// src/learning/learningSystem.js
// Sistem self-learning - menyimpan trade, tracking performance, dan adjust parameter

const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');

class LearningSystem {
  constructor() {
    this.tradesFile = path.resolve(config.learning.dataFile);
    this.paramsFile = path.resolve(config.learning.paramsFile);
    this.trades = [];
    this.params = this._defaultParams();
    this._initialized = false;
  }

  // ==========================================
  // PARAMETER DEFAULT (dari strategi utama)
  // ==========================================
  _defaultParams() {
    return {
      volumeSpikeMultiplier: 1.8,   // Minimum volume spike
      rsiMinLong: 50,               // RSI minimum untuk LONG
      rsiMaxShort: 50,              // RSI maksimum untuk SHORT
      slPercent: 0.5,               // Stop loss %
      pullbackTolerance: 0.3,       // Pullback tolerance %
      lastEvaluated: null,
      totalEvaluations: 0,
    };
  }

  // ==========================================
  // INISIALISASI - Load data dari file
  // ==========================================
  async init() {
    try {
      // Pastikan folder data ada
      await fs.ensureDir(path.dirname(this.tradesFile));

      // Load trades
      if (await fs.pathExists(this.tradesFile)) {
        this.trades = await fs.readJSON(this.tradesFile);
        logger.info(`📚 Learning System: ${this.trades.length} trade berhasil dimuat`);
      } else {
        this.trades = [];
        await fs.writeJSON(this.tradesFile, [], { spaces: 2 });
        logger.info('📚 Learning System: File trades baru dibuat');
      }

      // Load params
      if (await fs.pathExists(this.paramsFile)) {
        const savedParams = await fs.readJSON(this.paramsFile);
        // Merge dengan default (supaya field baru selalu ada)
        this.params = { ...this._defaultParams(), ...savedParams };
        logger.info('⚙️ Learning System: Parameter tersimpan dimuat');
        logger.info(`   Volume multiplier: ${this.params.volumeSpikeMultiplier}x`);
        logger.info(`   RSI min long: ${this.params.rsiMinLong}`);
        logger.info(`   RSI max short: ${this.params.rsiMaxShort}`);
      } else {
        this.params = this._defaultParams();
        await fs.writeJSON(this.paramsFile, this.params, { spaces: 2 });
        logger.info('⚙️ Learning System: Parameter default disimpan');
      }

      this._initialized = true;
    } catch (err) {
      logger.error(`❌ Learning System init error: ${err.message}`);
      this.trades = [];
      this.params = this._defaultParams();
      this._initialized = true;
    }
  }

  // ==========================================
  // SIMPAN SIGNAL BARU SEBAGAI OPEN TRADE
  // ==========================================
  async saveSignal(signalData) {
    if (!this._initialized) await this.init();

    const trade = {
      id: `trade_${Date.now()}`,
      pair: signalData.pair,
      signal: signalData.signal,         // LONG / SHORT
      bias: signalData.bias,
      entryPrice: signalData.entryPrice,
      sl: signalData.levels.sl,
      tp1: signalData.levels.tp1,
      tp2: signalData.levels.tp2,
      indicators: signalData.indicators,
      status: 'OPEN',                    // OPEN, WIN_TP1, WIN_TP2, LOSS, MANUAL_CLOSE
      outcome: null,
      exitPrice: null,
      pnlPct: null,
      rrActual: null,
      signalAt: signalData.timestamp,
      closedAt: null,
      marketCondition: {
        rsi: signalData.indicators?.rsi,
        volumeMultiplier: signalData.indicators?.volumeMultiplier,
        bias: signalData.bias,
      },
    };

    this.trades.push(trade);
    await this._saveTrades();
    logger.info(`💾 Trade disimpan: ${trade.id} (${trade.pair} ${trade.signal})`);
    return trade.id;
  }

  // ==========================================
  // TUTUP TRADE & RECORD HASIL
  // ==========================================
  async closeTrade(tradeId, exitPrice, outcome) {
    if (!this._initialized) await this.init();

    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade) {
      logger.warn(`⚠️ Trade ${tradeId} tidak ditemukan`);
      return;
    }

    trade.status = outcome;          // WIN_TP1, WIN_TP2, LOSS, MANUAL_CLOSE
    trade.exitPrice = exitPrice;
    trade.closedAt = new Date().toISOString();

    // Hitung PnL
    if (trade.signal === 'LONG') {
      trade.pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(3);
      const risk = trade.entryPrice - trade.sl;
      const reward = exitPrice - trade.entryPrice;
      trade.rrActual = risk > 0 ? (reward / risk).toFixed(2) : '0';
    } else {
      trade.pnlPct = ((trade.entryPrice - exitPrice) / trade.entryPrice * 100).toFixed(3);
      const risk = trade.sl - trade.entryPrice;
      const reward = trade.entryPrice - exitPrice;
      trade.rrActual = risk > 0 ? (reward / risk).toFixed(2) : '0';
    }

    await this._saveTrades();
    logger.info(`✅ Trade ${tradeId} ditutup: ${outcome} @ ${exitPrice} (PnL: ${trade.pnlPct}%)`);
  }

  // ==========================================
  // EVALUASI PERFORMA & ADJUST PARAMETER
  // ==========================================
  async evaluate() {
    if (!this._initialized) await this.init();

    const closedTrades = this.trades.filter(t => t.status !== 'OPEN');

    if (closedTrades.length < config.learning.minTradesForEval) {
      logger.info(`📊 Evaluasi skip: hanya ${closedTrades.length} trade tertutup (min: ${config.learning.minTradesForEval})`);
      return null;
    }

    // Ambil trade 30 hari terakhir
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentTrades = closedTrades.filter(t => t.closedAt > thirtyDaysAgo);
    const evalTrades = recentTrades.length >= config.learning.minTradesForEval ? recentTrades : closedTrades;

    // Hitung statistik
    const wins = evalTrades.filter(t => t.status.startsWith('WIN'));
    const losses = evalTrades.filter(t => t.status === 'LOSS');
    const winRate = evalTrades.length > 0 ? (wins.length / evalTrades.length * 100) : 0;

    // Rata-rata RR aktual
    const avgRR = evalTrades.length > 0
      ? evalTrades.reduce((sum, t) => sum + parseFloat(t.rrActual || 0), 0) / evalTrades.length
      : 0;

    // Winrate per kondisi
    const highVolTrades = evalTrades.filter(t => parseFloat(t.marketCondition?.volumeMultiplier || 0) >= 2.0);
    const highVolWins = highVolTrades.filter(t => t.status.startsWith('WIN'));
    const highVolWinRate = highVolTrades.length > 0 ? (highVolWins.length / highVolTrades.length * 100) : 0;

    logger.info(`📊 EVALUASI LEARNING SYSTEM:`);
    logger.info(`   Total trades dievaluasi: ${evalTrades.length}`);
    logger.info(`   Winrate: ${winRate.toFixed(1)}%`);
    logger.info(`   Avg RR aktual: ${avgRR.toFixed(2)}`);
    logger.info(`   Winrate high volume: ${highVolWinRate.toFixed(1)}% (dari ${highVolTrades.length} trade)`);

    // ==========================================
    // ADJUSTMENT LOGIKA
    // ==========================================
    let changed = false;
    const oldParams = { ...this.params };

    // Jika winrate rendah (<45%), perketat filter volume
    if (winRate < 45 && evalTrades.length >= 10) {
      const newVol = Math.min(2.5, this.params.volumeSpikeMultiplier + 0.1);
      if (newVol !== this.params.volumeSpikeMultiplier) {
        logger.info(`⚙️ Winrate rendah (${winRate.toFixed(1)}%) - perketat volume filter: ${this.params.volumeSpikeMultiplier} → ${newVol}`);
        this.params.volumeSpikeMultiplier = newVol;
        changed = true;
      }
    }

    // Jika winrate sangat bagus (>65%), longgarkan sedikit volume filter
    if (winRate > 65 && evalTrades.length >= 10) {
      const newVol = Math.max(1.5, this.params.volumeSpikeMultiplier - 0.05);
      if (newVol !== this.params.volumeSpikeMultiplier) {
        logger.info(`⚙️ Winrate bagus (${winRate.toFixed(1)}%) - longgarkan volume filter: ${this.params.volumeSpikeMultiplier} → ${newVol}`);
        this.params.volumeSpikeMultiplier = newVol;
        changed = true;
      }
    }

    // Jika winrate high-vol jauh lebih tinggi, perketat volume lebih agresif
    if (highVolTrades.length >= 5 && highVolWinRate > winRate + 15) {
      const newVol = Math.min(2.2, this.params.volumeSpikeMultiplier + 0.2);
      if (newVol !== this.params.volumeSpikeMultiplier) {
        logger.info(`⚙️ High-vol winrate (${highVolWinRate.toFixed(1)}%) > normal (${winRate.toFixed(1)}%) - naikkan volume filter: ${this.params.volumeSpikeMultiplier} → ${newVol}`);
        this.params.volumeSpikeMultiplier = newVol;
        changed = true;
      }
    }

    // Update timestamp evaluasi
    this.params.lastEvaluated = new Date().toISOString();
    this.params.totalEvaluations = (this.params.totalEvaluations || 0) + 1;

    if (changed) {
      await this._saveParams();
    }

    const report = {
      evaluatedAt: this.params.lastEvaluated,
      totalTrades: evalTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate.toFixed(1),
      avgRR: avgRR.toFixed(2),
      paramChanged: changed,
      oldParams: changed ? oldParams : null,
      newParams: changed ? { ...this.params } : null,
    };

    return report;
  }

  // ==========================================
  // GET PERFORMANCE STATS - untuk command /performance
  // ==========================================
  async getPerformanceStats() {
    if (!this._initialized) await this.init();

    const allTrades = this.trades;
    const openTrades = allTrades.filter(t => t.status === 'OPEN');
    const closedTrades = allTrades.filter(t => t.status !== 'OPEN');
    const wins = closedTrades.filter(t => t.status.startsWith('WIN'));
    const losses = closedTrades.filter(t => t.status === 'LOSS');
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length * 100) : 0;

    // Per pair stats
    const btcTrades = closedTrades.filter(t => t.pair.includes('BTC'));
    const solTrades = closedTrades.filter(t => t.pair.includes('SOL'));
    const btcWins = btcTrades.filter(t => t.status.startsWith('WIN'));
    const solWins = solTrades.filter(t => t.status.startsWith('WIN'));

    return {
      total: allTrades.length,
      open: openTrades.length,
      closed: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate.toFixed(1),
      btc: {
        total: btcTrades.length,
        wins: btcWins.length,
        winRate: btcTrades.length > 0 ? (btcWins.length / btcTrades.length * 100).toFixed(1) : '0',
      },
      sol: {
        total: solTrades.length,
        wins: solWins.length,
        winRate: solTrades.length > 0 ? (solWins.length / solTrades.length * 100).toFixed(1) : '0',
      },
      currentParams: this.params,
      lastEvaluated: this.params.lastEvaluated,
    };
  }

  // ==========================================
  // GET LAST SIGNAL
  // ==========================================
  getLastSignal(pair = null) {
    const filtered = pair
      ? this.trades.filter(t => t.pair === pair)
      : this.trades;

    if (filtered.length === 0) return null;
    return filtered[filtered.length - 1];
  }

  // ==========================================
  // INTERNAL - Save ke file
  // ==========================================
  async _saveTrades() {
    try {
      await fs.writeJSON(this.tradesFile, this.trades, { spaces: 2 });
    } catch (err) {
      logger.error(`❌ Gagal simpan trades: ${err.message}`);
    }
  }

  async _saveParams() {
    try {
      await fs.writeJSON(this.paramsFile, this.params, { spaces: 2 });
      logger.info('⚙️ Parameter baru disimpan');
    } catch (err) {
      logger.error(`❌ Gagal simpan params: ${err.message}`);
    }
  }

  // ==========================================
  // GET CURRENT PARAMS (untuk dipakai strategy)
  // ==========================================
  getParams() {
    return { ...this.params };
  }
}

module.exports = new LearningSystem();
