const { chromium } = require('playwright');
const { extractDOM } = require('./src/dom-extractor');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://job-boards.eu.greenhouse.io/dwelly/jobs/4954106101');
  await page.waitForTimeout(3000);
  
  const input = page.locator('text=Have you built and shipped').locator('xpath=./..').locator('input[role="combobox"]').first();
  await input.click();
  await page.waitForTimeout(500);
  await page.keyboard.type('Yes');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  
  // Dump outerHTML of the parent div containing the input
  const parentHtml = await input.locator('xpath=./../..').evaluate(el => el.outerHTML);
  console.log(parentHtml);
  
  await browser.close();
})();
