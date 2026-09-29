const { chromium } = require('playwright');
const { extractDOM } = require('../src/dom-extractor');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log("Navigating to Workday...");
    await page.goto("https://wk.wd3.myworkdayjobs.com/en-US/External/job/USA---Chicago%2C-IL%2C-West-Adams-St/Senior-Full-Stack-Engineer--AI-Platform---Agents_R0052281/apply/LinkedIn?source=LinkedIn_Posting", { waitUntil: 'networkidle' });
    
    // Workday sometimes needs time to load React
    await page.waitForTimeout(5000);
    
    // Click Apply button
    console.log("Clicking Apply...");
    try {
        await page.getByRole('link', { name: /Apply/i }).first().click({ timeout: 5000 });
        await page.waitForTimeout(5000);
    } catch(e) {
        console.log("Could not find Apply button directly. Let's see what buttons exist:");
        const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('a, button')).map(b => b.innerText));
        console.log(buttons.slice(0, 10));
    }
    
    console.log("Extracting DOM...");
    const elements = await page.evaluate(extractDOM, 'test');
    
    console.log("Total interactive elements extracted:", elements.length);
    
    // Print button/comboboxes that look like dropdowns
    const dropdowns = elements.filter(el => el.role === 'combobox' || el.role === 'listbox' || el.tag === 'select' || (el.tag === 'button' && el.ariaExpanded !== ''));
    console.log("Dropdown-like elements found:");
    console.log(JSON.stringify(dropdowns, null, 2));

    await browser.close();
})();
