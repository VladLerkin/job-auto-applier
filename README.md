# job auto applier (Job form autofiller)

See what's new in the [Release Notes](RELEASE_NOTES.md). | [Architecture & Design](docs/DESIGN.md)

## Why this program is needed

**job-auto-applier** is a tool designed to automatically fill out job application forms. It analyzes your profile and resume (CV), and uses Artificial Intelligence (Gemini API) to independently insert the necessary information into form fields on job boards. This saves time and eliminates tedious routine work.

## Technology Stack

The project consists of two main parts:

1. **Chrome Extension (Client Side):** A classic Google Chrome extension (HTML, CSS, JavaScript). It acts as the user interface for managing the process and settings.
2. **Node.js Server (Agent):** A local server using Express, `playwright` for browser automation, and `@google/genai` for integration with Google's AI (Gemini).

## Key Features

- **Autonomous Playwright Agent:** Uses CDP and Playwright to navigate complex shadow DOMs, iframe contexts (e.g., Greenhouse, Workable), and dynamically interact with forms exactly like a human would.
- **Local PDF Parsing & AI Structuring:** Securely parses your PDF resume locally. Optionally uses Gemini AI to structure the raw text perfectly for job applications via an intuitive confirmation UI.
- **Secure Export & Smart Import:** Easily backup your configuration (including the PDF file itself) to a JSON file. When importing, use a sleek modal to selectively choose which settings to restore.
- **Smart Field Skipping:** Respects fields already filled out by platforms like LinkedIn Easy Apply to avoid overwriting correct data.

## How to Install

1. Clone or download this repository.
2. **Install the extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** in the top right corner.
   - Click **Load unpacked** and select the `chrome-extension/` folder of this project.
3. **Run the agent server:**
   - Simply double-click the `Start Agent.command` script (or `Start Agent.bat` on Windows). On the first run, it will automatically install all necessary Node.js dependencies and download the required browser. This script will launch the server and a dedicated browser instance for the agent to work in.

## Using the Program

All agent control is performed through the popup window of the installed Chrome extension.

- Open the desired job application page.
- Click on the job-auto-applier extension icon.
- Click the **🚀 Fill Application Form** button, and the agent will begin filling in the fields automatically.

## Settings

The extension has a **Settings** tab where you can configure the following parameters:

- **Gemini API Key:** Your access key for the Gemini API.
- **Model Name:** The AI model to use (default is `gemini-3.8-flash`).
- **Your Profile / Preferences:** Any additional information that is not in your resume but is frequently asked in application forms. For example: whether you need visa sponsorship, expected salary, race/ethnicity, veteran status, disability status, preferred work format (remote/hybrid/on-site), seniority level, etc.
- **Your CV / Resume Text:** The text of your resume. You can paste it manually or upload it as a PDF — the text will be extracted automatically.

### Mandatory Requirements

In order for the extension to work properly and fill out forms, the following two fields **must** be filled out in the settings:

1. **Gemini API Key** (access to the AI is impossible without a key).
2. **Your CV / Resume Text** (without your resume, the agent will have nothing to fill into the application form).
