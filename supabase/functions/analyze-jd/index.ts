import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAiClient, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "../_shared/ai-client.ts";
import { buildJdParsePrompt, parseJdResponse } from "../_shared/jd-parse.ts";
import { buildCoveragePrompt, admitCoverage, type CandidateClaim } from "../_shared/coverage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { jobDescription, jobDescriptionId } = await req.json();
    if (typeof jobDescription !== 'string' || jobDescription.trim() === '') {
      throw new Error('jobDescription is required');
    }

    // The corpus is the whole point: an empty one means "extract claims first",
    // not "you are unqualified for everything".
    const { data: claimRows, error: claimsError } = await supabase
      .from('claims')
      .select('id, kind, type, text')
      .eq('user_id', user.id)
      .eq('status', 'active');
    if (claimsError) {
      throw new Error(`Failed to load claims: ${claimsError.message}`);
    }
    if (!claimRows || claimRows.length === 0) {
      throw new Error('No claims in your corpus yet — extract claims from your documents first');
    }
    const claims: CandidateClaim[] = claimRows.map((c) => ({
      id: c.id,
      kind: c.kind,
      type: c.type,
      text: c.text,
    }));

    const ai = createAiClient({
      baseUrl: Deno.env.get('AI_BASE_URL') || DEFAULT_AI_BASE_URL,
      apiKey: Deno.env.get('AI_API_KEY') || Deno.env.get('LOVABLE_API_KEY')!,
      model: Deno.env.get('AI_MODEL') || DEFAULT_AI_MODEL,
    });

    // 1. Parse the posting into structured requirements.
    const parsePrompt = buildJdParsePrompt(jobDescription);
    const parsed = parseJdResponse(await ai.chatJson(parsePrompt));
    if (parsed.requirements.length === 0) {
      throw new Error('No requirements could be parsed from this text — is it a job posting?');
    }
    console.log('Parsed requirements:', parsed.requirements.length, 'malformed:', parsed.malformed.length);

    // 2. Match requirements against the corpus and pick a lane.
    const coveragePrompt = buildCoveragePrompt(parsed.requirements, claims);
    const result = admitCoverage(
      await ai.chatJson(coveragePrompt),
      parsed.requirements.length,
      claims,
    );
    console.log(
      'Coverage — demoted:', result.demoted.length,
      'malformed:', result.malformed.length,
      'laneFallback:', result.laneFallback,
    );

    // 3. Persist. Upsert the posting first so requirements have a parent.
    let jdId = jobDescriptionId as string | undefined;
    const laneDecision = { ...result.lane, laneFallback: result.laneFallback };

    if (jdId) {
      const { error } = await supabase
        .from('job_descriptions')
        .update({ title: parsed.title, company: parsed.company, lane_decision: laneDecision })
        .eq('id', jdId)
        .eq('user_id', user.id);
      if (error) {
        throw new Error(`Failed to update job description: ${error.message}`);
      }
    } else {
      const { data: row, error } = await supabase
        .from('job_descriptions')
        .insert({
          user_id: user.id,
          title: parsed.title,
          company: parsed.company,
          description: jobDescription,
          lane_decision: laneDecision,
        })
        .select('id')
        .single();
      if (error || !row) {
        throw new Error(`Failed to create job description: ${error?.message}`);
      }
      jdId = row.id;
    }

    // Idempotent re-analysis: requirements cascade to coverage and citations.
    const { error: deleteError } = await supabase
      .from('jd_requirements')
      .delete()
      .eq('job_description_id', jdId)
      .eq('user_id', user.id);
    if (deleteError) {
      throw new Error(`Failed to clear previous requirements: ${deleteError.message}`);
    }

    const responseCoverage: {
      requirementId: string;
      text: string;
      type: string;
      priority: string;
      status: string;
      claimIds: string[];
      rationale: string | null;
    }[] = [];

    for (let i = 0; i < parsed.requirements.length; i++) {
      const requirement = parsed.requirements[i];
      const entry = result.coverage[i];

      const { data: reqRow, error: reqError } = await supabase
        .from('jd_requirements')
        .insert({
          job_description_id: jdId,
          user_id: user.id,
          text: requirement.text,
          type: requirement.type,
          priority: requirement.priority,
          position: i,
        })
        .select('id')
        .single();
      if (reqError || !reqRow) {
        throw new Error(`Failed to insert requirement: ${reqError?.message}`);
      }

      const { data: covRow, error: covError } = await supabase
        .from('requirement_coverage')
        .insert({
          requirement_id: reqRow.id,
          user_id: user.id,
          status: entry.status,
          rationale: entry.rationale,
        })
        .select('id')
        .single();
      if (covError || !covRow) {
        throw new Error(`Failed to insert coverage: ${covError?.message}`);
      }

      if (entry.claimIds.length > 0) {
        const { error: linkError } = await supabase
          .from('coverage_claims')
          .insert(entry.claimIds.map((claimId) => ({ coverage_id: covRow.id, claim_id: claimId })));
        if (linkError) {
          throw new Error(`Failed to insert coverage claims: ${linkError.message}`);
        }
      }

      responseCoverage.push({
        requirementId: reqRow.id,
        text: requirement.text,
        type: requirement.type,
        priority: requirement.priority,
        status: entry.status,
        claimIds: entry.claimIds,
        rationale: entry.rationale,
      });
    }

    const counts = (status: string) => responseCoverage.filter((c) => c.status === status).length;

    return new Response(
      JSON.stringify({
        success: true,
        jobDescriptionId: jdId,
        lane: laneDecision,
        coverage: responseCoverage,
        summary: {
          requirements: responseCoverage.length,
          verified: counts('verified'),
          inferred: counts('inferred'),
          gaps: counts('gap'),
          malformed: parsed.malformed.length + result.malformed.length,
          demoted: result.demoted.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error analyzing job description:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
