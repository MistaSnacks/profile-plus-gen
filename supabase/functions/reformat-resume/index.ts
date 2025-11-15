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

    const jobDescription = resume.job_descriptions.description;
    const jobTitle = resume.job_descriptions.title || 'the position';
    const company = resume.job_descriptions.company || 'the company';

    console.log('Reformatting for job:', jobTitle, 'at', company);

    const systemPrompt = `You are a resume and ATS expert. You will reformat an existing resume based on specific AI analysis and suggestions to improve its ATS score and effectiveness.

Your task is to:
- Incorporate the suggested keywords naturally into the resume
- Implement the content improvements suggested in the analysis
- Fix any ATS compatibility issues mentioned
- Add or emphasize skills and qualifications as recommended
- Include quantifiable achievements where suggested
- Maintain the same basic structure but improve the content quality

CRITICAL FORMATTING REQUIREMENTS:
- Output ONLY plain text, no markdown, no special formatting
- Use simple text formatting: ALL CAPS for section headers, regular text for content
- Do NOT use asterisks, bullets (•), or any markdown symbols
- For bullet points, use a simple dash (-) at the start of lines
- Do NOT use bold (**text**), italic (*text*), or any markdown formatting
- Keep it simple and ATS-friendly: plain text only

Do not invent new experiences or qualifications. Only enhance and rewrite existing content using better language and incorporating the suggested improvements.`;

    const userPrompt = `Reformat this resume incorporating the AI analysis suggestions below.

JOB TITLE: ${jobTitle}
COMPANY: ${company}

JOB DESCRIPTION:
${jobDescription}

ORIGINAL RESUME:
${resume.content}

AI ANALYSIS & SUGGESTIONS:
${analysis}

Please reformat the resume incorporating these suggestions. Output ONLY the reformatted resume text with no additional commentary. Remember: plain text only, no markdown formatting.`;

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
