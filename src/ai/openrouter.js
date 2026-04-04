// src/ai/openrouter.js
// Client untuk OpenRouter API - AI chat di Telegram

const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');

class OpenRouterClient {
  constructor() {
    this.apiKey = config.openRouter.apiKey;
    this.baseUrl = config.openRouter.baseUrl;
    this.model = config.openRouter.model;
    this.fallbackModel = config.openRouter.fallbackModel;

    // Session history per chat ID (maksimal 10 pesan)
    this.sessions = new Map();
    this.maxHistoryLength = 10;

    // System prompt untuk trading bot
    this.systemPrompt = `Kamu adalah AI Trading Assistant yang ahli dalam:
- Analisa teknikal cryptocurrency (BTC & SOL)
- Strategi EMA Pullback Scalping (5m/15m timeframe)
- Risk management trading
- Membaca kondisi market intraday

Sistem trading yang kamu gunakan:
- Strategi: 5-Minute EMA Pullback Scalping
- Indikator: EMA9, EMA21, RSI14, Volume
- Pair: BTC/USD dan SOL/USD
- Timeframe bias: 15m, Entry: 5m
- Risk: SL 0.45-0.55%, TP1 RR1:1, TP2 RR1:2

Sifat jawaban:
- Langsung dan informatif
- Gunakan Bahasa Indonesia
- Sertakan angka dan data spesifik jika relevan
- Jika ditanya tentang sesuatu di luar kapabilitasmu, jelaskan dengan jujur
- JANGAN berikan saran untuk trading dengan leverage tinggi atau untung besar tanpa risiko
- Selalu ingatkan bahwa semua signal adalah BUKAN saran finansial resmi

Kamu memiliki akses ke data sinyal terbaru yang akan disertakan dalam konteks jika tersedia.`;
  }

  // ==========================================
  // KIRIM PESAN KE AI
  // ==========================================
  async chat(chatId, userMessage, context = '') {
    // Ambil atau buat session
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, []);
    }

    const history = this.sessions.get(chatId);

    // Siapkan pesan user (dengan konteks jika ada)
    const fullUserMessage = context
      ? `[Konteks sistem: ${context}]\n\nPesan user: ${userMessage}`
      : userMessage;

    // Tambah ke history
    history.push({ role: 'user', content: fullUserMessage });

    // Batasi history
    if (history.length > this.maxHistoryLength) {
      history.splice(0, history.length - this.maxHistoryLength);
    }

    // Coba dengan model utama dulu, lalu fallback
    for (const model of [this.model, this.fallbackModel]) {
      try {
        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          {
            model,
            messages: [
              { role: 'system', content: this.systemPrompt },
              ...history,
            ],
            max_tokens: 800,
            temperature: 0.7,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://github.com/crypto-signal-bot',
              'X-Title': 'Crypto Signal Bot',
            },
            timeout: 30000,
          }
        );

        const assistantMessage = response.data?.choices?.[0]?.message?.content;

        if (!assistantMessage) {
          throw new Error('Response kosong dari API');
        }

        // Simpan response ke history
        history.push({ role: 'assistant', content: assistantMessage });

        logger.info(`🤖 AI response berhasil (model: ${model})`);
        return assistantMessage;
      } catch (err) {
        logger.warn(`⚠️ AI error dengan model ${model}: ${err.message}`);
        if (model === this.fallbackModel) {
          throw err;
        }
        logger.info(`🔄 Mencoba fallback model: ${this.fallbackModel}`);
      }
    }

    throw new Error('Semua model gagal merespons');
  }

  // ==========================================
  // CLEAR SESSION (reset percakapan)
  // ==========================================
  clearSession(chatId) {
    this.sessions.delete(chatId);
    logger.info(`🗑️ Session AI untuk chat ${chatId} direset`);
  }

  // ==========================================
  // ANALISA MARKET DENGAN AI (opsional)
  // ==========================================
  async analyzeMarket(pair, indicators, signal) {
    const prompt = `Berikan analisa singkat kondisi market saat ini untuk ${pair}:
- EMA9: ${indicators.ema9?.toFixed(2)}
- EMA21: ${indicators.ema21?.toFixed(2)}
- RSI: ${indicators.rsi?.toFixed(1)}
- Volume multiplier: ${indicators.volumeMultiplier}x
- Signal: ${signal}

Berikan pendapat 2-3 kalimat tentang kualitas setup ini.`;

    try {
      const tempChatId = `analysis_${Date.now()}`;
      const result = await this.chat(tempChatId, prompt);
      this.clearSession(tempChatId);
      return result;
    } catch (err) {
      logger.error(`❌ Gagal analisa AI: ${err.message}`);
      return null;
    }
  }
}

module.exports = new OpenRouterClient();
