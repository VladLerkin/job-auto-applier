const { GoogleGenAI } = require('@google/genai');

/**
 * Send a prompt to Gemini and return the parsed JSON response.
 */
async function askGemini(prompt, apiKey, modelName) {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: modelName || 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json"
        }
    });
    return JSON.parse(response.text);
}

/**
 * Generate plain-text cover letter via Gemini.
 */
async function generateCoverLetterText(cvText, jobDescription, profileText, apiKey, modelName, maxLength) {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a professional career coach. Write a compelling, tailored cover letter for the job below.

Job Description:
${jobDescription || 'Not provided'}

Candidate CV:
${cvText}

Candidate Preferences / Notes:
${profileText || 'None'}

Instructions:
${maxLength ? `- 1-2 paragraphs max, professional tone\n- VERY IMPORTANT: The output MUST be strictly under ${maxLength} characters in length.` : '- 3-4 paragraphs, professional tone'}
- Address the specific role and company if identifiable
- Highlight the most relevant experience and skills
- End with a strong closing statement
- Do NOT include placeholders like [Your Name] — use the actual name from the CV
- Output ONLY the cover letter text, no subject line, no extra commentary`;

    const response = await ai.models.generateContent({
        model: modelName || 'gemini-3.8-flash',
        contents: prompt
    });
    return response.text.trim();
}

module.exports = { askGemini, generateCoverLetterText };
