const { chromium } = require('playwright');
const assert = require('assert');
const { findLabelledFileInput, findCoverLetterTextArea } = require('../src/file-handlers');

async function runTests() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log("Setting up mock HTML...");
    const htmlContent = `
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
                // Setup shadow DOM for Resume
                const hh = document.querySelector('hh-file-upload');
                const shadow1 = hh.attachShadow({mode: 'open'});
                shadow1.innerHTML = '<style>.letter { color: red; }</style><input type="file" id="resume-input" />';
                
                // Setup shadow DOM for Cover Letter textarea
                const ct = document.querySelector('custom-textarea');
                const shadow2 = ct.attachShadow({mode: 'open'});
                shadow2.innerHTML = '<textarea id="cl-textarea"></textarea>';
            </script>
        </body>
        </html>
    `;
    
    await page.setContent(htmlContent);
    
    console.log("Testing findLabelledFileInput (Shadow DOM crossing)...");
    const resumeInput = await findLabelledFileInput(page, ['resume', 'cv']);
    assert(resumeInput !== null, "Should find the resume input inside the shadow DOM");
    const id1 = await resumeInput.locator.evaluate(el => el.id);
    assert(id1 === 'resume-input', "Should return the correct input element");
    console.log("✅ findLabelledFileInput passed.");

    console.log("Testing findCoverLetterTextArea (Shadow DOM crossing)...");
    const clTextArea = await findCoverLetterTextArea(page);
    assert(clTextArea !== null, "Should find the cover letter textarea inside the shadow DOM");
    const id2 = await clTextArea.locator.evaluate(el => el.id);
    assert(id2 === 'cl-textarea', "Should return the correct textarea element");
    console.log("✅ findCoverLetterTextArea passed.");
    
    // Testing false positive for CSS text "letter"
    console.log("Testing false positive on CSS text...");
    const falsePositiveInput = await findLabelledFileInput(page, ['letter']);
    assert(falsePositiveInput === null, "Should NOT match just because of CSS properties or distant text");
    console.log("✅ False positive test passed.");

    await browser.close();
    console.log("All tests passed!");
}

runTests().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});
