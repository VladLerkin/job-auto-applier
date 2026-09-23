const { downloadModel } = require('./agent-server/src/local-llm');
const path = require('path');

const url = 'https://huggingface.co/unsloth/gemma-4-E4B-it-qat-GGUF/resolve/main/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf';
const dest = path.join(__dirname, 'test.gguf');

console.log('Downloading...');
downloadModel(url, dest, (progress) => console.log(progress.toFixed(2) + '%'))
    .then(() => console.log('Done'))
    .catch(console.error);
