const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log("Connecting to Chrome on port 9222...");
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    const pages = contexts[0].pages();
    
    let page = pages.find(p => p.url().includes('smartrecruiters.com'));
    if (!page) {
        console.log("Could not find smartrecruiters page.");
        process.exit(1);
    }
    
    console.log(`Dumping HTML of: ${page.url()}`);
    const html = await page.content();
    fs.writeFileSync('smartrecruiters_dump.html', html);
    console.log("Dumped to smartrecruiters_dump.html");
    
    await browser.close();
})();
