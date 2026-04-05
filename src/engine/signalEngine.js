// src/engine/signalEngine.js
// Mesin scanning signal utama - scan market setiap interval tertentu

const config = require('../../config');
const logger = require('../utils/logger');
const twelveData = require('../data/binance');
const strategy = require('../strategy/emaScalping');
const learningSystem = require('../learning/learningSystem');

class SignalEngine {
  constructor() {
    this.isRunning = false;
    this.scanInterval = null;
    this.lastSignalTime = new Map();  // Cooldown per pair
    this.onSignalCallback = null;      // Callback saat ada signal
    this.scanCount = 0;
    this.startTime = null;
    this.errors = 0;
    this.lastScanTime = null;
    this.lastScanResults = new Map();  // Simpan hasil scan terakhir per pair
  }

  // ==========================================
  // MULAI ENGINE
  // ==========================================
  async start(onSignalCallback) {
    if (this.isRunning) {
      logger.warn('⚠️ Signal Engine sudah berjalan');
      return;
    }

    this.onSignalCallback = onSignalCallback;
    this.isRunning = true;
    this.startTime = new Date();

    logger.info('🚀 Signal Engine dimulai');
    logger.info(`   Pairs: ${config.pairs.map(p => p.symbol).join(', ')}`);
    logger.info(`   Interval: ${config.engine.scanIntervalMs / 1000} detik`);

    // Scan pertama langsung
    await this._runScan();

    // Scan berikutnya dengan interval
    this.scanInterval = setInterval(async () => {
      await this._runScan();
    }, config.engine.scanIntervalMs);

    logger.info('✅ Signal Engine aktif dan siap');
  }

  // ==========================================
  // STOP ENGINE
  // ==========================================
  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isRunning = false;
    logger.info('⏹️ Signal Engine dihentikan');
  }

  // ==========================================
  // SATU SIKLUS SCAN
  // ==========================================
  async _runScan() {
    this.scanCount++;
    this.lastScanTime = new Date();
    logger.info(`\n🔍 === SCAN #${this.scanCount} - ${this.lastScanTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} ===`);

    for (const pair of config.pairs) {
      try {
        await this._scanPair(pair);
        // Tunggu 2 detik antar pair untuk menghindari rate limit
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        this.errors++;
        logger.error(`❌ Error scan ${pair.symbol}: ${err.message}`);
      }
    }

    logger.info(`✅ Scan #${this.scanCount} selesai. Total error: ${this.errors}`);
  }

  // ==========================================
  // SCAN SATU PAIR
  // ==========================================
  async _scanPair(pair) {
    const symbol = pair.twelveSymbol;
    logger.info(`🔍 Scanning ${symbol}...`);

    // Cek cooldown
    if (this._isInCooldown(symbol)) {
      const remaining = this._getCooldownRemaining(symbol);
      logger.info(`⏳ ${symbol} masih dalam cooldown (${Math.ceil(remaining / 60000)} menit lagi)`);
      return;
    }

    // Ambil data 5m dan 15m dengan rate limit awareness
    let data5m, data15m;

    try {
      data5m = await twelveData.getAllIndicators(symbol, config.timeframes.scalp);
      // Tunggu 1.5 detik antar request
      await new Promise(r => setTimeout(r, 1500));
      data15m = await twelveData.getAllIndicators(symbol, config.timeframes.bias);
    } catch (err) {
      logger.error(`❌ Gagal ambil data ${symbol}: ${err.message}`);
      return;
    }

    // Analisa dengan strategi
    const result = strategy.analyze(pair.symbol, data5m, data15m);

    // Simpan hasil scan terakhir
    this.lastScanResults.set(symbol, {
      ...result,
      scannedAt: new Date().toISOString(),
    });

    // Jika ada signal, kirim notifikasi
    if (result.signal && result.signal !== 'NONE') {
      logger.info(`🎯 SIGNAL DITEMUKAN: ${result.pair} ${result.signal} @ ${result.entryPrice}`);

      // Set cooldown untuk pair ini
      this.lastSignalTime.set(symbol, Date.now());

      // Simpan ke learning system
      const tradeId = await learningSystem.saveSignal(result);
      result.tradeId = tradeId;

      // Kirim ke callback (Telegram bot)
      if (this.onSignalCallback) {
        try {
          await this.onSignalCallback(result);
        } catch (err) {
          logger.error(`❌ Error pada signal callback: ${err.message}`);
        }
      }
    } else {
      logger.info(`📊 ${symbol}: ${result.reason || 'Tidak ada signal'}`);
    }
  }

  // ==========================================
  // COOLDOWN MANAGEMENT
  // ==========================================
  _isInCooldown(symbol) {
    const lastTime = this.lastSignalTime.get(symbol);
    if (!lastTime) return false;
    return (Date.now() - lastTime) < config.engine.signalCooldownMs;
  }

  _getCooldownRemaining(symbol) {
    const lastTime = this.lastSignalTime.get(symbol);
    if (!lastTime) return 0;
    return Math.max(0, config.engine.signalCooldownMs - (Date.now() - lastTime));
  }

  // ==========================================
  // STATUS ENGINE
  // ==========================================
  getStatus() {
    const uptimeMs = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    const uptimeHours = Math.floor(uptimeMs / 3600000);
    const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000);

    return {
      isRunning: this.isRunning,
      scanCount: this.scanCount,
      errors: this.errors,
      uptime: `${uptimeHours}j ${uptimeMinutes}m`,
      startTime: this.startTime?.toISOString(),
      lastScanTime: this.lastScanTime?.toISOString(),
      nextScanIn: this._getNextScanIn(),
      pairs: config.pairs.map(p => ({
        symbol: p.symbol,
        inCooldown: this._isInCooldown(p.twelveSymbol),
        cooldownRemaining: this._getCooldownRemaining(p.twelveSymbol),
        lastResult: this.lastScanResults.get(p.twelveSymbol),
      })),
    };
  }

  _getNextScanIn() {
    if (!this.lastScanTime || !this.isRunning) return null;
    const elapsed = Date.now() - this.lastScanTime.getTime();
    const remaining = Math.max(0, config.engine.scanIntervalMs - elapsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  // ==========================================
  // SCAN MANUAL (dipanggil dari command Telegram)
  // ==========================================
  async manualScan() {
    logger.info('🔍 Manual scan dipicu...');
    // Reset cooldown untuk manual scan
    this.lastSignalTime.clear();
    await this._runScan();
    return this.lastScanResults;
  }
}

module.exports = new SignalEngine();
