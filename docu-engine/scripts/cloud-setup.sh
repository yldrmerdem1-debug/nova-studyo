#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 render machine (Google Cloud c2d/n2 highcpu):
# Node 22, ffmpeg, the libraries headless Chrome needs, then the engine's npm packages.
# Run on the VM from the folder holding docu-engine.tgz:  bash cloud-setup.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl ffmpeg fonts-liberation \
  libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi
mkdir -p ~/nova && tar -xzf docu-engine.tgz -C ~/nova
cd ~/nova/docu-engine
npm ci --no-audit --no-fund --loglevel=error
# Remotion's headless Chrome, fetched once here instead of inside the first render.
node -e "import('@remotion/renderer').then(r => r.ensureBrowser()).then(() => console.log('chrome hazır'))"
echo "kurulum tamam: $(node -v), $(ffmpeg -version | head -1 | cut -c1-40), $(nproc) çekirdek"
