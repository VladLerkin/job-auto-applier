const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { executeAction, buildPrompt } = require('../../src/form-filler');

describe('Date field logic', () => {
    let browser;

    before(async () => {
        browser = await chromium.launch({ headless: true });
    });

    after(async () => {
        if (browser) await browser.close();
    });

    it('includes date format instructions in buildPrompt', () => {
        const prompt = buildPrompt(0, 10, 'cv', 'profile', [], '', '');
        assert.match(prompt, /placeholder, label, or type to determine the format/);
    });

    it('uses .fill() for native date inputs and .pressSequentially() for text inputs', async () => {
        const page = await browser.newPage();
        try {
            await page.setContent(`
                <input type="date" id="dateInput" data-arf-id="agent-date">
                <input type="text" id="textInput" data-arf-id="agent-text">
                <script>
                    window.keydownCounts = { dateInput: 0, textInput: 0 };
                    document.getElementById('dateInput').addEventListener('keydown', () => window.keydownCounts.dateInput++);
                    document.getElementById('textInput').addEventListener('keydown', () => window.keydownCounts.textInput++);
                </script>
            `);

            await executeAction(page, { action: 'fill', id: 'agent-date', value: '2023-06-01' });
            const dateKeydowns = await page.evaluate(() => window.keydownCounts.dateInput);
            const dateValue = await page.locator('#dateInput').inputValue();

            assert.equal(dateValue, '2023-06-01');
            assert.equal(dateKeydowns, 0, 'Date input should use .fill() with 0 keydown events');

            await executeAction(page, { action: 'fill', id: 'agent-text', value: '2023' });
            const textKeydowns = await page.evaluate(() => window.keydownCounts.textInput);
            const textValue = await page.locator('#textInput').inputValue();

            assert.equal(textValue, '2023');
            assert.ok(textKeydowns > 0, 'Text input should use .pressSequentially() with >0 keydown events');
        } finally {
            await page.close();
        }
    });
});
