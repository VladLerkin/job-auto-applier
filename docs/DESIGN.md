# Architecture & Design

## Overview

**job-auto-applier** — AI-powered tool for auto-filling job application forms. It consists of two independent components that communicate over HTTP:

```
┌──────────────────────┐        HTTP (localhost:3000)        ┌──────────────────────┐
│   Chrome Extension   │  ─────────────────────────────────→ │   Agent Server       │
│  (chrome-extension/) │  POST /fill, POST /stop             │  (agent-server/)     │
│                      │  ←───────────────────────────────── │                      │
│  • Popup UI          │  JSON response                      │  • Playwright        │
│  • Settings mgmt     │                                     │  • TypeSafe AI (Jev) │
│  • PDF parsing       │                                     │  • Gemini API        │
└──────────────────────┘                                     └──────┬───────────────┘
                                                                    │
                                                         CDP (port 9222)
                                                                    │
                                                             ┌──────▼───────────────┐
                                                             │   Dedicated Chrome   │
                                                             │   (job hunting       │
                                                             │    browser instance) │
                                                             └──────────────────────┘
```

## Project Structure

```
job-auto-applier/
├── .gitignore
├── README.md                          # User-facing documentation
├── RELEASE_NOTES.md                   # Changelog
├── DESIGN.md                          # This file — architecture docs
├── Start Agent.bat                    # Windows launcher
├── Start Agent.command                # macOS launcher
│
├── chrome-extension/                  # Chrome Extension (Manifest V3)
│   ├── manifest.json                  # Extension manifest — permissions, popup, background
│   ├── background.js                  # Service worker — Gemini API calls from extension context
│   ├── popup/                         # Extension popup UI
│   │   ├── popup.html                 # Popup markup
│   │   ├── popup.css                  # Popup styles
│   │   └── popup.js                   # Popup logic — tabs, settings, PDF upload, agent control
│   └── lib/                           # Vendored third-party libraries
│       ├── pdf.min.js                 # PDF.js core
│       └── pdf.worker.min.js          # PDF.js web worker
│
├── agent-server/                      # Node.js Agent Server
│   ├── .env                           # Environment config (timeout, max steps)
│   ├── package.json                   # Dependencies & scripts
│   ├── package-lock.json
│   ├── src/                           # Application source code
│   │   ├── server.js                  # Express app, routes (/fill, /stop), startup
│   │   ├── gemini.js                  # Gemini API integration (askGemini, generateCoverLetterText)
│   │   ├── jev.js                     # TypeSafe AI / Jev System One integration (initJev, askJev)
│   │   ├── dom-extractor.js           # Browser-injectable DOM extraction function
│   │   ├── form-filler.js             # 15-step agent loop, action execution, LLM prompt builder
│   │   ├── file-handlers.js           # PDF upload, cover letter handling (text + PDF gen)
│   │   ├── browser.js                 # Chrome launch & CDP connection
│   │   └── logger.js                  # File logging utility
│   └── tests/                         # Test scripts
│       ├── test-chrome.js
│       ├── test-extract.js
│       ├── test-gemini.js
│       ├── test-jev.js
│       ├── test-jazzhr.js
│       └── test-jazzhr-submit.js
│
└── docs/                              # Project documentation & notes
    └── DESIGN.md                      # Architecture docs (this file)
```

## Component Details

### Chrome Extension (`chrome-extension/`)

The extension provides the user interface — a popup with two tabs:
- **Generator** — "Fill Application Form" button that sends the user's CV, API key, and current tab URL to the agent server via `POST /fill`. Also has a "Stop Agent" button.
- **Settings** — API key, model name, profile/preferences, CV text. Features a Smart Import JSON modal, secure local JSON export, and an AI Confirm modal for PDF text extraction and structuring.

**Key files:**
| File | Responsibility |
|------|---------------|
| `manifest.json` | Declares permissions (`storage`, `activeTab`, `scripting`), popup, background worker |
| `background.js` | Service worker with Gemini API call logic (used for direct extension-level AI calls) |
| `popup/popup.js` | All popup UI logic: tabs, settings persistence, PDF parsing, secure import/export modals, CV AI restructuring, agent invocation |
| `lib/pdf.min.js` | PDF.js library for client-side PDF text extraction |

### Agent Server (`agent-server/src/`)

A local Express server that drives browser automation via Playwright.

**Module responsibilities:**

| Module | Responsibility |
|--------|---------------|
| `server.js` | Express app setup, CORS, JSON body parsing, `/fill` and `/stop` routes, inactivity auto-shutdown, startup orchestration |
| `gemini.js` | Gemini API wrapper: `askGemini()` for JSON responses, `generateCoverLetterText()` for cover letters |
| `jev.js` | TypeSafe AI SDK wrapper: `askJev()` for routing and processing binary/choice fields via System One |
| `dom-extractor.js` | `extractDOM()` — injected into browser pages via `page.evaluate()`, traverses DOM including Shadow DOM, returns structured field descriptors |
| `form-filler.js` | Core agent loop (10 steps max) implementing **Concurrent Hybrid Routing**: extracts DOM → delegates binary/choice fields to Jev (TypeSafe) AND complex fields to Gemini in parallel → executes Jev actions instantly upon completion → filters Jev-handled actions from Gemini results → executes remaining Gemini actions with near-zero artificial delays. |
| `file-handlers.js` | PDF resume upload, "Autofill from resume" detection, cover letter text area detection, cover letter PDF generation (pdfkit) |
| `browser.js` | Chrome launch (platform-aware), CDP connection via Playwright |
| `logger.js` | Simple `logToFile()` utility — appends timestamped messages to `agent.log` |

## Data Flow

### Form Filling Flow

```
1. User clicks "Fill Application Form" in extension popup
2. popup.js sends POST /fill to localhost:3000 with:
   - cvText, apiKey, modelName, profileText, tabUrl, cvPdfBase64
3. server.js connects to Chrome via CDP (port 9222)
4. server.js finds the target page (by tabUrl or job site heuristics)
5. file-handlers.js:
   a. Tries "Autofill from resume" (Ashby feature)
   b. Uploads PDF to resume file input
   c. Handles cover letter (textarea or PDF upload)
6. form-filler.js runs 10-step loop:
   a. dom-extractor.js extracts current DOM state
   b. ROUTING (CONCURRENT): 
      - Passes simple choice/binary fields to Jev System One
      - Passes the entire domState to Gemini API (complex fields)
   c. Executes Jev actions instantly as soon as the Jev promise resolves
   d. Waits for Gemini to resolve, filters out Gemini's actions for Jev-handled fields to avoid conflicts
   e. Executes remaining Gemini actions (fill, selectOption) with near-zero artificial delays for lightning-fast typing
   f. Repeats until done or max steps reached
7. server.js returns JSON response to extension
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/fill` | POST | Start form-filling agent. Body: `{ cvText, apiKey, modelName, profileText, tabUrl, cvPdfBase64, cvPdfName }` |
| `/stop` | POST | Gracefully stop the running agent |
