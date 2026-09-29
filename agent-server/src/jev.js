const { TypeSafeClient, choice, noul } = require('@typesafe-ai/sdk');

/**
 * Initializes the TypeSafe AI client.
 * @param {string} apiKey 
 * @returns {TypeSafeClient|null}
 */
function initJev(apiKey) {
    if (!apiKey) return null;
    try {
        const client = new TypeSafeClient({ apiKey });
        console.log("✅ TypeSafe AI (Jev System One) initialized as a Guardrail engine.");
        return client;
    } catch (e) {
        console.error("Failed to initialize TypeSafe:", e.message);
        return null;
    }
}

/**
 * Routes binary and simple choice fields to Jev for fast processing.
 * @param {TypeSafeClient} client 
 * @param {string} cvText 
 * @param {string} profileText 
 * @param {Array} binaryFields 
 * @returns {Promise<Array>} List of generated actions
 */
async function askJev(client, cvText, profileText, binaryFields) {
    let jevActions = [];
    if (!client || binaryFields.length === 0) return jevActions;
    
    console.log(`⚡ Jev Routing: Processing ${binaryFields.length} choice fields...`);
    try {
        const state = `User CV: ${cvText}\nPreferences: ${profileText || 'None'}`;
        const questions = {};
        
        binaryFields.forEach(el => {
            const isAlreadySelected = el.tag === 'select' ? (el.text && el.text.length > 0 && !el.text.toLowerCase().includes('select')) : el.checked;
            if (el.context && !isAlreadySelected) { // Ensure it's not already filled
                const key = `action_${el.id.replace(/-/g, '_')}`;
                if (el.tag === 'select') {
                    // options are already an array of strings from dom-extractor
                    const optionTexts = el.options.map(o => typeof o === 'string' ? o.trim() : o.text?.trim()).filter(Boolean).slice(0, 20);
                    optionTexts.push("Skip");
                    questions[key] = choice(`Which option accurately describes the user for the field: "${el.context}"?`, optionTexts);
                } else {
                    const optionText = el.label || el.value || el.text || '';
                    const optionStr = optionText ? ` Option: "${optionText}".` : '';
                    questions[key] = choice(`Should this checkbox/radio button be selected? Consider the user's CV and Preferences. IMPORTANT: For general consent, agreement, acknowledgment, legal, or terms & conditions checkboxes, ALWAYS select "Yes". Field context: "${el.context}".${optionStr}`, ["Yes", "No"]);
                }
            }
        });
        
        if (Object.keys(questions).length > 0) {
            const tsResponse = await client.systemOne({ state, questions });
            for (const el of binaryFields) {
                const key = `action_${el.id.replace(/-/g, '_')}`;
                const res = tsResponse.answers[key];
                if (res) {
                    if (el.tag === 'select') {
                        if (res.choice && res.choice !== "Skip" && res.confidence > 0.4) {
                            jevActions.push({ action: 'selectNative', id: el.id, value: res.choice });
                            console.log(`✅ Jev chose dropdown: "${res.choice}" for "${el.context.substring(0, 40)}..."`);
                        }
                    } else {
                        if (res.choice === "Yes" && res.confidence > 0.4) {
                            jevActions.push({ action: 'click', id: el.id, value: el.context });
                            console.log(`✅ Jev clicked checkbox/radio: "${el.context.substring(0, 40)}..."`);
                        }
                    }
                }
            }
        }
        console.log(`⚡ Jev generated ${jevActions.length} actions.`);
    } catch(e) {
        console.error("⚠️ Jev routing failed:", e.message);
    }
    
    return jevActions;
}

module.exports = { initJev, askJev };
