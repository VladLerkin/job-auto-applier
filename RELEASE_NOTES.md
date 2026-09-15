# Release Notes

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
