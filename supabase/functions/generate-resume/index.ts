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
    const systemPrompt = `You are a resume and ATS expert. You will create resumes tailored to job descriptions using ONLY the information provided in the user's documents.

CRITICAL RULES - NEVER VIOLATE THESE:
1. DO NOT invent, fabricate, or assume any degrees, certifications, or qualifications not explicitly stated in the user's documents
2. DO NOT add educational credentials that are not present in the source materials
3. DO NOT infer or create certifications, licenses, or professional designations
4. DO NOT make up company names, job titles, or dates
5. ONLY use experiences, skills, and achievements that are directly stated or clearly implied from the provided documents

You may:
- Reword bullet points for better impact using industry keywords
- Reorganize information for better presentation
- Emphasize relevant experiences that match the job description
- Use action verbs and quantifiable results from the source material

If the user's documents lack qualifications mentioned in the job description, DO NOT fabricate them. Work with what is actually provided.

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

IMPORTANT: First, extract and identify the job title and company name from the job description above. If not explicitly stated, infer the most likely job title.

USER PROFILE:
Name: ${profile?.full_name || 'User'}
Email: ${profile?.email || ''}
LinkedIn: ${profile?.linkedin_url || ''}
Portfolio: ${profile?.portfolio_url || ''}

USER'S DOCUMENTS AND EXPERIENCE:
${documentsText}

Generate a complete, ATS-optimized resume that matches this job description.`;

    // First, extract job title and company from description
    const extractionPrompt = `Extract the job title and company name from this job description. If not explicitly stated, infer the most likely job title based on the requirements and description.

JOB DESCRIPTION:
${jobDescription}

Respond in this exact format:
Job Title: [extracted or inferred title]
Company: [company name or "Not specified"]`;

    const extractionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: extractionPrompt }
        ],
      }),
    });

    let jobTitle = 'Position';
    let companyName = '';
    
    if (extractionResponse.ok) {
      const extractionData = await extractionResponse.json();
      const extractedInfo = extractionData.choices[0].message.content;
      
      const titleMatch = extractedInfo.match(/Job Title:\s*(.+)/i);
      const companyMatch = extractedInfo.match(/Company:\s*(.+)/i);
      
      if (titleMatch) jobTitle = titleMatch[1].trim();
      if (companyMatch && !companyMatch[1].includes('Not specified')) {
        companyName = companyMatch[1].trim();
      }
    }

    console.log('Extracted job title:', jobTitle, 'Company:', companyName);

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
    let resumeContent = aiData.choices[0].message.content;

    console.log('Generated initial resume length:', resumeContent.length);

    // Calculate simple ATS score based on keyword matching
    const calculateATSScore = (content: string) => {
      const jobKeywords: string[] = jobDescription.toLowerCase()
        .split(/\W+/)
        .filter((word: string) => word.length > 3);
      const uniqueKeywords: string[] = [...new Set(jobKeywords)];
      const contentLower = content.toLowerCase();
      const matchedKeywords = uniqueKeywords.filter((kw: string) => contentLower.includes(kw));
      return {
        score: Math.min(100, Math.round((matchedKeywords.length / uniqueKeywords.length) * 100)),
        matchedKeywords,
        uniqueKeywords
      };
    };

    let { score: atsScore, matchedKeywords, uniqueKeywords } = calculateATSScore(resumeContent);
    console.log('Initial ATS Score:', atsScore);

    // Multi-pass refinement: if score is below 75%, analyze and refine
    if (atsScore < 75) {
      console.log('ATS score below 75%, starting analysis and refinement...');
      
      // Step 1: Analyze the resume
      const analysisPrompt = `You are an ATS (Applicant Tracking System) expert. Analyze this resume against the job description and provide detailed feedback.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeContent}

Provide your analysis in the following format:

KEYWORD MATCH SCORE: [0-100]
Explanation of score

STRENGTHS:
• [Strength 1]
• [Strength 2]
• [Strength 3]

GAPS:
• [Gap 1 - what's missing]
• [Gap 2 - what's missing]
• [Gap 3 - what's missing]

RECOMMENDATIONS:
• [Specific actionable recommendation 1]
• [Specific actionable recommendation 2]
• [Specific actionable recommendation 3]

Focus on:
- Keywords and phrases from the job description
- Required skills and qualifications
- Experience level alignment
- ATS compatibility issues`;

      const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'user', content: analysisPrompt }
          ],
        }),
      });

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        const analysis = analysisData.choices[0].message.content;
        console.log('Analysis complete, refining resume...');

        // Step 2: Reformat based on analysis
        const reformatSystemPrompt = `You are a resume and ATS expert. Your task is to rewrite the resume to address the analysis feedback and improve the ATS score.

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

Do NOT use markdown syntax (no **, ##, etc.). Use plain text with clear spacing and bullet points (•).

CRITICAL RULES - NEVER VIOLATE:
1. Keep all factual information EXACTLY as stated in the original resume
2. DO NOT add degrees, certifications, or credentials not present in the original
3. DO NOT fabricate educational qualifications or professional licenses
4. Incorporate missing keywords from the job description naturally into EXISTING experiences
5. Address the gaps identified in the analysis WITHOUT inventing qualifications
6. Maintain the same style: ${style}
7. If qualifications are missing, improve what EXISTS rather than creating fictional credentials`;

        const reformatUserPrompt = `JOB DESCRIPTION:
${jobDescription}

ORIGINAL RESUME:
${resumeContent}

ANALYSIS AND FEEDBACK:
${analysis}

Rewrite the resume to incorporate the recommendations and improve ATS compatibility while maintaining accuracy.`;

        const reformatResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: reformatSystemPrompt },
              { role: 'user', content: reformatUserPrompt }
            ],
          }),
        });

        if (reformatResponse.ok) {
          const reformatData = await reformatResponse.json();
          const refinedContent = reformatData.choices[0].message.content;
          
          // Recalculate ATS score for refined version
          const refinedResult = calculateATSScore(refinedContent);
          
          console.log('Refined ATS Score:', refinedResult.score, '(improved from', atsScore, ')');
          
          // Use refined version
          resumeContent = refinedContent;
          atsScore = refinedResult.score;
          matchedKeywords = refinedResult.matchedKeywords;
          uniqueKeywords = refinedResult.uniqueKeywords;
        }
      }
    }

    console.log('Final ATS Score:', atsScore);

    // Save job description with extracted info
    const { data: jobDesc } = await supabase
      .from('job_descriptions')
      .insert({
        user_id: user.id,
        description: jobDescription,
        title: jobTitle,
        company: companyName || null,
        keywords: uniqueKeywords.slice(0, 50),
      })
      .select()
      .single();

    // Create resume title
    const resumeTitle = companyName 
      ? `${jobTitle} at ${companyName}`
      : jobTitle;

    // Save generated resume
    const { data: resume, error: saveError } = await supabase
      .from('generated_resumes')
      .insert({
        user_id: user.id,
        job_description_id: jobDesc?.id,
        title: resumeTitle,
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
