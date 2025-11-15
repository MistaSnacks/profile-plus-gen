import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    
    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { message } = await req.json();

    console.log('Fetching user documents...');

    // Fetch all user documents with extracted text
    const { data: documents, error: docsError } = await supabaseClient
      .from('documents')
      .select('name, type, extracted_text')
      .eq('user_id', user.id)
      .not('extracted_text', 'is', null);

    if (docsError) {
      console.error('Documents fetch error:', docsError);
      throw docsError;
    }

    console.log('Found documents:', documents?.length || 0);

    // Build context from documents
    const context = documents && documents.length > 0
      ? documents.map((doc: any) => {
          return `Document: ${doc.name} (${doc.type})\n${doc.extracted_text || 'No text extracted'}`;
        }).join('\n\n---\n\n')
      : 'No documents found. Please upload documents first.';

    // Generate response using Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that answers questions based on the user's documents. 
            Use the following context from their documents to answer their questions. 
            If the context doesn't contain relevant information, say so politely.
            
            Context from user's documents:
            ${context}`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('Failed to generate response');
    }

    const aiData = await aiResponse.json();
    const response = aiData.choices[0].message.content;

    return new Response(
      JSON.stringify({ response }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in chat-documents:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
