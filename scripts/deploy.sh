#!/usr/bin/env bash
# Build and ship to personal-server; PM2 process "kessler" on :3006 behind Apache's /kessler ProxyPass.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rsync -az --delete dist/ personal-server:~/kessler/dist/
rsync -az package.json package-lock.json personal-server:~/kessler/
ssh personal-server 'cd ~/kessler && npm install --omit=dev --no-audit --no-fund >/dev/null && (pm2 describe kessler >/dev/null 2>&1 && pm2 restart kessler --update-env || PORT=3006 pm2 start dist/server.mjs --name kessler) && pm2 save >/dev/null'
echo "deployed: https://wreckingwheels.com/kessler/"
