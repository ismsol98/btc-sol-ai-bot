# BTC-SOL AI Bot

Signal trading otomatis untuk **BTC/USDT** dan **SOL/USDT** menggunakan strategi **5-Minute EMA Pullback Scalping**.
Data chart realtime diambil langsung dari **Binance API** (gratis, tanpa perlu API key Binance).

---

## Daftar Isi

1. [Fitur Utama](#fitur-utama)
2. [Persyaratan](#persyaratan)
3. [Setup Lengkap dari Nol](#setup-lengkap-dari-nol)
4. [Konfigurasi .env](#konfigurasi-env)
5. [Menjalankan Bot](#menjalankan-bot)
6. [Command Telegram](#command-telegram)
7. [Cara Lapor Hasil Trade](#cara-lapor-hasil-trade)
8. [Monitoring](#monitoring)
9. [Strategi Trading](#strategi-trading)
10. [Disclaimer](#disclaimer)

---

## Fitur Utama

- Auto scan BTC/USDT dan SOL/USDT setiap 3 menit
- Analisis EMA9, EMA21, RSI14, dan Volume (data dari Binance)
- Notifikasi signal langsung ke Telegram
- AI Trading Assistant via OpenRouter (chat bebas)
- Learning System: bot belajar dari hasil trade dan menyesuaikan parameter otomatis
- Track winrate, average RR, dan expectancy secara otomatis
- Berjalan 24/7 di VPS dengan PM2

---

## Persyaratan

Sebelum mulai, siapkan semua ini:

1. **VPS Ubuntu 24.04**
   - Rekomendasi: Sumopod paket paling murah (sudah cukup)
   - https://sumopod.com

2. **Telegram Bot Token**
   - Buka Telegram, cari @BotFather
   - Ketik /newbot
   - Ikuti instruksi, masukkan nama dan username bot
   - Simpan TOKEN yang diberikan
   - Format: 123456789:AABBCCDDEEFFaabbccddeeff

3. **Telegram Chat ID**
   - Buka Telegram, cari @userinfobot
   - Ketik /start
   - Simpan angka ID yang muncul

4. **OpenRouter API Key**
   - Daftar di https://openrouter.ai
   - Buka Settings > API Keys
   - Klik Create Key
   - PENTING: Jangan tambahkan provider restriction apapun
   - Simpan API key yang diberikan

---

## Setup Lengkap dari Nol

### LANGKAH 1 — SSH ke VPS
ssh ubuntu@IP_VPS_KAMU (ini kalo pake terminal default macbook, kalau windows ssh root@IP_VPS_KAMU )

### LANGKAH 2 — Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v

### LANGKAH 3 — Clone Repository
git clone https://github.com/ismsol98/btc-sol-ai-bot.git
cd btc-sol-ai-bot

### LANGKAH 4 — Install Dependencies
npm install

### LANGKAH 5 — Buat File .env
cp .env.example .env
nano .env

Isi semua value (lihat bagian Konfigurasi .env di bawah), lalu simpan: Ctrl+X → Y → Enter

### LANGKAH 6 — Jalankan Bot
npm install -g pm2
pm2 start index.js --name btc-sol-ai-bot
pm2 save
pm2 startup

### LANGKAH 7 — Verifikasi Bot Aktif
pm2 status
pm2 logs btc-sol-ai-bot --lines 20 --nostream

Buka Telegram, kirim /start ke bot kamu. Jika muncul sambutan, bot sudah berjalan normal.

---

## Konfigurasi .env
TELEGRAM_BOT_TOKEN=isi_token_dari_botfather
TELEGRAM_CHAT_ID=isi_chat_id_kamu
OPENROUTER_API_KEY=isi_api_key_openrouter
OPENROUTER_MODEL=qwen/qwen3-6-plus:free
OPENROUTER_FALLBACK_MODEL=stepfun/step-3.5-flash:free

### Model AI yang Digunakan

| Role     | Model                        | Biaya  |
|----------|------------------------------|--------|
| Primary  | qwen/qwen3-6-plus:free       | Gratis |
| Fallback | stepfun/step-3.5-flash:free  | Gratis |

Kedua model ini tersedia gratis di OpenRouter tanpa perlu isi saldo.

---

## Menjalankan Bot

### Command PM2 yang Sering Dipakai
pm2 status                                    # Lihat status bot
pm2 logs btc-sol-ai-bot --lines 30 --nostream # Lihat log terbaru
pm2 logs btc-sol-ai-bot                       # Log real-time
pm2 restart btc-sol-ai-bot                    # Restart bot
pm2 stop btc-sol-ai-bot                       # Stop bot
pm2 flush btc-sol-ai-bot                      # Bersihkan log lama

---

## Command Telegram

| Command | Fungsi |
|---------|--------|
| /start | Mulai bot dan lihat sambutan |
| /status | Cek status bot dan koneksi |
| /signal | Minta signal terbaru BTC & SOL |
| /lastsignal | Signal terakhir yang dikirim |
| /lastsignal BTC | Signal terakhir BTC saja |
| /lastsignal SOL | Signal terakhir SOL saja |
| /performance | Statistik winrate dan performa learning |
| /scan | Trigger scan manual sekarang |
| /reset | Reset percakapan AI |
| /help | Lihat semua command |
| (chat biasa) | Ngobrol dengan AI Trading Assistant |

---

## Cara Lapor Hasil Trade

Setelah dapat signal dan masuk posisi, lapor hasilnya langsung ke bot Telegram:
TP1 hit
TP2 hit
SL hit
manual close

Bot AI akan otomatis mencatat, menghitung winrate, dan memberikan analisis serta rekomendasi untuk signal berikutnya.

---

## Monitoring

### Via Telegram
- /status — Cek apakah bot masih hidup
- /performance — Lihat winrate dan statistik

### Via VPS
pm2 logs btc-sol-ai-bot          # Log real-time
pm2 logs btc-sol-ai-bot --err    # Error saja
pm2 monit                        # Dashboard lengkap

### Troubleshooting Umum

**Bot tidak merespons di Telegram:**
pm2 status
pm2 logs btc-sol-ai-bot --lines 50

**AI tidak merespons:**
- Pastikan OpenRouter API key tidak ada provider restriction
- Buat key baru di https://openrouter.ai jika perlu

**Bot crash terus:**
pm2 logs btc-sol-ai-bot --err --lines 100
pm2 restart btc-sol-ai-bot

---

## Strategi Trading

### 5-Minute EMA Pullback Scalping

**Indikator:** EMA9, EMA21, RSI14, Volume (data dari Binance)

**LONG Entry — semua kondisi harus terpenuhi:**
1. Bias 15m BULLISH (harga > EMA21 di timeframe 15m)
2. Harga pullback ke area EMA9/EMA21 di timeframe 5m
3. Candle close di atas EMA9
4. RSI > 50 dan naik (maksimal 70)
5. Volume spike minimal 1.8x rata-rata 10 candle terakhir

**SHORT Entry — kebalikan dari LONG**

**Risk Management:**
- Stop Loss: 0.5% dari entry
- TP1: RR 1:1
- TP2: RR 1:2
- Max risk per trade: 0.5% modal

---

## Tech Stack

- Node.js 20
- Binance Public API (data chart realtime, gratis tanpa API key)
- OpenRouter AI (chat assistant + analisis)
- Telegram Bot API
- PM2 (process manager)
- SQLite (learning system & trade history)

---

## Disclaimer

Signal yang dihasilkan bot ini adalah **BUKAN saran finansial resmi**.
Gunakan sebagai referensi tambahan. Selalu lakukan analisa sendiri (DYOR).
Trading crypto memiliki risiko tinggi. Hanya gunakan uang yang siap kamu rugikan.

Made with ❤️ for Indonesian Crypto Community

---
