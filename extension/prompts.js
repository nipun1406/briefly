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
  // ─── Gemini Prompts ───
  extractJDMeta: (jd, profile) => ({
    system: `You extract structured metadata from job descriptions and candidate profiles. Respond ONLY with a JSON object.`,
    user: `Analyze this job description and the provided candidate profile to extract/generate the following:
1. Company name.
2. Job role/title.
3. "workExRoleDescriptions": For EACH role in the candidate's work experience, generate a short 2-3 sentence role description tailored to the job description.
4. "skillsExactMatch": A list of skills in the candidate's profile that EXACTLY match a skill mentioned in the JD.
5. "skillsCloseMatch": A list of skills in the candidate's profile that are CLOSELY RELATED to a skill mentioned in the JD.

Return EXACTLY this JSON format:
{
  "company": "...",
  "role": "...",
  "workExRoleDescriptions": {
    "Job Title 1 at Company 1": "...",
    "Job Title 2 at Company 2": "..."
  },
  "skillsExactMatch": ["...", "..."],
  "skillsCloseMatch": ["...", "..."]
}

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

JOB DESCRIPTION:
${jd}`
  }),

  parseResume: (text) => ({
    system: `Extract structured data from resume text and return ONLY a JSON object matching the schema exactly.`,
    user: `Parse this resume text into the following JSON schema. Fill all fields you can find; use empty strings/arrays for missing data.
SCHEMA:
{
  "personal": { "name":"","email":"","phone":"","location":"","linkedin":"","github":"","website":"" },
  "modules": {
    "education": [{ "institution":"","degree":"","field":"","startDate":"","endDate":"","gpa":"","bullets":[] }],
    "workExperience": [{ "company":"","title":"","location":"","startDate":"","endDate":"","bullets":[] }],
    "projects": [{ "name":"","tech":"","url":"","bullets":[] }],
    "achievements": [{ "name":"","date":"","description":"" }],
    "skills": { "languages": [], "frameworks": [], "tools": [] },
    "courses": [{ "name":"","institution":"","date":"", "level":"" }]
  }
}
RESUME TEXT:\n${text}`
  }),

  chat: (profile, jd, detailedMode) => ({
    system: `You are a helpful job application assistant with access to the candidate profile and job description. ${detailedMode ? '' : 'IMPORTANT: Maximum 2–3 sentences. No filler words.'}\n\nCANDIDATE PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nJOB DESCRIPTION:\n${jd || 'No JD loaded.'}`
  }),

  // ─── OpenRouter (Claude/DeepSeek) Prompts ───
  generateResume: (profile, jd, template) => ({
    system: `You are a resume writer and LaTeX typesetter. Output ONLY valid LaTeX — no markdown fences. The resume MUST fit on exactly ONE page.\n${GUARDRAILS}`,
    user: `Generate a tailored, 1-page resume in LaTeX.\n\nLATEX TEMPLATE:\n${template}\n\nCANDIDATE PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nJOB DESCRIPTION:\n${jd}`
  }),

  generateCoverLetter: (profile, jd, template) => ({
    system: `You are a cover letter writer and LaTeX typesetter. Output ONLY valid LaTeX — no markdown fences. The cover letter must be prose-heavy, narrative, and longer in content than a one-page resume.\n${GUARDRAILS}`,
    user: `Generate a compelling cover letter in LaTeX. Do NOT use bullet points.\n\nLATEX TEMPLATE:\n${template}\n\nCANDIDATE PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nJOB DESCRIPTION:\n${jd}`
  })
};