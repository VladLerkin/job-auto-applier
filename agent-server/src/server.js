const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { logToFile } = require('./logger');
const { connectToBrowser, startDedicatedBrowser } = require('./browser');
const { handleAutofillFromResume, handleResumeUpload, handleCoverLetter } = require('./file-handlers');
const { fillForm } = require('./form-filler');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Inactivity Timeout Logic ────────────────────────────────────────────────
let inactivityTimer;
const TIMEOUT_MINUTES = parseInt(process.env.INACTIVITY_TIMEOUT_MINUTES) || 120;
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

// ── Cancellation flag & State ───────────────────────────────────────────────
let isCancelled = false;
let isFilling = false;
const MAX_STEPS = parseInt(process.env.MAX_STEPS) || 10;
let currentStep = 0;
let totalSteps = MAX_STEPS;

app.get('/fill-status', (req, res) => {
    res.json({ isFilling, currentStep, totalSteps });
});

app.post('/stop', (req, res) => {
    isCancelled = true;
    logToFile('🛑 Received stop request from UI');
    res.json({ success: true, message: 'Agent stopping...' });
});

// ── View Cover Letter endpoint ──────────────────────────────────────────────
app.get('/cover-letter', (req, res) => {
    const workspacePath = path.join(__dirname, '..', 'workspace', 'last_cover_letter.txt');
    if (fs.existsSync(workspacePath)) {
        res.sendFile(workspacePath);
    } else {
        res.status(404).send('No cover letter has been generated yet.');
    }
});

// ── Main /fill endpoint ─────────────────────────────────────────────────────
app.post('/fill', async (req, res) => {
    if (isFilling) {
        return res.status(400).json({ error: 'Agent is already filling a form.' });
    }

    isCancelled = false;
    isFilling = true;
    currentStep = 0;
    resetInactivityTimer();
    
    let { cvText, apiKey, modelName, profileText, tabUrl, cvPdfBase64, cvPdfName, provider, localModelPath } = req.body;
    
    if (provider === 'gemini' && (!cvText || !apiKey)) {
        return res.status(400).json({ error: 'Missing cvText or apiKey' });
    }
    if (provider === 'local' && (!cvText || !localModelPath)) {
        return res.status(400).json({ error: 'Missing cvText or localModelPath' });
    }

    if (provider === 'local' && localModelPath && !path.isAbsolute(localModelPath)) {
        localModelPath = path.resolve(__dirname, '..', 'models', path.basename(localModelPath));
    }

    // Save PDF to a temp file if provided
    let tempPdfPath = null;
    if (cvPdfBase64) {
        tempPdfPath = path.join(os.tmpdir(), cvPdfName || 'resume.pdf');
        fs.writeFileSync(tempPdfPath, Buffer.from(cvPdfBase64, 'base64'));
        logToFile(`PDF saved to temp: ${tempPdfPath}`);
    }

    let browser;
    let coverLetterTempPdf = null;

    try {
        console.log(`Connecting to Chrome on port 9222...`);
        try {
            browser = await connectToBrowser();
        } catch (e) {
            return res.status(500).json({ error: 'Could not connect to Chrome. Is it running with --remote-debugging-port=9222?' });
        }

        const contexts = browser.contexts();
        const pages = contexts[0].pages();
        
        // Find the right page to work on
        let page;
        if (tabUrl) {
            const baseTabUrl = tabUrl.split('?')[0].split('#')[0];
            page = pages.find(p => {
                const pUrl = p.url().split('?')[0].split('#')[0];
                return pUrl === baseTabUrl || p.url() === tabUrl;
            });
        }
        
        if (!page) {
            page = pages.find(p => p.url().includes('jobs.') || p.url().includes('smartrecruiters.com') || p.url().includes('linkedin.com/jobs') || p.url().includes('icims.com/jobs') || p.url().includes('greenhouse.io') || p.url().includes('lever.co') || p.url().includes('workday.com'));
        }
        
        if (!page) page = pages[0];
        
        console.log(`Working on tab: ${page.url()}`);

        // ── STEP 0: Autofill from resume (Ashby and similar) ────────────────
        if (tempPdfPath) {
            await handleAutofillFromResume(page, tempPdfPath);
        }

        // ── Auto-upload PDF resume ──────────────────────────────────────────
        if (tempPdfPath) {
            await handleResumeUpload(page, tempPdfPath);
        }

        // ── Handle Cover Letter ─────────────────────────────────────────────
        coverLetterTempPdf = await handleCoverLetter(page, cvText, profileText, apiKey, modelName);

        // ── Main form-filling loop ──────────────────────────────────────────
        const result = await fillForm(page, {
            cvText,
            apiKey,
            modelName,
            profileText,
            provider: provider || 'gemini',
            localModelPath,
            maxSteps: MAX_STEPS,
            isCancelledFn: () => isCancelled,
            onProgress: (step, total) => {
                currentStep = step;
                totalSteps = total;
            }
        });

        if (!result.success) {
            if (!res.headersSent) {
                res.json({ success: false, error: result.error });
            }
            return;
        }

        res.json({ 
            success: true, 
            readyForReview: true,
            message: result.message,
            json: JSON.stringify({ actions: result.allActions }, null, 2) 
        });

    } catch (error) {
        console.error("Agent Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    } finally {
        if (browser) {
            try { await browser.disconnect(); } catch(e) { /* ignore */ }
        }
        if (tempPdfPath && fs.existsSync(tempPdfPath)) {
            try { fs.unlinkSync(tempPdfPath); } catch(e) { /* ignore */ }
        }
        if (coverLetterTempPdf && fs.existsSync(coverLetterTempPdf)) {
            try { fs.unlinkSync(coverLetterTempPdf); } catch(e) { /* ignore */ }
        }
        isFilling = false;
    }
});

// ── Local LLM Management Endpoints ──────────────────────────────────────────
const { downloadModel, askLocalLLM } = require('./local-llm');
let currentDownload = null;

app.post('/download-model', async (req, res) => {
    const { url, filename } = req.body;
    if (!url || !filename) return res.status(400).json({ error: 'Missing url or filename' });
    
    const destPath = path.join(__dirname, '..', 'models', filename);
    if (!fs.existsSync(path.dirname(destPath))) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
    }
    
    if (currentDownload && currentDownload.status === 'downloading') {
        return res.status(400).json({ error: 'A download is already in progress' });
    }

    currentDownload = { status: 'downloading', progress: 0, downloaded: 0, total: 0 };
    
    downloadModel(url, destPath, (progress, downloaded, total) => {
        currentDownload.progress = progress;
        currentDownload.downloaded = downloaded;
        currentDownload.total = total;
    }).then((filePath) => {
        currentDownload = { status: 'done', progress: 100, filePath };
    }).catch(err => {
        currentDownload = { status: 'error', error: err.message };
    });
    
    res.json({ success: true, message: 'Download started' });
});

app.get('/download-status', (req, res) => {
    res.json(currentDownload || { status: 'none' });
});

app.post('/test-model', async (req, res) => {
    let { localModelPath } = req.body;
    if (!localModelPath) return res.status(400).json({ error: 'Missing localModelPath' });
    
    if (!path.isAbsolute(localModelPath)) {
        localModelPath = path.resolve(__dirname, '..', 'models', path.basename(localModelPath));
    }

    try {
        const result = await askLocalLLM('Respond strictly with this exact JSON: {"success": true}', localModelPath);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`✅ Agent Server running on http://localhost:${PORT}`);
    console.log(`⏹  Press Ctrl+C to stop the server.`);
    await startDedicatedBrowser();
});
