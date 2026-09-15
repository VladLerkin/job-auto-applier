const path = require('path');
const os = require('os');
const { logToFile } = require('./logger');

/**
 * Launch a dedicated Chrome instance with the extension pre-loaded.
 */
async function startDedicatedBrowser() {
    try {
        console.log("\nLaunching dedicated Job Browser with pre-installed extension...");
        const userDataDir = path.join(os.homedir(), '.ai-job-profile');
        const extensionPath = path.resolve(__dirname, '../../chrome-extension'); 
        
        // Launch Chrome natively based on the OS
        const { exec } = require('child_process');
        if (os.platform() === 'win32') {
            exec(`start "" chrome --remote-debugging-port=9222 --user-data-dir="${userDataDir}" --load-extension="${extensionPath}"`);
        } else if (os.platform() === 'darwin') {
            exec(`open -n -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="${userDataDir}" --load-extension="${extensionPath}"`);
        } else {
            exec(`google-chrome --remote-debugging-port=9222 --user-data-dir="${userDataDir}" --load-extension="${extensionPath}"`);
        }
        
        // Wait for it to open port
        await new Promise(r => setTimeout(r, 2000));
        console.log("Dedicated Browser is ready! (Keep this window open)");
    } catch (e) {
        console.error("Failed to launch dedicated browser:", e.message);
    }
}

/**
 * Connect to a running Chrome instance via CDP.
 * @returns {Object} The Playwright browser object.
 */
async function connectToBrowser() {
    const { chromium } = require('playwright');
    return chromium.connectOverCDP('http://localhost:9222');
}

module.exports = { startDedicatedBrowser, connectToBrowser };
