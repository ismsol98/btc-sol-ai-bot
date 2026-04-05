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

    // System prompt yang bersih dan detail
    this.systemPrompt = [
      'Kamu adalah AI Trading Assistant yang sangat analitis dan disiplin untuk strategi EMA Pullback Scalping pada BTC/USDT dan SOL/USDT.',
      '',
      'Kamu memiliki akses penuh ke Learning System yang menyimpan semua signal dan hasil trade.',
      'Tujuan utamamu adalah meningkatkan winrate dan expectancy jangka panjang dengan belajar dari setiap hasil.',
      '',
      'Saat user melaporkan hasil trade (contoh: "TP1 hit", "TP2 hit", "SL hit", "loss", "manual close"), kamu harus:',
      '- Langsung mencatat dan menganalisa',
      '- Hitung winrate, average RR, dan expectancy',
      '- Identifikasi pola gagal (low volume, ranging choppy, false breakout, news interference, dll)',
      '- Berikan rekomendasi perbaikan yang konkret untuk signal berikutnya',
      '',
      'Metrik yang selalu kamu pantau:',
      '- Win Rate (%)',
      '- Average RR aktual',
      '- Expectancy = (Win% x Avg Win RR) - (Loss% x 1)',
      '',
      'Gaya jawaban:',
      '- Langsung, jujur, dan analitis',
      '- Gunakan Bahasa Indonesia yang mudah dipahami',
      '- Selalu sebutkan winrate terkini jika relevan',
      '- Berikan saran perbaikan yang spesifik',
      '- Selalu ingatkan bahwa semua signal BUKAN saran finansial resmi',
      '',
      'Kamu boleh melihat data performa terbaru setiap kali user chat.',
      '',
      '[PERINGATAN] Selalu ingatkan bahwa trading crypto berisiko tinggi dan semua keputusan akhir ada di tangan user.'
    ].join('\n');
  }

  async chat(chatId, userMessage, context = '') {
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, []);
    }

    const history = this.sessions.get(chatId);

    const fullUserMessage = context
      ? '[Konteks sistem: ' + context + ']\n\nPesan user: ' + userMessage
      : userMessage;

    history.push({ role: 'user', content: fullUserMessage });

    if (history.length > this.maxHistoryLength) {
      history.splice(0, history.length - this.maxHistoryLength);
    }

    const models = [this.model, this.fallbackModel];

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      try {
        const response = await axios.post(
          this.baseUrl + '/chat/completions',
          {
            model: model,
            messages: [
              { role: 'system', content: this.systemPrompt },
              ...history,
            ],
            max_tokens: 800,
            temperature: 0.7,
          },
          {
            headers: {
              'Authorization': 'Bearer ' + this.apiKey,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://github.com/ismsol198/btc-sol-ai-bot',
              'X-Title': 'BTC-SOL AI Bot',
            },
            timeout: 30000,
          }
        );

        const assistantMessage = response.data &&
          response.data.choices &&
          response.data.choices[0] &&
          response.data.choices[0].message &&
          response.data.choices[0].message.content;

        if (!assistantMessage) {
          throw new Error('Response kosong dari API');
        }

        history.push({ role: 'assistant', content: assistantMessage });
        logger.info('AI response berhasil (model: ' + model + ')');
        return assistantMessage;

      } catch (err) {
        logger.warn('AI error dengan model ' + model + ': ' + err.message);
        if (i === models.length - 1) {
          throw err;
        }
      }
    }

    throw new Error('Semua model gagal merespons');
  }

  clearSession(chatId) {
    this.sessions.delete(chatId);
    logger.info('Session AI untuk chat ' + chatId + ' direset');
  }
}

module.exports = new OpenRouterClient();
