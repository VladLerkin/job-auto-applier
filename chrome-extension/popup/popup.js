document.addEventListener('DOMContentLoaded', () => {
  // ── Tabs Logic ───────────────────────────────────────────────────────────────
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

  // ── Close Popup Logic ────────────────────────────────────────────────────────
  document.getElementById('close-popup-btn').addEventListener('click', () => {
    window.close();
  });

  // Load Settings
  const apiKeyInput = document.getElementById('api-key');
  const modelNameInput = document.getElementById('model-name');
  const profileInput = document.getElementById('profile-text');
  const cvInput = document.getElementById('cv-text');
  
  // ── Load saved settings on startup ─────────────────────────────────────────────
  async function loadSettings() {
    const { apiKey, modelName, cv, profile, cvPdfName } = await chrome.storage.local.get(['apiKey', 'modelName', 'cv', 'profile', 'cvPdfName']);
    if (apiKey) apiKeyInput.value = apiKey;
    if (modelName) modelNameInput.value = modelName;
    if (profile) profileInput.value = profile;
    if (cv) cvInput.value = cv;
    if (cvPdfName) {
      document.getElementById('loaded-pdf-name').textContent = `Loaded: ${cvPdfName}`;
    }
  }
  loadSettings();

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
    document.getElementById('loaded-pdf-name').textContent = `Loaded: ${file.name}`;

    const saveStatus = document.getElementById('save-status');
    const originalCvText = cvInput.value;

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

    // Step 2: Ask user and process text
    const { apiKey, modelName } = await chrome.storage.local.get(['apiKey', 'modelName']);

    // Восстанавливаем оригинальный текст на время показа модалки
    cvInput.value = originalCvText; 
    
    const useText = await new Promise((resolve) => {
      let modal = document.getElementById('ai-confirm-modal');
      if (!modal) {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = `
          <div id="ai-confirm-modal" class="modal hidden">
            <div class="modal-content">
              <h3>Overwrite CV Text?</h3>
              <p id="ai-confirm-msg" style="font-size: 14px; margin-bottom: 20px; line-height: 1.5; font-weight: normal; color: #374151;">
                <!-- Injected via JS -->
              </p>
              <div class="modal-actions">
                <button id="ai-cancel-btn" class="secondary-btn">Cancel</button>
                <button id="ai-confirm-btn" class="primary-btn">Yes, overwrite text</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modalContainer.firstElementChild);
        modal = document.getElementById('ai-confirm-modal');
      }
      const msgEl = document.getElementById('ai-confirm-msg');
      
      if (apiKey) {
        msgEl.innerHTML = "Do you want to use AI (Gemini) to automatically structure the extracted text from your PDF?<br><br>If you click <b>Cancel</b>, the PDF will be saved for auto-uploading on job sites, but your CV text below will <b>not</b> be changed.";
      } else {
        msgEl.innerHTML = "Do you want to load the raw text from this PDF into the text box below?<br><br>(<i>Hint: Add a Gemini API Key in settings to let AI structure it nicely for you!</i>)<br><br>If you click <b>Cancel</b>, the PDF will be saved for auto-uploading on job sites, but your CV text below will <b>not</b> be changed.";
      }

      modal.classList.remove('hidden');
      
      const onConfirm = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      
      document.getElementById('ai-confirm-btn').addEventListener('click', onConfirm);
      document.getElementById('ai-cancel-btn').addEventListener('click', onCancel);
      
      function cleanup() {
        modal.classList.add('hidden');
        document.getElementById('ai-confirm-btn').removeEventListener('click', onConfirm);
        document.getElementById('ai-cancel-btn').removeEventListener('click', onCancel);
      }
    });

    if (useText) {
      if (apiKey) {
        cvInput.value = "🤖 Step 2/2: Structuring CV with AI, please wait...";
        saveStatus.textContent = "🤖 Step 2/2: Structuring with AI...";
        saveStatus.classList.remove('hidden');

        try {
          const structured = await structureCvWithLLM(rawText, apiKey, modelName);
          cvInput.value = structured;
          saveStatus.textContent = "✅ CV extracted, structured by AI, and saved!";
        } catch (err) {
          cvInput.value = rawText;
          const errEl = document.getElementById('error-msg');
          errEl.textContent = "⚠️ AI structuring failed (raw text saved). Error: " + err.message;
          errEl.classList.remove('hidden');
          saveStatus.textContent = "⚠️ AI structuring failed — check error below";
          setTimeout(() => errEl.classList.add('hidden'), 15000);
        }
      } else {
        cvInput.value = rawText;
        saveStatus.textContent = "📄 Raw PDF text loaded into text box";
        saveStatus.classList.remove('hidden');
      }
    } else {
      cvInput.value = originalCvText;
      saveStatus.textContent = "📄 PDF saved (Text area unchanged)";
      saveStatus.classList.remove('hidden');
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
    // Не экспортируем apiKey в целях безопасности!
    const data = await chrome.storage.local.get(['modelName', 'profile', 'cv', 'cvPdfBase64', 'cvPdfName']);
    const json = JSON.stringify(data, null, 2);
    
    // Используем классический подход с Blob, так как chrome.downloads часто 
    // ломает имя файла при вызове из popup расширения.
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'job-auto-applier-settings.json';
    document.body.appendChild(a);
    a.click();
    
    // Удаляем элемент и очищаем память через 500мс
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  });

  // ── Import Settings ──────────────────────────────────────────────────────────
  let pendingImportData = null;
  const importModal = document.getElementById('import-modal');
  
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      pendingImportData = JSON.parse(text);
      importModal.classList.remove('hidden');
    } catch (err) {
      alert('Failed to parse settings file: ' + err.message);
    }

    // Reset file input so the same file can be re-imported if needed
    e.target.value = '';
  });

  document.getElementById('cancel-import-btn').addEventListener('click', () => {
    pendingImportData = null;
    importModal.classList.add('hidden');
  });

  document.getElementById('confirm-import-btn').addEventListener('click', async () => {
    if (!pendingImportData) return;

    const toSave = {};
    
    if (document.getElementById('import-cb-profile').checked && pendingImportData.profile !== undefined) {
      toSave.profile = pendingImportData.profile;
      profileInput.value = toSave.profile;
    }
    
    if (document.getElementById('import-cb-cv').checked && pendingImportData.cv !== undefined) {
      toSave.cv = pendingImportData.cv;
      cvInput.value = toSave.cv;
    }
    
    if (document.getElementById('import-cb-pdf').checked && pendingImportData.cvPdfBase64 !== undefined) {
      toSave.cvPdfBase64 = pendingImportData.cvPdfBase64;
      if (pendingImportData.cvPdfName) {
        toSave.cvPdfName = pendingImportData.cvPdfName;
        document.getElementById('loaded-pdf-name').textContent = `Loaded: ${toSave.cvPdfName}`;
      }
    }
    
    if (document.getElementById('import-cb-model').checked && pendingImportData.modelName !== undefined) {
      toSave.modelName = pendingImportData.modelName;
      modelNameInput.value = toSave.modelName;
    }
    
    // API key is never exported normally, but just in case it's in a manual json
    if (pendingImportData.apiKey !== undefined && pendingImportData.apiKey !== '') {
        // Only import if we actually want it, but we don't have a checkbox for it
        // We'll just ignore it to be safe.
    }

    if (Object.keys(toSave).length > 0) {
      await chrome.storage.local.set(toSave);
      
      const importStatus = document.getElementById('import-status');
      importStatus.classList.remove('hidden');
      setTimeout(() => importStatus.classList.add('hidden'), 2500);
    }
    
    pendingImportData = null;
    importModal.classList.add('hidden');
  });
});

