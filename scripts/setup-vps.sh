#!/bin/bash
# scripts/setup-vps.sh
# Script setup otomatis untuk VPS (jalankan setelah SSH ke VPS)
# Usage: bash scripts/setup-vps.sh

set -e  # Exit jika ada error

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    CRYPTO SIGNAL BOT - VPS SETUP     ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ---- CEK OS ----
if [ ! -f /etc/debian_version ] && [ ! -f /etc/ubuntu_version ] && ! grep -qi "ubuntu\|debian" /etc/os-release 2>/dev/null; then
    echo "⚠️  Script ini dioptimalkan untuk Ubuntu/Debian"
    echo "   Lanjutkan dengan risiko sendiri..."
fi

# ---- UPDATE SISTEM ----
echo "📦 [1/6] Update sistem..."
sudo apt-get update -y
sudo apt-get upgrade -y
echo "✅ Sistem terupdate"

# ---- INSTALL NODE.JS LTS ----
echo ""
echo "📦 [2/6] Install Node.js LTS..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "   Node.js sudah terinstall: $NODE_VERSION"
    # Cek minimal Node 18
    NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -lt "18" ]; then
        echo "   ⚠️  Node.js terlalu lama, upgrade ke LTS..."
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "✅ Node.js: $(node -v)"
echo "✅ npm: $(npm -v)"

# ---- INSTALL GIT ----
echo ""
echo "📦 [3/6] Install Git..."
if ! command -v git &> /dev/null; then
    sudo apt-get install -y git
fi
echo "✅ Git: $(git --version)"

# ---- INSTALL PM2 ----
echo ""
echo "📦 [4/6] Install PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
echo "✅ PM2: $(pm2 -v)"

# ---- BUAT FOLDER LOGS & DATA ----
echo ""
echo "📁 [5/6] Setup folder..."
mkdir -p logs data
echo "✅ Folder logs/ dan data/ dibuat"

# ---- INSTALL DEPENDENCIES ----
echo ""
echo "📦 [6/6] Install npm dependencies..."
npm install --production
echo "✅ Dependencies terinstall"

# ---- SELESAI ----
echo ""
echo "✅ ==========================================="
echo "✅  SETUP SELESAI!"
echo "✅ ==========================================="
echo ""
echo "📋 LANGKAH SELANJUTNYA:"
echo ""
echo "1. Salin file .env:"
echo "   cp .env.example .env"
echo ""
echo "2. Edit file .env:"
echo "   nano .env"
echo ""
echo "   Isi:"
echo "   - TELEGRAM_BOT_TOKEN=xxx"
echo "   - TWELVE_DATA_API_KEY=xxx"
echo "   - OPENROUTER_API_KEY=xxx"
echo ""
echo "3. Jalankan bot:"
echo "   npm start"
echo ""
echo "4. Atau jalankan dengan PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "5. Kirim /start ke bot Telegram kamu!"
echo ""
