# Release Notes

## v1.3.4
**Release Date:** September 17, 2026

### Features
- **View Last Cover Letter:** Added a new button in the extension popup to easily view the last generated cover letter in a new tab.

### Bug Fixes & Improvements
- **React-Select Dropdowns:** Improved `dom-extractor.js` to correctly capture selected values from `react-select` components (common on Greenhouse) so the agent stops repeating already filled fields.
- **Form Validation & Anti-Hallucination:** Added `maxLength` extraction for text inputs, and enforced strict LLM rules to respect limits and avoid hallucinating CV facts.
- **Hostaway JD Extraction:** Fixed the URL parsing regex to support job slugs (not just UUIDs), enabling correct extraction of the full job description on Hostaway pages.
- **Fatal API Errors:** The agent server now immediately halts and reports fatal API errors (like 429 Resource Exhausted) directly to the extension UI instead of silently looping.

## v1.3.3
**Release Date:** September 16, 2026

### Bug Fixes & Improvements
- **Custom Dropdown Support:** Improved `dom-extractor.js` to detect custom `div`-based dropdowns (e.g., `.select-selected` elements used for currency and years of experience fields). These are now correctly exposed to the LLM as `combobox` fields.
- **Form Filler Action Fix:** Fixed an issue in `form-filler.js` where the agent would fail when trying to apply a `selectOption` action to a non-input custom dropdown. The agent now properly clicks to expand the dropdown and selects the appropriate option without trying to type text.

## v1.3.2
**Release Date:** September 16, 2026

### Documentation
- **README Formatting:** Updated `README.md` title and formatting for better readability.

## v1.3.1
**Release Date:** September 15, 2026

### Developer Tools & Documentation
- **Agentic Release Skill:** Added a dedicated agent skill (`release-app`) to automate future version bumping, changelog generation, tagging, and pushing for this project. 
- **Documentation Restructure:** Fully translated `README.md` to English with a new "Key Features" section. Updated `DESIGN.md` to include recent architecture changes, and removed obsolete draft files.

## v1.3.0
**Release Date:** September 15, 2026

### Security & UX Improvements
- **Security & Export Fixes:** Removed API Key from the settings export to prevent accidental leaks. Switched export logic to a robust `<a>` Blob download method that bypasses Chrome's popup UUID filename bug, ensuring `job-auto-applier-settings.json` is saved correctly. Added PDF Base64 string and file name to the export so users don't lose their auto-upload capability on a new device.
- **Smart Import UI:** Replaced the silent settings overwrite with a dynamic modal dialog when importing a JSON file. Users can now selectively check which fields to import (Preferences, CV text, CV PDF File, Model Name).
- **Safe PDF Upload Flow:** Added a custom AI confirmation modal when a user uploads a PDF. The extension now intelligently asks if you want to use AI to structure the CV, or if you just want to load the raw text (if no API key is provided). Clicking "Cancel" safely retains the existing text area while still storing the PDF in the background for auto-uploads.
- **UI Polish:** Added an intuitive 'Close' (`✖`) button to the popup header. Added a real-time label indicating the name of the currently loaded PDF next to the upload button, persisting across popup restarts. Fixed macOS file picker restrictions by defining rigorous MIME types (`accept=".json,application/json"`).

## v1.2.0
**Release Date:** September 15, 2026

### New Features & Improvements
- **Windows Support:** Added a `Start Agent.bat` script for native Windows launching and updated the backend server to launch the Chrome browser properly on Windows machines.
- **Precise Cover Letter Lengths:** The agent now dynamically reads `maxLength` constraints on text fields (common on Greenhouse forms) and instructs the AI to generate concise paragraphs that strictly adhere to those limits.
- **Robust Radio Button Extraction:** Completely rewrote label and context extraction for radio buttons to effectively parse sites like Workable that hide labels behind complex custom `div` wrappers and SVG elements. The agent now properly understands the question being asked.
- **Resilient Form Loading:** Added a dynamic waiting mechanism to the main agent loop. The agent will now pause and retry if it encounters a page with no interactive form fields, ensuring dynamically embedded iframes (like Greenhouse forms) have time to fully load before the agent starts or prematurely finishes.
- **DOM Selector Hardening:** Escaped dynamic attribute IDs to prevent custom form IDs (like `job_application[first_name]`) from crashing the extraction process.


## v1.1.0
**Release Date:** September 15, 2026

### New Features
- **Stop Agent:** Added a "Stop Agent" button in the Chrome extension UI. You can now gracefully interrupt and pause the agent's form-filling session at any time without killing the background server.
- **Improved UI Layout:** Moved the "Save Settings" button to the very top of the Settings tab so you don't forget to click it when updating API keys or CV content.

### Bug Fixes & Improvements
- **Strict Resume Uploading:** Removed a dangerous fallback mechanism that would blindly upload your resume PDF to the first available file input on the page (which caused resumes to be uploaded to "Photo" fields on some sites). The agent now strictly looks for inputs explicitly labeled as Resume or CV.
- **Smart Field Skipping:** Drastically improved the LLM prompt so the agent respects fields that are already pre-filled with correct data (e.g., your email, phone, or location pre-populated by LinkedIn Easy Apply) and only attempts to fill empty or incorrect fields.
- **Fixed Variable Scoping:** Fixed a `ReferenceError` crash that occurred when the server tried to clean up temporary PDF files upon cancellation.
