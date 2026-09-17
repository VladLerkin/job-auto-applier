const { chromium } = require('playwright');
const { extractDOM } = require('./src/dom-extractor');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://job-boards.eu.greenhouse.io/dwelly/jobs/4954106101');
  await page.waitForTimeout(3000);
  
  const input = page.locator('input[type="tel"]').first();
  await input.fill('+995598147619');
  await page.waitForTimeout(1000);
  
  const fields = await page.evaluate(extractDOM);
  console.log(JSON.stringify(fields.filter(f => f.type === 'tel'), null, 2));
  
  await browser.close();
})();
