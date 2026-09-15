const fs = require('fs');
const path = require('path');
const { logToFile } = require('./logger');
const { askGemini } = require('./gemini');
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
            if (action.value.length > 50) {
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
        await targetLocator.selectOption({ label: action.value }, { timeout: 2000 });
        await page.waitForTimeout(500);

    } else if (action.action === 'selectOption') {
        // Handle combobox/autocomplete fields (Country/Region, City with search)
        const tagName = await targetLocator.evaluate(el => el.tagName).catch(() => '');
        if (tagName === 'SELECT') {
            await targetLocator.selectOption({ label: action.select }, { timeout: 2000 });
            await page.waitForTimeout(500);
        } else {
            // 1. Click on the input to focus it
            await targetLocator.click({ timeout: 2000 });
            await page.waitForTimeout(300);
            
            // 2. Clear existing value and type search text
            await targetLocator.fill('', { timeout: 1000 });
            await targetLocator.pressSequentially(action.search, { delay: 50, timeout: 5000 });
            
            // 3. Wait for dropdown options to appear
            await page.waitForTimeout(2000);
            
            // 4. Try to click the matching option using multiple strategies
            let optionClicked = false;
            
            // Strategy 1: Click by role="option"
            try {
                const options = targetFrame.getByRole('option', { name: action.select });
                const count = await options.count();
                if (count > 0) {
                    await options.first().click({ timeout: 2000 });
                    optionClicked = true;
                }
            } catch(e) { /* try next strategy */ }
            
            // Strategy 2: Click by role="listbox" li items
            if (!optionClicked) {
                try {
                    const listItems = targetFrame.locator('[role="listbox"] li, [role="listbox"] [role="option"]');
                    const count = await listItems.count();
                    for (let i = 0; i < count; i++) {
                        const text = await listItems.nth(i).innerText();
                        if (text.includes(action.select)) {
                            await listItems.nth(i).click({ force: true, timeout: 1000 });
                            optionClicked = true;
                            break;
                        }
                    }
                } catch(e) { /* try next strategy */ }
            }
            
            // Strategy 3: Use getByText on the visible dropdown options
            if (!optionClicked) {
                try {
                    const textMatch = targetFrame.getByText(action.select, { exact: true });
                    const handles = await textMatch.elementHandles();
                    for (const handle of handles) {
                        const isVisible = await handle.isVisible();
                        if (isVisible) {
                            await handle.click({ force: true, timeout: 1000 });
                            optionClicked = true;
                            break;
                        }
                    }
                } catch(e) { /* try next strategy */ }
            }
            
            // Strategy 4: Fallback to Shadow DOM evaluate for the specific frame
            if (!optionClicked) {
                optionClicked = await targetFrame.evaluate((selectText) => {
                    function findOption(root, text) {
                        const allNodes = root.querySelectorAll('*');
                        for (const node of allNodes) {
                            if ((node.getAttribute('role') === 'option' || node.tagName === 'LI') && 
                                (node.innerText || node.textContent || '').includes(text)) {
                                node.click();
                                return true;
                            }
                            if (node.shadowRoot) {
                                const found = findOption(node.shadowRoot, text);
                                if (found) return true;
                            }
                        }
                        return false;
                    }
                    return findOption(document, selectText);
                }, action.select).catch(() => false);
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
function buildPrompt(step, cvText, profileText, domState, errorPrompt, actionSummary) {
    return `
You are an autonomous web agent filling out a job application.
Step ${step + 1} of 15.
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
   - City: { "action": "selectOption", "id": "<id>", "search": "Tbilisi", "select": "Tbilisi" }
   - Title: Use a GENERIC title! Search "Software" and select "Software Developer" or "Software Engineer".
   - Company: If it has a search icon, use selectOption. Otherwise use fill.
   - Do NOT use "fill" for search dropdown fields!

3. NATIVE <select> DROPDOWNS: tag="select" with "options" array → use "selectNative":
   { "action": "selectNative", "id": "<id>", "value": "Yes" }

4. RADIO BUTTONS: type="radio" → use "click".
5. CHECKBOXES: type="checkbox" → use "click" to toggle on.
6. Phone Country Code: click "Country code" button, then clickText the correct country.

7. DATES - CRITICAL:
   - Format: YYYY-MM-DD
   - Extract the EXACT month from the CV. NEVER default to January (01) unless CV only says a year!
   - FROM dates: use day 01. Example: "June 2023" → "2023-06-01"
   - TO dates: use LAST day of month. Example: "March 2020" → "2020-03-31"
   - Last days: Jan=31, Feb=28, Mar=31, Apr=30, May=31, Jun=30, Jul=31, Aug=31, Sep=30, Oct=31, Nov=30, Dec=31
   - For current jobs: check "I currently work here" checkbox.

8. EXPERIENCE - Fill the LAST 4 jobs from the CV, starting with the OLDEST first:
   - Fill oldest job first → click Save → click +Add → fill next oldest, etc.
   - For each entry: fill Title (selectOption), Company, Description, From date, To date → click Save.
   - Skip entries already completed (check Progress above).

9. EDUCATION - Fill education entries:
   - Click "+ Add" for education, fill School, Degree, Field, From date, To date → click Save.

10. Cover Letter: DO NOT fill — it is handled separately.

11. WHEN DONE: When all fillable fields are complete and you have nothing more to do,
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
 * @param {Object} options - { cvText, apiKey, modelName, profileText, isCancelledFn }
 * @returns {Object} { success, allActions, message }
 */
async function fillForm(page, { cvText, apiKey, modelName, profileText, isCancelledFn }) {
    let allActions = [];
    let completedEntries = [];
    let previousErrors = [];
    let consecutiveEmptySteps = 0;
    let repeatedActionsCount = 0;
    let lastActionsStr = "";
    
    for (let step = 0; step < 15; step++) {
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
            
            const hasFormFields = domState.some(el => ['input', 'textarea', 'select'].includes(el.tag) && el.type !== 'hidden');
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
            
            const prompt = buildPrompt(step, cvText, profileText, domState, errorPrompt, actionSummary);
            
            const result = await askGemini(prompt, apiKey, modelName);
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
