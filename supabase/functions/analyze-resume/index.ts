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

    const { resumeId } = await req.json();

    console.log('Analyzing resume:', resumeId);

    // Get the resume
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

    console.log('Analyzing for job:', jobTitle, 'at', company);

    const systemPrompt = `You are an expert ATS (Applicant Tracking System) consultant and career coach with access to the candidate's ORIGINAL DOCUMENTS. Your role is to analyze resumes and provide specific, actionable, TRUTHFUL feedback.

CRITICAL RULES FOR CATEGORIZING SUGGESTIONS:
1. **REPHRASE EXISTING** - Skills, experiences, or achievements found in the original documents that can be reworded for better impact
   - Example: "automation" in docs → suggest "AI-powered automation" if relevant
   - Mark with [REPHRASE]

2. **REASONABLE INFERENCE** - Adjacent skills that can be safely implied from documented experience
   - Example: Used "Python" → can infer "scripting" capability
   - Must be logically connected to documented skills
   - Mark with [INFERENCE]

3. **SKILLS GAP** - Required skills in job description that are NOT found in original documents
   - Do NOT suggest adding these as if they exist
   - Instead, flag these as gaps to be addressed through learning
   - Mark with [GAP]

ANTI-FABRICATION RULES:
- NEVER suggest adding skills, tools, or experiences not evidenced in original documents
- NEVER invent metrics, certifications, or job responsibilities
- When a job requirement isn't met, be honest about the gap
- Focus on optimizing what truly exists vs. fabricating what doesn't

Provide concrete, implementable suggestions that maintain resume truthfulness.`;

    const userPrompt = `Analyze this resume against the job description while VERIFYING all suggestions against the candidate's original documents.

JOB TITLE: ${jobTitle}
COMPANY: ${company}

JOB DESCRIPTION:
${jobDescription}

CURRENT RESUME:
${resume.content}

ORIGINAL DOCUMENTS (SOURCE OF TRUTH):
${documentsContext}

CURRENT ATS SCORE: ${resume.ats_score}%

ANALYSIS REQUIREMENTS:
Provide a structured analysis with THREE CATEGORIES:

1. **[REPHRASE] - Skills from Original Documents**
   - Keywords/skills found IN original documents that should be emphasized or reworded
   - Show which document contains the evidence
   - Example: "Python (from: Resume_2024.pdf) → suggest highlighting 'Python automation'"

2. **[INFERENCE] - Reasonable Inferences**
   - Skills that can be safely inferred from documented experience
   - Explain the logical connection
   - Example: "Git experience (inferred from 'team code projects' in Portfolio.pdf)"

3. **[GAP] - Honest Skills Gaps**
   - Job requirements NOT found in any original document
   - Flag as areas for future development, NOT as things to add now
   - Example: "Docker (required, not found in documents - recommend learning)"

4. **ATS Formatting Issues**
   - Structure, formatting, or organization problems

5. **Metrics & Achievements**
   - Only suggest adding metrics that can be derived from documented work
   - Flag if job requires metrics not present in docs

CRITICAL: For each suggestion, cite which document(s) support it or explicitly state [GAP] if unsupported.`;

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
      throw new Error('Failed to analyze resume with AI');
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0].message.content;

    console.log('Analysis generated, length:', analysis.length);

    return new Response(
      JSON.stringify({ analysis }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in analyze-resume function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
