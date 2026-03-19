#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# The Omniscient — Raspberry Pi Setup Script
# ──────────────────────────────────────────────────────────
# Run this on a fresh Raspberry Pi OS 64-bit install.
# Usage: chmod +x scripts/pi-setup.sh && ./scripts/pi-setup.sh
set -euo pipefail

echo "╔══════════════════════════════════════════╗"
echo "║   The Omniscient — Pi Setup              ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. System update ─────────────────────────────────────
echo ""
echo "▸ Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ── 2. Install Node.js 20 ───────────────────────────────
echo ""
echo "▸ Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
echo "  Node: $(node -v)  npm: $(npm -v)"

# ── 3. Install Chromium and Playwright dependencies ─────
echo ""
echo "▸ Installing Chromium browser and dependencies..."
sudo apt install -y \
  chromium-browser \
  fonts-liberation \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2

# ── 4. Install build tools for better-sqlite3 ───────────
echo ""
echo "▸ Installing build tools..."
sudo apt install -y build-essential python3

# ── 5. Install npm dependencies ─────────────────────────
echo ""
echo "▸ Installing npm packages..."
npm install
npm install better-sqlite3

# ── 6. Install Playwright Chromium ───────────────────────
echo ""
echo "▸ Installing Playwright Chromium..."
npx playwright install chromium

# ── 7. Set up environment ───────────────────────────────
if [ ! -f .env ]; then
  echo ""
  echo "▸ Creating .env from Pi template..."
  cp .env.pi.example .env
  # Generate a random auth secret
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/replace-with-at-least-64-random-characters/$SECRET/" .env
  echo "  ⚠ IMPORTANT: Edit .env to add your GEMINI_API_KEY and email addresses"
fi

# ── 8. Initialize database ──────────────────────────────
echo ""
echo "▸ Initializing SQLite database..."
mkdir -p data
node -e "
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const dbPath = './data/omniscient.db';
  if (fs.existsSync(dbPath)) {
    console.log('  Database already exists, skipping init.');
    process.exit(0);
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const sql = fs.readFileSync('./migrations/0001_cloudflare_auth_security.sql', 'utf8');
  db.exec(sql);
  db.close();
  console.log('  Database initialized at ' + dbPath);
"

# ── 9. Build Next.js ────────────────────────────────────
echo ""
echo "▸ Building production bundle..."
npm run build

# ── 10. Install cloudflared ─────────────────────────────
echo ""
echo "▸ Installing Cloudflare Tunnel (cloudflared)..."
if ! command -v cloudflared &>/dev/null; then
  ARCH=$(dpkg --print-architecture)
  curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}" \
    -o /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
  sudo chmod +x /usr/local/bin/cloudflared
fi
echo "  cloudflared: $(cloudflared --version 2>&1 | head -1)"

# ── 11. Create systemd services ─────────────────────────
echo ""
echo "▸ Creating systemd services..."

PI_USER=$(whoami)
APP_DIR=$(pwd)

sudo tee /etc/systemd/system/omniscient.service > /dev/null <<EOF
[Unit]
Description=The Omniscient Lead Engine
After=network.target

[Service]
Type=simple
User=${PI_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node node_modules/.bin/next start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/cloudflared.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${PI_USER}
ExecStart=/usr/local/bin/cloudflared tunnel run omniscient
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Setup Complete!                        ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  Next steps:                             ║"
echo "║                                          ║"
echo "║  1. Edit .env with your secrets:         ║"
echo "║     nano .env                            ║"
echo "║                                          ║"
echo "║  2. Test locally:                        ║"
echo "║     npm start                            ║"
echo "║     → http://localhost:3000              ║"
echo "║                                          ║"
echo "║  3. Set up Cloudflare Tunnel:            ║"
echo "║     cloudflared tunnel login             ║"
echo "║     cloudflared tunnel create omniscient ║"
echo "║     → Edit ~/.cloudflared/config.yml     ║"
echo "║     cloudflared tunnel route dns \\       ║"
echo "║       omniscient ops.getaxiom.ca         ║"
echo "║                                          ║"
echo "║  4. Start services:                      ║"
echo "║     sudo systemctl enable omniscient     ║"
echo "║     sudo systemctl enable cloudflared    ║"
echo "║     sudo systemctl start omniscient      ║"
echo "║     sudo systemctl start cloudflared     ║"
echo "║                                          ║"
echo "╚══════════════════════════════════════════╝"
