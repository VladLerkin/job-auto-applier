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
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  }
  
  cvUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;
    
    cvInput.value = "Extracting text from PDF, please wait...";
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        // Extract text
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
        
        // Extract embedded hyperlinks
        const annotations = await page.getAnnotations();
        const links = annotations
          .filter(a => a.subtype === 'Link' && a.url)
          .map(a => a.url);
          
        if (links.length > 0) {
          fullText += '\n[Embedded Links:]\n' + links.join('\n') + '\n';
        }
        
        fullText += '\n';
      }
      
      // Clean up weird characters (e.g. bullet points parsed as icons)
      fullText = fullText.replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\r]/gu, ' ');
      
      cvInput.value = fullText.trim();
      
      // Auto-save after extracting
      chrome.storage.local.set({ cv: cvInput.value }, () => {
        const status = document.getElementById('save-status');
        status.textContent = "PDF extracted and saved automatically!";
        status.classList.remove('hidden');
        setTimeout(() => {
          status.classList.add('hidden');
          status.textContent = "Saved successfully!"; // reset text
        }, 3000);
      });
    } catch (err) {
      cvInput.value = "Error extracting text: " + err.message;
    }
  });

  // Generate logic
  const generateBtn = document.getElementById('generate-btn');
  const loadingDiv = document.getElementById('loading');
  const resultContainer = document.getElementById('result-container');
  const resultText = document.getElementById('result-text');
  const errorMsg = document.getElementById('error-msg');

  generateBtn.addEventListener('click', async () => {
    // Hide previous results/errors
    resultContainer.classList.add('hidden');
    errorMsg.classList.add('hidden');
    
    // Check if API key and CV exist
    const { apiKey, modelName, cv, profile } = await chrome.storage.local.get(['apiKey', 'modelName', 'cv', 'profile']);
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
    generateBtn.disabled = true;

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
          tabUrl: tabUrl
        })
      });

      const data = await response.json();
      
      loadingDiv.classList.add('hidden');
      generateBtn.disabled = false;

      if (response.ok && data.success) {
        resultText.textContent = "✅ Form filled successfully! Check the browser tab.";
        resultContainer.classList.remove('hidden');
      } else {
        errorMsg.textContent = "Agent Error: " + (data.error || "Unknown error");
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      loadingDiv.classList.add('hidden');
      generateBtn.disabled = false;
      errorMsg.textContent = "Failed to reach Agent Server. Is it running on http://localhost:3000? Error: " + err.message;
      errorMsg.classList.remove('hidden');
    }
  });
});

