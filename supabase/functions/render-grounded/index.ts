import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAiClient, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "../_shared/ai-client.ts";
import { buildRenderPrompt, admitBullets, renderPlainText } from "../_shared/render.ts";
import type { CandidateClaim } from "../_shared/coverage.ts";

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

    const { jobDescriptionId, resumeId } = await req.json();
    if (typeof jobDescriptionId !== 'string' || jobDescriptionId === '') {
      throw new Error('jobDescriptionId is required');
    }

    const { data: jd, error: jdError } = await supabase
      .from('job_descriptions')
      .select('id, title, company, lane_decision')
      .eq('id', jobDescriptionId)
      .eq('user_id', user.id)
      .single();
    if (jdError || !jd) {
      throw new Error('Job description not found');
    }
    const laneDecision = jd.lane_decision as { selected?: { claimIds?: string[] } } | null;
    const laneClaimIds: string[] = laneDecision?.selected?.claimIds ?? [];
    if (laneClaimIds.length === 0) {
      throw new Error('No lane decision on this posting — run analyze-jd first');
    }

    // Requirements and their coverage were decided by analyze-jd; this function
    // never re-derives them, so what the user saw is what gets written.
    const { data: requirements, error: reqError } = await supabase
      .from('jd_requirements')
      .select('id, text, type, priority, position, requirement_coverage(id, status, coverage_claims(claim_id))')
      .eq('job_description_id', jobDescriptionId)
      .eq('user_id', user.id)
      .order('position', { ascending: true });
    if (reqError) {
      throw new Error(`Failed to load requirements: ${reqError.message}`);
    }
    if (!requirements || requirements.length === 0) {
      throw new Error('No requirements for this posting — run analyze-jd first');
    }

    // Selected claims = cited by non-gap coverage AND inside the chosen lane.
    const laneSet = new Set(laneClaimIds);
    const citedIds = new Set<string>();
    let requirementsAddressed = 0;
    for (const r of requirements as unknown as {
      requirement_coverage: { status: string; coverage_claims: { claim_id: string }[] }[] | null;
    }[]) {
      const coverage = Array.isArray(r.requirement_coverage) ? r.requirement_coverage[0] : r.requirement_coverage;
      if (!coverage || coverage.status === 'gap') continue;
      const inLane = (coverage.coverage_claims ?? []).map((cc) => cc.claim_id).filter((id) => laneSet.has(id));
      if (inLane.length > 0) requirementsAddressed++;
      for (const id of inLane) citedIds.add(id);
    }
    if (citedIds.size === 0) {
      throw new Error('No claims in the selected lane cover any requirement — nothing to write from');
    }

    const { data: claimRows, error: claimsError } = await supabase
      .from('claims')
      .select('id, kind, type, text')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('id', Array.from(citedIds));
    if (claimsError) {
      throw new Error(`Failed to load claims: ${claimsError.message}`);
    }
    const claims: CandidateClaim[] = (claimRows ?? []).map((c) => ({
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

    const renderPrompt = buildRenderPrompt(
      (requirements as unknown as { text: string; type: string; priority: string }[]).map((r) => ({
        text: r.text,
        type: r.type as "skill" | "experience" | "credential" | "responsibility",
        priority: r.priority as "required" | "preferred",
      })),
      claims,
    );
    const rendered = admitBullets(await ai.chatJson(renderPrompt), claims.map((c) => c.id));
    console.log('Bullets admitted:', rendered.admitted.length, 'rejected:', rendered.rejected.length);
    if (rendered.admitted.length === 0) {
      throw new Error(
        `Every bullet failed the citation check (${rendered.rejected.length} rejected) — no resume was written`,
      );
    }

    const content = renderPlainText(rendered.admitted);
    const title = `${jd.title ?? 'Untitled role'}${jd.company ? ` at ${jd.company}` : ''}`;

    let finalResumeId = resumeId as string | undefined;
    if (finalResumeId) {
      const { data: updated, error } = await supabase
        .from('generated_resumes')
        .update({ title, content, lane_decision: jd.lane_decision, metadata: { engine: 'v2' } })
        .eq('id', finalResumeId)
        .eq('user_id', user.id)
        .eq('job_description_id', jobDescriptionId)
        .select('id')
        .single();
      if (error || !updated) {
        throw new Error('Resume not found for this job description');
      }
      const { error: clearError } = await supabase
        .from('resume_bullets')
        .delete()
        .eq('resume_id', finalResumeId)
        .eq('user_id', user.id);
      if (clearError) {
        throw new Error(`Failed to clear previous bullets: ${clearError.message}`);
      }
    } else {
      const { data: row, error } = await supabase
        .from('generated_resumes')
        .insert({
          user_id: user.id,
          job_description_id: jobDescriptionId,
          title,
          content,
          format: 'plain_text',
          lane_decision: jd.lane_decision,
          metadata: { engine: 'v2' },
        })
        .select('id')
        .single();
      if (error || !row) {
        throw new Error(`Failed to create resume: ${error?.message}`);
      }
      finalResumeId = row.id;
    }

    for (const bullet of rendered.admitted) {
      const { data: bulletRow, error: bulletError } = await supabase
        .from('resume_bullets')
        .insert({
          resume_id: finalResumeId,
          user_id: user.id,
          section: bullet.section,
          position: bullet.position,
          text: bullet.text,
        })
        .select('id')
        .single();
      if (bulletError || !bulletRow) {
        throw new Error(`Failed to insert bullet: ${bulletError?.message}`);
      }
      const { error: citeError } = await supabase
        .from('bullet_claims')
        .insert(bullet.claimIds.map((claimId) => ({ bullet_id: bulletRow.id, claim_id: claimId })));
      if (citeError) {
        throw new Error(`Failed to insert bullet citations: ${citeError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        resumeId: finalResumeId,
        summary: {
          bullets: rendered.admitted.length,
          rejectedBullets: rendered.rejected.length,
          malformed: rendered.malformed,
          claimsUsed: claims.length,
          requirementsAddressed,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error rendering grounded resume:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
