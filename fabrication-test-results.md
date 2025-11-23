# Fabrication Test Results - Document-Aware System
**Test Date:** 2025-11-23  
**Resume ID:** f76f1916-cef6-46fb-b976-ec7000220398  
**Job:** Support Operations Specialist at Anthropic  
**ATS Score:** 94% (Generated with NEW document-aware system)  
**System Version:** Document-Aware Analysis & Reformat (Post-Update)

---

## 🚨 CRITICAL FINDING: Document-Aware System Still Fabricating

Despite implementing document verification, the system generated a resume with **~10-15% fabricated content**.

---

## Fabrication Analysis

### ❌ HIGH SEVERITY FABRICATIONS

#### 1. **AI Tools - COMPLETELY FABRICATED**
**Resume Claims:**
```
AI & AUTOMATION
- Chat GPT, Claude, Gemini, Perplexity, Cursor, Huggingface
```

**Original Document Check:**
- ❌ Chat GPT - NOT mentioned in any document
- ❌ Claude - NOT mentioned in any document
- ❌ Gemini - NOT mentioned in any document
- ❌ Perplexity - NOT mentioned in any document
- ❌ Cursor - NOT mentioned in any document
- ❌ Huggingface - NOT mentioned in any document

**Reality:** Only mentions "automation using Sonnet, SQL, Python, Tableau, and Google App Scripts"

**Fabrication Severity:** CRITICAL - Interview-breaking
**Category:** Should be [GAP] - Required skill NOT in documents

---

#### 2. **AI-Native Support Models - FABRICATED**
**Resume Claims:**
```
- AI-native support models
- AI capabilities
- AI performance monitoring
```

**Original Document Check:**
- ❌ "AI-native support models" - NEVER mentioned
- ❌ "AI capabilities" - NEVER mentioned
- ❌ "AI performance monitoring" - NEVER mentioned
- ✅ Has: "automation using SQL, Python, Tableau"

**Fabrication Severity:** HIGH - Invents expertise area
**Category:** Should be [GAP] - Not found in documents

---

#### 3. **Zendesk - FABRICATED TOOL**
**Resume Claims:**
```
- JIRA, Trello, Asana, Zendesk, Notion, CRM, Sonnet, Sentilink
```

**Original Document Check:**
- ✅ JIRA - Mentioned in original
- ✅ Trello - Mentioned in original
- ✅ Asana - Mentioned in original
- ❌ Zendesk - NEVER mentioned in any document
- ✅ Notion - Mentioned in original
- ✅ Sonnet - Mentioned in original
- ✅ Sentilink - Mentioned in original

**Fabrication Severity:** HIGH - Tool never used
**Category:** Should be [GAP] - Required by job, not in documents

---

#### 4. **CSAT Analysis - FABRICATED METRIC**
**Resume Claims:**
```
CUSTOMER & USER EXPERIENCE
- CSAT analysis
```

**Original Document Check:**
- ❌ CSAT never mentioned in any document
- ✅ Has: "7% increase in customer payments" (payment success, NOT satisfaction)
- ✅ Has: "improved customer experience" (generic statement)

**Fabrication Severity:** MEDIUM - Different metric type
**Category:** Should be [GAP] or [INFERENCE] with disclaimer

---

### ✅ VERIFIED CONTENT (Correctly From Documents)

**Legitimate Skills & Experience:**
- ✅ SQL, Python, Tableau, Google App Scripts
- ✅ Sonnet, Sentilink, JIRA, Trello, Asana, Notion
- ✅ Process optimization, workflow optimization
- ✅ Fraud operations background
- ✅ Team leadership (2 specialists, 10 analysts)
- ✅ Cash collection program (7% increase in payments)
- ✅ Cross-functional collaboration (Product, Data Science, Finance)
- ✅ Project management, KPI/OKR management

---

## Interview Risk Assessment

### Questions User CANNOT Answer:

**Q: "Tell me about your experience with Claude or GPT-4."**
- Resume claims: Lists "Chat GPT, Claude, Gemini"
- Reality: Never used these tools
- **Result:** Immediate credibility loss ❌

**Q: "How have you used AI-native support models in previous roles?"**
- Resume claims: "Specializing in AI-native support models"
- Reality: No AI experience, only basic Python automation
- **Result:** Exposed as fabrication ❌

**Q: "Walk me through your CSAT analysis methodology."**
- Resume claims: "CSAT analysis"
- Reality: Only payment success metrics (7% increase)
- **Result:** Cannot provide examples ❌

**Q: "What's your experience with Zendesk?"**
- Resume claims: Lists Zendesk as tool
- Reality: Used Sonnet, not Zendesk
- **Result:** Tool knowledge gap exposed ❌

---

## System Performance Analysis

### Expected vs. Actual Behavior

**EXPECTED (Document-Aware System):**
- ❌ Reject: "Chat GPT, Claude, Gemini" → [GAP]
- ❌ Reject: "AI-native support models" → [GAP]
- ❌ Reject: "Zendesk" → [GAP]
- ❌ Reject: "CSAT analysis" → [GAP] or careful [INFERENCE]
- ✅ Keep: SQL, Python, Tableau → [REPHRASE]
- ✅ Keep: Fraud operations → [REPHRASE]

**ACTUAL (What Happened):**
- ❌ ADDED: "Chat GPT, Claude, Gemini" (FABRICATED)
- ❌ ADDED: "AI-native support models" (FABRICATED)
- ❌ ADDED: "Zendesk" (FABRICATED)
- ❌ ADDED: "CSAT analysis" (FABRICATED)
- ✅ KEPT: SQL, Python, Tableau (CORRECT)
- ✅ KEPT: Fraud operations (CORRECT)

---

## Fabrication Statistics

**Total Skills/Claims:** ~50 items
**Fabricated Items:** 7-8 major fabrications
**Fabrication Rate:** ~10-15%
**Target Rate:** <5%
**Status:** ❌ FAILED - System still fabricating above target

### Breakdown:
- **Critical Fabrications (Interview-Breaking):** 4 items
  - AI tools (Chat GPT, Claude, Gemini, etc.)
  - AI-native support models
  - Zendesk
  - CSAT analysis
- **Verified Content:** ~40 items (80-85%)
- **Conservative Inferences:** Few items (acceptable)

---

## Root Cause Analysis

### Why is the System Still Fabricating?

**Hypothesis 1: Prompt Strength**
- AI model may be prioritizing ATS score over truthfulness
- "Optimization pressure" overriding anti-fabrication rules

**Hypothesis 2: Categorization Failure**
- AI correctly identifies [GAP] items but still adds them
- Reformat function not properly filtering [GAP] suggestions

**Hypothesis 3: Document Context Insufficient**
- Original documents being included but not weighted heavily enough
- Job description requirements overriding document verification

**Hypothesis 4: Inference Rules Too Loose**
- "Reasonable inference" being interpreted too broadly
- "Python automation" → "AI capabilities" is TOO BIG a leap

---

## Recommended Fixes

### 1. **Strengthen Anti-Fabrication Prompts**
```
CRITICAL RULE: NEVER add skills, tools, or technologies NOT explicitly mentioned in original documents.
If skill is required by job but NOT in documents → REFUSE TO ADD IT.
ATS score reduction is ACCEPTABLE. Fabrication is NOT ACCEPTABLE.
```

### 2. **Add Explicit Rejection List**
```
FORBIDDEN ADDITIONS (unless in documents):
- Specific AI tools (ChatGPT, Claude, Gemini, GPT-4, etc.)
- Support platforms (Zendesk, Intercom, Freshdesk)
- Metrics not in documents (CSAT, NPS, etc.)
```

### 3. **Make [GAP] Items Visible but NOT Added**
- Analysis should show [GAP] items as "Skills to Develop"
- Reformat should NEVER add [GAP] items to resume
- User should see: "These skills are required but not in your documents"

### 4. **Stricter Inference Rules**
```
VALID INFERENCE: Python → "scripting" (adjacent skill)
INVALID INFERENCE: Python automation → "AI capabilities" (too broad)
INVALID INFERENCE: Payment metrics → "CSAT analysis" (different metric)
```

---

## Success Criteria (Not Met)

- ❌ Fabrication rate <5% (ACTUAL: 10-15%)
- ❌ All [GAP] items excluded from resume (ACTUAL: Added to resume)
- ❌ Only [REPHRASE] and conservative [INFERENCE] included
- ✅ Document fetching working (22 documents retrieved)
- ✅ Categorization logic present (but not enforced)

---

## Conclusion

**Status:** ❌ SYSTEM STILL FABRICATING ABOVE TARGET

The document-aware system is **partially working** but **not fully effective**:
- ✅ Fetches original documents correctly
- ✅ Likely categorizes suggestions (need to see analysis output)
- ❌ FAILS to prevent [GAP] items from being added
- ❌ FAILS to maintain <5% fabrication target

**Current State:** 10-15% fabrication (HIGH RISK)
**Target State:** <5% fabrication (ACCEPTABLE RISK)
**Gap:** System needs stronger enforcement of anti-fabrication rules

---

## Next Steps

1. **Review Analysis Output:** Check if AI is correctly categorizing as [GAP]
2. **Strengthen Reformat Prompts:** Add explicit rejection rules for [GAP] items
3. **Add Post-Processing Filter:** Code-level check to remove [GAP] items
4. **Test Again:** Run another fabrication test after fixes
5. **Target:** Achieve <5% fabrication rate

**The core issue:** The system identifies fabrications but still adds them to optimize ATS score.
**The solution:** Enforce strict filtering where ATS score reduction is acceptable to maintain truthfulness.
