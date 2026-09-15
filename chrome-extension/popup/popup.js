document.addEventListener('DOMContentLoaded', () => {
  // Tabs logic
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  // Load Settings
  const apiKeyInput = document.getElementById('api-key');
  const modelNameInput = document.getElementById('model-name');
  const profileInput = document.getElementById('profile-text');
  const cvInput = document.getElementById('cv-text');
  
  chrome.storage.local.get(['apiKey', 'modelName', 'profile', 'cv'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.modelName) modelNameInput.value = result.modelName;
    if (result.profile) profileInput.value = result.profile;
    if (result.cv) cvInput.value = result.cv;
  });

  // Save Settings
  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const modelName = modelNameInput.value.trim() || 'gemini-3.8-flash';
    const profile = profileInput.value.trim();
    const cv = cvInput.value.trim();

    chrome.storage.local.set({ apiKey, modelName, profile, cv }, () => {
      const status = document.getElementById('save-status');
      status.classList.remove('hidden');
      setTimeout(() => {
        status.classList.add('hidden');
      }, 2000);
    });
  });

  // Handle PDF Upload
  const cvUpload = document.getElementById('cv-upload');
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';
  }

  // ── Structure raw CV text via Gemini ─────────────────────────────────────────
  async function structureCvWithLLM(rawText, apiKey, modelName) {
    const model = modelName || 'gemini-3.8-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `You are a professional CV parser. The text below was extracted from a PDF resume and may contain formatting noise. 
Parse it and return a clean, structured version using EXACTLY these section headers (include only sections that have content):

== PERSONAL INFO ==
Full Name: [First Name Last Name]
Job Title: [current/target job title as stated in the CV]

== CONTACTS ==
Email: [email]
Phone: [phone number]
LinkedIn: [LinkedIn URL or handle]
GitHub: [GitHub URL or handle]
Telegram: [Telegram handle if present]
Website: [personal website if present]
[Any other contact links]

== LOCATION ==
Country: [country]
City: [city]

== PREFERRED WORK TYPE ==
[e.g.: Remote / Hybrid / On-site — extract if explicitly stated, otherwise write "Not specified"]

== SUMMARY ==
[2-4 sentence professional summary]

== AREAS OF EXPERTISE ==
[List the candidate's main specializations, professional interests, and key focus areas as bullet points starting with •]
[Examples: • AI Agentic Engineering, • Microservices Architecture, • FinTech Backend Systems]

== EXPERIENCE ==
--- [Job Title] at [Company Name] | [Start Date] – [End Date or Present] ---
[Key responsibilities and achievements as bullet points starting with •]

(repeat for each role, most recent first)

== EDUCATION ==
--- [Degree] in [Field] | [University Name] | [Year] ---
[Optional: relevant details]

== CERTIFICATIONS ==
--- [Certification Name] | [Issuing Organisation] | [Year] ---
[Optional: credential ID or link]

== PERSONAL PROJECTS ==
--- [Project Name] ---
[Brief description, technologies used, links if available]

== SKILLS ==
[Group skills logically, e.g.: Programming Languages: ..., Frameworks: ..., Tools: ..., Cloud: ..., etc.]

== LANGUAGES ==
[List each language and proficiency level, e.g.: English — Native, Russian — Fluent, Spanish — Intermediate]

Rules:
- Keep all factual information exactly as provided — do NOT invent or omit anything
- Fix obvious OCR/encoding errors (e.g. garbled characters)
- Remove page headers/footers/noise that are not part of the CV content
- Output ONLY the structured CV text — no preamble, no commentary

--- RAW CV TEXT ---
${rawText}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || rawText;
  }

  cvUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;

    // Store original PDF as base64 for later upload to job form
    const pdfBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]); // strip data:...;base64,
      reader.readAsDataURL(file);
    });
    chrome.storage.local.set({ cvPdfBase64: pdfBase64, cvPdfName: file.name });

    const saveStatus = document.getElementById('save-status');

    // Step 1: Extract raw text
    cvInput.value = "⏳ Step 1/2: Extracting text from PDF...";
    saveStatus.textContent = "⏳ Step 1/2: Extracting text from PDF...";
    saveStatus.classList.remove('hidden');

    let rawText = '';
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);

        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        rawText += pageText + '\n';

        // Extract embedded hyperlinks
        const annotations = await page.getAnnotations();
        const links = annotations
          .filter(a => a.subtype === 'Link' && a.url)
          .map(a => a.url);
        if (links.length > 0) {
          rawText += '\n[Embedded Links:]\n' + links.join('\n') + '\n';
        }
        rawText += '\n';
      }

      // Clean up weird characters
      rawText = rawText.replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\r]/gu, ' ').trim();
    } catch (err) {
      cvInput.value = "❌ Error extracting text: " + err.message;
      saveStatus.classList.add('hidden');
      return;
    }

    // Step 2: Structure with Gemini (only if API key is set)
    const { apiKey, modelName } = await chrome.storage.local.get(['apiKey', 'modelName']);

    if (apiKey) {
      cvInput.value = "🤖 Step 2/2: Structuring CV with AI, please wait...";
      saveStatus.textContent = "🤖 Step 2/2: Structuring with AI...";

      try {
        const structured = await structureCvWithLLM(rawText, apiKey, modelName);
        cvInput.value = structured;
        saveStatus.textContent = "✅ CV extracted, structured by AI, and saved!";
      } catch (err) {
        // Fall back to raw text if LLM call fails — show error prominently
        cvInput.value = rawText;
        const errEl = document.getElementById('error-msg');
        errEl.textContent = "⚠️ AI structuring failed (raw text saved). Error: " + err.message;
        errEl.classList.remove('hidden');
        saveStatus.textContent = "⚠️ AI structuring failed — check error below";
        // Keep error visible until dismissed, auto-hide after 15s
        setTimeout(() => errEl.classList.add('hidden'), 15000);
      }
    } else {
      // No API key — save raw text and hint user
      cvInput.value = rawText;
      saveStatus.textContent = "📄 PDF extracted (set API Key in Settings to also auto-structure with AI)";
    }

    // Save to storage
    chrome.storage.local.set({ cv: cvInput.value }, () => {
      setTimeout(() => {
        saveStatus.classList.add('hidden');
        saveStatus.textContent = "Saved successfully!";
      }, 5000);
    });
  });

  // ── Re-structure button ───────────────────────────────────────────────────────
  document.getElementById('restructure-btn').addEventListener('click', async () => {
    const saveStatus = document.getElementById('save-status');
    const currentText = cvInput.value.trim();

    if (!currentText) {
      saveStatus.textContent = "⚠️ CV text is empty — upload a PDF or paste text first.";
      saveStatus.classList.remove('hidden');
      setTimeout(() => saveStatus.classList.add('hidden'), 4000);
      return;
    }

    const { apiKey, modelName } = await chrome.storage.local.get(['apiKey', 'modelName']);
    if (!apiKey) {
      const errEl = document.getElementById('error-msg');
      errEl.textContent = "⚠️ API Key not set — go to Settings tab and enter your Gemini API Key, then Save.";
      errEl.classList.remove('hidden');
      setTimeout(() => errEl.classList.add('hidden'), 8000);
      return;
    }

    document.getElementById('restructure-btn').disabled = true;
    saveStatus.textContent = "🤖 Structuring CV with AI, please wait...";
    saveStatus.classList.remove('hidden');

    try {
      const structured = await structureCvWithLLM(currentText, apiKey, modelName);
      cvInput.value = structured;
      chrome.storage.local.set({ cv: structured });
      saveStatus.textContent = "✅ CV structured by AI and saved!";
    } catch (err) {
      const errEl = document.getElementById('error-msg');
      errEl.textContent = "⚠️ AI structuring failed. Error: " + err.message;
      errEl.classList.remove('hidden');
      saveStatus.textContent = "⚠️ Failed — check error message";
      setTimeout(() => errEl.classList.add('hidden'), 15000);
    }

    document.getElementById('restructure-btn').disabled = false;
    setTimeout(() => {
      saveStatus.classList.add('hidden');
      saveStatus.textContent = "Saved successfully!";
    }, 5000);
  });

  // Generate logic
  const generateBtn = document.getElementById('generate-btn');
  const stopBtn = document.getElementById('stop-btn');
  const loadingDiv = document.getElementById('loading');
  const resultContainer = document.getElementById('result-container');
  const resultText = document.getElementById('result-text');
  const errorMsg = document.getElementById('error-msg');

  generateBtn.addEventListener('click', async () => {
    // Hide previous results/errors
    resultContainer.classList.add('hidden');
    errorMsg.classList.add('hidden');
    
    // Check if API key and CV exist
    const { apiKey, modelName, cv, profile, cvPdfBase64, cvPdfName } = await chrome.storage.local.get(['apiKey', 'modelName', 'cv', 'profile', 'cvPdfBase64', 'cvPdfName']);
    if (!apiKey || !cv) {
      errorMsg.textContent = "Please set your API Key and CV in the Settings tab.";
      errorMsg.classList.remove('hidden');
      return;
    }

    const currentModel = modelName || 'gemini-3.8-flash';

    let tabUrl = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) tabUrl = tab.url;
    } catch (e) {
      console.warn("Could not get active tab URL:", e);
    }

    loadingDiv.classList.remove('hidden');
    generateBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    try {
      const response = await fetch('http://localhost:3000/fill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cvText: cv,
          apiKey,
          modelName: currentModel,
          profileText: profile,
          tabUrl: tabUrl,
          cvPdfBase64: cvPdfBase64 || null,
          cvPdfName: cvPdfName || 'resume.pdf'
        })
      });

      const data = await response.json();
      
      loadingDiv.classList.add('hidden');
      generateBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');

      if (response.ok && data.success) {
        resultText.textContent = "✅ Form filled successfully! Check the browser tab.";
        resultContainer.classList.remove('hidden');
      } else {
        errorMsg.textContent = "Agent Error: " + (data.error || "Unknown error");
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      loadingDiv.classList.add('hidden');
      generateBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      errorMsg.textContent = "Failed to reach Agent Server. Is it running on http://localhost:3000? Error: " + err.message;
      errorMsg.classList.remove('hidden');
    }
  });

  stopBtn.addEventListener('click', async () => {
    try {
      await fetch('http://localhost:3000/stop', { method: 'POST' });
      stopBtn.classList.add('hidden');
      loadingDiv.classList.add('hidden');
      generateBtn.classList.remove('hidden');
      resultText.textContent = "🛑 Agent stopped by user.";
      resultContainer.classList.remove('hidden');
    } catch(e) {
      errorMsg.textContent = "Failed to stop agent: " + e.message;
      errorMsg.classList.remove('hidden');
    }
  });

  // ── Export Settings ──────────────────────────────────────────────────────────
  document.getElementById('export-btn').addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['apiKey', 'modelName', 'profile', 'cv']);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auto-resume-filler-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Import Settings ──────────────────────────────────────────────────────────
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Only import known keys
      const allowed = ['apiKey', 'modelName', 'profile', 'cv'];
      const toSave = {};
      for (const key of allowed) {
        if (data[key] !== undefined) toSave[key] = data[key];
      }

      await chrome.storage.local.set(toSave);

      // Update UI fields
      if (toSave.apiKey)    apiKeyInput.value   = toSave.apiKey;
      if (toSave.modelName) modelNameInput.value = toSave.modelName;
      if (toSave.profile)   profileInput.value  = toSave.profile;
      if (toSave.cv)        cvInput.value       = toSave.cv;

      const importStatus = document.getElementById('import-status');
      importStatus.classList.remove('hidden');
      setTimeout(() => importStatus.classList.add('hidden'), 2500);
    } catch (err) {
      alert('Failed to import settings: ' + err.message);
    }

    // Reset file input so the same file can be re-imported if needed
    e.target.value = '';
  });
});

