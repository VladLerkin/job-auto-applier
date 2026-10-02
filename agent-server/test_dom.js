const { chromium } = require('playwright');
const { extractDOM } = require('./src/dom-extractor');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://www.elitetechnicaljobs.com/apply/?jobid=12687', { waitUntil: 'networkidle' });
  const domState = await page.evaluate(extractDOM, 'test');
  console.log(JSON.stringify(domState, null, 2));
  await browser.close();
})();
