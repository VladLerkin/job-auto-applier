const { chromium } = require('playwright');
const fs = require('fs');

async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://jobs.lever.co/spinai/53484bdf-622b-4d1d-9f24-30a1d7cc5881/apply');
    await page.waitForLoadState('networkidle');

    const coverKeywords = ['cover letter', 'cover_letter', 'coverletter', 'motivation', 'letter', 'fit for this role', 'why would you be a fit', 'why are you a fit'];

    for (const frame of page.frames()) {
        const textAreas = await frame.locator('textarea, input[type="text"]').elementHandles();
        const arr = Array.from(textAreas);

        for (let i = 0; i < arr.length; i++) {
            const ta = arr[i];
            const name = await ta.getAttribute('name');
            const type = await ta.evaluate(e => e.tagName);
            
            const matched = await ta.evaluate((el, kws) => {
                let node = el.parentElement;
                for (let depth = 0; depth < 6 && node; depth++, node = node.parentElement) {
                    if (node.querySelectorAll('textarea, input').length > 3) {
                        return false; // Skip huge containers to prevent false positives
                    }

                    const labelEls = node.querySelectorAll('label, [class*="label"]');
                    for (const label of labelEls) {
                        const text = (label.innerText || label.textContent || '').toLowerCase();
                        if (kws.some(kw => text.includes(kw.toLowerCase()))) return { matched: true, reason: 'label class', text };
                    }
                    
                    let directText = "";
                    for (let child of node.childNodes) {
                        if (child.nodeType === 3) {
                            directText += child.nodeValue.trim() + " ";
                        }
                    }
                    if (directText.trim()) {
                        const text = directText.toLowerCase();
                        if (kws.some(kw => text.includes(kw.toLowerCase()))) return { matched: true, reason: 'direct text', text };
                    }
                }
                return false;
            }, coverKeywords);

            if (matched) {
                console.log(`MATCHED index ${i}: name=${name}, type=${type}`);
            }
        }
    }
    await browser.close();
}

run().catch(console.error);
