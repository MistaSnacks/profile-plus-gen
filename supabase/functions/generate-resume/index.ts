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

⚠️ CRITICAL WARNING - VIOLATIONS WILL RESULT IN REJECTION ⚠️

ABSOLUTE PROHIBITIONS - YOU WILL BE PENALIZED FOR VIOLATIONS:
❌ NEVER add degrees that don't exist in the documents (e.g., "Bachelor of Science" when none is mentioned)
❌ NEVER add certifications not explicitly listed (e.g., CAMS, CISA, PMP, etc.)
❌ NEVER add licenses or professional designations
❌ NEVER invent company names, job titles, or employment dates
❌ NEVER create educational institutions or graduation dates
❌ If a qualification is missing from the documents, YOU MUST LEAVE IT OUT - do not fill gaps with fiction

WHAT YOU CAN DO:
✓ Reword existing bullet points with stronger action verbs and keywords
✓ Reorganize existing information for better presentation
✓ Emphasize relevant experiences that already exist in the documents
✓ Use quantifiable results that are already stated in the source material

REMEMBER: An incomplete resume is better than a dishonest one. If the user's documents don't have a degree, don't add one. If they don't have certifications, don't invent them.

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
⚠️ CRITICAL: Be highly selective! Only include the 3-5 MOST RELEVANT positions for this specific job.
- Prioritize recent roles that match the job requirements
- Skip older or irrelevant positions entirely
- Focus on quality over quantity - better to have 3 perfect matches than 10 mediocre ones

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

    // ALWAYS run multi-pass refinement with full analysis-reformat workflow
    console.log('Starting analysis and refinement workflow...');
      
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

⚠️ CRITICAL WARNING - VIOLATIONS WILL RESULT IN REJECTION ⚠️

ABSOLUTE PROHIBITIONS DURING REFINEMENT:
❌ DO NOT add ANY degrees not present in the original resume (if original has no degree, refined version must have no degree)
❌ DO NOT add ANY certifications not present in the original resume (if no CAMS cert exists, don't add it)
❌ DO NOT add ANY educational institutions not in the original
❌ DO NOT add ANY professional licenses or designations not in the original
❌ ONLY improve what ALREADY EXISTS - do not create new credentials

YOUR JOB: Incorporate missing KEYWORDS into EXISTING bullet points and experiences. DO NOT create new qualifications to fill gaps.

Example of CORRECT refinement:
Original: "• Managed fraud detection processes"
Refined: "• Managed fraud detection and abuse vector monitoring processes using anomaly alerting systems"

Example of INCORRECT refinement (NEVER DO THIS):
Original: No CAMS certification listed
Refined: NEVER ADD "• Certified Anti-Money Laundering Specialist (CAMS) - 2023"

Style: ${style}`;

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
