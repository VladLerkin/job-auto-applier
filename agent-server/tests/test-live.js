const { chromium } = require('playwright');
(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        const pages = contexts[0].pages();
        const page = pages.find(p => p.url().includes('ats.rippling.com'));
        if (!page) {
            console.log("No rippling page found!");
            process.exit(1);
        }
        console.log("Found page:", page.url());
        
        let found = null;
        const keywords = ['cover letter', 'cover_letter', 'coverletter', 'cover', 'letter', 'motivation'];
        
        for (const frame of page.frames()) {
            for (const kw of keywords) {
                for (const attr of ['name', 'id', 'aria-label', 'data-label', 'data-testid']) {
                    const sel = `input[type="file"][${attr}*="${kw}" i]`;
                    const el = frame.locator(sel).first();
                    const count = await el.count().catch(() => 0);
                    if (count > 0) {
                        found = { sel, kw, attr };
                        console.log("Strategy 1 found:", found);
                        break;
                    }
                }
                if (found) break;
            }
            if (found) break;
        }
        if (!found) {
            console.log("Strategy 1 failed. Trying Strategy 2...");
            for (const frame of page.frames()) {
                const fileInputs = frame.locator('input[type="file"]');
                const count = await fileInputs.count().catch(() => 0);
                for (let i = 0; i < count; i++) {
                    const input = fileInputs.nth(i);
                    const matched = await input.evaluate((el, kws) => {
                        let node = el.parentElement;
                        for (let depth = 0; depth < 10 && node; depth++, node = node.parentElement) {
                            const labelEls = node.querySelectorAll('label, span, div, h3, h4');
                            for (const label of labelEls) {
                                const text = (label.innerText || label.textContent || '').toLowerCase();
                                if (kws.some(kw => text.includes(kw.toLowerCase()))) return true;
                            }
                            if (node.previousElementSibling) {
                                const prevText = (node.previousElementSibling.innerText || node.previousElementSibling.textContent || '').toLowerCase();
                                if (kws.some(kw => prevText.includes(kw.toLowerCase()))) return true;
                            }
                            const nodeText = (node.innerText || '').toLowerCase();
                            if (kws.some(kw => nodeText.includes(kw.toLowerCase()))) return true;
                        }
                        return false;
                    }, keywords).catch(() => false);
                    if (matched) {
                        console.log("Strategy 2 found input at index", i);
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }
        
        if (!found) console.log("Still didn't find anything.");
        
        await browser.disconnect();
    } catch(e) {
        console.error(e);
    }
})();
