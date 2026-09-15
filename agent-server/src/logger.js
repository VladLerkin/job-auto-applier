const fs = require('fs');
const path = require('path');

function logToFile(msg) {
    fs.appendFileSync(path.join(__dirname, '..', 'agent.log'), new Date().toISOString() + ' ' + msg + '\n');
    console.log(msg);
}

module.exports = { logToFile };
