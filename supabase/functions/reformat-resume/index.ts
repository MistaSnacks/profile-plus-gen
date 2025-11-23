import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { resumeId, analysis } = await req.json();

    console.log('Reformatting resume:', resumeId);

    // Get the resume and job description
    const { data: resume, error: resumeError } = await supabase
      .from('generated_resumes')
      .select('*, job_descriptions(*)')
      .eq('id', resumeId)
      .eq('user_id', user.id)
      .single();

    if (resumeError || !resume) {
      throw new Error('Resume not found');
    }

    if (!resume.job_descriptions) {
      throw new Error('Job description not found for this resume');
    }

    // Fetch user's original documents (SOURCE OF TRUTH)
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('name, type, extracted_text')
      .eq('user_id', user.id);

    if (docsError) {
      console.error('Error fetching documents:', docsError);
    }

    const documentsContext = documents && documents.length > 0
      ? documents.map(doc => `[${doc.type.toUpperCase()}: ${doc.name}]\n${doc.extracted_text || ''}`).join('\n\n---\n\n')
      : 'No original documents available';

    console.log('Fetched', documents?.length || 0, 'user documents for verification');

    const jobDescription = resume.job_descriptions.description;
    const jobTitle = resume.job_descriptions.title || 'the position';
    const company = resume.job_descriptions.company || 'the company';

    console.log('Reformatting for job:', jobTitle, 'at', company);

    const systemPrompt = `You are a resume and ATS expert with access to the candidate's ORIGINAL DOCUMENTS. You will reformat a resume based on AI analysis while STRICTLY adhering to truth and verifiability.

ANTI-FABRICATION RULES (CRITICAL):
1. **ONLY add content that can be verified in the original documents**
2. **NEVER fabricate skills, tools, experiences, metrics, or certifications**
3. For [REPHRASE] suggestions: Reword existing documented content for better impact
4. For [INFERENCE] suggestions: Only add if the logical connection is crystal clear
5. For [GAP] suggestions: DO NOT add these to the resume - they're learning goals

ALLOWED OPERATIONS:
✅ Rephrase documented skills/experiences for stronger impact
✅ Add keywords that describe existing work (if verifiable in docs)
✅ Reorganize content for better ATS compatibility
✅ Quantify achievements IF data exists in original documents
✅ Emphasize relevant experiences from original documents

FORBIDDEN OPERATIONS:
❌ Add skills/tools not found in original documents
❌ Invent metrics or certifications
❌ Fabricate job responsibilities or projects
❌ Add technologies never mentioned in documents
❌ Exaggerate experience level or scope

FORMATTING REQUIREMENTS:
- Use simple text: ALL CAPS for headers, regular text for content
- Bullet points use dash (-) at line start
- **Bold with double asterisks** ONLY for content with verifiable origins:
  - [VERIFIED]: Content directly from documents
  - [INFERRED]: Adjacent skills with clear connection
- DO NOT bold fabricated content (there shouldn't be any)

You are the final line of defense against resume fraud. Be ruthlessly honest.`;

    const userPrompt = `Reformat this resume using ONLY verifiable content from the original documents.

JOB TITLE: ${jobTitle}
COMPANY: ${company}

JOB DESCRIPTION:
${jobDescription}

CURRENT RESUME:
${resume.content}

ORIGINAL DOCUMENTS (SOURCE OF TRUTH - VERIFY ALL CHANGES AGAINST THESE):
${documentsContext}

AI ANALYSIS (with categorization):
${analysis}

INSTRUCTIONS:
1. Implement [REPHRASE] suggestions by improving how documented content is presented
2. Carefully evaluate [INFERENCE] suggestions - only add if evidence clearly supports it
3. IGNORE [GAP] suggestions - do not add unverified content
4. Fix formatting/ATS issues mentioned in analysis
5. Mark improvements with **bold** and indicate category:
   - **content** for [VERIFIED] changes from docs
   - **content** for [INFERRED] if truly supported

Output ONLY the reformatted resume with no commentary. Be conservative - when in doubt, leave it out.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('Failed to reformat resume with AI');
    }

    const aiData = await aiResponse.json();
    const reformattedContent = aiData.choices[0].message.content;

    // Calculate new ATS score
    const scoreResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: 'You are an ATS scoring expert. Analyze resumes and provide a score from 0-100 based on keyword match, relevance, and formatting. Respond with ONLY a number between 0 and 100, nothing else.' 
          },
          { 
            role: 'user', 
            content: `Rate this resume for the job:\n\nJob Description:\n${jobDescription}\n\nResume:\n${reformattedContent}` 
          }
        ],
      }),
    });

    let atsScore = resume.ats_score; // Default to original score
    if (scoreResponse.ok) {
      const scoreData = await scoreResponse.json();
      const scoreText = scoreData.choices[0].message.content.trim();
      const parsedScore = parseInt(scoreText);
      if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
        atsScore = parsedScore;
      }
    }

    console.log('Reformatted resume generated, new ATS score:', atsScore);

    return new Response(
      JSON.stringify({ 
        content: reformattedContent,
        atsScore: atsScore 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in reformat-resume function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
