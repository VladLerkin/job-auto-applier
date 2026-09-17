#!/bin/bash
# Подгружаем профили, чтобы терминал "увидел" команду npm, если вы используете nvm или brew
[ -f ~/.bash_profile ] && source ~/.bash_profile
[ -f ~/.zshrc ] && source ~/.zshrc
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin

echo "🚀 Starting AI Agent Server..."

if ! command -v npm &> /dev/null; then
  echo ""
  echo "===================================================================="
  echo "❌ ERROR: Node.js is not installed or not in your system PATH!"
  echo ""
  echo "Please follow these steps to install Node.js on your Mac:"
  echo "Option 1 (Recommended if you have Homebrew):"
  echo "  Run this command in your terminal: brew install node"
  echo ""
  echo "Option 2 (Official Installer):"
  echo "  1. Go to https://nodejs.org/"
  echo "  2. Download and install the \"LTS\" version for macOS."
  echo ""
  echo "After installation, restart this terminal window and try again."
  echo "===================================================================="
  echo ""
  echo "Press ENTER to close this window."
  read
  exit 1
fi

cd "$(dirname "$0")/agent-server" || exit

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies for the first time... This might take a minute."
  npm install
  npx -y playwright install chromium
fi

npm start || { echo "❌ Server crashed. Press ENTER to close this window."; read; exit 1; }

echo ""
echo "===================================================================="
echo "🛑 Agent Server has gracefully shut down."
echo "You can safely close this terminal window (Cmd + W)."
echo "To start the agent again, just double-click 'Start Agent.command'."
echo "===================================================================="
echo ""
read -p "Press ENTER to exit..."
