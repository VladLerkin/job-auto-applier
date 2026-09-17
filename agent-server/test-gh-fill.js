const { chromium } = require('playwright');
const { extractDOM } = require('./src/dom-extractor');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://job-boards.eu.greenhouse.io/dwelly/jobs/4954106101');
  await page.waitForTimeout(3000);
  
  // Fill the combobox
  const input = page.locator('text=Have you built and shipped').locator('xpath=./..').locator('input[role="combobox"]').first();
  await input.click();
  await page.waitForTimeout(500);
  await page.keyboard.type('Yes');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  
  const fields = await page.evaluate(extractDOM);
  console.log(JSON.stringify(fields.filter(f => f.label && f.label.includes('Have you built')), null, 2));
  
  await browser.close();
})();
