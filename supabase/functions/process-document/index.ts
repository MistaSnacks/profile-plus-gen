import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mammoth from "https://esm.sh/mammoth@1.6.0";

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

    console.log('Processing document:', documentId);

    // Get document from database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (docError || !document) {
      throw new Error('Document not found');
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('documents')
      .download(document.file_path);

    if (downloadError || !fileData) {
      throw new Error('Failed to download file');
    }

    // Extract text from file based on file type
    let text = '';
    try {
      const fileExtension = document.name.toLowerCase().split('.').pop();
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      if (fileExtension === 'docx') {
        console.log('Processing DOCX file');
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
        console.log('Extracted DOCX text length:', text.length);
      } else if (fileExtension === 'pdf') {
        console.log('Processing PDF file - using placeholder for now');
        // PDF parsing requires additional dependencies, marking for extraction
        text = `[PDF file: ${document.name} - text extraction in progress]`;
      } else {
        // Try to extract as plain text
        console.log('Processing as plain text file');
        text = await fileData.text();
      }

      // Remove null bytes that Postgres TEXT columns cannot handle
      text = text.replace(/\u0000/g, '');
      
      // Clean up extra whitespace
      text = text.replace(/\s+/g, ' ').trim();
      
    } catch (error) {
      console.error('Error extracting text:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      text = `[Could not extract text from: ${document.name}. Error: ${errorMessage}]`;
    }

    // Update document with extracted text
    const { error: updateError } = await supabase
      .from('documents')
      .update({ extracted_text: text })
      .eq('id', documentId);

    if (updateError) {
      console.error('Update error details:', updateError);
      throw new Error(`Failed to update document: ${updateError.message}`);
    }

    console.log('Document processed successfully');

    console.log('Document processing complete');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing document:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
