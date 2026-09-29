const { chromium } = require('playwright');
const { extractDOM } = require('../src/dom-extractor');

(async () => {
    console.log("Starting test for hidden radio buttons and context extraction...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Inject a mocked LinkedIn/iCIMS form
    await page.setContent(`
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
                <!-- To test JS fallback click tracking -->
                <script>
                    window.labelClicked = false;
                    document.getElementById('label_yes').addEventListener('click', () => {
                        window.labelClicked = true;
                    });
                </script>
            </body>
        </html>
    `);

    // 1. Test extraction
    console.log("Running extractDOM...");
    const domState = await page.evaluate(extractDOM);
    
    const yesRadio = domState.find(el => el.tag === 'input' && el.label === 'Yes');
    const noRadio = domState.find(el => el.tag === 'input' && el.label === 'No');

    if (!yesRadio || !noRadio) {
        console.error("❌ Test Failed: Hidden radio buttons were not extracted!");
        process.exit(1);
    }
    console.log("✅ Hidden radio buttons successfully extracted despite CSS hiding.");

    if (!yesRadio.context.includes("Are you legally authorized to work in the United States?*")) {
        console.error("❌ Test Failed: Context extraction failed. Context was:", yesRadio.context);
        process.exit(1);
    }
    console.log("✅ Question context successfully extracted.");

    // 2. Test fallback click mechanism
    console.log("Testing fallback click...");
    // Simulate what form-filler.js does when Playwright fails
    const actionId = yesRadio.id; // which is set by extractDOM as data-arf-id and returned in 'id'
    
    // Attempt normal playwright click (should fail or succeed but we'll force the fallback manually to test it)
    await page.evaluate((selector) => {
        const el = document.querySelector('[data-arf-id="' + selector + '"]');
        el.click();
        if (el.labels && el.labels.length > 0) {
            el.labels[0].click();
        } else if (el.id) {
            const safeId = el.id.replace(/"/g, '\\\\\"');
            const label = document.querySelector('label[for="' + safeId + '"]');
            if (label) label.click();
        }
    }, actionId);

    const wasClicked = await page.evaluate(() => window.labelClicked);
    if (!wasClicked) {
        console.error("❌ Test Failed: Fallback JS click did not trigger label click!");
        process.exit(1);
    }
    console.log("✅ Fallback JS click successfully triggered the label click.");

    console.log("All tests passed successfully! 🎉");
    await browser.close();
})();
