const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { logToFile } = require('./logger');

const DEFAULT_AGY_MODEL = 'gemini-3.8-flash-medium';

/**
 * Resolve the `agy` executable path and an enhanced PATH environment variable.
 */
function resolveAgyEnv() {
    const home = os.homedir();
    const extraDirs = [
        path.join(home, '.local', 'bin'),
        path.join(home, '.gemini', 'antigravity', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin'
    ];

    const currentPath = process.env.PATH || '';
    const pathSep = process.platform === 'win32' ? ';' : ':';
    const enhancedPath = [...extraDirs, currentPath].filter(Boolean).join(pathSep);

    let agyBin = process.env.AGY_PATH || 'agy';
    if (agyBin === 'agy') {
        for (const dir of extraDirs) {
            const candidate = path.join(dir, process.platform === 'win32' ? 'agy.exe' : 'agy');
            if (fs.existsSync(candidate)) {
                agyBin = candidate;
                break;
            }
        }
    }

    return {
        agyBin,
        env: {
            ...process.env,
            PATH: enhancedPath
        }
    };
}

/**
 * Run `agy` CLI in non-interactive print mode (`-p`) and return stdout text.
 */
function runAgyPrompt(prompt, modelName, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
        const { agyBin, env } = resolveAgyEnv();
        const model = modelName || DEFAULT_AGY_MODEL;

        const args = ['--disable-slash-commands'];
        if (model) {
            args.push('--model', model);
        }
        args.push('-p', prompt);

        logToFile(`🚀 Calling Antigravity CLI (agy) with model: ${model}`);
        console.log(`[Agy CLI] Running with model "${model}"...`);

        const child = spawn(agyBin, args, {
            cwd: os.tmpdir(),
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                child.kill('SIGTERM');
                reject(new Error(`Agy CLI timed out after ${Math.round(timeoutMs / 1000)}s`));
            }
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        child.on('error', (err) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            reject(new Error(`Failed to start Agy CLI (${agyBin}): ${err.message}. Make sure Antigravity CLI ('agy') is installed.`));
        });

        child.on('close', (code) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);

            if (code !== 0) {
                const errText = (stderr || stdout || `Exited with code ${code}`).trim();
                reject(new Error(`Agy CLI exited with code ${code}: ${errText}`));
                return;
            }

            resolve(stdout.trim());
        });
    });
}

/**
 * Extract and parse JSON from an LLM text response.
 */
function parseJsonResponse(responseText) {
    const cleanText = responseText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

    try {
        return JSON.parse(cleanText);
    } catch (firstErr) {
        // Fallback: extract the first {...} JSON object from the output
        const match = cleanText.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (secondErr) {
                // fall through
            }
        }
        console.error('[Agy CLI] Failed to parse JSON:', responseText);
        throw new Error(`Agy CLI returned invalid JSON: ${firstErr.message}`);
    }
}

/**
 * Send a prompt to Antigravity CLI (`agy`) and return the parsed JSON response.
 */
async function askAgy(prompt, modelName) {
    const fullPrompt = `IMPORTANT: Do NOT use any tools, bash commands, or file operations. Respond directly with text only.
You are an autonomous web agent. You must respond ONLY with valid JSON. Do not include markdown code fences like \`\`\`json or any extra commentary.

${prompt}`;

    const responseText = await runAgyPrompt(fullPrompt, modelName);
    return parseJsonResponse(responseText);
}

/**
 * Generate plain text via Antigravity CLI (`agy`).
 */
async function askAgyText(prompt, modelName) {
    const fullPrompt = `IMPORTANT: Do NOT use any tools, bash commands, or file operations. Output ONLY the requested text directly without any preamble or commentary.

${prompt}`;

    return await runAgyPrompt(fullPrompt, modelName);
}

/**
 * Generate plain-text cover letter via Antigravity CLI (`agy`).
 */
async function generateCoverLetterWithAgy(cvText, jobDescription, profileText, modelName, maxLength) {
    const prompt = `You are a professional career coach. Write a compelling, tailored cover letter for the job below.

Job Description:
${jobDescription || 'Not provided'}

Candidate CV:
${cvText}

Candidate Preferences / Notes:
${profileText || 'None'}

Instructions:
${maxLength ? `- 1-2 paragraphs max, professional tone\n- VERY IMPORTANT: The output MUST be strictly under ${maxLength} characters in length.` : '- 3-4 paragraphs, professional tone'}
- Address the specific role and company if identifiable
- Highlight the most relevant experience and skills
- End with a strong closing statement
- Do NOT include placeholders like [Your Name] — use the actual name from the CV
- Output ONLY the cover letter text, no subject line, no extra commentary`;

    return await askAgyText(prompt, modelName);
}

/**
 * Fetch available models from `agy models`.
 */
function listAgyModels(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const { agyBin, env } = resolveAgyEnv();
        const child = spawn(agyBin, ['models'], {
            cwd: os.tmpdir(),
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                child.kill('SIGTERM');
                reject(new Error('Timed out fetching models from agy'));
            }
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        child.on('error', (err) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            reject(new Error(`Failed to run agy models: ${err.message}`));
        });

        child.on('close', (code) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);

            if (code !== 0) {
                reject(new Error((stderr || stdout || `agy models exited with code ${code}`).trim()));
                return;
            }

            // Strip ANSI escape codes and carriage-return spinner lines
            const clean = stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
            const lines = clean
                .split(/\r?\n/)
                .map(line => {
                    // If line has carriage returns from spinner, take the last segment
                    const parts = line.split('\r');
                    return parts[parts.length - 1].trim();
                })
                .filter(line => line && !line.includes('Fetching available models'));

            const models = [];
            for (const line of lines) {
                const match = line.match(/^(\S+)\s+(.+)$/);
                if (match) {
                    models.push({ id: match[1], label: `${match[2].trim()} (${match[1]})` });
                }
            }

            resolve(models);
        });
    });
}

module.exports = {
    DEFAULT_AGY_MODEL,
    askAgy,
    askAgyText,
    generateCoverLetterWithAgy,
    listAgyModels
};

