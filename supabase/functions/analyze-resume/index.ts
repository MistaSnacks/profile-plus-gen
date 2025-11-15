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

    const jobDescription = resume.job_descriptions.description;
    const jobTitle = resume.job_descriptions.title || 'the position';
    const company = resume.job_descriptions.company || 'the company';

    console.log('Analyzing for job:', jobTitle, 'at', company);

    const systemPrompt = `You are an expert ATS (Applicant Tracking System) consultant and career coach. Your role is to analyze resumes and provide specific, actionable feedback to improve their ATS compatibility and appeal to recruiters.

Focus on:
- Keyword optimization for the specific job
- ATS compatibility issues (formatting, structure)
- Content improvements (quantifiable achievements, impact statements)
- Skills gaps and how to address them
- Section organization and clarity

Provide concrete, implementable suggestions that the candidate can act on immediately.`;

    const userPrompt = `Analyze this resume for the following job position and provide detailed, actionable insights to improve the ATS score and overall effectiveness.

JOB TITLE: ${jobTitle}
COMPANY: ${company}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE'S RESUME:
${resume.content}

CURRENT ATS SCORE: ${resume.ats_score}%

Please provide:
1. Top 3-5 specific keywords missing from the resume that appear in the job description
2. 3-5 concrete content improvements with examples of how to rewrite specific sections
3. Any ATS compatibility issues (formatting, structure) that need fixing
4. Skills or qualifications mentioned in the job description that are missing or underemphasized
5. Specific metrics or quantifiable achievements that should be added

Format your response as a structured analysis with clear sections and bullet points.`;

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
