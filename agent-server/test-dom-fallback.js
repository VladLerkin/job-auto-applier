const { chromium } = require('playwright');
const { extractDOM } = require('./src/dom-extractor.js');

const html = `
<!DOCTYPE html>
<html>
<body>
  <!-- Case 1: Sibling element -->
  <div class="q1">
    <p>Question 1: Sibling paragraph?</p>
    <textarea id="t1"></textarea>
  </div>

  <!-- Case 2: Parent's sibling element (what current logic handles well) -->
  <div class="q2">
    <p>Question 2: Parent sibling paragraph?</p>
    <div>
      <textarea id="t2"></textarea>
    </div>
  </div>

  <!-- Case 3: Text node before the element, no wrapping tag -->
  <div class="q3">
    Question 3: Bare text node before?
    <br>
    <textarea id="t3"></textarea>
  </div>
</body>
</html>
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const fields = await page.evaluate(extractDOM, '');
  
  fields.forEach(f => {
    console.log(`Original ID: ${f.id} => Label: '${f.label}' Context: '${f.context}'`);
  });
  
  await browser.close();
})();
