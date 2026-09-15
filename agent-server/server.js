const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const path = require('path');
const os = require('os');
const fs = require('fs');
const PDFDocument = require('pdfkit');

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

// Generate plain-text cover letter via Gemini
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

// Render cover letter text to a PDF file, return the temp file path
function generateCoverLetterPdf(text, candidateName) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(os.tmpdir(), `cover_letter_${Date.now()}.pdf`);
        const doc = new PDFDocument({ margin: 60, size: 'A4' });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Header
        doc.font('Helvetica-Bold').fontSize(14).text(candidateName || 'Cover Letter', { align: 'left' });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(10).text(new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }));
        doc.moveDown(1);

        // Body
        doc.font('Helvetica').fontSize(11).text(text, { align: 'justify', lineGap: 4 });

        doc.end();
        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
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
        try {
            const style = window.getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') return false;
        } catch(e) {}
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
            try {
                const safeId = el.id.replace(/"/g, '\\"');
                const label = el.getRootNode().querySelector(`label[for="${safeId}"]`);
                if (label) labelText = label.innerText;
            } catch(e) {}
        }
        if (!labelText) {
            const parentLabel = el.closest('label');
            if (parentLabel) labelText = parentLabel.innerText;
        }
        if (!labelText && (el.type === 'radio' || el.type === 'checkbox' || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox')) {
            let node = el.parentElement;
            for(let i=0; i<4 && node; i++) {
                let txt = (node.innerText || node.textContent || '').replace(/SVGs not supported by this browser\./g, '').trim();
                if (txt) {
                    labelText = txt.split('\n')[0];
                    break;
                }
                node = node.parentElement;
            }
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
        
        let isChecked = false;
        if (el.type === 'radio' || el.type === 'checkbox') {
            isChecked = el.checked || false;
        }

        // Provide parent context text for bare Yes/No buttons and radios/checkboxes
        let contextText = null;
        if (el.tagName === 'BUTTON' && (textContent === 'Yes' || textContent === 'No')) {
            let p = el.parentElement;
            if (p) p = p.parentElement; // Go up 2 levels
            if (p) {
                contextText = (p.innerText || '').substring(0, 100).replace(/\n/g, ' ').trim();
            }
        } else if (el.type === 'radio' || el.type === 'checkbox') {
            const fieldset = el.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend');
                if (legend) contextText = (legend.innerText || legend.textContent || '').substring(0, 150).replace(/\n/g, ' ').trim();
            }
            if (!contextText) {
                let node = el.parentElement;
                for(let i = 0; i < 6 && node; i++) {
                    const heading = node.querySelector('h1, h2, h3, h4, h5, h6, strong, [role="heading"]');
                    if (heading) {
                        contextText = (heading.innerText || heading.textContent || '').substring(0, 150).replace(/\n/g, ' ').trim();
                        break;
                    }
                    if (node.previousElementSibling && ['H3','LABEL','SPAN','STRONG'].includes(node.previousElementSibling.tagName)) {
                        contextText = (node.previousElementSibling.innerText || node.previousElementSibling.textContent || '').substring(0, 150).replace(/\n/g, ' ').trim();
                        break;
                    }
                    node = node.parentElement;
                }
            }
            if (!contextText) {
                let p = el.parentElement;
                if (p && p.parentElement) p = p.parentElement;
                if (p && p.parentElement) p = p.parentElement;
                if (p && p.parentElement) p = p.parentElement;
                if (p) {
                    let lines = (p.innerText || '').replace(/SVGs not supported by this browser\./g, '').split('\n').map(l => l.trim()).filter(l => l);
                    if (lines.length > 0) contextText = lines[0].substring(0, 150);
                }
            }
        }

        fields.push({
            id: uniqueId,
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            placeholder: el.placeholder || '',
            label: labelText.trim().replace(/\n/g, ' '),
            value: el.type === 'radio' || el.type === 'checkbox' ? '' : (el.value || ''),
            checked: isChecked,
            text: textContent,
            context: contextText,
            role: role || '',
            ariaExpanded: ariaExpanded || '',
            options: optionsList.length > 0 ? optionsList : undefined
        });
    });
    
    return fields;
};
let isCancelled = false;

app.post('/stop', (req, res) => {
    isCancelled = true;
    logToFile('🛑 Received stop request from UI');
    res.json({ success: true, message: 'Agent stopping...' });
});

app.post('/fill', async (req, res) => {
    isCancelled = false;
    // Reset timer on every request
    resetInactivityTimer();
    
    const { cvText, apiKey, modelName, profileText, tabUrl, cvPdfBase64, cvPdfName } = req.body;
    
    if (!cvText || !apiKey) {
        return res.status(400).json({ error: 'Missing cvText or apiKey' });
    }

    // Save PDF to a temp file if provided
    let tempPdfPath = null;
    if (cvPdfBase64) {
        tempPdfPath = path.join(os.tmpdir(), cvPdfName || 'resume.pdf');
        fs.writeFileSync(tempPdfPath, Buffer.from(cvPdfBase64, 'base64'));
        logToFile(`PDF saved to temp: ${tempPdfPath}`);
    }

    let browser;
    let contexts;
    let coverLetterTempPdf = null;
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

        // ── STEP 0: Try "Autofill from resume" feature (Ashby and similar) ────────
        if (tempPdfPath) {
            try {
                // Look for "Autofill from resume" button - this is Ashby's native autofill
                let autofillInput = null;
                for (const frame of page.frames()) {
                    // Find file input that is a sibling/descendant of an "autofill" container
                    const allFileInputs = frame.locator('input[type="file"]');
                    const fileCount = await allFileInputs.count().catch(() => 0);
                    for (let fi = 0; fi < fileCount; fi++) {
                        const inp = allFileInputs.nth(fi);
                        const isAutofill = await inp.evaluate(el => {
                            let node = el.parentElement;
                            for (let d = 0; d < 8 && node; d++, node = node.parentElement) {
                                const t = (node.innerText || node.textContent || '').toLowerCase();
                                if (t.includes('autofill') || t.includes('auto-fill') || t.includes('auto fill')) return true;
                            }
                            return false;
                        }).catch(() => false);
                        if (isAutofill) { autofillInput = inp; break; }
                    }
                    if (autofillInput) break;
                }

                if (autofillInput) {
                    logToFile('✅ Found "Autofill from resume" input — uploading PDF...');
                    await autofillInput.setInputFiles(tempPdfPath);
                    await page.waitForTimeout(4000); // wait for autofill to populate fields
                    logToFile('✅ Autofill from resume complete — waiting for fields to populate');
                } else {
                    logToFile('No "Autofill from resume" feature found on this page');
                }
            } catch(e) {
                logToFile(`⚠️ Autofill from resume failed: ${e.message}`);
            }
        }

        // ── Helper: find a file input by nearby sibling/ancestor label text ────────
        // Works for Ashby and similar patterns where <label> is a sibling to the
        // container that holds the hidden <input type="file">.
        async function findLabelledFileInput(keywords) {
            for (const frame of page.frames()) {
                // Strategy 1: CSS attribute-based matching (fast path)
                for (const kw of keywords) {
                    for (const attr of ['name', 'id', 'aria-label', 'data-label', 'data-testid']) {
                        const sel = `input[type="file"][${attr}*="${kw}" i]`;
                        const el = frame.locator(sel).first();
                        if (await el.count().catch(() => 0) > 0) return { frame, locator: el };
                    }
                }

                // Strategy 2: Enumerate all file inputs, walk up DOM to find sibling label text
                const fileInputs = frame.locator('input[type="file"]');
                const count = await fileInputs.count().catch(() => 0);
                for (let i = 0; i < count; i++) {
                    const input = fileInputs.nth(i);
                    const matched = await input.evaluate((el, kws) => {
                        // Walk up to find a common ancestor that also contains a label sibling
                        let node = el.parentElement;
                        for (let depth = 0; depth < 6 && node; depth++, node = node.parentElement) {
                            const labelEls = node.querySelectorAll('label');
                            for (const label of labelEls) {
                                const text = (label.innerText || label.textContent || '').toLowerCase();
                                if (kws.some(kw => text.includes(kw.toLowerCase()))) return true;
                            }
                            // Also check the node's own text (excluding inputs/buttons)
                            const nodeText = (node.innerText || '').toLowerCase();
                            if (kws.some(kw => nodeText.startsWith(kw.toLowerCase()))) return true;
                        }
                        return false;
                    }, keywords).catch(() => false);
                    if (matched) return { frame, locator: input };
                }
            }
            return null;
        }

        // ── Helper: find a textarea for cover letter ─────────────────────────────
        async function findCoverLetterTextArea() {
            const coverKeywords = ['cover letter', 'cover_letter', 'coverletter', 'motivation', 'letter', 'fit for this role', 'why would you be a fit', 'why are you a fit'];
            for (const frame of page.frames()) {
                // Strategy 1: attribute-based
                for (const kw of coverKeywords) {
                    for (const attr of ['name', 'id', 'aria-label', 'placeholder', 'data-label']) {
                        const sel = `textarea[${attr}*="${kw}" i], input[type="text"][${attr}*="${kw}" i]`;
                        const el = frame.locator(sel).first();
                        if (await el.count().catch(() => 0) > 0) {
                            if (await el.isVisible().catch(() => false)) {
                                const ml = await el.getAttribute('maxlength').catch(() => null);
                                return { frame, locator: el, maxLength: ml ? parseInt(ml) : null };
                            }
                        }
                    }
                }
                // Strategy 2: sibling label proximity (same pattern as file input above)
                const textareas = frame.locator('textarea');
                const count = await textareas.count().catch(() => 0);
                for (let i = 0; i < count; i++) {
                    const ta = textareas.nth(i);
                    const isVis = await ta.isVisible().catch(() => false);
                    if (!isVis) continue; // Skip hidden textareas like recaptcha

                    const matched = await ta.evaluate((el, kws) => {
                        let node = el.parentElement;
                        for (let depth = 0; depth < 6 && node; depth++, node = node.parentElement) {
                            const labelEls = node.querySelectorAll('label');
                            for (const label of labelEls) {
                                const text = (label.innerText || label.textContent || '').toLowerCase();
                                if (kws.some(kw => text.includes(kw.toLowerCase()))) return true;
                            }
                        }
                        return false;
                    }, coverKeywords).catch(() => false);
                    if (matched) {
                        const ml = await ta.getAttribute('maxlength').catch(() => null);
                        return { frame, locator: ta, maxLength: ml ? parseInt(ml) : null };
                    }
                }
            }
            return null;
        }

        // ── Auto-upload PDF resume ───────────────────────────────────────────────
        if (tempPdfPath) {
            try {
                logToFile('Attempting to auto-upload PDF resume...');
                const resumeInput = await findLabelledFileInput(['resume', 'cv']);
                if (resumeInput) {
                    await resumeInput.locator.setInputFiles(tempPdfPath);
                    await page.waitForTimeout(2000);
                    logToFile('✅ PDF resume uploaded to labelled resume input');
                } else {
                    logToFile('⚠️ No labelled resume/CV input found on this page. Skipping auto-upload.');
                }
            } catch (e) {
                logToFile(`⚠️ PDF resume upload failed: ${e.message}`);
            }
        }

        // ── Handle Cover Letter ──────────────────────────────────────────────────
        try {
            // Extract job description text from the page for context
            const jobDescText = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');

            const clTextArea = await findCoverLetterTextArea();
            if (clTextArea) {
                // ✅ Case 1: There's a text field — generate and paste cover letter
                logToFile(`Cover letter TEXT field detected (maxLength: ${clTextArea.maxLength || 'none'}) — generating text...`);
                const clText = await generateCoverLetterText(cvText, jobDescText, profileText, apiKey, modelName, clTextArea.maxLength);
                await clTextArea.locator.fill(clText);
                await page.waitForTimeout(1000);
                logToFile('✅ Cover letter text pasted into text area');
            } else {
                // Check if there's a cover letter FILE upload
                // More aggressive search — Ashby uses hidden inputs with no attributes
                const clFileInput = await findLabelledFileInput(['cover letter', 'cover_letter', 'coverletter', 'cover', 'letter', 'motivation']);
                if (clFileInput) {
                    // ✅ Case 2: Only a file upload — generate PDF and upload
                    logToFile('Cover letter FILE input detected — generating cover letter PDF...');
                    const clText = await generateCoverLetterText(cvText, jobDescText, profileText, apiKey, modelName);
                    // Extract candidate name from CV
                    const nameMatch = cvText.match(/==\s*PERSONAL INFO\s*==[\s\S]*?Full Name:\s*(.+)/i);
                    const candidateName = nameMatch ? nameMatch[1].trim() : '';
                    coverLetterTempPdf = await generateCoverLetterPdf(clText, candidateName);
                    await clFileInput.locator.setInputFiles(coverLetterTempPdf);
                    await page.waitForTimeout(2000);
                    logToFile('✅ Cover letter PDF uploaded');
                } else {
                    logToFile('No cover letter field detected on this page');
                }
            }
        } catch (e) {
            logToFile(`⚠️ Cover letter handling failed: ${e.message}`);
        }

        // Run a 15-step loop to allow for dynamic DOM updates (dropdowns, Add buttons, multiple experiences)
        let allActions = [];
        let completedEntries = []; // Track which experience/education entries are done
        let previousErrors = [];
        let consecutiveEmptySteps = 0;
        let repeatedActionsCount = 0;
        let lastActionsStr = "";
        
        for (let step = 0; step < 15; step++) {
            if (isCancelled) {
                logToFile('🛑 Agent loop cancelled by user.');
                res.json({ success: false, error: 'Stopped by user' });
                return; // Exits the function, triggering finally block
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
                        fs.appendFileSync(path.join(__dirname, 'debug_error.log'), `Frame ${i} extract error: ` + e.message + '\n');
                    }
                }
                
                const hasFormFields = domState.some(el => ['input', 'textarea', 'select'].includes(el.tag) && el.type !== 'hidden');
                if (!hasFormFields) {
                    logToFile(`No interactive form fields found on step ${step+1}, waiting...`);
                    consecutiveEmptySteps++;
                    if (consecutiveEmptySteps >= 5) {
                        logToFile(`🛑 Gave up waiting for form fields after 5 tries.`);
                        if (!res.headersSent) {
                            res.json({ success: false, error: 'Could not detect any form fields on the page.' });
                        }
                        return;
                    }
                    continue; // Skip LLM call, wait and retry
                }
                consecutiveEmptySteps = 0;
                
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
                
                const result = await askGemini(prompt, apiKey, modelName);
                if (isCancelled) {
                    logToFile('🛑 Agent loop cancelled by user (during LLM wait).');
                    res.json({ success: false, error: 'Stopped by user' });
                    return;
                }
                
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
                    if (isCancelled) {
                        logToFile('🛑 Agent loop cancelled by user (during action execution).');
                        res.json({ success: false, error: 'Stopped by user' });
                        return;
                    }
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

        res.json({ 
            success: true, 
            readyForReview: true,
            message: '✅ Form filled! Please review all fields and submit manually.',
            json: JSON.stringify({actions: allActions}, null, 2) 
        });
    } catch (error) {
        console.error("Agent Error:", error);
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) {
            try { await browser.disconnect(); } catch(e) { /* ignore */ }
        }
        // Clean up temp PDF file
        if (tempPdfPath && fs.existsSync(tempPdfPath)) {
            try { fs.unlinkSync(tempPdfPath); } catch(e) { /* ignore */ }
        }
        // Clean up cover letter temp PDF
        if (coverLetterTempPdf && fs.existsSync(coverLetterTempPdf)) {
            try { fs.unlinkSync(coverLetterTempPdf); } catch(e) { /* ignore */ }
        }
    }
});

async function startDedicatedBrowser() {
    try {
        console.log("\nLaunching dedicated Job Browser with pre-installed extension...");
        const userDataDir = path.join(os.homedir(), '.ai-job-profile');
        const extensionPath = path.resolve(__dirname, '../'); 
        
        // Launch Chrome natively based on the OS
        const { exec } = require('child_process');
        if (os.platform() === 'win32') {
            exec(`start "" chrome --remote-debugging-port=9222 --user-data-dir="${userDataDir}" --load-extension="${extensionPath}"`);
        } else if (os.platform() === 'darwin') {
            exec(`open -n -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="${userDataDir}" --load-extension="${extensionPath}"`);
        } else {
            exec(`google-chrome --remote-debugging-port=9222 --user-data-dir="${userDataDir}" --load-extension="${extensionPath}"`);
        }
        
        // Wait for it to open port
        await new Promise(r => setTimeout(r, 2000));
        console.log("Dedicated Browser is ready! (Keep this window open)");
    } catch (e) {
        console.error("Failed to launch dedicated browser:", e.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`✅ Agent Server running on http://localhost:${PORT}`);
    console.log(`⏹  Press Ctrl+C to stop the server.`);
    await startDedicatedBrowser();
});
