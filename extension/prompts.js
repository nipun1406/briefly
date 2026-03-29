// prompts.js
export const GUARDRAILS = `
STRICT EMBELLISHMENT RULES — YOU MUST FOLLOW THESE:
ALLOWED:
  - Rephrasing bullets using JD keywords and action verbs
  - Reordering / emphasising existing tech stack items that match the JD

FORBIDDEN — NEVER DO ANY OF THE FOLLOWING:
  - Change company names, university names, or project names
  - Change or round up GPAs
  - Add tools, languages, or frameworks not mentioned anywhere in the candidate profile
  - Invent achievements, certifications, or responsibilities
  - Change job titles or employment dates
`;

export const Prompts = {
  // ─── OpenRouter/Gemini Prompts (Text/JSON Tasks) ───
  extractJDMeta: (jd, profile) => ({
    system: `You extract structured metadata. Respond ONLY with a minified, single-line JSON object. DO NOT output markdown, backticks, or newline (\\n) characters.`,
    user: `Extract/generate: 1. company name, 2. role, 3. workExRoleDescriptions (2-3 sentences tailored to JD for EACH workEx role), 4. skillsExactMatch, 5. skillsCloseMatch. Return EXACTLY this single-line JSON format: {"company":"...","role":"...","workExRoleDescriptions":{"Job 1":"..."},"skillsExactMatch":["..."],"skillsCloseMatch":["..."]} CANDIDATE PROFILE: ${JSON.stringify(profile)} JOB DESCRIPTION: ${jd}`
  }),

  parseResume: (text) => ({
    system: `You parse resumes. Respond ONLY with a minified, single-line JSON object. DO NOT output markdown, backticks, or newline (\\n) characters.`,
    user: `Parse this resume text into the following single-line JSON schema. Fill all fields; use empty strings/arrays for missing data. SCHEMA: {"personal":{"name":"","email":"","phone":"","location":"","linkedin":"","github":"","website":""},"modules":{"education":[{"institution":"","degree":"","field":"","startDate":"","endDate":"","gpa":"","bullets":[]}],"workExperience":[{"company":"","title":"","location":"","startDate":"","endDate":"","bullets":[]}],"projects":[{"name":"","tech":"","url":"","bullets":[]}],"achievements":[{"name":"","date":"","description":""}],"skills":{"languages":[],"frameworks":[],"tools":[]},"courses":[{"name":"","institution":"","date":"","level":""}]}} RESUME TEXT: ${text.replace(/\n/g, ' ')}`
  }),

  chat: (profile, jd, detailedMode) => ({
    system: `You are a helpful job application assistant. ${detailedMode ? '' : 'IMPORTANT: Maximum 2–3 sentences. No filler words.'}`,
    user: `CANDIDATE PROFILE: ${JSON.stringify(profile)}\nJOB DESCRIPTION: ${jd || 'None'}`
  }),

  // ─── OpenRouter Prompts (LaTeX Tasks) ───
  generateResume: (profile, jd, template) => ({
    system: `You are a resume writer and LaTeX typesetter. Output ONLY valid LaTeX — no markdown fences.\n${GUARDRAILS}`,
    user: `Generate a highly tailored resume in LaTeX. 

CRITICAL CONSTRAINTS:
1. RELEVANCE: Do NOT include every experience or skill from the profile. Ruthlessly cull irrelevant information. ONLY include roles, projects, and skills that strongly match the JD.
2. EXACT LENGTH: The compiled document MUST fill exactly ONE FULL PAGE. It cannot spill over to page 2, and it cannot leave large blank spaces at the bottom. Dynamically adjust the number of bullet points, projects, or older roles included to achieve this exact length.

LATEX TEMPLATE:\n${template}\nCANDIDATE PROFILE:\n${JSON.stringify(profile)}\nJOB DESCRIPTION:\n${jd}`
  }),

  generateCoverLetter: (profile, jd, template) => ({
    system: `You are a cover letter writer and LaTeX typesetter. Output ONLY valid LaTeX — no markdown fences. The cover letter must be prose-heavy, narrative, and longer in content than a one-page resume.\n${GUARDRAILS}`,
    user: `Generate a compelling cover letter in LaTeX. Do NOT use bullet points. Only focus on experiences most relevant to the JD.\nLATEX TEMPLATE:\n${template}\nCANDIDATE PROFILE:\n${JSON.stringify(profile)}\nJOB DESCRIPTION:\n${jd}`
  })
};