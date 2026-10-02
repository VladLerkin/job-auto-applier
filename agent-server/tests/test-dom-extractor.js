const { chromium } = require('playwright');
const { extractDOM } = require('../src/dom-extractor');

const testHtml = `
<!DOCTYPE html>
<html>
<body>
  <!-- Case 1: Sibling element (Standard bad practice) -->
  <div class="q1">
    <p>Question 1: Sibling paragraph?</p>
    <textarea id="t1" name="q1"></textarea>
  </div>

  <!-- Case 2: Parent's sibling element -->
  <div class="q2">
    <p>Question 2: Parent sibling paragraph?</p>
    <div>
      <textarea id="t2" name="q2"></textarea>
    </div>
  </div>

  <!-- Case 3: Text node before the element, no wrapping tag -->
  <div class="q3">
    Question 3: Bare text node before?
    <br>
    <textarea id="t3" name="q3"></textarea>
  </div>
  
  <!-- Case 4: Elite Technical style where text is before an input but deep -->
  <div class="q4">
    <p>Question 4: Elite style question text</p>
    <div>
      <br>
      <textarea id="t4" name="q4"></textarea>
    </div>
  </div>
</body>
</html>
`;

(async () => {
    let browser;
    try {
        console.log("Starting DOM extractor tests...");
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        // Load the test HTML
        await page.setContent(testHtml);
        
        // Inject and run the dom-extractor
        const fields = await page.evaluate(extractDOM, 'test');
        
        let allPassed = true;
        
        const assertLabel = (id, expectedLabel) => {
            // Find the original element to match the id
            const el = fields.find(f => {
                // To get original id, we'd need it in the fields, but extractDOM replaces id with data-arf-id.
                // We'll map by order instead since there are only 4 textareas in order.
                return true;
            });
        };
        
        // Since extractDOM replaces actual IDs with agent-x, we get them in order
        const textareas = fields.filter(f => f.tag === 'textarea');
        
        const expected = [
            "Question 1: Sibling paragraph?",
            "Question 2: Parent sibling paragraph?",
            "Question 3: Bare text node before?",
            "Question 4: Elite style question text"
        ];
        
        if (textareas.length !== 4) {
            console.error(`❌ Expected 4 textareas, found ${textareas.length}`);
            allPassed = false;
        }
        
        for (let i = 0; i < expected.length; i++) {
            const actual = textareas[i]?.label;
            if (actual === expected[i]) {
                console.log(`✅ Test ${i+1} passed: Found label '${actual}'`);
            } else {
                console.error(`❌ Test ${i+1} failed: Expected '${expected[i]}', got '${actual}'`);
                allPassed = false;
            }
        }
        
        if (allPassed) {
            console.log("\n🎉 All DOM fallback extraction tests passed!");
            process.exit(0);
        } else {
            console.error("\n❌ Some tests failed.");
            process.exit(1);
        }

    } catch (e) {
        console.error("Test script crashed:", e);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
    }
})();
