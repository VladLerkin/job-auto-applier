#!/bin/bash
# Подгружаем профили, чтобы терминал "увидел" команду npm, если вы используете nvm или brew
[ -f ~/.bash_profile ] && source ~/.bash_profile
[ -f ~/.zshrc ] && source ~/.zshrc
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin

echo "🚀 Starting AI Agent Server..."
cd "$(dirname "$0")/agent-server" || exit

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies for the first time... This might take a minute."
  npm install
  npx -y playwright install chromium
fi

npm start || { echo "❌ Server crashed. Press ENTER to close this window."; read; }
