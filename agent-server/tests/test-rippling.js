const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://ats.rippling.com/jack-westin/jobs/a3af1dde-ab15-4260-9a83-32231667613e/apply?jobSite=LinkedIn&jobBoardSlug=jack-westin&jobId=a3af1dde-ab15-4260-9a83-32231667613e&step=application', { waitUntil: 'networkidle' });
    
    // Find input[type="file"]
    const inputs = await page.$$('input[type="file"]');
    for (let i = 0; i < inputs.length; i++) {
        const handle = inputs[i];
        const outerHTML = await handle.evaluate(el => el.outerHTML);
        const parentHTML = await handle.evaluate(el => {
            let p = el.parentElement;
            for(let j=0; j<4; j++) if(p.parentElement) p = p.parentElement;
            return p.outerHTML;
        });
        console.log(`--- File Input ${i+1} ---`);
        console.log('Outer HTML:', outerHTML);
        console.log('Parent HTML:\n', parentHTML.substring(0, 1500) + '...');
    }
    
    await browser.close();
})();
