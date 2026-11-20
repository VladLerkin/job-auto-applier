const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { extractDOM } = require('../../src/dom-extractor');

const TEST_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="q1">
    <p>Question 1: Sibling paragraph?</p>
    <textarea id="t1" name="q1"></textarea>
  </div>

  <div class="q2">
    <p>Question 2: Parent sibling paragraph?</p>
    <div>
      <textarea id="t2" name="q2"></textarea>
    </div>
  </div>

  <div class="q3">
    Question 3: Bare text node before?
    <br>
    <textarea id="t3" name="q3"></textarea>
  </div>

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

describe('DOM extractor fallback label detection', () => {
    let browser;

    before(async () => {
        browser = await chromium.launch({ headless: true });
    });

    after(async () => {
        if (browser) await browser.close();
    });

    it('extracts labels from sibling elements, parent siblings, bare text nodes, and deep structures', async () => {
        const page = await browser.newPage();
        try {
            await page.setContent(TEST_HTML);
            const fields = await page.evaluate(extractDOM, 'test');
            const textareas = fields.filter((f) => f.tag === 'textarea');

            const expected = [
                'Question 1: Sibling paragraph?',
                'Question 2: Parent sibling paragraph?',
                'Question 3: Bare text node before?',
                'Question 4: Elite style question text',
            ];

            assert.equal(textareas.length, expected.length);
            assert.deepEqual(
                textareas.map((t) => t.label),
                expected
            );
        } finally {
            await page.close();
        }
    });
});
