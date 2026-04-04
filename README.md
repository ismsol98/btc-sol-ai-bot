# 🤖 Crypto Signal Bot

Signal trading otomatis untuk **BTC/USD** dan **SOL/USD** menggunakan strategi **5-Minute EMA Pullback Scalping**.

---

## 📋 Daftar Isi

1. [Arsitektur Sistem](#arsitektur-sistem)
2. [Struktur Folder](#struktur-folder)
3. [Prasyarat](#prasyarat)
4. [Setup dari Nol (MacBook → VPS)](#setup-dari-nol)
5. [Konfigurasi .env](#konfigurasi-env)
6. [Menjalankan dengan PM2](#menjalankan-dengan-pm2)
7. [Command Telegram](#command-telegram)
8. [Testing](#testing)
9. [Monitoring & Debug](#monitoring--debug)
10. [Strategi Trading](#strategi-trading)

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────┐
│                   index.js                       │
│              (Entry Point + Cron)                │
└────────┬────────────┬──────────────┬────────────┘
         │            │              │
         ▼            ▼              ▼
  ┌─────────┐  ┌──────────┐  ┌──────────────┐
  │Telegram │  │ Signal   │  │  Learning    │
  │  Bot    │  │ Engine   │  │   System     │
  └────┬────┘  └────┬─────┘  └──────┬───────┘
       │             │               │
       ▼             ▼               │
  ┌─────────┐  ┌──────────┐         │
  │OpenRouter│  │TwelveData│         │
  │ AI Chat  │  │   API    │         │
  └─────────┘  └────┬─────┘         │
                    │               │
                    ▼               │
              ┌──────────┐          │
              │  Strategy │──────────┘
              │  (EMA +  │
              │ RSI + Vol)│
              └──────────┘
```

**Alur Kerja:**
1. Signal Engine scan setiap 1 menit
2. Ambil data OHLCV + EMA + RSI dari Twelve Data API
3. Strategy menganalisa kondisi (bias 15m + entry 5m)
4. Jika ada signal → simpan ke Learning System → kirim ke Telegram
5. Learning System evaluasi setiap 24 jam dan adjust parameter

---

## 📁 Struktur Folder

```
crypto-signal-bot/
├── index.js                    ← Entry point utama
├── config.js                   ← Konfigurasi terpusat
├── package.json
├── ecosystem.config.js         ← Konfigurasi PM2
├── .env.example                ← Template env variables
├── .env                        ← ENV kamu (jangan di-commit!)
├── src/
│   ├── bot/
│   │   └── telegram.js         ← Telegram bot + command handler
│   ├── data/
│   │   └── twelvedata.js       ← Twelve Data API client
│   ├── strategy/
│   │   └── emaScalping.js      ← Logic strategi EMA Pullback
│   ├── engine/
│   │   └── signalEngine.js     ← Mesin scan signal utama
│   ├── ai/
│   │   └── openrouter.js       ← OpenRouter AI chat
│   ├── learning/
│   │   └── learningSystem.js   ← Self-learning & evaluasi
│   └── utils/
│       └── logger.js           ← Sistem logging
├── data/
│   ├── trades.json             ← History semua trade/signal
│   ├── params.json             ← Parameter yang sudah di-adjust
│   └── chatids.json            ← Daftar Telegram chat ID
├── logs/
│   ├── combined.log            ← Log semua aktivitas
│   ├── error.log               ← Log error saja
│   ├── pm2-out.log             ← PM2 stdout
│   └── pm2-error.log           ← PM2 stderr
└── scripts/
    ├── setup-vps.sh            ← Script setup otomatis VPS
    └── test.js                 ← Script testing komponen
```

---

## 📦 Prasyarat

- Node.js >= 18 (di VPS)
- Akun [Twelve Data](https://twelvedata.com) (ada free tier)
- Akun [OpenRouter](https://openrouter.ai) (ada free tier)
- Bot Telegram dari [@BotFather](https://t.me/BotFather)
- VPS dengan OS Ubuntu/Debian (Sumopod)

---

## 🚀 Setup dari Nol

### LANGKAH 1: Buat Bot Telegram

1. Buka Telegram, cari **@BotFather**
2. Kirim `/newbot`
3. Ikuti instruksi, masukkan nama dan username bot
4. **Simpan token** yang diberikan BotFather
   Format: `123456789:AABBCCDDEEFFaabbccddeeff1234567890`

### LANGKAH 2: Dapatkan API Keys

**Twelve Data:**
1. Buka https://twelvedata.com
2. Daftar akun gratis
3. Pergi ke Dashboard → API Keys
4. Salin API key kamu

**OpenRouter:**
1. Buka https://openrouter.ai
2. Daftar akun
3. Pergi ke Keys → Create Key
4. Salin API key kamu

### LANGKAH 3: Upload Project ke VPS

**Di MacBook (terminal):**

```bash
# Salin project ke VPS
# Ganti [VPS_IP] dengan IP VPS Sumopod kamu
scp -r crypto-signal-bot/ root@[VPS_IP]:~/
```

**Atau clone dari Git (jika sudah push ke GitHub):**

```bash
# Di VPS setelah SSH
git clone https://github.com/username/crypto-signal-bot.git
cd crypto-signal-bot
```

### LANGKAH 4: SSH ke VPS

```bash
# Di MacBook - buka Terminal
ssh root@[VPS_IP]

# Jika ada custom port
ssh root@[VPS_IP] -p [PORT]

# Jika menggunakan SSH key file
ssh -i ~/.ssh/id_rsa root@[VPS_IP]
```

### LANGKAH 5: Setup VPS Otomatis

```bash
# Di VPS, masuk ke folder project
cd ~/crypto-signal-bot

# Beri permission script
chmod +x scripts/setup-vps.sh

# Jalankan setup otomatis
bash scripts/setup-vps.sh
```

Script ini akan otomatis install: Node.js LTS, npm, git, PM2, dan semua dependencies.

### LANGKAH 6: Konfigurasi .env

```bash
# Di VPS, di dalam folder project
cp .env.example .env
nano .env
```

Isi semua value:

```env
TELEGRAM_BOT_TOKEN=123456789:AABBCCDDEEFFaabbccddeeff
TELEGRAM_CHAT_ID=
TWELVE_DATA_API_KEY=api_key_kamu_dari_twelvedata
OPENROUTER_API_KEY=sk-or-v1-key_kamu_dari_openrouter
SCAN_INTERVAL_MS=60000
NODE_ENV=production
```

Simpan: **Ctrl+X → Y → Enter**

### LANGKAH 7: Jalankan Testing

```bash
# Pastikan masih di folder project
cd ~/crypto-signal-bot

# Jalankan test semua komponen
node scripts/test.js
```

Semua test harus hijau ✅ sebelum lanjut.

### LANGKAH 8: Test Jalankan Manual (opsional)

```bash
# Jalankan dulu secara manual untuk lihat log
node index.js
```

Buka Telegram, kirim `/start` ke bot kamu. Kamu akan melihat chat ID di log. Tekan `Ctrl+C` untuk stop.

---

## ⚙️ Menjalankan dengan PM2

```bash
# Masuk ke folder project
cd ~/crypto-signal-bot

# Start dengan PM2
pm2 start ecosystem.config.js

# Lihat status
pm2 status

# Lihat log real-time
pm2 logs crypto-signal-bot

# ---- WAJIB DILAKUKAN agar bot tetap hidup setelah reboot ----
# Simpan konfigurasi PM2
pm2 save

# Setup agar PM2 auto-start saat VPS reboot
pm2 startup
# → Salin dan jalankan command yang muncul (biasanya sudo env PATH=... pm2 startup ...)
```

### Command PM2 Berguna

```bash
pm2 status                          # Lihat status semua proses
pm2 logs crypto-signal-bot          # Log real-time
pm2 logs crypto-signal-bot --lines 100  # 100 baris log terakhir
pm2 restart crypto-signal-bot       # Restart bot
pm2 stop crypto-signal-bot          # Stop bot
pm2 delete crypto-signal-bot        # Hapus dari PM2
pm2 monit                           # Dashboard monitoring
```

---

## 📱 Command Telegram

| Command | Fungsi |
|---------|--------|
| `/start` | Daftar dan sambutan. Wajib kirim ini dulu! |
| `/status` | Status engine, uptime, scan count |
| `/lastsignal` | Signal terakhir semua pair |
| `/lastsignal BTC` | Signal terakhir BTC saja |
| `/lastsignal SOL` | Signal terakhir SOL saja |
| `/performance` | Statistik winrate dan parameter learning |
| `/scan` | Trigger scan manual sekarang |
| `/reset` | Reset percakapan AI |
| `/help` | Daftar semua command |
| *(chat biasa)* | Ngobrol dengan AI Trading Assistant |

---

## 🧪 Testing

```bash
# Test semua komponen
node scripts/test.js

# Jika ingin test satu hal saja:
# Test koneksi Twelve Data
curl "https://api.twelvedata.com/price?symbol=BTC/USD&apikey=YOUR_KEY"

# Test koneksi OpenRouter
curl -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek/deepseek-chat-v3-0324:free","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'

# Test Telegram bot token
curl "https://api.telegram.org/botYOUR_TOKEN/getMe"
```

---

## 📊 Monitoring & Debug

### Via Telegram
Kirim command ke bot Telegram kamu:
- `/status` - Cek apakah engine masih hidup
- `/performance` - Lihat statistik

### Via VPS

```bash
# Log real-time
pm2 logs crypto-signal-bot

# Log error saja
pm2 logs crypto-signal-bot --err

# Dashboard lengkap
pm2 monit

# Lihat file log langsung
tail -f ~/crypto-signal-bot/logs/combined.log
tail -f ~/crypto-signal-bot/logs/error.log

# Cek resource usage
pm2 show crypto-signal-bot
```

### Cara Debug Error Umum

**Bot tidak merespons di Telegram:**
```bash
pm2 status   # Pastikan status 'online'
pm2 logs crypto-signal-bot --lines 50  # Cek error terbaru
```

**Rate limit Twelve Data:**
- Naikkan `SCAN_INTERVAL_MS` di .env menjadi `120000` (2 menit)
- Restart bot: `pm2 restart crypto-signal-bot`

**AI tidak merespons:**
```bash
# Cek saldo OpenRouter di https://openrouter.ai
# Atau ganti model di config.js:
# openRouter.model = 'meta-llama/llama-4-scout:free'
```

**Bot crash terus:**
```bash
pm2 logs crypto-signal-bot --err --lines 100
# Perbaiki error yang muncul, lalu:
pm2 restart crypto-signal-bot
```

---

## 📈 Strategi Trading

### 5-Minute EMA Pullback Scalping

**Indikator:** EMA9, EMA21, RSI14, Volume

**LONG Entry (semua harus terpenuhi):**
1. ✅ Bias 15m BULLISH (harga > EMA21 di 15m)
2. ✅ Harga pullback ke area EMA9/EMA21 (5m)
3. ✅ Candle close DI ATAS EMA9
4. ✅ RSI > 50 dan naik (max 70 agar tidak overbought)
5. ✅ Volume spike ≥ 1.8x rata-rata 10 candle

**SHORT Entry (kebalikan LONG)**

**Risk Management:**
- SL: 0.5% dari entry
- TP1: RR 1:1 (potensi sama dengan risiko)
- TP2: RR 1:2 (potensi 2x risiko)
- Max risk per trade: 0.5% modal

---

## ⚠️ Disclaimer

Signal yang dihasilkan bot ini adalah **BUKAN saran finansial**. Gunakan sebagai referensi tambahan. Selalu lakukan analisa sendiri (DYOR) dan trading dengan uang yang mampu kamu rugikan.

---

*Dibuat untuk pembelajaran. Trading crypto memiliki risiko tinggi.*
