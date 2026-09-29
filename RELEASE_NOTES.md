# Release Notes

## v1.3.16
**Release Date:** September 29, 2026

### Features & Architecture
- **Concurrent Form Filling:** The agent now processes form fields significantly faster by executing Jev (TypeSafe AI) and Gemini requests in parallel instead of sequentially.
- **Lightning-Fast Execution:** Eliminated artificial typing and click delays from the form filler, resulting in near-instantaneous interaction with the page.

### Bug Fixes & Improvements
- **Radio Button Accuracy (Jev):** Fixed an issue where Jev System One couldn't differentiate between Yes/No options for radio buttons. The prompt now explicitly includes the option label alongside the field context.
- **Hidden Select Elements (Select2):** Fixed an issue where the agent would timeout trying to interact with custom dropdown components (e.g., BambooHR's Select2) by implementing `force: true` for native select options, successfully syncing the hidden state with the custom UI.
- **Gemini Fallback Filter:** Refined the Jev action filtering logic to strictly prevent Gemini from hallucinating and attempting to execute text actions (`selectOption`) on radio buttons and checkboxes that Jev should handle.

## v1.3.15
**Release Date:** September 29, 2026

### Security Fixes
- **Path Traversal Vulnerability (RCE):** Fixed a critical path traversal vulnerability in the `/download-model` endpoint that allowed an attacker to overwrite arbitrary local files (e.g., `~/.zshrc`) by manipulating the `filename` parameter. Implemented secure path resolution using strict directory verification.

## v1.3.14
**Release Date:** September 29, 2026

### Features & Architecture
- **Instant Visual Feedback (Jev):** Modified the form filler execution loop to execute Jev System One actions (checkboxes, dropdowns, radios) immediately upon receiving them (in ~200ms), rather than waiting 5-10 seconds for Gemini to finish generating its response for complex fields. This makes the UI feel incredibly responsive.
- **Code Refactoring:** Extracted all TypeSafe SDK initialization and routing logic out of `form-filler.js` into a dedicated `jev.js` module. Added corresponding unit tests in `test-jev.js` to ensure the integration remains stable.
## v1.3.13
**Release Date:** September 29, 2026

### Features & Architecture
- **Hybrid Routing Architecture (TypeSafe AI + Gemini):** Introduced a dual-engine system. Simple choices (checkboxes, radio buttons, standard dropdowns) are now routed to **Jev System One** via the `@typesafe-ai/sdk` for instant (200ms) execution. Complex text fields and search comboboxes are still handled by Gemini.
- **Token Optimization:** The form filler now automatically deletes any fields successfully processed by Jev from the DOM state before sending the prompt to Gemini. This drastically reduces the prompt size and saves input tokens on mixed-field pages.

### Bug Fixes & Improvements
- **Improved Field Context Extraction:** Fixed an issue on platforms like Lever where radio button context was incomplete. The extractor now grabs up to 250 characters of surrounding text (from parent `li` or `.application-question` containers) to ensure the AI understands exactly what question it is answering.
- **Dropdown Extraction Fix:** Corrected a bug where native `<select>` options weren't being correctly parsed into arrays of strings for the Jev SDK.
- **Architecture Docs:** Updated `docs/DESIGN.md` to document the new Data Flow, components, and Hybrid Routing logic.
## v1.3.12
**Release Date:** September 28, 2026

### Bug Fixes & Improvements
- **Cover Letter Upload Fix:** Fixed an issue where the auto-applier would incorrectly upload the cover letter into the resume field on certain ATS (e.g., Ashby HQ) due to false-positive matching of generic text blocks containing the words 'cover letter'.


## v1.3.11
**Release Date:** September 27, 2026

### Bug Fixes & Improvements
- **Resume Upload UI State:** Fixed an issue where uploading the resume to a hidden input didn't trigger the website's UI updates correctly. The agent now explicitly clicks "Attach/Upload resume" buttons before uploading the file to ensure the UI is in the correct state.

## v1.3.10
**Release Date:** September 25, 2026

### Bug Fixes & Improvements
- **Shadow DOM File Upload Fix:** Fixed an issue on ATS platforms (like HireHive) where the cover letter falsely matched the resume field due to CSS properties containing the keyword 'letter'.
- **Enhanced DOM Traversal:** Improved DOM traversal for file inputs hidden inside Shadow DOM components (like custom `<hh-file-upload>` elements) to correctly map them to labels located in the regular Light DOM.
- **Test Coverage:** Added robust test coverage (`test-file-handlers.js`) to ensure Shadow DOM traversal logic remains stable and false positives from hidden `<style>` text are prevented.

## v1.3.9
**Release Date:** September 24, 2026

### Bug Fixes & Improvements
- **Date Field Formatting:** Updated the LLM prompt to correctly interpret expected date formats (e.g. MM/YYYY) based on the field's placeholder or label, fixing an issue where dates like `2023-06-01` would misalign with custom masks on sites like IBM Careers (resulting in years like `0023`).
- **Native Date Inputs:** Replaced the `.pressSequentially()` method with `.fill()` for native HTML fields (type="date", "month", "time") to ensure better compatibility across job boards. Added a dedicated `test-date-logic.js` test suite.
- **Strict File Upload Scoping:** Fixed a bug in `file-handlers.js` where the DOM search algorithm traversed too high, causing the generated Cover Letter PDF to mistakenly upload into the "Resume" file input field if both fields shared a large container.

## v1.3.8
**Release Date:** September 24, 2026

### Cleanup & Maintenance
- **Workspace Cleanup:** Reorganized the project workspace by moving test scripts (`test-*.js`) to the `agent-server/tests` folder.
- **Removed Unused Files:** Deleted unused HTML dumps and utility scripts (`smartrecruiters_dump.html`, `formatted.html`, `lever_form.html`, `fix_git.sh`) to reduce clutter.

## v1.3.7
**Release Date:** September 22, 2026

### Bug Fixes & Improvements
- **Form Filling Reliability:** Improved the agent's ability to detect interactive form fields and handle complex dropdown options more reliably.

## v1.3.6
**Release Date:** September 18, 2026

### Features
- **Real-time Progress Tracking:** Added a live progress indicator ("Step X of Y") to the extension popup, making it easier to track the agent's progress during form filling.

### Bug Fixes & Improvements
- **Popup Stability Fix:** Fixed an issue where the extension popup would disappear during the "Autofill from resume" step on certain job boards (like Ashby) due to forced page reloads.
- **Configurable Steps Limit:** The agent's maximum steps limit is now configurable via the `MAX_STEPS` environment variable (default reduced to 10 steps) to prevent unnecessary looping on completed forms.
- **Cleanup:** Removed the deprecated `BROWSER_MODE` setting from the environment file and documentation.

## v1.3.5
**Release Date:** September 17, 2026

### Features
- **Local LLM Integration:** Added full support for running GGUF quantized models completely locally (using `node-llama-cpp`), reducing API costs to zero.
- **Model Downloader:** Added a built-in Hugging Face model downloader directly in the Chrome Extension UI, complete with a progress bar and HTTP range-request resume support.
- **Model Tester:** Added a "Test Model" button to quickly load a `.gguf` file into memory and run a test query.
- **Eval Test Suite:** Introduced a new testing framework (`tests/evals/`) to evaluate the agent against mock DOM snapshots (e.g., tricky Greenhouse React-Select forms) before running it live.

### Bug Fixes & Improvements
- **Hugging Face CloudFront Fix:** Fixed a 401 Unauthorized download issue caused by Hugging Face injecting ANSI terminal escape sequences into `Location` headers during redirect.
- **node-llama-cpp v3 Compatibility:** Updated the internal agent-server API calls to be fully compatible with `node-llama-cpp` v3's ESM structure and class constructors.
- **UI Settings Toggle:** Added an AI Provider dropdown to switch seamlessly between Google Gemini and the Local Model, hiding/showing relevant fields dynamically.

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
