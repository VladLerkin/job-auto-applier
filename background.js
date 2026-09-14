chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generate') {
    handleGenerate(request.payload)
      .then(text => sendResponse({ success: true, text }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    
    // Return true to indicate we will send a response asynchronously
    return true; 
  }
});

async function handleGenerate({ apiKey, modelName, cv, profile, jobDescription, formFields }) {
  const prompt = `
You are an expert career assistant. I need you to help me fill out a job application form.
Here is the Job Description / Page Content:
---
${jobDescription.substring(0, 15000)}
---

Here is my CV/Resume:
---
${cv}
---

Here is some additional profile info or preferences (if any):
---
${profile || "None provided"}
---

Here are the form fields on the page:
---
${JSON.stringify(formFields, null, 2)}
---

Based on the above, provide the values to fill into the form fields. 
Follow these STRICT rules:
1. For fields asking for a cover letter, write a concise, compelling cover letter highlighting my relevant skills based on the job description.
2. For fields asking for names, emails, links, etc., extract them accurately from my CV.
3. For social media links (LinkedIn, Twitter, GitHub, etc.), ONLY fill them in if you find the EXACT matching profile link in my CV. DO NOT put a Telegram link in a Twitter field. DO NOT guess.
4. For date fields (From, To, etc), output strictly in 'YYYY-MM-DD' format. You MUST extract the exact month from the CV (e.g., Jan=01, Dec=12). Do NOT default to January (01) if the CV specifies another month! For 'From'/start dates, use the 1st day of that month (e.g., 'Dec 2025' -> '2025-12-01'). For 'To'/end dates, use the last day of that month (e.g., 'Dec 2025' -> '2025-12-31').
5. If a field provides an 'options' array, you MUST return a value that exactly matches one of the provided options. Do not make up a value not in the list.
6. If you cannot find the information for a specific field in my CV or Profile, return an empty string "" for that field. DO NOT hallucinate answers.

Return a JSON object where the keys are the exact 'id' of the form fields, and the values are the text to insert.
Respond ONLY with valid JSON. Do not include markdown formatting.
`;

  const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  };

  let response;
  let retries = 3;
  let delay = 2000;
  
  while (retries > 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    try {
      response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.status === 503 || response.status === 429) {
        retries--;
        if (retries === 0) break;
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      } else {
        break; // Success or non-retryable error (e.g., 404, 400)
      }
    } catch (e) {
      clearTimeout(timeoutId);
      retries--;
      if (retries === 0) {
        throw new Error(`Network Error or Timeout: ${e.message}`);
      }
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates.length > 0 && data.candidates[0].content.parts.length > 0) {
    return data.candidates[0].content.parts[0].text;
  } else {
    throw new Error("Unexpected response structure from Gemini API");
  }
}
