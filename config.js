// config.js
// Konfigurasi terpusat untuk seluruh sistem

require('dotenv').config();

const config = {
  // ---- Telegram ----
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID || null,
  },

  // ---- API Keys ----
//  twelveData: {
//    apiKey: process.env.TWELVE_DATA_API_KEY,
//    baseUrl: 'https://api.twelvedata.com',
//  },

  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: 'https://openrouter.ai/api/v1',
    // Model murah dan stabil - bisa diganti sesuai kebutuhan
    model: 'qwen/qwen3.6-plus:free',
    fallbackModel: 'qwen/qwen3.6-plus:free',
  },

  // ---- Trading Pairs ----
  pairs: [
    { symbol: 'BTC/USDT', twelveSymbol: 'BTCUSDT', name: 'Bitcoin' },
    { symbol: 'SOL/USDT', twelveSymbol: 'SOLUSDT', name: 'Solana' },
  ],

  // ---- Timeframes ----
  timeframes: {
    scalp: '5m',   // Timeframe utama untuk entry
    bias: '15m',   // Timeframe untuk bias market
  },

  // ---- Strategi EMA Pullback ----
  strategy: {
    ema: {
      fast: 9,   // EMA cepat
      slow: 21,  // EMA lambat
    },
    rsi: {
      period: 14,
      minLong: 50,   // RSI minimum untuk entry LONG
      maxShort: 50,  // RSI maksimum untuk entry SHORT
    },
    volume: {
      lookback: 10,        // Jumlah candle untuk rata-rata volume
      spikeMultiplier: 1.6, // Volume harus >= 1.6x rata-rata
    },
    risk: {
      slPercent: 0.5,    // Stop Loss 0.5%
      tp1Ratio: 1.0,     // TP1: RR 1:1
      tp2Ratio: 2.0,     // TP2: RR 1:2
      maxRiskPercent: 0.5, // Max risk per trade 0.5%
    },
  },

  // ---- Signal Engine ----
  engine: {
    scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS) || 60000, // Default 1 menit
    signalCooldownMs: 5 * 60 * 1000,  // Cooldown 5 menit per pair (hindari duplikat)
    candleLimit: 50,  // Jumlah candle yang diambil per request
  },

  // ---- Learning System ----
  learning: {
    evaluationIntervalHours: 24,  // Evaluasi setiap 24 jam
    minTradesForEval: 5,          // Minimal trade sebelum evaluasi
    dataFile: './data/trades.json',
    paramsFile: './data/params.json',
  },
};

// Validasi env variables penting
function validateConfig() {
  const errors = [];
  if (!config.telegram.token) errors.push('TELEGRAM_BOT_TOKEN tidak diset');
//  if (!config.twelveData.apiKey) errors.push('TWELVE_DATA_API_KEY tidak diset');
  if (!config.openRouter.apiKey) errors.push('OPENROUTER_API_KEY tidak diset');

  if (errors.length > 0) {
    console.error('❌ Konfigurasi tidak lengkap:');
    errors.forEach(e => console.error(`   - ${e}`));
    console.error('\nPastikan file .env sudah diisi dengan benar!');
    process.exit(1);
  }
}

validateConfig();

module.exports = config;
