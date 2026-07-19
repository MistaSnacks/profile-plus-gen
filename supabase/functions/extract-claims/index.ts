import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAiClient, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "../_shared/ai-client.ts";
import { extractClaimsFromDocument } from "../_shared/claim-extraction.ts";

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

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (!user) {
      throw new Error('Unauthorized');
    }

    const { documentId } = await req.json();
    console.log('Extracting claims for document:', documentId);

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, name, extracted_text')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (docError || !document) {
      throw new Error('Document not found');
    }
    if (!document.extracted_text || document.extracted_text.startsWith('[')) {
      throw new Error('Document has no extracted text — process it first');
    }

    // AI provider is configurable via env; falls back to the Lovable gateway.
    const ai = createAiClient({
      baseUrl: Deno.env.get('AI_BASE_URL') || DEFAULT_AI_BASE_URL,
      apiKey: Deno.env.get('AI_API_KEY') || Deno.env.get('LOVABLE_API_KEY')!,
      model: Deno.env.get('AI_MODEL') || DEFAULT_AI_MODEL,
    });

    const result = await extractClaimsFromDocument(document.extracted_text, ai);
    console.log('Admitted:', result.admitted.length, 'Rejected:', result.rejected.length, 'Malformed:', result.malformedCount);

    // Idempotent re-extraction: clear this document's previous claims.
    const { error: deleteError } = await supabase
      .from('claims')
      .delete()
      .eq('origin_document_id', documentId)
      .eq('user_id', user.id);
    if (deleteError) {
      throw new Error(`Failed to clear previous claims: ${deleteError.message}`);
    }

    // Insert verified claims first so inferred claims can link to their ids.
    const indexToId = new Map<number, string>();
    let verifiedCount = 0;
    let inferredCount = 0;

    for (const claim of result.admitted.filter((c) => c.kind === 'verified')) {
      const { data: row, error } = await supabase
        .from('claims')
        .insert({
          user_id: user.id,
          origin_document_id: documentId,
          kind: 'verified',
          type: claim.type,
          text: claim.text,
          labels: claim.labels,
          date_start: claim.date_start ?? null,
          date_end: claim.date_end ?? null,
        })
        .select('id')
        .single();
      if (error || !row) {
        throw new Error(`Failed to insert claim: ${error?.message}`);
      }
      indexToId.set(claim.index, row.id);
      verifiedCount++;

      const ev = claim.evidence!;
      const { error: evError } = await supabase.from('claim_evidence').insert({
        claim_id: row.id,
        document_id: documentId,
        quote: ev.quote,
        start_offset: ev.start,
        end_offset: ev.end,
        match_verified: true,
      });
      if (evError) {
        throw new Error(`Failed to insert evidence: ${evError.message}`);
      }
    }

    for (const claim of result.admitted.filter((c) => c.kind === 'inferred')) {
      const { data: row, error } = await supabase
        .from('claims')
        .insert({
          user_id: user.id,
          origin_document_id: documentId,
          kind: 'inferred',
          type: claim.type,
          text: claim.text,
          labels: claim.labels,
          reasoning: claim.reasoning ?? null,
          date_start: claim.date_start ?? null,
          date_end: claim.date_end ?? null,
        })
        .select('id')
        .single();
      if (error || !row) {
        throw new Error(`Failed to insert inferred claim: ${error?.message}`);
      }
      inferredCount++;

      const links = (claim.supports ?? [])
        .map((s) => indexToId.get(s))
        .filter((id): id is string => Boolean(id))
        .map((supportingId) => ({ inferred_claim_id: row.id, supporting_claim_id: supportingId }));
      if (links.length > 0) {
        const { error: linkError } = await supabase.from('claim_links').insert(links);
        if (linkError) {
          throw new Error(`Failed to insert claim links: ${linkError.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          admitted: result.admitted.length,
          verified: verifiedCount,
          inferred: inferredCount,
          rejected: result.rejected.length,
          malformed: result.malformedCount,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error extracting claims:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
