import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAiClient, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "../_shared/ai-client.ts";
import { buildExtractionPrompt } from "../_shared/claim-extraction.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { documentText } = await req.json();
    const ai = createAiClient({
      baseUrl: Deno.env.get('AI_BASE_URL') || DEFAULT_AI_BASE_URL,
      apiKey: Deno.env.get('AI_API_KEY') || Deno.env.get('LOVABLE_API_KEY')!,
      model: Deno.env.get('AI_MODEL') || DEFAULT_AI_MODEL,
    });
    const { system, user } = buildExtractionPrompt(documentText);
    const raw = await ai.chatJson({ system, user });
    return new Response(JSON.stringify({ raw }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
