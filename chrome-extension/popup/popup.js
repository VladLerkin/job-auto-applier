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
  const aiProviderSelect = document.getElementById('ai-provider');
  const geminiSettings = document.getElementById('gemini-settings');
  const agySettings = document.getElementById('agy-settings');
  const agyModelSelect = document.getElementById('agy-model');
  const localSettings = document.getElementById('local-settings');
  const localModelUrlInput = document.getElementById('local-model-url');
  const localModelFilenameInput = document.getElementById('local-model-filename');
  const typesafeApiKeyInput = document.getElementById('typesafe-api-key');

  const apiKeyInput = document.getElementById('api-key');
  const modelNameInput = document.getElementById('model-name');
  const profileInput = document.getElementById('profile-text');
  const cvInput = document.getElementById('cv-text');
  
  aiProviderSelect.addEventListener('change', () => {
    geminiSettings.classList.add('hidden');
    agySettings.classList.add('hidden');
    localSettings.classList.add('hidden');

    if (aiProviderSelect.value === 'local') {
      localSettings.classList.remove('hidden');
    } else if (aiProviderSelect.value === 'agy') {
      agySettings.classList.remove('hidden');
    } else {
      geminiSettings.classList.remove('hidden');
    }
  });

  // ── Load saved settings on startup ─────────────────────────────────────────────
  async function loadSettings() {
    const { apiKey, modelName, cv, profile, cvPdfName, aiProvider, agyModel, localModelUrl, localModelFilename, typesafeApiKey } = await chrome.storage.local.get(['apiKey', 'modelName', 'cv', 'profile', 'cvPdfName', 'aiProvider', 'agyModel', 'localModelUrl', 'localModelFilename', 'typesafeApiKey']);
    if (aiProvider) {
      aiProviderSelect.value = aiProvider;
      aiProviderSelect.dispatchEvent(new Event('change'));
    }
    if (agyModel) {
      if (![...agyModelSelect.options].some(opt => opt.value === agyModel)) {
        const opt = document.createElement('option');
        opt.value = agyModel;
        opt.textContent = agyModel;
        agyModelSelect.appendChild(opt);
      }
      agyModelSelect.value = agyModel;
    }
    if (localModelUrl) localModelUrlInput.value = localModelUrl;
    if (localModelFilename) localModelFilenameInput.value = localModelFilename;
    if (typesafeApiKey) typesafeApiKeyInput.value = typesafeApiKey;
    if (apiKey) apiKeyInput.value = apiKey;
    if (modelName) modelNameInput.value = modelName;
    if (profile) profileInput.value = profile;
    if (cv) cvInput.value = cv;
    if (cvPdfName) {
      document.getElementById('loaded-pdf-name').textContent = `Loaded: ${cvPdfName}`;
    }
  }
  loadSettings();

  // ── Check Server Status on Load ────────────────────────────────────────────────
  async function checkServerStatus() {
    try {
      const res = await fetch('http://localhost:3000/fill-status');
      const data = await res.json();
      if (data.isFilling) {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('generate-btn').classList.add('hidden');
        document.getElementById('stop-btn').classList.remove('hidden');
        document.getElementById('result-container').classList.add('hidden');
        document.getElementById('error-msg').classList.add('hidden');
        
        if (data.currentStep && data.totalSteps) {
          document.getElementById('loading-text').textContent = `Agent is filling the form... (Step ${data.currentStep} of ${data.totalSteps})`;
        }
        
        pollFillStatus();
      }
    } catch (e) {
      // server not running or not responding, ignore
    }
  }
  
  // To prevent multiple intervals
  let pollInterval = null;

  function pollFillStatus() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3000/fill-status');
        const data = await res.json();
        
        if (data.isFilling) {
          if (data.currentStep && data.totalSteps) {
            document.getElementById('loading-text').textContent = `Agent is filling the form... (Step ${data.currentStep} of ${data.totalSteps})`;
          }
        } else {
          clearInterval(pollInterval);
          pollInterval = null;
          document.getElementById('loading').classList.add('hidden');
          document.getElementById('generate-btn').classList.remove('hidden');
          document.getElementById('stop-btn').classList.add('hidden');
          // Update the text only if we haven't received a response from the main fetch yet
          // But main fetch will overwrite if needed.
        }
      } catch (e) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }, 1500);
  }

  checkServerStatus();

  // Save Settings
  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const aiProvider = aiProviderSelect.value;
    const agyModel = agyModelSelect.value || 'gemini-3.8-flash-medium';
    const localModelUrl = localModelUrlInput.value.trim();
    const localModelFilename = localModelFilenameInput.value.trim();
    const typesafeApiKey = typesafeApiKeyInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const modelName = modelNameInput.value.trim() || 'gemini-3.8-flash';
    const profile = profileInput.value.trim();
    const cv = cvInput.value.trim();

    chrome.storage.local.set({ apiKey, modelName, profile, cv, aiProvider, agyModel, localModelUrl, localModelFilename, typesafeApiKey }, () => {
      const status = document.getElementById('save-status');
      status.classList.remove('hidden');
      setTimeout(() => {
        status.classList.add('hidden');
      }, 2000);
    });
  });

  // ── Antigravity CLI (agy) Refresh Models & Test ──────────────────────────────
  document.getElementById('refresh-agy-models-btn').addEventListener('click', async () => {
    const statusDiv = document.getElementById('test-agy-status');
    statusDiv.textContent = '⏳ Fetching models from agy CLI...';
    statusDiv.style.color = '#d97706';

    try {
      const res = await fetch('http://localhost:3000/agy-models');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch models');

      if (data.models && data.models.length > 0) {
        const previousVal = agyModelSelect.value;
        agyModelSelect.innerHTML = '';
        data.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.label;
          agyModelSelect.appendChild(opt);
        });
        if ([...agyModelSelect.options].some(o => o.value === previousVal)) {
          agyModelSelect.value = previousVal;
        }
        statusDiv.textContent = `✅ Loaded ${data.models.length} models from Agy CLI!`;
        statusDiv.style.color = '#059669';
      } else {
        statusDiv.textContent = '⚠️ No models returned by agy models.';
        statusDiv.style.color = '#d97706';
      }
    } catch (e) {
      statusDiv.textContent = '❌ Failed to fetch models: ' + e.message;
      statusDiv.style.color = '#dc2626';
    }
  });

  document.getElementById('test-agy-btn').addEventListener('click', async () => {
    const agyModel = agyModelSelect.value || 'gemini-3.8-flash-medium';
    const statusDiv = document.getElementById('test-agy-status');
    statusDiv.textContent = `⏳ Testing Agy CLI (${agyModel})...`;
    statusDiv.style.color = '#d97706';

    try {
      const res = await fetch('http://localhost:3000/test-agy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agyModel })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        statusDiv.textContent = '✅ Antigravity CLI is working properly!';
        statusDiv.style.color = '#059669';
      } else {
        throw new Error(data.error || JSON.stringify(data));
      }
    } catch (e) {
      statusDiv.textContent = '❌ Agy CLI test failed: ' + e.message;
      statusDiv.style.color = '#dc2626';
    }
  });

  // ── Local Model Download & Test ──────────────────────────────────────────────
  let downloadInterval;
  document.getElementById('download-model-btn').addEventListener('click', async () => {
    const url = localModelUrlInput.value.trim();
    const filename = localModelFilenameInput.value.trim();
    if (!url || !filename) return alert("Please enter both URL and filename");
    
    document.getElementById('download-progress-container').classList.remove('hidden');
    document.getElementById('download-status-text').textContent = 'Starting download...';
    
    try {
      const res = await fetch('http://localhost:3000/download-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, filename })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      clearInterval(downloadInterval);
      downloadInterval = setInterval(async () => {
        try {
          const sRes = await fetch('http://localhost:3000/download-status');
          const sData = await sRes.json();
          
          if (sData.status === 'downloading' || sData.status === 'done') {
            const pct = (sData.progress || 0).toFixed(1) + '%';
            document.getElementById('download-percentage').textContent = pct;
            document.getElementById('download-progress-bar').style.width = pct;
            
            if (sData.status === 'downloading') {
              const mb = (sData.downloaded / (1024*1024)).toFixed(1);
              const totalMb = sData.total ? (sData.total / (1024*1024)).toFixed(1) : '?';
              document.getElementById('download-status-text').textContent = `Downloading (${mb} MB / ${totalMb} MB)`;
            } else if (sData.status === 'done') {
              document.getElementById('download-status-text').textContent = 'Download Complete!';
              clearInterval(downloadInterval);
            }
          } else if (sData.status === 'error') {
            document.getElementById('download-status-text').textContent = 'Error: ' + sData.error;
            clearInterval(downloadInterval);
          }
        } catch(e) { /* ignore network error while checking status */ }
      }, 1000);
      
    } catch (e) {
      document.getElementById('download-status-text').textContent = "Server Error: " + e.message;
    }
  });

  document.getElementById('test-model-btn').addEventListener('click', async () => {
    const filename = localModelFilenameInput.value.trim();
    if (!filename) return alert("Please specify a model filename");
    
    const statusDiv = document.getElementById('test-model-status');
    statusDiv.textContent = '⏳ Loading model into memory and running test prompt... (this may take 10-30s)';
    statusDiv.style.color = '#d97706';
    
    try {
      const res = await fetch('http://localhost:3000/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localModelPath: '../models/' + filename })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        statusDiv.textContent = '✅ Model is working perfectly!';
        statusDiv.style.color = '#059669';
      } else {
        throw new Error(data.error || JSON.stringify(data));
      }
    } catch (e) {
      statusDiv.textContent = '❌ Test failed: ' + e.message;
      statusDiv.style.color = '#dc2626';
    }
  });

  // Handle PDF Upload
  const cvUpload = document.getElementById('cv-upload');
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';
  }

  // ── Structure raw CV text via Gemini or Agy CLI ──────────────────────────────
  async function structureCvWithLLM(rawText, apiKey, modelName, aiProvider = 'gemini', agyModel = 'gemini-3.8-flash-medium') {
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

    if (aiProvider === 'agy') {
      const res = await fetch('http://localhost:3000/structure-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, agyModel })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `Agy server error ${res.status}`);
      }
      return data.text || rawText;
    }

    const model = modelName || 'gemini-3.8-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
    const { apiKey, modelName, aiProvider, agyModel } = await chrome.storage.local.get(['apiKey', 'modelName', 'aiProvider', 'agyModel']);
    const canStructureWithAI = (aiProvider === 'agy') || Boolean(apiKey);

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
      
      if (canStructureWithAI) {
        const providerLabel = aiProvider === 'agy' ? 'Antigravity CLI' : 'Gemini';
        msgEl.innerHTML = `Do you want to use AI (${providerLabel}) to automatically structure the extracted text from your PDF?<br><br>If you click <b>Cancel</b>, the PDF will be saved for auto-uploading on job sites, but your CV text below will <b>not</b> be changed.`;
      } else {
        msgEl.innerHTML = "Do you want to load the raw text from this PDF into the text box below?<br><br>(<i>Hint: Select Antigravity CLI or add a Gemini API Key in settings to let AI structure it nicely for you!</i>)<br><br>If you click <b>Cancel</b>, the PDF will be saved for auto-uploading on job sites, but your CV text below will <b>not</b> be changed.";
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
      if (canStructureWithAI) {
        cvInput.value = "🤖 Step 2/2: Structuring CV with AI, please wait...";
        saveStatus.textContent = "🤖 Step 2/2: Structuring with AI...";
        saveStatus.classList.remove('hidden');

        try {
          const structured = await structureCvWithLLM(rawText, apiKey, modelName, aiProvider, agyModel);
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

    const { apiKey, modelName, aiProvider, agyModel } = await chrome.storage.local.get(['apiKey', 'modelName', 'aiProvider', 'agyModel']);
    if (aiProvider !== 'agy' && !apiKey) {
      const errEl = document.getElementById('error-msg');
      errEl.textContent = "⚠️ API Key not set — go to Settings tab and enter your Gemini API Key (or switch provider to Antigravity CLI), then Save.";
      errEl.classList.remove('hidden');
      setTimeout(() => errEl.classList.add('hidden'), 8000);
      return;
    }

    document.getElementById('restructure-btn').disabled = true;
    saveStatus.textContent = "🤖 Structuring CV with AI, please wait...";
    saveStatus.classList.remove('hidden');

    try {
      const structured = await structureCvWithLLM(currentText, apiKey, modelName, aiProvider, agyModel);
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
  const banBoardBtn = document.getElementById('ban-board-btn');
  const unbanBoardBtn = document.getElementById('unban-board-btn');
  const badBoardAlert = document.getElementById('bad-board-alert');
  const badBoardDomain = document.getElementById('bad-board-domain');
  const badBoardReason = document.getElementById('bad-board-reason');
  const loadingDiv = document.getElementById('loading');
  const resultContainer = document.getElementById('result-container');
  const resultText = document.getElementById('result-text');
  const errorMsg = document.getElementById('error-msg');

  const JOB_FILTER_API = 'http://localhost:8000';
  const DEFAULT_BAD_DOMAINS = ['cims.com', 'icims.com'];
  const MULTI_TENANT_ATS = [
    'icims.com', 'cims.com', 'myworkdayjobs.com', 'workday.com',
    'taleo.net', 'successfactors.com', 'successfactors.eu',
    'greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters.com',
    'workable.com', 'breezy.hr', 'bamboohr.com', 'jobvite.com',
    'ultipro.com', 'dayforcehcm.com', 'brassring.com', 'oraclecloud.com',
    'pageuppeople.com', 'avature.net', 'recruitee.com', 'teamtailor.com'
  ];

  let isCurrentTabBlacklisted = false;
  let currentMatchedBadDomain = null;

  function extractCleanDomain(urlOrDomain) {
    if (!urlOrDomain) return '';
    try {
      const raw = urlOrDomain.includes('://') ? urlOrDomain : 'https://' + urlOrDomain;
      const u = new URL(raw);
      const host = (u.hostname || '').toLowerCase().replace(/^www\./, '');
      if (!host) return '';
      for (const ats of MULTI_TENANT_ATS) {
        if (host === ats || host.endsWith('.' + ats)) return ats;
      }
      const parts = host.split('.');
      if (parts.length >= 3 && ['co', 'com', 'org', 'net', 'gov'].includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
        return parts.slice(-3).join('.');
      }
      if (parts.length >= 2) {
        return parts.slice(-2).join('.');
      }
      return host;
    } catch (_) {
      return '';
    }
  }

  function applyBlacklistedUiState(domain, reasonText) {
    isCurrentTabBlacklisted = true;
    currentMatchedBadDomain = domain;
    badBoardDomain.textContent = domain;
    badBoardReason.textContent = reasonText || 'Форму невозможно нормально заполнить. Автозаполнение отключено.';
    badBoardAlert.classList.remove('hidden');
    // Скрываем обе нижние кнопки, чтобы не было дублирования
    generateBtn.classList.add('hidden');
    if (banBoardBtn) {
      banBoardBtn.classList.add('hidden');
    }
  }

  function clearBlacklistedUiState(activeDomain) {
    isCurrentTabBlacklisted = false;
    currentMatchedBadDomain = null;
    badBoardAlert.classList.add('hidden');
    generateBtn.classList.remove('hidden');
    generateBtn.disabled = false;
    generateBtn.style.opacity = '1';
    generateBtn.style.cursor = 'pointer';
    generateBtn.textContent = '🚀 Fill Application Form';
    if (banBoardBtn) {
      banBoardBtn.classList.remove('hidden');
      banBoardBtn.disabled = false;
      banBoardBtn.textContent = activeDomain
        ? `⛔ Добавить в черный список (${activeDomain})`
        : '⛔ Добавить в черный список';
    }
  }

  async function ensureContentDetectorInjected(tabId) {
    try {
      if (chrome.scripting && chrome.scripting.registerContentScripts) {
        await chrome.scripting.registerContentScripts([
          {
            id: 'job-filter-bad-board-detector',
            matches: ['<all_urls>'],
            js: ['content-detector.js'],
            runAt: 'document_idle',
            persistAcrossSessions: true
          }
        ]).catch(() => {});
      }
      if (tabId && chrome.scripting && chrome.scripting.executeScript) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-detector.js']
        }).catch(() => {});
      }
    } catch (_) {}
  }

  async function checkActiveTabBlacklist() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.startsWith('http')) return;

      await ensureContentDetectorInjected(tab.id);

      const tabDomain = extractCleanDomain(tab.url);
      if (banBoardBtn && tabDomain && !['localhost', '127.0.0.1'].includes(tabDomain)) {
        banBoardBtn.textContent = `⛔ Добавить в черный список (${tabDomain})`;
      }

      let frameUrls = [];
      try {
        const pageInfo = await chrome.tabs.sendMessage(tab.id, { action: 'getPageUrls' });
        if (pageInfo && Array.isArray(pageInfo.frames)) {
          frameUrls = pageInfo.frames;
        }
      } catch (_) {}

      // 1. Прямой запрос из popup.js к локальному серверу Job Filter (http://localhost:8000)
      try {
        const params = new URLSearchParams({
          url: tab.url,
          frames: frameUrls.join(','),
          auto_link: 'true'
        });
        const res = await fetch(`${JOB_FILTER_API}/api/blacklist/check?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.all_blacklisted_domains)) {
            const cleanList = data.all_blacklisted_domains
              .map(d => extractCleanDomain(d) || d)
              .filter(Boolean);
            await chrome.storage.local.set({ badBoards: Array.from(new Set([...DEFAULT_BAD_DOMAINS, ...cleanList])) });
          }
          if (data.is_blacklisted) {
            const dom = extractCleanDomain(data.matched_domain) || data.matched_domain || tabDomain || 'cims.com';
            const companyInfo = data.linked_job && data.linked_job.company
              ? ` Привязано к компании «${data.linked_job.company}» в Job Filter.`
              : '';
            const fullReason = (data.reason || 'Форму невозможно нормально заполнить.') + companyInfo;
            applyBlacklistedUiState(dom, fullReason);
            try {
              chrome.tabs.sendMessage(tab.id, {
                action: 'showBadBoardBannerNow',
                matchedDomain: dom,
                reason: fullReason,
                linkedJob: data.linked_job
              });
            } catch (_) {}
            return;
          } else {
            return;
          }
        }
      } catch (_) {
        // Fallback на локальное хранилище, если сервер localhost:8000 выключен
      }

      const stored = await chrome.storage.local.get(['badBoards']);
      const cleanBadBoards = Array.from(
        new Set([...DEFAULT_BAD_DOMAINS, ...(stored.badBoards || [])].map(d => extractCleanDomain(d)).filter(Boolean))
      );
      const allUrls = [tab.url, ...frameUrls];
      for (const u of allUrls) {
        const d = extractCleanDomain(u);
        if (d && cleanBadBoards.includes(d)) {
          applyBlacklistedUiState(d, 'В чёрном списке (автозаполнение отключено).');
          try {
            chrome.tabs.sendMessage(tab.id, {
              action: 'showBadBoardBannerNow',
              matchedDomain: d,
              reason: 'Этот домен в твоём чёрном списке джоб-бордов (автозаполнение отключено).'
            });
          } catch (_) {}
          return;
        }
      }
    } catch (_) {}
  }

  checkActiveTabBlacklist();

  if (banBoardBtn) {
    banBoardBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.startsWith('http')) {
          errorMsg.textContent = 'Открой вкладку с джоб-бордом, чтобы добавить его в чёрный список.';
          errorMsg.classList.remove('hidden');
          return;
        }

        await ensureContentDetectorInjected(tab.id);

        // Если на странице есть внешний iframe (например, icims.com внутри сайта компании), берем его URL
        let targetUrl = tab.url;
        try {
          const pageInfo = await chrome.tabs.sendMessage(tab.id, { action: 'getPageUrls' });
          if (pageInfo && Array.isArray(pageInfo.frames) && pageInfo.frames.length > 0) {
            const atsFrame = pageInfo.frames.find(f => /icims\.com|cims\.com|workday|taleo|successfactors|greenhouse|lever|ashby/i.test(f));
            if (atsFrame) targetUrl = atsFrame;
          }
        } catch (_) {}

        const cleanDom = extractCleanDomain(targetUrl);
        if (!cleanDom || ['localhost', '127.0.0.1'].includes(cleanDom)) {
          errorMsg.textContent = 'Нельзя добавить локальный адрес в чёрный список.';
          errorMsg.classList.remove('hidden');
          return;
        }

        banBoardBtn.disabled = true;
        banBoardBtn.textContent = `⏳ Заносим ${cleanDom} в ЧС...`;

        // 1. Сохраняем чистый домен в chrome.storage.local
        const stored = await chrome.storage.local.get(['badBoards']);
        const prevClean = (stored.badBoards || []).map(d => extractCleanDomain(d)).filter(Boolean);
        const updatedLocal = Array.from(new Set([...DEFAULT_BAD_DOMAINS, ...prevClean, cleanDom]));
        await chrome.storage.local.set({ badBoards: updatedLocal });

        // 2. Напрямую отправляем POST в локальный сервер Job Filter (http://localhost:8000/api/blacklist)
        let serverSaved = false;
        let linkedCompany = '';
        let finalDomain = cleanDom;
        try {
          const res = await fetch(`${JOB_FILTER_API}/api/blacklist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              domain_or_url: cleanDom,
              reason: 'Помечено из расширения job-auto-applier (в чёрном списке)',
              hide_job: true,
              use_last_opened: true
            })
          });
          if (res.ok) {
            const data = await res.json();
            serverSaved = true;
            if (data.added && data.added.domain) {
              finalDomain = extractCleanDomain(data.added.domain) || data.added.domain;
            }
            if (data.added && data.added.company) {
              linkedCompany = data.added.company;
            }
          }
        } catch (_) {
          serverSaved = false;
        }

        banBoardBtn.disabled = false;
        const statusNote = serverSaved
          ? `Сайт "${finalDomain}"${linkedCompany ? ` и компания «${linkedCompany}»` : ''} добавлены в ЧС базы Job Filter!`
          : `Домен "${finalDomain}" сохранён в расширении.`;

        applyBlacklistedUiState(finalDomain, statusNote);

        try {
          chrome.tabs.sendMessage(tab.id, {
            action: 'showBadBoardBannerNow',
            matchedDomain: finalDomain,
            reason: statusNote
          });
        } catch (_) {}
      } catch (e) {
        banBoardBtn.disabled = false;
        errorMsg.textContent = 'Ошибка добавления в ЧС: ' + e.message;
        errorMsg.classList.remove('hidden');
      }
    });
  }

  if (unbanBoardBtn) {
    unbanBoardBtn.addEventListener('click', async () => {
      const domToRemove = currentMatchedBadDomain || badBoardDomain.textContent.trim();
      if (!domToRemove) return;

      try {
        const stored = await chrome.storage.local.get(['badBoards']);
        const filtered = (stored.badBoards || [])
          .map(d => extractCleanDomain(d))
          .filter(d => d && d !== domToRemove);
        await chrome.storage.local.set({ badBoards: filtered });

        try {
          await fetch(`${JOB_FILTER_API}/api/blacklist/domain/${encodeURIComponent(domToRemove)}`, {
            method: 'DELETE'
          });
        } catch (_) {}

        clearBlacklistedUiState(domToRemove);

        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'hideBadBoardBannerNow' });
          }
        } catch (_) {}
      } catch (e) {
        errorMsg.textContent = 'Ошибка разблокировки: ' + e.message;
        errorMsg.classList.remove('hidden');
      }
    });
  }

  generateBtn.addEventListener('click', async () => {
    if (isCurrentTabBlacklisted) {
      errorMsg.textContent = "⛔ Этот джоб-борд в чёрном списке — заполнение заблокировано!";
      errorMsg.classList.remove('hidden');
      return;
    }
    // Hide previous results/errors
    resultContainer.classList.add('hidden');
    errorMsg.classList.add('hidden');
    
    // Check if API key and CV exist
    const { apiKey, modelName, cv, profile, cvPdfBase64, cvPdfName, aiProvider, agyModel, localModelFilename, typesafeApiKey } = await chrome.storage.local.get(['apiKey', 'modelName', 'cv', 'profile', 'cvPdfBase64', 'cvPdfName', 'aiProvider', 'agyModel', 'localModelFilename', 'typesafeApiKey']);
    if (!cv) {
      errorMsg.textContent = "Please paste your CV text in the Settings tab.";
      errorMsg.classList.remove('hidden');
      return;
    }
    if (aiProvider !== 'local' && aiProvider !== 'agy' && !apiKey) {
      errorMsg.textContent = "Please set your Gemini API Key in the Settings tab (or select Antigravity CLI / Local Model).";
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
    document.getElementById('loading-text').textContent = "Agent is filling the form... (Starting)";
    generateBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    pollFillStatus();

    try {
      const response = await fetch('http://localhost:3000/fill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cvText: cv,
          apiKey,
          typesafeApiKey,
          modelName: currentModel,
          profileText: profile,
          tabUrl: tabUrl,
          cvPdfBase64: cvPdfBase64 || null,
          cvPdfName: cvPdfName || 'resume.pdf',
          provider: aiProvider || 'gemini',
          agyModel: agyModel || 'gemini-3.8-flash-medium',
          localModelPath: localModelFilename ? '../models/' + localModelFilename : null
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
    const data = await chrome.storage.local.get(['aiProvider', 'agyModel', 'modelName', 'profile', 'cv', 'cvPdfBase64', 'cvPdfName']);
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
    
    if (document.getElementById('import-cb-model').checked) {
      if (pendingImportData.modelName !== undefined) {
        toSave.modelName = pendingImportData.modelName;
        modelNameInput.value = toSave.modelName;
      }
      if (pendingImportData.aiProvider !== undefined) {
        toSave.aiProvider = pendingImportData.aiProvider;
        aiProviderSelect.value = toSave.aiProvider;
        aiProviderSelect.dispatchEvent(new Event('change'));
      }
      if (pendingImportData.agyModel !== undefined) {
        toSave.agyModel = pendingImportData.agyModel;
        if (![...agyModelSelect.options].some(opt => opt.value === toSave.agyModel)) {
          const opt = document.createElement('option');
          opt.value = toSave.agyModel;
          opt.textContent = toSave.agyModel;
          agyModelSelect.appendChild(opt);
        }
        agyModelSelect.value = toSave.agyModel;
      }
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

