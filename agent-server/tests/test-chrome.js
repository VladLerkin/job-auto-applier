const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

(async () => {
    try {
        const userDataDir = path.join(os.homedir(), '.ai-job-profile-test');
        const extensionPath = path.resolve(__dirname, '../');
        
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`
            ]
        });
        
        const page = context.pages()[0] || await context.newPage();
        await page.goto('chrome://extensions');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'extensions_screenshot.png' });
        
        await context.close();
    } catch (e) {
        console.log("Error:", e.message);
    }
})();
