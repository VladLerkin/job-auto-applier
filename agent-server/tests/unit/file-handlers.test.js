const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { findLabelledFileInput, findCoverLetterTextArea } = require('../../src/file-handlers');

const MOCK_HTML = `
<!DOCTYPE html>
<html>
<body>
    <div id="test-container">
        <label>
            Resume / CV
            <hh-file-upload></hh-file-upload>
        </label>
    </div>

    <div id="test-container-2">
        <label>
            Cover Letter Text
            <custom-textarea></custom-textarea>
        </label>
    </div>

    <script>
        const hh = document.querySelector('hh-file-upload');
        const shadow1 = hh.attachShadow({ mode: 'open' });
        shadow1.innerHTML = '<style>.letter { color: red; }</style><input type="file" id="resume-input" />';

        const ct = document.querySelector('custom-textarea');
        const shadow2 = ct.attachShadow({ mode: 'open' });
        shadow2.innerHTML = '<textarea id="cl-textarea"></textarea>';
    </script>
</body>
</html>
`;

describe('File handlers (Shadow DOM)', () => {
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

    it('finds labelled file input inside Shadow DOM', async () => {
        const resumeInput = await findLabelledFileInput(page, ['resume', 'cv']);
        assert.notEqual(resumeInput, null, 'Should find the resume input inside Shadow DOM');
        const id = await resumeInput.locator.evaluate((el) => el.id);
        assert.equal(id, 'resume-input');
    });

    it('finds cover letter textarea inside Shadow DOM', async () => {
        const clTextArea = await findCoverLetterTextArea(page);
        assert.notEqual(clTextArea, null, 'Should find the cover letter textarea inside Shadow DOM');
        const id = await clTextArea.locator.evaluate((el) => el.id);
        assert.equal(id, 'cl-textarea');
    });

    it('avoids false positives on CSS text inside style tags', async () => {
        const falsePositiveInput = await findLabelledFileInput(page, ['letter']);
        assert.equal(falsePositiveInput, null, 'Should not match CSS class names or distant text');
    });
});
