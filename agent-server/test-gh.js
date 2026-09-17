const { chromium } = require('playwright');
const { extractDOM } = require('./src/dom-extractor');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://job-boards.eu.greenhouse.io/dwelly/jobs/4954106101');
  await page.waitForTimeout(3000);
  
  const fields = await page.evaluate(extractDOM);
  console.log(JSON.stringify(fields.filter(f => ['select', 'input'].includes(f.tag) || f.role === 'combobox'), null, 2));
  
  await browser.close();
})();
