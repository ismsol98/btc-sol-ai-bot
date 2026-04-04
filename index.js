// index.js
// Entry point utama - menginisialisasi semua komponen dan menjalankan bot

require('dotenv').config();

const cron = require('node-cron');
const logger = require('./src/utils/logger');
const telegramBot = require('./src/bot/telegram');
const signalEngine = require('./src/engine/signalEngine');
const learningSystem = require('./src/learning/learningSystem');

// ==========================================
// MAIN FUNCTION
// ==========================================
async function main() {
  logger.info('');
  logger.info('╔══════════════════════════════════════╗');
  logger.info('║      CRYPTO SIGNAL BOT v1.0          ║');
  logger.info('║   BTC & SOL EMA Pullback Scalping     ║');
  logger.info('╚══════════════════════════════════════╝');
  logger.info('');

  try {
    // 1. Inisialisasi Learning System
    logger.info('📚 [1/3] Menginisialisasi Learning System...');
    await learningSystem.init();
    logger.info('✅ Learning System siap');

    // 2. Inisialisasi Telegram Bot
    logger.info('📱 [2/3] Menginisialisasi Telegram Bot...');
    await telegramBot.init();
    logger.info('✅ Telegram Bot siap');

    // 3. Mulai Signal Engine
    logger.info('🚀 [3/3] Memulai Signal Engine...');
    await signalEngine.start(async (signalResult) => {
      // Callback: kirim signal ke Telegram
      logger.info(`📤 Mengirim signal ${signalResult.pair} ${signalResult.signal} ke Telegram...`);
      await telegramBot.sendSignal(signalResult);
    });
    logger.info('✅ Signal Engine aktif');

    // ==========================================
    // CRON JOBS
    // ==========================================

    // Evaluasi learning system setiap 24 jam (jam 00:01 WIB)
    cron.schedule('1 17 * * *', async () => {  // 17:01 UTC = 00:01 WIB
      logger.info('⏰ Menjalankan evaluasi learning system harian...');
      try {
        const report = await learningSystem.evaluate();
        if (report) {
          const msg = [
            `🧠 *LAPORAN EVALUASI HARIAN*`,
            ``,
            `📊 *Statistik (${report.totalTrades} trade):*`,
            `▪️ Win: ${report.wins} | Loss: ${report.losses}`,
            `▪️ Winrate: ${report.winRate}%`,
            `▪️ Avg RR aktual: ${report.avgRR}`,
            ``,
            report.paramChanged
              ? [
                  `⚙️ *Parameter diupdate:*`,
                  `▪️ Volume: ${report.oldParams?.volumeSpikeMultiplier}x → ${report.newParams?.volumeSpikeMultiplier}x`,
                ].join('\n')
              : `✅ Parameter tidak berubah (performa stabil)`,
          ].join('\n');

          await telegramBot.broadcast(msg);
        }
      } catch (err) {
        logger.error(`❌ Error evaluasi harian: ${err.message}`);
      }
    });

    // Heartbeat check setiap jam - pastikan engine masih berjalan
    cron.schedule('0 * * * *', async () => {
      logger.info('💓 Heartbeat check...');
      const status = signalEngine.getStatus();

      if (!status.isRunning) {
        logger.warn('⚠️ Signal Engine mati! Mencoba restart...');
        try {
          await signalEngine.start(async (signalResult) => {
            await telegramBot.sendSignal(signalResult);
          });
          await telegramBot.broadcast('⚠️ Signal Engine di-restart otomatis');
        } catch (err) {
          logger.error(`❌ Gagal restart engine: ${err.message}`);
          await telegramBot.broadcast(`❌ Signal Engine gagal restart: ${err.message}`);
        }
      }
    });

    logger.info('');
    logger.info('✅ ============================================');
    logger.info('✅  BOT AKTIF - Semua komponen berjalan!');
    logger.info('✅  Kirim /start ke bot Telegram kamu');
    logger.info('✅ ============================================');
    logger.info('');

  } catch (err) {
    logger.error(`❌ Fatal error saat startup: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  }
}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
async function shutdown(signal) {
  logger.info(`\n⏹️ Menerima ${signal}, shutdown...`);
  try {
    signalEngine.stop();
    await telegramBot.broadcast('⏹️ Bot sedang shutdown...');
    logger.info('✅ Shutdown selesai');
  } catch (err) {
    logger.error(`❌ Error saat shutdown: ${err.message}`);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors agar bot tidak mati
process.on('uncaughtException', (err) => {
  logger.error(`❌ Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  // Jangan exit - biarkan PM2 yang handle
});

process.on('unhandledRejection', (reason) => {
  logger.error(`❌ Unhandled Rejection: ${reason}`);
  // Jangan exit - biarkan PM2 yang handle
});

// Mulai
main();
