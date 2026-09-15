const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    fs.writeFileSync('dummy.pdf', 'dummy content');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://watu.applytojob.com/apply/Jmij7tunT1/Senior-Backend-Engineer-JavaArchitecture');
    
    const input = page.locator('input[type="file"][name*="resume" i]').first();
    await input.setInputFiles('dummy.pdf');
    
    // dispatch change event
    await input.evaluate(e => e.dispatchEvent(new Event('change', { bubbles: true })));
    
    await page.waitForTimeout(2000);
    const html = await page.content();
    if (html.includes('dummy.pdf')) {
        console.log('SUCCESS: UI updated to show dummy.pdf');
    } else {
        console.log('FAIL: UI did not update');
    }
    await browser.close();
    fs.unlinkSync('dummy.pdf');
})();
