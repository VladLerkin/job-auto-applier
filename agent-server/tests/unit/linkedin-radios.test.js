const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { extractDOM } = require('../../src/dom-extractor');

const MOCK_HTML = `
<html>
    <body>
        <div class="fb-dash-form-element">
            <span class="question-text">Are you legally authorized to work in the United States?*</span>
            <div>
                <div>
                    <input id="_r_ar_" tabindex="0" type="radio" name="radio-group-_r_ap_" aria-label="Are you legally authorized to work in the United States?" style="position: absolute; left: -9999px; width: 0; height: 0; opacity: 0;" />
                    <label for="_r_ar_" id="label_yes">Yes</label>
                </div>
                <div>
                    <input id="_r_no_" tabindex="0" type="radio" name="radio-group-_r_ap_" style="position: absolute; left: -9999px; width: 0; height: 0; opacity: 0;" />
                    <label for="_r_no_" id="label_no">No</label>
                </div>
            </div>
        </div>
        <script>
            window.labelClicked = false;
            document.getElementById('label_yes').addEventListener('click', () => {
                window.labelClicked = true;
            });
        </script>
    </body>
</html>
`;

describe('Hidden radio buttons and context extraction', () => {
    let browser;
    let page;

    before(async () => {
        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();
        await page.setContent(MOCK_HTML);
    });

    after(async () => {
        if (browser) await browser.close();
    });

    it('extracts CSS-hidden radio buttons with question context and supports label click fallback', async () => {
        const domState = await page.evaluate(extractDOM);

        const yesRadio = domState.find((el) => el.tag === 'input' && el.label === 'Yes');
        const noRadio = domState.find((el) => el.tag === 'input' && el.label === 'No');

        assert.ok(yesRadio, 'Yes radio button should be extracted despite CSS hiding');
        assert.ok(noRadio, 'No radio button should be extracted despite CSS hiding');
        assert.ok(
            yesRadio.context.includes('Are you legally authorized to work in the United States?*'),
            `Expected question context, got: ${yesRadio.context}`
        );

        await page.evaluate((selector) => {
            const el = document.querySelector('[data-arf-id="' + selector + '"]');
            el.click();
            if (el.labels && el.labels.length > 0) {
                el.labels[0].click();
            } else if (el.id) {
                const safeId = el.id.replace(/"/g, '\\"');
                const label = document.querySelector('label[for="' + safeId + '"]');
                if (label) label.click();
            }
        }, yesRadio.id);

        const wasClicked = await page.evaluate(() => window.labelClicked);
        assert.equal(wasClicked, true, 'Fallback JS click should trigger the associated label click');
    });
});
