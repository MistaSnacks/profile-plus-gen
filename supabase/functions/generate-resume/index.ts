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

    const { jobDescription, style = 'professional' } = await req.json();

    console.log('Generating resume for user:', user.id);
    console.log('Job description length:', jobDescription.length);
    console.log('Style:', style);

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Get all user documents with embeddings
    const { data: documents } = await supabase
      .from('documents')
      .select('id, name, type, extracted_text')
      .eq('user_id', user.id);

    console.log('Found', documents?.length || 0, 'documents');

    // Combine all document information as context
    const documentsText = documents?.map(doc => 
      `${doc.name} (${doc.type}):\n${doc.extracted_text || '[No text extracted]'}`
    ).join('\n\n---\n\n') || 'No documents found.';

    // Generate resume using Lovable AI
    const systemPrompt = `You are an expert ATS resume writer and career coach. Create a tailored, ATS-optimized resume based on the user's experience and the job description.

Your resume should:
- Match keywords from the job description naturally
- Highlight relevant experience and achievements
- Use strong action verbs and quantifiable results
- Follow ATS-friendly formatting (no tables, no columns, simple linear structure)
- Be professional and concise
- Include relevant skills from the job posting

Style: ${style}

CRITICAL: Format the resume as ATS-friendly PLAIN TEXT with clear section headers. Use the following structure:

[FULL NAME]
[Email] | [Phone] | [LinkedIn] | [Portfolio]

PROFESSIONAL SUMMARY
[2-3 sentences highlighting key qualifications]

SKILLS
- [Skill category]: [comma-separated skills]
- [Another category]: [skills]

PROFESSIONAL EXPERIENCE
[Job Title] | [Company Name]
[Start Date] - [End Date]
• [Achievement with quantifiable result]
• [Achievement with quantifiable result]
• [Achievement with quantifiable result]

EDUCATION
[Degree] in [Field] | [Institution]
[Graduation Date]

CERTIFICATIONS (if applicable)
• [Certification Name] - [Issuing Organization] ([Year])

Do NOT use markdown syntax (no **, ##, etc.). Use plain text with clear spacing and bullet points (•).`;

    const userPrompt = `Create a tailored resume for this job posting:

JOB DESCRIPTION:
${jobDescription}

USER PROFILE:
Name: ${profile?.full_name || 'User'}
Email: ${profile?.email || ''}
LinkedIn: ${profile?.linkedin_url || ''}
Portfolio: ${profile?.portfolio_url || ''}

USER'S DOCUMENTS AND EXPERIENCE:
${documentsText}

Generate a complete, ATS-optimized resume that matches this job description.`;

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
      throw new Error('Failed to generate resume with AI');
    }

    const aiData = await aiResponse.json();
    const resumeContent = aiData.choices[0].message.content;

    console.log('Generated resume length:', resumeContent.length);

    // Calculate simple ATS score based on keyword matching
    const jobKeywords = jobDescription.toLowerCase()
      .split(/\W+/)
      .filter((word: string) => word.length > 3);
    const uniqueKeywords = [...new Set(jobKeywords)];
    const resumeLower = resumeContent.toLowerCase();
    const matchedKeywords = uniqueKeywords.filter(kw => resumeLower.includes(kw));
    const atsScore = Math.min(100, Math.round((matchedKeywords.length / uniqueKeywords.length) * 100));

    console.log('ATS Score:', atsScore);

    // Save job description
    const { data: jobDesc } = await supabase
      .from('job_descriptions')
      .insert({
        user_id: user.id,
        description: jobDescription,
        keywords: uniqueKeywords.slice(0, 50),
      })
      .select()
      .single();

    // Save generated resume
    const { data: resume, error: saveError } = await supabase
      .from('generated_resumes')
      .insert({
        user_id: user.id,
        job_description_id: jobDesc?.id,
        title: `Resume - ${new Date().toLocaleDateString()}`,
        content: resumeContent,
        format: 'plain_text',
        ats_score: atsScore,
        style: style,
        metadata: {
          matched_keywords: matchedKeywords.length,
          total_keywords: uniqueKeywords.length,
        }
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving resume:', saveError);
      throw saveError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        resume: {
          id: resume.id,
          content: resumeContent,
          ats_score: atsScore,
          style: style,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating resume:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
