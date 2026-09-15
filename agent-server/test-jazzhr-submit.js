const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    fs.writeFileSync('dummy.pdf', 'dummy content');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://watu.applytojob.com/apply/Jmij7tunT1/Senior-Backend-Engineer-JavaArchitecture');
    
    const input = page.locator('input[type="file"][name*="resume" i]').first();
    await input.setInputFiles('dummy.pdf');
    await input.evaluate(e => e.dispatchEvent(new Event('change', { bubbles: true })));
    
    // Fill out required fields to test submit
    await page.fill('input[name="first_name"]', 'John');
    await page.fill('input[name="last_name"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.fill('input[name="phone"]', '1234567890');
    
    // Click submit
    await page.click('button#resumator-submit-resume');
    await page.waitForTimeout(2000);
    
    const html = await page.content();
    if (html.includes('This field is required') || html.includes('Please attach a resume')) {
        console.log('FAIL: Form validation rejected the hidden resume upload');
    } else {
        console.log('SUCCESS: Form submitted successfully despite UI not updating');
    }
    
    await browser.close();
    fs.unlinkSync('dummy.pdf');
})();
