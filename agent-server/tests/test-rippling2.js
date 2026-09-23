const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://ats.rippling.com/jack-westin/jobs/a3af1dde-ab15-4260-9a83-32231667613e/apply?jobSite=LinkedIn&jobBoardSlug=jack-westin&jobId=a3af1dde-ab15-4260-9a83-32231667613e&step=application', { waitUntil: 'networkidle' });
    
    let found = null;
    const keywords = ['cover letter', 'cover_letter', 'coverletter', 'cover', 'letter', 'motivation'];
    
    for (const frame of page.frames()) {
        for (const kw of keywords) {
            for (const attr of ['name', 'id', 'aria-label', 'data-label', 'data-testid']) {
                const sel = `input[type="file" i][${attr}*="${kw}" i]`;
                const el = frame.locator(sel).first();
                const count = await el.count();
                if (count > 0) {
                    found = { sel, kw, attr };
                    break;
                }
            }
            if (found) break;
        }
        if (found) break;
    }
    
    console.log('Strategy 1 found:', found);
    
    await browser.close();
})();
