// src/bot/telegram.js
// Telegram Bot Handler - semua command dan AI chat

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const openRouter = require('../ai/openrouter');
const learningSystem = require('../learning/learningSystem');
const signalEngine = require('../engine/signalEngine');

class TelegramBotHandler {
  constructor() {
    this.bot = null;
    this.chatIds = new Set(); // Semua chat ID yang aktif
    this.chatIdsFile = path.resolve('./data/chatids.json');
    this.isInitialized = false;
  }

  // ==========================================
  // INISIALISASI BOT
  // ==========================================
  async init() {
    if (!config.telegram.token) {
      throw new Error('TELEGRAM_BOT_TOKEN tidak diset!');
    }

    // Load chat IDs tersimpan
    await this._loadChatIds();

    // Tambahkan chat ID dari env jika ada
    if (config.telegram.chatId) {
      this.chatIds.add(String(config.telegram.chatId));
    }

    // Buat bot instance
    this.bot = new TelegramBot(config.telegram.token, { polling: true });

    // Setup semua handlers
    this._setupCommandHandlers();
    this._setupMessageHandler();
    this._setupErrorHandlers();

    this.isInitialized = true;
    logger.info('✅ Telegram Bot berhasil diinisialisasi');
    logger.info(`   Chat IDs terdaftar: ${this.chatIds.size}`);

    // Kirim pesan startup jika ada chat ID
    if (this.chatIds.size > 0) {
      await this.broadcast('🚀 *Bot aktif!* Signal Engine sedang dimulai...');
    }

    return this.bot;
  }

  // ==========================================
  // SETUP COMMAND HANDLERS
  // ==========================================
  _setupCommandHandlers() {
    // /start - Registrasi user dan sambutan
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = String(msg.chat.id);
      const userName = msg.from?.first_name || 'Trader';

      this.chatIds.add(chatId);
      await this._saveChatIds();

      const welcomeMsg = [
        `👋 Halo *${this._escape(userName)}*! Selamat datang di *Crypto Signal Bot*`,
        ``,
        `📊 Bot ini memberikan signal trading untuk:`,
        `▪️ Bitcoin (BTC/USD)`,
        `▪️ Solana (SOL/USD)`,
        ``,
        `🎯 *Strategi:* 5-Min EMA Pullback Scalping`,
        `⏱️ *Timeframe:* 5m (entry) + 15m (bias)`,
        `📈 *Indikator:* EMA9, EMA21, RSI14, Volume`,
        ``,
        `💡 *Command tersedia:*`,
        `▪️ /status - Status bot & engine`,
        `▪️ /lastsignal - Signal terakhir`,
        `▪️ /performance - Statistik performa`,
        `▪️ /scan - Trigger scan manual`,
        `▪️ /reset - Reset percakapan AI`,
        ``,
        `💬 Atau langsung *chat* untuk tanya ke AI Trading Assistant!`,
        ``,
        `⚠️ _Signal ini BUKAN saran finansial. Selalu DYOR._`,
      ].join('\n');

      await this._send(chatId, welcomeMsg);
      logger.info(`👤 User baru terdaftar: ${chatId} (${userName})`);
    });

    // /status - Status bot
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = String(msg.chat.id);
      this.chatIds.add(chatId);

      try {
        const status = signalEngine.getStatus();
        const stats = await learningSystem.getPerformanceStats();

        const msg_text = [
          `📊 *STATUS BOT*`,
          ``,
          `⚡ *Signal Engine:* ${status.isRunning ? '🟢 Aktif' : '🔴 Mati'}`,
          `🔢 *Total Scan:* ${status.scanCount}`,
          `⏱️ *Uptime:* ${status.uptime}`,
          `🕐 *Scan terakhir:* ${status.lastScanTime ? new Date(status.lastScanTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'Belum ada'}`,
          `⏳ *Scan berikutnya:* ${status.nextScanIn || '-'}`,
          `❌ *Total error:* ${status.errors}`,
          ``,
          `📈 *STATISTIK TRADING:*`,
          `▪️ Total signal: ${stats.total}`,
          `▪️ Open: ${stats.open}`,
          `▪️ Closed: ${stats.closed}`,
          `▪️ Winrate: ${stats.winRate}%`,
          ``,
          `📊 *STATUS PAIR:*`,
          ...status.pairs.map(p => {
            const cooldownInfo = p.inCooldown
              ? ` ⏳ cooldown ${Math.ceil(p.cooldownRemaining / 60000)}m`
              : '';
            const lastSignal = p.lastResult?.signal !== 'NONE' && p.lastResult?.signal
              ? ` | Last: ${p.lastResult.signal}`
              : '';
            return `▪️ ${p.symbol}${cooldownInfo}${lastSignal}`;
          }),
        ].join('\n');

        await this._send(chatId, msg_text);
      } catch (err) {
        await this._send(chatId, `❌ Error ambil status: ${err.message}`);
      }
    });

    // /lastsignal - Signal terakhir
    this.bot.onText(/\/lastsignal(.*)/, async (msg, match) => {
      const chatId = String(msg.chat.id);
      const pairFilter = match[1]?.trim()?.toUpperCase() || null;

      try {
        const last = learningSystem.getLastSignal(pairFilter);

        if (!last) {
          await this._send(chatId, '📭 Belum ada signal tersimpan.');
          return;
        }

        const time = new Date(last.signalAt).toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta', hour12: false
        });

        const statusEmoji = {
          'OPEN': '🔵',
          'WIN_TP1': '🟢',
          'WIN_TP2': '💚',
          'LOSS': '🔴',
          'MANUAL_CLOSE': '⚪',
        }[last.status] || '⚪';

        const signalEmoji = last.signal === 'LONG' ? '⬆️' : '⬇️';

        const msg_text = [
          `📊 *SIGNAL TERAKHIR*`,
          ``,
          `${signalEmoji} *${last.pair} ${last.signal}*`,
          `🕐 *Waktu:* ${time} WIB`,
          `${statusEmoji} *Status:* ${last.status}`,
          ``,
          `💰 *Level:*`,
          `▪️ Entry : \`${last.entryPrice}\``,
          `🛑 SL    : \`${last.sl}\``,
          `🎯 TP1   : \`${last.tp1}\``,
          `🎯 TP2   : \`${last.tp2}\``,
          ``,
          last.exitPrice ? `✅ Exit : \`${last.exitPrice}\` | PnL: ${last.pnlPct}%` : '',
        ].filter(Boolean).join('\n');

        await this._send(chatId, msg_text);
      } catch (err) {
        await this._send(chatId, `❌ Error: ${err.message}`);
      }
    });

    // /performance - Statistik performa
    this.bot.onText(/\/performance/, async (msg) => {
      const chatId = String(msg.chat.id);

      try {
        const stats = await learningSystem.getPerformanceStats();
        const params = stats.currentParams;

        const lastEval = stats.lastEvaluated
          ? new Date(stats.lastEvaluated).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
          : 'Belum pernah';

        const msg_text = [
          `📊 *STATISTIK PERFORMA*`,
          ``,
          `🎯 *Overall:*`,
          `▪️ Total signal: ${stats.total}`,
          `▪️ Open: ${stats.open}`,
          `▪️ Closed: ${stats.closed}`,
          `▪️ Win: ${stats.wins} | Loss: ${stats.losses}`,
          `▪️ Winrate: *${stats.winRate}%*`,
          ``,
          `₿ *Bitcoin (BTC):*`,
          `▪️ Total: ${stats.btc.total} | Win: ${stats.btc.wins} | WR: ${stats.btc.winRate}%`,
          ``,
          `◎ *Solana (SOL):*`,
          `▪️ Total: ${stats.sol.total} | Win: ${stats.sol.wins} | WR: ${stats.sol.winRate}%`,
          ``,
          `🧠 *PARAMETER AKTIF (Learning System):*`,
          `▪️ Volume multiplier: ${params.volumeSpikeMultiplier}x`,
          `▪️ RSI min LONG: ${params.rsiMinLong}`,
          `▪️ RSI max SHORT: ${params.rsiMaxShort}`,
          `▪️ Total evaluasi: ${params.totalEvaluations || 0}`,
          `▪️ Evaluasi terakhir: ${lastEval}`,
        ].join('\n');

        await this._send(chatId, msg_text);
      } catch (err) {
        await this._send(chatId, `❌ Error: ${err.message}`);
      }
    });

    // /scan - Manual scan
    this.bot.onText(/\/scan/, async (msg) => {
      const chatId = String(msg.chat.id);

      await this._send(chatId, '🔍 Memulai manual scan... Mohon tunggu.');

      try {
        await signalEngine.manualScan();
        await this._send(chatId, '✅ Manual scan selesai. Cek /lastsignal untuk hasilnya.');
      } catch (err) {
        await this._send(chatId, `❌ Error manual scan: ${err.message}`);
      }
    });

    // /reset - Reset percakapan AI
    this.bot.onText(/\/reset/, async (msg) => {
      const chatId = String(msg.chat.id);
      openRouter.clearSession(chatId);
      await this._send(chatId, '🗑️ Percakapan AI direset. Mulai percakapan baru!');
    });

    // /help - Bantuan
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = String(msg.chat.id);
      const helpMsg = [
        `📖 *BANTUAN*`,
        ``,
        `*Command:*`,
        `▪️ /start - Mulai & daftar`,
        `▪️ /status - Status bot & engine`,
        `▪️ /lastsignal - Signal terakhir (semua pair)`,
        `▪️ /lastsignal BTC - Signal terakhir BTC`,
        `▪️ /lastsignal SOL - Signal terakhir SOL`,
        `▪️ /performance - Statistik performa trading`,
        `▪️ /scan - Trigger scan manual`,
        `▪️ /reset - Reset percakapan AI`,
        `▪️ /help - Tampilkan bantuan ini`,
        ``,
        `*Chat AI:*`,
        `Kirim pesan apapun untuk ngobrol dengan AI Trading Assistant!`,
        `Contoh:`,
        `▪️ "Apa itu EMA pullback?"`,
        `▪️ "Jelaskan risk management yang baik"`,
        `▪️ "Bagaimana kondisi market BTC sekarang?"`,
        ``,
        `⚠️ _Signal BUKAN saran finansial. DYOR!_`,
      ].join('\n');

      await this._send(chatId, helpMsg);
    });
  }

  // ==========================================
  // SETUP MESSAGE HANDLER (AI Chat)
  // ==========================================
  _setupMessageHandler() {
    this.bot.on('message', async (msg) => {
      // Skip jika pesan adalah command
      if (msg.text?.startsWith('/')) return;
      // Skip jika bukan text
      if (!msg.text) return;

      const chatId = String(msg.chat.id);
      const userText = msg.text.trim();

      // Auto-register chat ID
      this.chatIds.add(chatId);
      await this._saveChatIds();

      try {
        // Tampilkan "typing..."
        this.bot.sendChatAction(chatId, 'typing');

        // Siapkan konteks dari status engine
        const status = signalEngine.getStatus();
        const lastScanInfo = status.pairs.map(p => {
          const r = p.lastResult;
          if (!r) return `${p.symbol}: belum ada data`;
          return `${p.symbol}: signal=${r.signal || 'NONE'}, bias=${r.bias || '-'}`;
        }).join('; ');

        const context = `Status engine: ${status.isRunning ? 'aktif' : 'mati'}, scan ke-${status.scanCount}, uptime ${status.uptime}. Scan terakhir: ${lastScanInfo}`;

        // Chat dengan AI
        const response = await openRouter.chat(chatId, userText, context);

        await this._send(chatId, response, { parse_mode: 'Markdown' });
      } catch (err) {
        logger.error(`❌ Error AI chat: ${err.message}`);
        await this._send(chatId,
          '❌ Maaf, AI sedang tidak tersedia. Coba lagi beberapa saat atau cek /status.',
          { parse_mode: 'Markdown' }
        );
      }
    });
  }

  // ==========================================
  // ERROR HANDLERS
  // ==========================================
  _setupErrorHandlers() {
    this.bot.on('polling_error', (err) => {
      logger.error(`❌ Telegram polling error: ${err.message}`);
    });

    this.bot.on('error', (err) => {
      logger.error(`❌ Telegram bot error: ${err.message}`);
    });
  }

  // ==========================================
  // KIRIM SIGNAL KE SEMUA USER
  // ==========================================
  async sendSignal(signalResult) {
    const message = require('../strategy/emaScalping').formatSignalMessage(signalResult);

    if (!message) {
      logger.warn('⚠️ Format signal gagal - tidak ada pesan untuk dikirim');
      return;
    }

    await this.broadcast(message);
  }

  // ==========================================
  // BROADCAST KE SEMUA CHAT ID
  // ==========================================
  async broadcast(message, options = {}) {
    if (!this.bot || !this.isInitialized) {
      logger.warn('⚠️ Bot belum siap untuk broadcast');
      return;
    }

    if (this.chatIds.size === 0) {
      logger.warn('⚠️ Tidak ada chat ID terdaftar. Kirim /start ke bot Telegram dulu!');
      return;
    }

    for (const chatId of this.chatIds) {
      try {
        await this._send(chatId, message, options);
      } catch (err) {
        logger.error(`❌ Gagal kirim ke ${chatId}: ${err.message}`);
        // Hapus chat ID jika bot diblokir
        if (err.message?.includes('bot was blocked') || err.message?.includes('chat not found')) {
          this.chatIds.delete(chatId);
          logger.info(`🗑️ Chat ID ${chatId} dihapus (tidak aktif)`);
        }
      }
    }

    await this._saveChatIds();
  }

  // ==========================================
  // INTERNAL HELPER - Kirim pesan
  // ==========================================
  async _send(chatId, text, options = {}) {
    if (!this.bot) return;

    const defaultOptions = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };

    try {
      await this.bot.sendMessage(chatId, text, { ...defaultOptions, ...options });
    } catch (err) {
      // Jika Markdown error, coba kirim sebagai plain text
      if (err.message?.includes('parse') || err.message?.includes('Markdown')) {
        try {
          await this.bot.sendMessage(chatId, text.replace(/[*_`[\]]/g, ''), {
            disable_web_page_preview: true,
          });
        } catch (err2) {
          logger.error(`❌ Gagal kirim pesan ke ${chatId}: ${err2.message}`);
        }
      } else {
        throw err;
      }
    }
  }

  // ==========================================
  // ESCAPE MARKDOWN
  // ==========================================
  _escape(text) {
    return (text || '').replace(/[*_`[\]]/g, '\\$&');
  }

  // ==========================================
  // LOAD/SAVE CHAT IDs
  // ==========================================
  async _loadChatIds() {
    try {
      await fs.ensureDir(path.dirname(this.chatIdsFile));
      if (await fs.pathExists(this.chatIdsFile)) {
        const ids = await fs.readJSON(this.chatIdsFile);
        ids.forEach(id => this.chatIds.add(String(id)));
        logger.info(`📱 ${this.chatIds.size} chat ID dimuat`);
      }
    } catch (err) {
      logger.warn(`⚠️ Gagal load chat IDs: ${err.message}`);
    }
  }

  async _saveChatIds() {
    try {
      await fs.ensureDir(path.dirname(this.chatIdsFile));
      await fs.writeJSON(this.chatIdsFile, Array.from(this.chatIds), { spaces: 2 });
    } catch (err) {
      logger.error(`❌ Gagal simpan chat IDs: ${err.message}`);
    }
  }
}

module.exports = new TelegramBotHandler();
