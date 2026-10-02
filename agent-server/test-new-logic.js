const { chromium } = require('playwright');
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
  
  <!-- Case 4: Elite style where text is before an input but deep -->
  <div class="q4">
    <p>Question 4: Elite style question text</p>
    <div>
      <br>
      <textarea id="t4"></textarea>
    </div>
  </div>
</body>
</html>
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const fields = await page.evaluate(() => {
     const els = document.querySelectorAll('textarea');
     return Array.from(els).map(el => {
        let labelText = '';
        let currentNode = el;
        let found = false;
        for (let i = 0; i < 10 && currentNode && !found; i++) {
            let prev = currentNode.previousSibling;
            while (prev && !found) {
                let txt = (prev.innerText || prev.textContent || '').replace(/SVGs not supported by this browser\\./g, '').trim();
                if (txt && txt.length > 2 && txt.length < 250) {
                    const lines = txt.split('\\n').map(l => l.trim()).filter(l => l);
                    if (lines.length > 0) {
                        labelText = lines[lines.length - 1];
                        found = true;
                    }
                }
                prev = prev.previousSibling;
            }
            if (!found) {
                currentNode = currentNode.parentElement;
            }
        }
        return { id: el.id, label: labelText };
     });
  });
  
  fields.forEach(f => {
    console.log(`ID: ${f.id} => Label: '${f.label}'`);
  });
  
  await browser.close();
})();
