const fs = require('fs');
const path = require('path');
const { buildPrompt } = require('../../src/form-filler');
const { askGemini } = require('../../src/gemini');

// Set your API key in environment to test Gemini:
// export GEMINI_API_KEY="AIzaSy..."
const apiKey = process.env.GEMINI_API_KEY;

async function runEvals() {
    const scenariosDir = path.join(__dirname, 'scenarios');
    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.json'));

    console.log(`Found ${files.length} evaluation scenarios.\n`);

    for (const file of files) {
        console.log(`[Running Eval]: ${file}`);
        const scenario = JSON.parse(fs.readFileSync(path.join(scenariosDir, file), 'utf8'));
        
        const prompt = buildPrompt(0, scenario.cvText, scenario.profileText, scenario.domState, '', '');
        
        if (!apiKey) {
            console.warn(`⚠️  GEMINI_API_KEY not set. Skipping real API call.`);
            console.log(`Prompt would be:\n${prompt.substring(0, 500)}...\n`);
            continue;
        }

        try {
            console.log(`Calling Gemini...`);
            const result = await askGemini(prompt, apiKey, 'gemini-2.5-flash');
            
            let passed = true;
            console.log(`Expected Actions:`, scenario.expectedActions);
            console.log(`Received Actions:`, result.actions);

            // Basic validation
            for (const expected of scenario.expectedActions) {
                const found = result.actions.find(a => a.id === expected.id && a.action === expected.action);
                if (!found) {
                    console.error(`❌ FAILED: Missing expected action on ${expected.id} (${expected.action})`);
                    passed = false;
                } else if (expected.value && found.value !== expected.value) {
                    console.error(`❌ FAILED: Expected value '${expected.value}' but got '${found.value}' for ${expected.id}`);
                    passed = false;
                }
            }

            if (passed) {
                console.log(`✅ PASSED: ${scenario.name}`);
            }
        } catch (e) {
            console.error(`❌ FAILED: API Error - ${e.message}`);
        }
        console.log('--------------------------------------------------\n');
    }
}

runEvals();
