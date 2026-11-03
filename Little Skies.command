#!/bin/zsh
# Double-click in Finder to launch little skies in your browser.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npm run dev
