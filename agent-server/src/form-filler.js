const fs = require('fs');
const path = require('path');
const { logToFile } = require('./logger');
const { askGemini } = require('./gemini');
const { askLocalLLM } = require('./local-llm');
const { extractDOM } = require('./dom-extractor');

/**
 * Execute a single action on the page (fill, click, clickText, selectOption, selectNative).
 */
async function executeAction(page, action) {
    let targetLocator = null;
    let targetFrame = null;

    if (action.action !== 'clickText') {
        const selector = `[data-arf-id="${action.id}"]`;
        for (const frame of page.frames()) {
            const loc = frame.locator(selector).first();
            const count = await loc.count().catch(() => 0);
            if (count > 0) {
                targetLocator = loc;
                targetFrame = frame;
                break;
            }
        }
        if (!targetLocator) throw new Error(`Could not find element ${action.id} in any frame`);
    }

    if (action.action === 'fill') {
        try {
            const inputType = await targetLocator.evaluate(el => el.type).catch(() => '');
            if (action.value.length > 50 || ['date', 'month', 'time'].includes(inputType)) {
                await targetLocator.fill(action.value, { timeout: 1000 });
            } else {
                await targetLocator.fill('', { timeout: 1000 }); // Clear first
                await targetLocator.pressSequentially(action.value, { delay: 15, timeout: 5000 });
            }
        } catch (e) {
            throw new Error(`Could not fill element ${action.id}: ${e.message}`);
        }
        await page.waitForTimeout(1000);

    } else if (action.action === 'click') {
        try {
            await targetLocator.click({ force: true, timeout: 500 });
        } catch (e) {
            throw new Error(`Could not click element ${action.id}: ${e.message}`);
        }
        await page.waitForTimeout(1000);

    } else if (action.action === 'clickText') {
        const isExact = action.exact === true;
        let clicked = false;
        
        for (const frame of page.frames()) {
            const elements = await frame.getByText(action.value, { exact: isExact }).elementHandles().catch(() => []);
            for (let el of elements) {
                try {
                    await el.click({ force: true, timeout: 500 });
                    clicked = true;
                    break;
                } catch(e) { }
            }
            if (clicked) break;
        }
        
        // Fallback: search inside Shadow DOM via evaluate
        if (!clicked) {
            for (const frame of page.frames()) {
                clicked = await frame.evaluate(({ searchText, exact }) => {
                    function findInShadow(root, text, exactMatch) {
                        const allNodes = root.querySelectorAll('*');
                        for (const node of allNodes) {
                            const nodeText = (node.innerText || node.textContent || '').trim();
                            const matches = exactMatch ? nodeText === text : nodeText.includes(text);
                            if (matches && node.offsetParent !== null) {
                                node.click();
                                return true;
                            }
                            if (node.shadowRoot) {
                                const found = findInShadow(node.shadowRoot, text, exactMatch);
                                if (found) return true;
                            }
                        }
                        return false;
                    }
                    return findInShadow(document, searchText, exact);
                }, { searchText: action.value, exact: isExact }).catch(() => false);
                
                if (clicked) break;
            }
        }
        if (!clicked) {
            throw new Error(`No clickable element found with text: ${action.value}`);
        }
        await page.waitForTimeout(1000);

    } else if (action.action === 'selectNative') {
        let selected = false;
        const optionValue = await targetLocator.evaluate((selectNode, matchText) => {
            if (!selectNode.options) return null;
            const lowerMatch = matchText.toLowerCase().trim();
            for (let opt of selectNode.options) {
                if (opt.text.trim().toLowerCase() === lowerMatch) return opt.value;
            }
            for (let opt of selectNode.options) {
                if (opt.text.trim().toLowerCase().includes(lowerMatch)) return opt.value;
            }
            return null;
        }, action.value).catch(() => null);

        if (optionValue !== null) {
            try { await targetLocator.selectOption(optionValue, { timeout: 2000 }); selected = true; } catch(e) {}
        }
        if (!selected) await targetLocator.selectOption({ label: action.value }, { timeout: 2000 });
        await page.waitForTimeout(500);

    } else if (action.action === 'selectOption') {
        // Handle combobox/autocomplete fields (Country/Region, City with search)
        const tagName = await targetLocator.evaluate(el => el.tagName).catch(() => '');
        if (tagName === 'SELECT') {
            let selected = false;
            const optionValue = await targetLocator.evaluate((selectNode, matchText) => {
                if (!selectNode.options) return null;
                const lowerMatch = matchText.toLowerCase().trim();
                for (let opt of selectNode.options) {
                    if (opt.text.trim().toLowerCase() === lowerMatch) return opt.value;
                }
                for (let opt of selectNode.options) {
                    if (opt.text.trim().toLowerCase().includes(lowerMatch)) return opt.value;
                }
                return null;
            }, action.select).catch(() => null);

            if (optionValue !== null) {
                try { await targetLocator.selectOption(optionValue, { timeout: 2000 }); selected = true; } catch(e) {}
            }
            if (!selected) await targetLocator.selectOption({ label: action.select }, { timeout: 2000 });
            await page.waitForTimeout(500);
        } else {
            // 1. Click on the element to focus/open it
            await targetLocator.click({ timeout: 2000 });
            await page.waitForTimeout(300);
            
            // 2. Clear existing value and type search text (only if it's an input)
            const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA';
            if (isInput && action.search) {
                await targetLocator.fill('', { timeout: 1000 });
                await targetLocator.pressSequentially(action.search, { delay: 50, timeout: 5000 });
            }
            
            // 3. Wait for dropdown options to appear
            await page.waitForTimeout(2000);
            
            // 4. Try to click the matching option using multiple strategies
            let optionClicked = false;
            let matchText = action.select.toLowerCase();
            let altMatchText = action.select.includes(',') ? action.select.split(',')[0].trim().toLowerCase() : null;
            
            // Strategy 1: Click by role="option"
            try {
                const options = targetFrame.getByRole('option', { name: action.select });
                const count = await options.count();
                if (count > 0) {
                    await options.first().click({ timeout: 2000 });
                    optionClicked = true;
                }
            } catch(e) { /* try next strategy */ }
            
            // Strategy 2: Use getByText to find visible elements matching the text
            if (!optionClicked) {
                try {
                    const textMatch = targetFrame.getByText(altMatchText || matchText);
                    const count = await textMatch.count();
                    for (let i = 0; i < count; i++) {
                        const el = textMatch.nth(i);
                        if (await el.isVisible()) {
                            const tagName = await el.evaluate(e => e.tagName).catch(()=>'');
                            if (!['INPUT', 'TEXTAREA', 'FORM', 'BODY', 'HTML'].includes(tagName)) {
                                const text = (await el.innerText()).toLowerCase().trim();
                                if (text === matchText || text === altMatchText || text.startsWith(matchText) || (altMatchText && text.startsWith(altMatchText))) {
                                    await el.click({ force: true, timeout: 1000 });
                                    optionClicked = true;
                                    break;
                                }
                            }
                        }
                    }
                } catch(e) { /* try next strategy */ }
            }
            
            // Strategy 3: Click by common list item selectors
            if (!optionClicked) {
                try {
                    const listItems = targetFrame.locator('[role="listbox"] li, [role="listbox"] [role="option"], [class*="dropdown"] li, [class*="dropdown"] a, [class*="menu"] li');
                    const count = await listItems.count();
                    for (let i = 0; i < count; i++) {
                        const text = await listItems.nth(i).innerText();
                        const optionText = text.toLowerCase().trim();
                        if (optionText === matchText || optionText === altMatchText || optionText.startsWith(matchText) || (altMatchText && optionText.startsWith(altMatchText))) {
                            await listItems.nth(i).click({ force: true, timeout: 1000 });
                            optionClicked = true;
                            break;
                        }
                    }
                } catch(e) { /* try next strategy */ }
            }
            
            // Strategy 4: Fallback to Shadow DOM evaluate for the specific frame
            if (!optionClicked) {
                optionClicked = await targetFrame.evaluate(({selectText, altText}) => {
                    function findOption(root, text, alt) {
                        const allNodes = root.querySelectorAll('*');
                        for (const node of allNodes) {
                            const tagName = node.tagName;
                            if (!['INPUT', 'TEXTAREA', 'FORM', 'BODY', 'HTML'].includes(tagName)) {
                                const nodeText = (node.innerText || node.textContent || '').toLowerCase().trim();
                                if (nodeText === text || nodeText === alt || nodeText.startsWith(text) || (alt && nodeText.startsWith(alt))) {
                                    if (node.children.length <= 2) {
                                        node.click();
                                        return true;
                                    }
                                }
                            }
                            if (node.shadowRoot) {
                                const found = findOption(node.shadowRoot, text, alt);
                                if (found) return true;
                            }
                        }
                        return false;
                    }
                    return findOption(document, selectText, altText);
                }, { selectText: matchText, altText: altMatchText }).catch(() => false);
            }
            
            if (!optionClicked) {
                throw new Error(`selectOption: Could not find and click option "${action.select}" after typing "${action.search}"`);
            }
            await page.waitForTimeout(1000);
        }
    }
}

/**
 * Build the LLM prompt for a given step.
 */
function buildPrompt(step, maxSteps, cvText, profileText, domState, errorPrompt, actionSummary) {
    return `
You are an autonomous web agent filling out a job application.
Step ${step + 1} of ${maxSteps}.
${errorPrompt}

Here is the user's CV:
---
${cvText}
---

Here are the user's Preferences / Notes:
---
${profileText || 'None'}
---

Here is the current DOM state (interactive elements, including their current values):
---
${JSON.stringify(domState, null, 2)}
---

Progress so far: ${actionSummary}

⚠️ CRITICAL RULE — SKIP ALREADY FILLED FIELDS:
- Look at the "value" field for each element. If a text field is ALREADY PRE-FILLED with correct data (e.g. your email, phone, location, or name), DO NOT touch it! 
- Only interact with fields that are empty ("value": "") or contain wrong data.
- If a radio or checkbox is already "checked": true, DO NOT click it again!
- The "context" field helps identify Yes/No buttons. Read the context to know what the button answers.

Decide what actions to take. Available actions: fill, click, clickText, selectOption, selectNative.

Rules:
0. PREFERENCES: ALWAYS prioritize the user's Preferences over generic assumptions! If they state they work remotely, select Remote=Yes. If they don't require sponsorship, select Sponsorship=No option.
1. SKIP already-filled fields and already-checked radios/checkboxes.

2. SEARCH DROPDOWN FIELDS (Country/Region, City, Title, Company, Office location):
   - Any field with a search icon (🔍) or role="combobox" is a search dropdown.
   - You MUST use "selectOption": { "action": "selectOption", "id": "<field id>", "search": "<search text>", "select": "<option to click>" }
   - Country/Region: { "action": "selectOption", "id": "<id>", "search": "Georgia", "select": "Georgia" }
   - City/Location: Search using "City, Country" or just "City". For 'select', provide "City, Country" as well (e.g. "Tbilisi, Georgia"). The script will handle matching it to country codes like "GEO" automatically.
   - Title: Use a GENERIC title! Search "Software" and select "Software Developer" or "Software Engineer".
   - Company: If it has a search icon, use selectOption. Otherwise use fill.
   - Do NOT use "fill" for search dropdown fields!

3. NATIVE <select> DROPDOWNS: tag="select" with "options" array → use "selectNative":
   { "action": "selectNative", "id": "<id>", "value": "Yes" }

4. RADIO BUTTONS: type="radio" → use "click".
5. CHECKBOXES: type="checkbox" → use "click" to toggle on.
6. Phone Country Code: click "Country code" button, then clickText the correct country.

7. DATES - CRITICAL:
   - LOOK AT THE FIELD'S placeholder, label, or type to determine the format!
   - If the field expects MM/YYYY or MM/YY, use that exact format (e.g. "06/2023").
   - If the field is just for a "Year", output the 4-digit year (e.g. "2023").
   - If it's a standard date field (YYYY-MM-DD) or has no specific format indication, use YYYY-MM-DD.
   - Extract the EXACT month from the CV. NEVER default to January (01) unless CV only says a year!
   - For current jobs: check "I currently work here" checkbox.

8. EXPERIENCE - Fill the LAST 4 jobs from the CV, starting with the OLDEST first:
   - Fill oldest job first → click Save → click +Add → fill next oldest, etc.
   - For each entry: fill Title (selectOption), Company, Description, From date, To date → click Save.
   - Skip entries already completed (check Progress above).

9. EDUCATION - Fill education entries:
   - Click "+ Add" for education, fill School, Degree, Field, From date, To date → click Save.

10. Cover Letter: DO NOT fill — it is handled separately.

11. STRICT TRUTHFULNESS: 
    - NEVER invent or hallucinate facts, experiences, or projects that are not explicitly stated in the CV.
    - If a custom question asks about an experience you don't have according to the CV, answer with "No commercial experience with this" or similar.

12. LENGTH LIMITS: 
    - If a field has a "maxLength" attribute, your response MUST NOT exceed this length in characters. Be concise.

13. WHEN DONE: When all fillable fields are complete and you have nothing more to do,
    return { "done": true, "actions": [] } — this will STOP the agent and notify the user to review.
    DO NOT try to submit the form!

Return JSON (one of these two formats):
{ "actions": [ { "action": "fill", "id": "agent-12", "value": "text" }, ... ] }
OR when finished:
{ "done": true, "actions": [] }
`;
}

/**
 * Run the main 15-step form-filling loop.
 * @param {Object} page - Playwright page object
 * @param {Object} options - { cvText, apiKey, modelName, profileText, isCancelledFn, provider, localModelPath }
 * @returns {Object} { success, allActions, message }
 */
async function fillForm(page, { cvText, apiKey, modelName, profileText, isCancelledFn, provider = 'gemini', localModelPath = null, maxSteps = 10, onProgress }) {
    let allActions = [];
    let completedEntries = [];
    let previousErrors = [];
    let consecutiveEmptySteps = 0;
    let repeatedActionsCount = 0;
    let lastActionsStr = "";
    
    for (let step = 0; step < maxSteps; step++) {
        if (onProgress) onProgress(step + 1, maxSteps);
        if (isCancelledFn()) {
            logToFile('🛑 Agent loop cancelled by user.');
            return { success: false, error: 'Stopped by user' };
        }
        try {
            console.log(`\n--- Step ${step + 1} ---`);
            await page.waitForTimeout(1500); 
            
            let domState = [];
            const frames = page.frames();
            for (let i = 0; i < frames.length; i++) {
                const frame = frames[i];
                try {
                    const frameState = await frame.evaluate(extractDOM, `f${i}`);
                    domState = domState.concat(frameState);
                } catch (e) {
                    fs.appendFileSync(path.join(__dirname, '..', 'debug_error.log'), `Frame ${i} extract error: ` + e.message + '\n');
                }
            }
            
            const hasFormFields = domState.some(el => 
                (['input', 'textarea', 'select'].includes(el.tag) && el.type !== 'hidden') ||
                el.tag === 'button' ||
                ['textbox', 'combobox', 'listbox', 'radio', 'checkbox'].includes(el.role) ||
                el.tag.includes('-button')
            );
            if (!hasFormFields) {
                logToFile(`No interactive form fields found on step ${step+1}, waiting...`);
                consecutiveEmptySteps++;
                if (consecutiveEmptySteps >= 5) {
                    logToFile(`🛑 Gave up waiting for form fields after 5 tries.`);
                    return { success: false, error: 'Could not detect any form fields on the page.' };
                }
                continue;
            }
            consecutiveEmptySteps = 0;
            
            fs.writeFileSync(path.join(__dirname, '..', 'debug_dom.json'), JSON.stringify(domState, null, 2));
            
            let errorPrompt = '';
            if (previousErrors.length > 0) {
                errorPrompt = `\nWARNING: Your actions from the PREVIOUS step failed with the following errors:\n${previousErrors.join('\n')}\nDO NOT repeat the exact same actions. Try a different approach (e.g. if selectOption failed, try clicking the field first, or use a different search term).\n`;
            }
            previousErrors = [];
            
            const actionSummary = completedEntries.length > 0 
                ? `Completed entries so far: ${completedEntries.join(', ')}` 
                : 'No entries completed yet.';
            
            const prompt = buildPrompt(step, maxSteps, cvText, profileText, domState, errorPrompt, actionSummary);
            
            let result;
            if (provider === 'local') {
                result = await askLocalLLM(prompt, localModelPath);
            } else {
                result = await askGemini(prompt, apiKey, modelName);
            }
            
            if (isCancelledFn()) {
                logToFile('🛑 Agent loop cancelled by user (during LLM wait).');
                return { success: false, error: 'Stopped by user' };
            }
            
            fs.writeFileSync(path.join(__dirname, '..', 'debug_gemini.json'), JSON.stringify(result, null, 2));
            console.log("Gemini Actions:", result.actions);
            
            const currentActionsStr = JSON.stringify(result.actions);
            if (currentActionsStr === lastActionsStr && result.actions && result.actions.length > 0) {
                repeatedActionsCount++;
                console.log(`Repeated actions detected (${repeatedActionsCount} times).`);
                if (repeatedActionsCount >= 2) {
                    console.log("Agent is stuck repeating the exact same actions. Stopping to save tokens.");
                    break;
                }
            } else {
                repeatedActionsCount = 0;
            }
            lastActionsStr = currentActionsStr;
            
            if (!result.actions || result.actions.length === 0 || result.done === true) {
                if (result.done === true) {
                    logToFile('✅ Agent signalled form is complete — stopping for user review.');
                    break;
                }
                consecutiveEmptySteps++;
                console.log(`No actions returned (${consecutiveEmptySteps} consecutive empty steps).`);
                if (consecutiveEmptySteps >= 2) {
                    console.log("Two consecutive empty steps. Stopping.");
                    break;
                }
                continue;
            }
            consecutiveEmptySteps = 0;
            
            allActions.push(...result.actions);
            
            for (const action of result.actions) {
                if (isCancelledFn()) {
                    logToFile('🛑 Agent loop cancelled by user (during action execution).');
                    return { success: false, error: 'Stopped by user' };
                }
                try {
                    await executeAction(page, action);
                } catch (e) {
                    const errorMsg = `Failed to execute ${action.action} on ${action.id || action.value}: ${e.message}\n`;
                    console.log(errorMsg);
                    fs.appendFileSync(path.join(__dirname, '..', 'debug_error.log'), errorMsg);
                    previousErrors.push(errorMsg);
                }
            }
            
            // Track completed entries: if we clicked Save, record what company was filled
            const saveAction = result.actions.find(a => 
                (a.action === 'clickText' && a.value === 'Save') || 
                (a.action === 'click' && allActions.some(prev => prev.action === 'fill'))
            );
            const companyAction = result.actions.find(a => a.action === 'fill' && a.value && a.value.length > 2 && a.value.length < 100);
            if (saveAction && companyAction) {
                completedEntries.push(companyAction.value);
                console.log(`Tracked completed entry: ${companyAction.value}`);
            }
            
        } catch (stepError) {
            console.error(`Step ${step + 1} crashed:`, stepError.message);
            
            // Abort immediately on fatal API errors (e.g. out of credits, 429, invalid key)
            const errMsg = (stepError.message || '').toLowerCase();
            if (errMsg.includes('429') || errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('api key') || errMsg.includes('billing')) {
                logToFile(`🛑 Fatal API Error: ${stepError.message}`);
                return { success: false, error: `Fatal API Error: ${stepError.message}` };
            }
            
            previousErrors.push(`Step crashed: ${stepError.message}`);
        }
    }

    return { 
        success: true, 
        allActions,
        message: '✅ Form filled! Please review all fields and submit manually.'
    };
}

module.exports = { fillForm, executeAction, buildPrompt };
