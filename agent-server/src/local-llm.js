const fs = require('fs');
const path = require('path');
const https = require('https');

let _llama = null;
let _currentModel = null;
let _currentModelPath = null;
let _nodeLlamaCppMod = null;

async function getLlamaInstance() {
    if (!_nodeLlamaCppMod) {
        _nodeLlamaCppMod = await import('node-llama-cpp');
    }
    if (!_llama) {
        _llama = await _nodeLlamaCppMod.getLlama();
    }
    return _llama;
}

/**
 * Send a prompt to the local LLM and return the parsed JSON response.
 */
async function askLocalLLM(prompt, modelPath) {
    if (!fs.existsSync(modelPath)) {
        throw new Error(`Local model not found at ${modelPath}. Please download it first.`);
    }

    const llama = await getLlamaInstance();
    
    // Load model if not loaded or if path changed
    if (!_currentModel || _currentModelPath !== modelPath) {
        if (_currentModel) {
            // Unload previous model (best effort)
            _currentModel = null;
        }
        _currentModel = await llama.loadModel({ modelPath });
        _currentModelPath = modelPath;
    }

    const context = await _currentModel.createContext();
    const session = new _nodeLlamaCppMod.LlamaChatSession({ contextSequence: context.getSequence() });
    
    // Ensure the model knows we want JSON strictly
    const systemPrompt = "You are an autonomous web agent. You must respond ONLY with valid JSON. Do not include markdown formatting like ```json.";
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;

    console.log(`[Local LLM] Generating response...`);
    const responseText = await session.prompt(fullPrompt, {
        temperature: 0.1
    });

    try {
        // Strip out potential markdown wraps
        const cleanText = responseText.replace(/```json/gi, '').replace(/```/gi, '').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("[Local LLM] Failed to parse JSON:", responseText);
        throw new Error(`Local LLM output invalid JSON: ${e.message}`);
    }
}

/**
 * Download a GGUF model from a URL with resume support.
 */
function downloadModel(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        let downloadedBytes = 0;
        let totalBytes = 0;

        const options = {};
        if (fs.existsSync(destPath)) {
            downloadedBytes = fs.statSync(destPath).size;
            options.headers = { 'Range': `bytes=${downloadedBytes}-` };
            console.log(`[Download] Resuming from ${downloadedBytes} bytes...`);
        }

        const req = https.get(url, options, (res) => {
            if (res.statusCode === 206 || res.statusCode === 200) {
                const total = parseInt(res.headers['content-length'], 10);
                totalBytes = downloadedBytes + total;

                const fileStream = fs.createWriteStream(destPath, { flags: res.statusCode === 206 ? 'a' : 'w' });
                
                res.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    fileStream.write(chunk);
                    const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
                    if (onProgress) onProgress(progress, downloadedBytes, totalBytes);
                });

                res.on('end', () => {
                    fileStream.end();
                    resolve(destPath);
                });

                res.on('error', (err) => {
                    fileStream.end();
                    reject(err);
                });
            } else if (res.statusCode === 416) {
                // Requested range not satisfiable, means file is already fully downloaded
                console.log("[Download] File already fully downloaded.");
                resolve(destPath);
            } else if (res.statusCode === 302 || res.statusCode === 301) {
                // Handle redirect
                let redirectUrl = res.headers.location;
                // HuggingFace sometimes injects OSC 8 terminal hyperlinks into the location header!
                // We must strip them out to get the raw URL.
                const match = redirectUrl.match(/https?:\/\/[^\s\x1b\u001b\u009b]+/);
                if (match) {
                    redirectUrl = match[0];
                }
                console.log(`[Download] Redirecting to ${redirectUrl}`);
                downloadModel(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
            } else {
                reject(new Error(`Failed to download model, status code: ${res.statusCode}`));
            }
        });

        req.on('error', reject);
    });
}

module.exports = { askLocalLLM, downloadModel };
