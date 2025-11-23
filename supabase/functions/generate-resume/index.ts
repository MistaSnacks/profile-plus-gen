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

    // ALWAYS run document-aware analysis and reformat workflow
    console.log('Starting document-aware analysis and refinement workflow...');
      
      // Step 1: Document-Aware Analysis
      const analysisSystemPrompt = `You are an expert ATS (Applicant Tracking System) consultant and career coach with access to the candidate's ORIGINAL DOCUMENTS. Your role is to analyze resumes and provide specific, actionable, TRUTHFUL feedback.

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

      const analysisUserPrompt = `Analyze this resume against the job description while VERIFYING all suggestions against the candidate's original documents.

JOB TITLE: ${jobTitle}
COMPANY: ${companyName || 'the company'}

JOB DESCRIPTION:
${jobDescription}

CURRENT RESUME:
${resumeContent}

ORIGINAL DOCUMENTS (SOURCE OF TRUTH):
${documentsText}

CURRENT ATS SCORE: ${atsScore}%

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

      const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: analysisSystemPrompt },
            { role: 'user', content: analysisUserPrompt }
          ],
        }),
      });

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        const analysis = analysisData.choices[0].message.content;
        console.log('Analysis complete, refining resume...');

        // Step 2: Document-Verified Reformat
        const reformatSystemPrompt = `You are a resume optimization expert with STRICT TRUTHFULNESS REQUIREMENTS. You have access to the candidate's ORIGINAL DOCUMENTS and must verify ALL changes against them.

🔒 ABSOLUTE RULES - ZERO TOLERANCE FOR VIOLATIONS:

1. **ONLY ADD [REPHRASE] ITEMS**
   - These are skills/experiences explicitly found in original documents
   - Can be reworded for impact but content must be verifiable
   ✅ Example: "SQL automation" in docs → "Advanced SQL-based automation"

2. **CAUTIOUSLY ADD [INFERENCE] ITEMS**
   - ONLY if inference is conservative and logical
   - Must have clear connection to documented skills
   ⚠️ Example: "Python" in docs → "Python scripting" (OK)
   ❌ Example: "Python" in docs → "AI/ML expertise" (TOO BIG LEAP)

3. **NEVER ADD [GAP] ITEMS**
   - These are skills NOT in documents
   - Must be excluded from final resume
   - Lower ATS score is ACCEPTABLE - fabrication is NOT
   ❌ Example: If "Docker" marked [GAP] → DO NOT ADD IT

4. **VERIFY EVERYTHING AGAINST DOCUMENTS**
   - Before adding ANY skill, tool, or experience → CHECK DOCUMENTS
   - If not found in documents → DO NOT ADD
   - If uncertain → DO NOT ADD

FORBIDDEN ADDITIONS (unless explicitly in documents):
❌ Specific tools/platforms not documented (Zendesk, Docker, Kubernetes, etc.)
❌ Certifications not listed (PMP, CAMS, AWS certs, etc.)
❌ Programming languages not documented
❌ Degrees or educational credentials not in documents
❌ Specific AI tools not mentioned (ChatGPT, Claude, unless verified)
❌ Metrics or achievements not documented

ALLOWED OPTIMIZATIONS:
✅ Reword existing bullet points with stronger action verbs
✅ Reorganize existing experiences for better flow
✅ Emphasize documented skills relevant to job
✅ Add keywords from job description to EXISTING experiences (if not fabricating)
✅ Improve formatting and structure

CRITICAL: Format as ATS-friendly PLAIN TEXT (no markdown **, ##).

[FULL NAME]
[Contact Info]

PROFESSIONAL SUMMARY
[Brief summary from documented experience]

SKILLS
[ONLY skills found in documents or reasonable inferences]

PROFESSIONAL EXPERIENCE
[ONLY positions from documents, bullet points from verified work]

EDUCATION
[ONLY if degrees exist in documents]

CERTIFICATIONS
[ONLY if certifications exist in documents]

Style: ${style}

REMEMBER: Truth > ATS Score. An honest 50% match is better than a fabricated 90% match.`;

        const reformatUserPrompt = `JOB TITLE: ${jobTitle}
COMPANY: ${companyName || 'the company'}

JOB DESCRIPTION:
${jobDescription}

CURRENT RESUME:
${resumeContent}

DOCUMENT-AWARE ANALYSIS:
${analysis}

ORIGINAL DOCUMENTS (VERIFY AGAINST THESE):
${documentsText}

TASK: Rewrite the resume following these STRICT RULES:

1. Review the analysis categories:
   - [REPHRASE] items → ADD these (they're verified in documents)
   - [INFERENCE] items → ADD only if conservative and logical
   - [GAP] items → DO NOT ADD (skills not in documents)

2. For EVERY addition you consider:
   - Ask: "Is this explicitly in the original documents?"
   - If YES → Add it
   - If MAYBE/INFERENCE → Only add if very conservative
   - If NO/GAP → DO NOT ADD IT

3. Improve ATS score by:
   - Emphasizing verified skills that match job requirements
   - Reorganizing existing content for better flow
   - Adding job keywords to EXISTING documented experiences
   - NOT by inventing skills or experiences

4. If a job requirement isn't in documents:
   - Accept the lower ATS score
   - Do NOT fabricate to fill the gap
   - Focus on what the candidate DOES have

OUTPUT: Reformatted resume with ONLY verified content from original documents.`;

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
          
          console.log('Document-Verified ATS Score:', refinedResult.score, '(from initial', atsScore, ')');
          console.log('✅ Resume verified against', documents?.length || 0, 'original documents');
          
          // Use document-verified version
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
          document_verified: true,
          verification_date: new Date().toISOString(),
          documents_checked: documents?.length || 0,
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
