require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const domState = [
  {
    "id": "agent-5",
    "tag": "input",
    "type": "text",
    "name": "",
    "label": "First name*",
    "value": "",
    "text": ""
  },
  {
    "id": "agent-6",
    "tag": "input",
    "type": "text",
    "name": "",
    "label": "Last name*",
    "value": "",
    "text": ""
  }
];

const cvText = "Vladislav Ivanov, Senior Java Developer";

const prompt = `
You are an autonomous web agent helping a user fill out a job application.

Here is the user's CV:
---
${cvText}
---

Here is the current DOM state (interactive elements only):
---
${JSON.stringify(domState, null, 2)}
---

Based on the CV and the DOM state, decide what actions to take. 
You can fill text inputs, or click options in dropdowns.

Rules:
1. Only take action on fields that relate to the CV (e.g. Title, Company, Dates).
2. If you see an open dropdown list (e.g. listbox, options, li elements with text matching what we need), output a 'click' action for the correct option ID.
3. Do not fill fields that already have the correct value.
4. For dates, type 'MM/YYYY' (e.g. '12/2025') if it is a month/year picker.

Return a JSON object with an array of "actions". 
Each action must have:
- "action": "fill" or "click"
- "id": The "id" of the element from the DOM state (e.g. "agent-5")
- "value": (only if action is "fill") the exact string to type into the field.

Example:
{
   "actions": [
      { "action": "fill", "id": "agent-12", "value": "Senior Java Developer" },
      { "action": "click", "id": "agent-45" }
   ]
}

If there is nothing left to do, return {"actions": []}.
Respond strictly with JSON.
`;

async function run() {
    console.log("Using API Key:", process.env.GEMINI_API_KEY ? "YES" : "NO");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        console.log(response.text);
    } catch (e) {
        console.error(e);
    }
}
run();
