const path = require('path');
const os = require('os');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { logToFile } = require('./logger');
const { generateCoverLetterText } = require('./gemini');

/**
 * Find a file input element by nearby sibling/ancestor label text.
 * Works for Ashby and similar patterns where <label> is a sibling to the
 * container that holds the hidden <input type="file">.
 */
async function findLabelledFileInput(page, keywords) {
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

/**
 * Find a textarea (or text input) for cover letter entry.
 */
async function findCoverLetterTextArea(page) {
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

/**
 * Render cover letter text to a PDF file, return the temp file path.
 */
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

/**
 * Try to use the "Autofill from resume" feature (Ashby and similar).
 */
async function handleAutofillFromResume(page, tempPdfPath) {
    try {
        let autofillInput = null;
        for (const frame of page.frames()) {
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
            await page.waitForTimeout(4000);
            logToFile('✅ Autofill from resume complete — waiting for fields to populate');
        } else {
            logToFile('No "Autofill from resume" feature found on this page');
        }
    } catch(e) {
        logToFile(`⚠️ Autofill from resume failed: ${e.message}`);
    }
}

/**
 * Auto-upload PDF resume to the resume/CV file input.
 */
async function handleResumeUpload(page, tempPdfPath) {
    try {
        logToFile('Attempting to auto-upload PDF resume...');
        const resumeInput = await findLabelledFileInput(page, ['resume', 'cv']);
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

/**
 * Handle cover letter — either paste into textarea or generate & upload PDF.
 * @returns {string|null} Path to temp cover letter PDF (for cleanup), or null.
 */
async function handleCoverLetter(page, cvText, profileText, apiKey, modelName) {
    let coverLetterTempPdf = null;
    try {
        const jobDescText = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');

        const clTextArea = await findCoverLetterTextArea(page);
        if (clTextArea) {
            logToFile(`Cover letter TEXT field detected (maxLength: ${clTextArea.maxLength || 'none'}) — generating text...`);
            const clText = await generateCoverLetterText(cvText, jobDescText, profileText, apiKey, modelName, clTextArea.maxLength);
            await clTextArea.locator.fill(clText);
            await page.waitForTimeout(1000);
            logToFile('✅ Cover letter text pasted into text area');
        } else {
            const clFileInput = await findLabelledFileInput(page, ['cover letter', 'cover_letter', 'coverletter', 'cover', 'letter', 'motivation']);
            if (clFileInput) {
                logToFile('Cover letter FILE input detected — generating cover letter PDF...');
                const clText = await generateCoverLetterText(cvText, jobDescText, profileText, apiKey, modelName);
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
    return coverLetterTempPdf;
}

module.exports = {
    findLabelledFileInput,
    findCoverLetterTextArea,
    generateCoverLetterPdf,
    handleAutofillFromResume,
    handleResumeUpload,
    handleCoverLetter
};
