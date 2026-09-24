const { chromium } = require('playwright');
const { executeAction, buildPrompt } = require('../src/form-filler');

async function testDateLogic() {
    let success = true;

    // Test 1: Verify buildPrompt contains the new logic
    console.log("Test 1: Verifying buildPrompt instructions");
    const prompt = buildPrompt(0, 10, "cv", "profile", [], "", "");
    if (!prompt.includes('placeholder, label, or type to determine the format')) {
        console.error("❌ buildPrompt does not contain the updated instructions for dates.");
        success = false;
    } else {
        console.log("✅ buildPrompt contains the correct instructions.");
    }

    // Test 2: Verify executeAction uses .fill() for date inputs instead of pressSequentially()
    console.log("Test 2: Verifying executeAction behavior for date fields");
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        
        // We set up a page with a native date input and a standard text input.
        // We'll track 'keydown' events to differentiate between .fill (no keydown) and .pressSequentially (fires keydown).
        await page.setContent(`
            <input type="date" id="dateInput" data-arf-id="agent-date">
            <input type="text" id="textInput" data-arf-id="agent-text">
            <script>
                window.keydownCounts = { dateInput: 0, textInput: 0 };
                document.getElementById('dateInput').addEventListener('keydown', () => window.keydownCounts.dateInput++);
                document.getElementById('textInput').addEventListener('keydown', () => window.keydownCounts.textInput++);
            </script>
        `);

        // Test native date input
        await executeAction(page, { action: 'fill', id: 'agent-date', value: '2023-06-01' });
        const dateKeydowns = await page.evaluate(() => window.keydownCounts.dateInput);
        const dateValue = await page.locator('#dateInput').inputValue();

        if (dateValue !== '2023-06-01') {
            console.error(`❌ Date input value is wrong: ${dateValue}`);
            success = false;
        } else if (dateKeydowns > 0) {
            console.error(`❌ Date input had ${dateKeydowns} keydown events. It used pressSequentially() instead of fill()!`);
            success = false;
        } else {
            console.log("✅ Native date input successfully used .fill() (0 keydowns)");
        }

        // Test normal text input (should use pressSequentially, so >0 keydowns)
        await executeAction(page, { action: 'fill', id: 'agent-text', value: '2023' });
        const textKeydowns = await page.evaluate(() => window.keydownCounts.textInput);
        const textValue = await page.locator('#textInput').inputValue();

        if (textValue !== '2023') {
            console.error(`❌ Text input value is wrong: ${textValue}`);
            success = false;
        } else if (textKeydowns === 0) {
            console.error("❌ Text input had 0 keydown events. It did not use pressSequentially()!");
            success = false;
        } else {
            console.log("✅ Text input successfully used .pressSequentially() (>0 keydowns)");
        }
        
    } catch (err) {
        console.error("❌ Exception during test:", err);
        success = false;
    } finally {
        await browser.close();
    }

    if (success) {
        console.log("\n🎉 All date logic tests passed!");
        process.exit(0);
    } else {
        console.error("\n❌ Tests failed.");
        process.exit(1);
    }
}

testDateLogic();
