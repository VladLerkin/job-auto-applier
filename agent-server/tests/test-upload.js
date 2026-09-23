const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');

(async () => {
    try {
        const filePath = path.join(os.tmpdir(), `test_cover_letter.pdf`);
        const doc = new PDFDocument({ margin: 60, size: 'A4' });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);
        doc.text("This is a test cover letter.");
        doc.end();
        await new Promise(resolve => stream.on('finish', resolve));

        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        const pages = contexts[0].pages();
        const page = pages.find(p => p.url().includes('ats.rippling.com'));
        if (!page) {
            console.log("No rippling page found!");
            process.exit(1);
        }
        console.log("Found page:", page.url());
        
        const fileInput = page.locator('input[data-testid="input-cover_letter"]').first();
        if (await fileInput.count() > 0) {
            console.log("Found Cover Letter input! Uploading...");
            await fileInput.setInputFiles(filePath);
            console.log("Uploaded via setInputFiles.");
            
            // Let's also dispatch a change event just in case
            await fileInput.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
            console.log("Dispatched change event.");
        } else {
            console.log("Could not find input-cover_letter");
        }
        
        await browser.disconnect();
    } catch(e) {
        console.error(e);
    }
})();
