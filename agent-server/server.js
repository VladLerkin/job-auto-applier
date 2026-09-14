const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const path = require('path');
const os = require('os');
const fs = require('fs');

function logToFile(msg) {
    fs.appendFileSync(path.join(__dirname, 'agent.log'), new Date().toISOString() + ' ' + msg + '\n');
    console.log(msg);
}

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Inactivity Timeout Logic
let inactivityTimer;
const TIMEOUT_MINUTES = parseInt(process.env.INACTIVITY_TIMEOUT_MINUTES) || 120; // Default to 120 minutes
const TIMEOUT_MS = TIMEOUT_MINUTES * 60 * 1000;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        console.log(`\n[Auto-Shutdown] No activity for ${TIMEOUT_MINUTES} minutes. Shutting down agent server...`);
        process.exit(0);
    }, TIMEOUT_MS);
}
// Start timer on launch
resetInactivityTimer();

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


let dedicatedBrowserContext = null;

// Injected function to extract interactive elements
const extractDOM = (frameId) => {
    const allElements = [];
    
    function traverse(root) {
        // Clear old IDs inside this root (main document or shadow root)
        root.querySelectorAll('[data-arf-id]').forEach(el => el.removeAttribute('data-arf-id'));
        
        const els = root.querySelectorAll('input, select, textarea, button, a, [role="button"], [role="combobox"], [role="listbox"], [role="option"], li, [tabindex="0"], spl-button, oc-button, [aria-label]');
        els.forEach(el => allElements.push(el));
        
        const allNodes = root.querySelectorAll('*');
        for (let i = 0; i < allNodes.length; i++) {
            if (allNodes[i].shadowRoot) {
                traverse(allNodes[i].shadowRoot);
            }
        }
    }
    
    traverse(document);

    // Only capture interactive or potentially clickable elements
    const elements = allElements.filter(el => {
        const rect = el.getBoundingClientRect();
        // Basic visibility check
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        // Filter out LinkedIn navigation noise (skip links, nav items outside modal)
        const text = (el.innerText || el.textContent || '').trim();
        if (el.tagName === 'BUTTON' && text.startsWith('Skip to ')) return false;
        return true;
    });
        
    let idCounter = 1;
    const fields = [];
    
    elements.forEach(el => {
        const idPrefix = frameId ? `${frameId}-` : '';
        const uniqueId = `agent-${idPrefix}${idCounter++}`;
        el.setAttribute('data-arf-id', uniqueId);
        
        let labelText = '';
        if (el.id) {
            const label = el.getRootNode().querySelector(`label[for="${el.id}"]`);
            if (label) labelText = label.innerText;
        }
        if (!labelText) labelText = el.getAttribute('aria-label') || '';
        if (!labelText) labelText = el.name || '';
        
        let optionsList = [];
        if (el.tagName === 'SELECT') {
            optionsList = Array.from(el.options).map(o => o.text).filter(t => t);
        }

        let textContent = el.innerText || el.textContent || '';
        if (textContent) textContent = textContent.trim().substring(0, 100); // limit length
        
        // Capture role and aria-expanded to help identify combobox/dropdown fields
        const role = el.getAttribute('role') || '';
        const ariaExpanded = el.getAttribute('aria-expanded') || '';
        
        fields.push({
            id: uniqueId,
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            placeholder: el.placeholder || '',
            label: labelText.trim().replace(/\n/g, ' '),
            value: el.value || '',
            text: textContent,
            role: role || undefined,
            ariaExpanded: ariaExpanded || undefined,
            options: optionsList.length > 0 ? optionsList : undefined
        });
    });
    
    return fields;
};

app.post('/fill', async (req, res) => {
    // Reset timer on every request
    resetInactivityTimer();
    
    const { cvText, apiKey, modelName, profileText, tabUrl } = req.body;
    
    if (!cvText || !apiKey) {
        return res.status(400).json({ error: 'Missing cvText or apiKey' });
    }

    let browser;
    let contexts;
    try {
        console.log(`Connecting to Chrome on port 9222...`);
        try {
            browser = await chromium.connectOverCDP('http://localhost:9222');
        } catch (e) {
            return res.status(500).json({ error: 'Could not connect to Chrome. Is it running with --remote-debugging-port=9222?' });
        }
        contexts = browser.contexts();
        
        const pages = contexts[0].pages();
        
        let page;
        // Prioritize the tab the user invoked the extension from
        if (tabUrl) {
            const baseTabUrl = tabUrl.split('?')[0].split('#')[0];
            page = pages.find(p => {
                const pUrl = p.url().split('?')[0].split('#')[0];
                return pUrl === baseTabUrl || p.url() === tabUrl;
            });
        }
        
        // Fallback: Prioritize a page that is likely a job application
        if (!page) {
            page = pages.find(p => p.url().includes('jobs.') || p.url().includes('smartrecruiters.com') || p.url().includes('linkedin.com/jobs') || p.url().includes('icims.com/jobs') || p.url().includes('greenhouse.io') || p.url().includes('lever.co') || p.url().includes('workday.com'));
        }
        
        if (!page) page = pages[0]; // fallback
        
        console.log(`Working on tab: ${page.url()}`);
        
        // Run a 15-step loop to allow for dynamic DOM updates (dropdowns, Add buttons, multiple experiences)
        let allActions = [];
        let completedEntries = []; // Track which experience/education entries are done
        let previousErrors = [];
        let consecutiveEmptySteps = 0;
        let repeatedActionsCount = 0;
        let lastActionsStr = "";
        
        for (let step = 0; step < 15; step++) {
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
                        // ignore frames that are detached or cross-origin restricted
                    }
                }
                fs.writeFileSync(path.join(__dirname, 'debug_dom.json'), JSON.stringify(domState, null, 2));
                
                let errorPrompt = '';
                if (previousErrors.length > 0) {
                    errorPrompt = `\nWARNING: Your actions from the PREVIOUS step failed with the following errors:\n${previousErrors.join('\n')}\nDO NOT repeat the exact same actions. Try a different approach (e.g. if selectOption failed, try clicking the field first, or use a different search term).\n`;
                }
                previousErrors = []; // Reset for this step
                
                // Build compact action summary instead of full history (to avoid token bloat)
                const actionSummary = completedEntries.length > 0 
                    ? `Completed entries so far: ${completedEntries.join(', ')}` 
                    : 'No entries completed yet.';
                
                const prompt = `
            You are an autonomous web agent filling out a job application.
            Step ${step + 1} of 15.
            ${errorPrompt}
            
            Here is the user's CV:
            ---
            ${cvText}
            ---
            
            Here is the current DOM state (interactive elements):
            ---
            ${JSON.stringify(domState, null, 2)}
            ---
            
            Progress so far: ${actionSummary}
            
            Decide what actions to take. Available actions: fill, click, clickText, selectOption.
            
            Rules:
            1. Only fill fields you haven't successfully filled yet. If a field already has the correct value, DO NOT interact with it!
            
            2. SEARCH DROPDOWN FIELDS (Country/Region, City, Title, Company, Office location):
               - Any field with a search icon (🔍) or role="combobox" is a search dropdown.
               - You MUST use "selectOption": { "action": "selectOption", "id": "<field id>", "search": "<search text>", "select": "<option to click>" }
               - Country/Region: { "action": "selectOption", "id": "<id>", "search": "Georgia", "select": "Georgia" }
               - City: { "action": "selectOption", "id": "<id>", "search": "Tbilisi", "select": "Tbilisi" }
               - Title: Use a GENERIC title! Search "Software" and select "Software Developer" or "Software Engineer". Do NOT use exact CV titles like "Java Developer".
               - Company: If it has a search icon, use selectOption. Otherwise use fill.
               - Do NOT use "fill" for search dropdown fields!
            
            3. NATIVE <select> DROPDOWNS: If an element has tag="select" and "options" array, use "selectNative":
               { "action": "selectNative", "id": "<id>", "value": "Yes" }
               The value must match one of the options listed in the element's "options" array.
            
            4. RADIO BUTTONS: For radio inputs (type="radio"), use "click" with the ID of the radio option you want to select.
            
            5. CHECKBOXES: For checkbox inputs (type="checkbox"), use "click" with the ID to toggle it on.
            
            6. Phone Country Code: If the phone country code is wrong, click the "Country code" button, then clickText the correct country.
            
            4. DATES - CRITICAL:
               - Format: YYYY-MM-DD
               - Extract the EXACT month from the CV. NEVER default to January (01) unless the CV only says a year!
               - For FROM (start) dates: use day 01. Example: "June 2023" → "2023-06-01"
               - For TO (end) dates: use the LAST day of the month. Example: "March 2020" → "2020-03-31", "February 2019" → "2019-02-28", "June 2023" → "2023-06-30", "December 2021" → "2021-12-31"
               - Last days: Jan=31, Feb=28(or 29 for leap year), Mar=31, Apr=30, May=31, Jun=30, Jul=31, Aug=31, Sep=30, Oct=31, Nov=30, Dec=31
               - For current jobs, check "I currently work here" checkbox instead of setting an end date.
            
            5. EXPERIENCE - Fill the LAST 4 jobs from the CV, starting with the OLDEST first:
               - This is important! The form displays entries with the most recent on top.
               - So fill the oldest job first, then click Save, then +Add, then the next oldest, etc.
               - For each entry: fill Title (selectOption), Company, Description, From date, To date → click Save
               - Then click "+ Add" (label "Add experience entry") to add the next entry.
               - Skip jobs if you've already completed them (check Progress above).
            
            6. EDUCATION - Also fill education entries from the CV:
               - Click "+ Add" button for education (label "Add education entry") to open the form.
               - Fill School/University, Degree, Field of Study, From date, To date → click Save.
               - Use selectOption for any search-dropdown fields.
            
            7. Cover Letter: For long text fields, output the full text in a 'fill' action.
            8. Return {"actions": []} if everything is done.
            
            Return JSON:
            {
               "actions": [
                  { "action": "fill", "id": "agent-12", "value": "text to type" },
                  { "action": "click", "id": "agent-45" },
                  { "action": "selectNative", "id": "agent-30", "value": "Yes" },
                  { "action": "selectOption", "id": "agent-20", "search": "Software", "select": "Software Developer" }
               ]
            }
            `;
                
                const result = await askGemini(prompt, apiKey, modelName);
                fs.writeFileSync(path.join(__dirname, 'debug_gemini.json'), JSON.stringify(result, null, 2));
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
                
                if (!result.actions || result.actions.length === 0) {
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
                    try {
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
                        // Use a more specific locator to avoid clicking invisible elements or the main container
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
                        // Handle native <select> elements
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
                        
                        // 4. Try to click the matching option using multiple strategies on the SAME FRAME
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
                        } // close the else block for non-SELECT elements
                    }
                } catch (e) {
                    const errorMsg = `Failed to execute ${action.action} on ${action.id || action.value}: ${e.message}\n`;
                    console.log(errorMsg);
                    fs.appendFileSync(path.join(__dirname, 'debug_error.log'), errorMsg);
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
                // Continue to next step instead of crashing the whole server
            }
        }

        res.json({ success: true, json: JSON.stringify({actions: allActions}, null, 2) });
    } catch (error) {
        console.error("Agent Error:", error);
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) {
            try { await browser.disconnect(); } catch(e) { /* ignore */ }
        }
    }
});

async function startDedicatedBrowser() {
    try {
        console.log("\nLaunching dedicated Job Browser with pre-installed extension...");
        const userDataDir = path.join(os.homedir(), '.ai-job-profile');
        const extensionPath = path.resolve(__dirname, '../'); 
        
        // Launch Chrome natively on Mac to ensure extensions work flawlessly
        const { exec } = require('child_process');
        exec(`open -n -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="${userDataDir}" --load-extension="${extensionPath}"`);
        
        // Wait for it to open port
        await new Promise(r => setTimeout(r, 2000));
        console.log("Dedicated Browser is ready! (Keep this window open)");
    } catch (e) {
        console.error("Failed to launch dedicated browser:", e.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Agent Server running on http://localhost:${PORT}`);
    await startDedicatedBrowser();
});
