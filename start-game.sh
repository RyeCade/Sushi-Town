#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

URL="http://localhost:3000"

# Finder/double-click shells don't load nvm — set it up here.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
fi

# Fallbacks if nvm isn't available.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found."
  echo "Open Terminal and run: nvm use && which npm"
  echo "Then try this launcher again."
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if curl -sf "$URL" >/dev/null 2>&1; then
  open "$URL"
  echo "Sushi Town is already running at $URL"
  read -r -p "Press Enter to close..."
  exit 0
fi

(
  for _ in $(seq 1 60); do
    if curl -sf "$URL" >/dev/null 2>&1; then
      open "$URL"
      exit 0
    fi
    sleep 0.25
  done
  echo "Server did not become ready at $URL"
) &

echo "Starting Sushi Town at $URL"
echo "Using npm: $(command -v npm)"
npm run dev
