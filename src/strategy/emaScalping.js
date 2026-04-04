// src/strategy/emaScalping.js
// Implementasi PENUH strategi 5-Minute EMA Pullback Scalping
// Jangan ubah logic ini tanpa memahami strategi sepenuhnya!

const config = require('../../config');
const logger = require('../utils/logger');

class EMAScalpingStrategy {
  constructor() {
    this.cfg = config.strategy;
  }

  // ==========================================
  // UTILITAS KALKULASI
  // ==========================================

  // Hitung rata-rata volume dari N candle terakhir
  _avgVolume(candles, lookback) {
    if (candles.length < lookback) return 0;
    const recent = candles.slice(-lookback);
    const total = recent.reduce((sum, c) => sum + c.volume, 0);
    return total / lookback;
  }

  // Ambil nilai terakhir dari array indikator
  _last(arr, n = 1) {
    if (!arr || arr.length < n) return null;
    return arr[arr.length - n];
  }

  // Ambil nilai dari 2 candle sebelumnya (untuk cek trend RSI)
  _prev(arr) {
    return this._last(arr, 2);
  }

  // Cek apakah harga berada di dekat EMA (dalam range pullback)
  _isPullbackToEMA(price, ema9Val, ema21Val, direction) {
    // Range pullback: harga dalam 0.3% dari EMA 9 atau EMA 21
    const pullbackTolerance = 0.003; // 0.3%

    const distEma9 = Math.abs(price - ema9Val) / ema9Val;
    const distEma21 = Math.abs(price - ema21Val) / ema21Val;

    // Untuk LONG: harga pullback dari atas, mendekati EMA dari atas
    if (direction === 'LONG') {
      // Harga harus di atas atau sangat dekat EMA 21, dan mendekati EMA 9 atau EMA 21
      return (distEma9 <= pullbackTolerance || distEma21 <= pullbackTolerance);
    }
    
    // Untuk SHORT: harga pullback dari bawah, mendekati EMA dari bawah
    if (direction === 'SHORT') {
      return (distEma9 <= pullbackTolerance || distEma21 <= pullbackTolerance);
    }

    return false;
  }

  // ==========================================
  // ANALISA BIAS 15 MENIT
  // ==========================================
  analyzeBias15m(data15m) {
    const { candles, ema21 } = data15m;

    if (!candles || !ema21 || candles.length < 5) {
      return { bias: 'NEUTRAL', reason: 'Data 15m tidak cukup' };
    }

    const lastCandle = this._last(candles);
    const lastEma21 = this._last(ema21);

    if (!lastCandle || !lastEma21) {
      return { bias: 'NEUTRAL', reason: 'Tidak ada data candle/EMA21' };
    }

    const currentPrice = lastCandle.close;
    const ema21Val = lastEma21.value;

    // Bias BULLISH: harga penutupan > EMA 21 di 15m
    if (currentPrice > ema21Val) {
      const pctAbove = ((currentPrice - ema21Val) / ema21Val * 100).toFixed(3);
      return {
        bias: 'BULLISH',
        reason: `Harga ${currentPrice.toFixed(2)} > EMA21(${ema21Val.toFixed(2)}) di 15m (+${pctAbove}%)`,
        currentPrice,
        ema21Val,
      };
    }

    // Bias BEARISH: harga penutupan < EMA 21 di 15m
    if (currentPrice < ema21Val) {
      const pctBelow = ((ema21Val - currentPrice) / ema21Val * 100).toFixed(3);
      return {
        bias: 'BEARISH',
        reason: `Harga ${currentPrice.toFixed(2)} < EMA21(${ema21Val.toFixed(2)}) di 15m (-${pctBelow}%)`,
        currentPrice,
        ema21Val,
      };
    }

    return { bias: 'NEUTRAL', reason: 'Harga tepat di EMA21' };
  }

  // ==========================================
  // ANALISA KONDISI ENTRY 5 MENIT
  // ==========================================
  analyzeEntry5m(data5m, bias) {
    const { candles, ema9, ema21, rsi } = data5m;

    if (!candles || !ema9 || !ema21 || !rsi) {
      return { signal: 'NONE', reason: 'Data 5m tidak lengkap' };
    }

    if (candles.length < 15 || ema9.length < 3 || ema21.length < 3 || rsi.length < 3) {
      return { signal: 'NONE', reason: 'Jumlah data 5m tidak cukup' };
    }

    // Ambil data terbaru
    const lastCandle = this._last(candles);
    const prevCandle = this._prev(candles);
    const lastEma9 = this._last(ema9);
    const lastEma21 = this._last(ema21);
    const lastRsi = this._last(rsi);
    const prevRsi = this._prev(rsi);

    if (!lastCandle || !lastEma9 || !lastEma21 || !lastRsi) {
      return { signal: 'NONE', reason: 'Data terbaru tidak tersedia' };
    }

    const price = lastCandle.close;
    const ema9Val = lastEma9.value;
    const ema21Val = lastEma21.value;
    const rsiVal = lastRsi.value;
    const rsiPrevVal = prevRsi ? prevRsi.value : rsiVal;

    // Hitung volume
    const avgVol = this._avgVolume(candles, this.cfg.volume.lookback);
    const currentVol = lastCandle.volume;
    const volMultiplier = avgVol > 0 ? currentVol / avgVol : 0;
    const volumeSpike = volMultiplier >= this.cfg.volume.spikeMultiplier;

    // ==========================================
    // LOGIC ENTRY LONG
    // ==========================================
    if (bias === 'BULLISH') {
      const checks = {
        // Kondisi 1: EMA 9 > EMA 21 di 5m (trend up)
        emaTrendUp: ema9Val > ema21Val,
        // Kondisi 2: Harga pullback ke EMA 9 / EMA 21 (5m)
        pullbackToEMA: this._isPullbackToEMA(price, ema9Val, ema21Val, 'LONG'),
        // Kondisi 3: Candle close DI ATAS EMA 9
        closeAboveEma9: price > ema9Val,
        // Kondisi 4: RSI > 50 dan naik (tidak overbought)
        rsiOk: rsiVal > this.cfg.rsi.minLong && rsiVal <= 70 && rsiVal > rsiPrevVal,
        // Kondisi 5: Volume spike >= 1.8x rata-rata
        volumeOk: volumeSpike,
      };

      const failedChecks = Object.entries(checks)
        .filter(([, v]) => !v)
        .map(([k]) => k);

      if (failedChecks.length === 0) {
        return {
          signal: 'LONG',
          entryPrice: price,
          ema9: ema9Val,
          ema21: ema21Val,
          rsi: rsiVal,
          volume: currentVol,
          avgVolume: avgVol,
          volumeMultiplier: volMultiplier.toFixed(2),
          checks,
          reasons: this._buildLongReasons(price, ema9Val, ema21Val, rsiVal, volMultiplier),
        };
      }

      return {
        signal: 'NONE',
        reason: `Long conditions tidak terpenuhi: ${failedChecks.join(', ')}`,
        checks,
        price,
        ema9: ema9Val,
        ema21: ema21Val,
        rsi: rsiVal,
        volMultiplier: volMultiplier.toFixed(2),
      };
    }

    // ==========================================
    // LOGIC ENTRY SHORT
    // ==========================================
    if (bias === 'BEARISH') {
      const checks = {
        // Kondisi 1: EMA 9 < EMA 21 di 5m (trend down)
        emaTrendDown: ema9Val < ema21Val,
        // Kondisi 2: Harga pullback ke EMA 9 / EMA 21 (5m) dari bawah
        pullbackToEMA: this._isPullbackToEMA(price, ema9Val, ema21Val, 'SHORT'),
        // Kondisi 3: Candle close DI BAWAH EMA 9
        closeBelowEma9: price < ema9Val,
        // Kondisi 4: RSI < 50 dan turun (tidak oversold)
        rsiOk: rsiVal < this.cfg.rsi.maxShort && rsiVal >= 30 && rsiVal < rsiPrevVal,
        // Kondisi 5: Volume spike >= 1.8x rata-rata
        volumeOk: volumeSpike,
      };

      const failedChecks = Object.entries(checks)
        .filter(([, v]) => !v)
        .map(([k]) => k);

      if (failedChecks.length === 0) {
        return {
          signal: 'SHORT',
          entryPrice: price,
          ema9: ema9Val,
          ema21: ema21Val,
          rsi: rsiVal,
          volume: currentVol,
          avgVolume: avgVol,
          volumeMultiplier: volMultiplier.toFixed(2),
          checks,
          reasons: this._buildShortReasons(price, ema9Val, ema21Val, rsiVal, volMultiplier),
        };
      }

      return {
        signal: 'NONE',
        reason: `Short conditions tidak terpenuhi: ${failedChecks.join(', ')}`,
        checks,
        price,
        ema9: ema9Val,
        ema21: ema21Val,
        rsi: rsiVal,
        volMultiplier: volMultiplier.toFixed(2),
      };
    }

    return { signal: 'NONE', reason: `Bias NEUTRAL, skip` };
  }

  // ==========================================
  // KALKULASI LEVEL ENTRY, SL, TP
  // ==========================================
  calculateLevels(signal, entryPrice) {
    const slPct = this.cfg.risk.slPercent / 100;
    const tp1Ratio = this.cfg.risk.tp1Ratio;
    const tp2Ratio = this.cfg.risk.tp2Ratio;

    if (signal === 'LONG') {
      const sl = entryPrice * (1 - slPct);
      const slDistance = entryPrice - sl;
      const tp1 = entryPrice + (slDistance * tp1Ratio);
      const tp2 = entryPrice + (slDistance * tp2Ratio);

      return {
        entry: entryPrice,
        sl: parseFloat(sl.toFixed(6)),
        tp1: parseFloat(tp1.toFixed(6)),
        tp2: parseFloat(tp2.toFixed(6)),
        slPct: (slPct * 100).toFixed(2),
        rr1: tp1Ratio,
        rr2: tp2Ratio,
      };
    }

    if (signal === 'SHORT') {
      const sl = entryPrice * (1 + slPct);
      const slDistance = sl - entryPrice;
      const tp1 = entryPrice - (slDistance * tp1Ratio);
      const tp2 = entryPrice - (slDistance * tp2Ratio);

      return {
        entry: entryPrice,
        sl: parseFloat(sl.toFixed(6)),
        tp1: parseFloat(tp1.toFixed(6)),
        tp2: parseFloat(tp2.toFixed(6)),
        slPct: (slPct * 100).toFixed(2),
        rr1: tp1Ratio,
        rr2: tp2Ratio,
      };
    }

    return null;
  }

  // ==========================================
  // FULL ANALYSIS - Gabungan semua analisa
  // ==========================================
  analyze(pair, data5m, data15m) {
    try {
      // 1. Analisa bias 15m
      const biasResult = this.analyzeBias15m(data15m);
      logger.info(`📊 [${pair}] Bias 15m: ${biasResult.bias} - ${biasResult.reason}`);

      if (biasResult.bias === 'NEUTRAL') {
        return {
          pair,
          signal: 'NONE',
          reason: `Bias NEUTRAL: ${biasResult.reason}`,
          timestamp: new Date().toISOString(),
        };
      }

      // 2. Analisa entry 5m berdasarkan bias
      const entryResult = this.analyzeEntry5m(data5m, biasResult.bias);
      logger.info(`📈 [${pair}] Entry 5m: ${entryResult.signal} - ${entryResult.reason || 'Signal ditemukan'}`);

      if (entryResult.signal === 'NONE') {
        return {
          pair,
          signal: 'NONE',
          reason: entryResult.reason,
          bias: biasResult.bias,
          debug: {
            price: entryResult.price,
            ema9: entryResult.ema9,
            ema21: entryResult.ema21,
            rsi: entryResult.rsi,
            volMultiplier: entryResult.volMultiplier,
            checks: entryResult.checks,
          },
          timestamp: new Date().toISOString(),
        };
      }

      // 3. Hitung level SL & TP
      const levels = this.calculateLevels(entryResult.signal, entryResult.entryPrice);

      // 4. Gabungkan hasil
      return {
        pair,
        signal: entryResult.signal,
        bias: biasResult.bias,
        entryPrice: entryResult.entryPrice,
        levels,
        indicators: {
          ema9: entryResult.ema9,
          ema21: entryResult.ema21,
          rsi: entryResult.rsi,
          volume: entryResult.volume,
          avgVolume: entryResult.avgVolume,
          volumeMultiplier: entryResult.volumeMultiplier,
        },
        reasons: entryResult.reasons,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      logger.error(`❌ Error analisa ${pair}: ${err.message}`);
      return {
        pair,
        signal: 'NONE',
        reason: `Error: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ==========================================
  // FORMAT PESAN SIGNAL
  // ==========================================
  formatSignalMessage(result) {
    const { pair, signal, bias, entryPrice, levels, indicators, reasons, timestamp } = result;

    if (!signal || signal === 'NONE') return null;

    const emoji = signal === 'LONG' ? '🟢' : '🔴';
    const biasEmoji = bias === 'BULLISH' ? '📈' : '📉';
    const signalEmoji = signal === 'LONG' ? '⬆️' : '⬇️';

    const time = new Date(timestamp).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false,
    });

    const msg = [
      `${emoji} *SIGNAL ${signal} — ${pair}*`,
      ``,
      `🕐 *Waktu:* ${time} WIB`,
      `📊 *Bias 15m:* ${biasEmoji} ${bias}`,
      ``,
      `💰 *LEVEL ENTRY:*`,
      `▪️ Entry  : \`${entryPrice.toFixed(pair.includes('BTC') ? 2 : 4)}\``,
      `🛑 SL    : \`${levels.sl.toFixed(pair.includes('BTC') ? 2 : 4)}\` (-${levels.slPct}%)`,
      `🎯 TP1   : \`${levels.tp1.toFixed(pair.includes('BTC') ? 2 : 4)}\` (RR 1:${levels.rr1})`,
      `🎯 TP2   : \`${levels.tp2.toFixed(pair.includes('BTC') ? 2 : 4)}\` (RR 1:${levels.rr2})`,
      ``,
      `📉 *INDIKATOR:*`,
      `▪️ EMA9   : \`${indicators.ema9.toFixed(2)}\``,
      `▪️ EMA21  : \`${indicators.ema21.toFixed(2)}\``,
      `▪️ RSI14  : \`${indicators.rsi.toFixed(1)}\``,
      `▪️ Volume : \`${indicators.volumeMultiplier}x\` rata-rata`,
      ``,
      `🧠 *ALASAN ENTRY:*`,
      ...reasons.map(r => `▪️ ${r}`),
      ``,
      `⚠️ _Signal ini BUKAN saran finansial. Selalu lakukan analisa sendiri._`,
    ].join('\n');

    return msg;
  }

  // ==========================================
  // HELPERS - Build reason strings
  // ==========================================
  _buildLongReasons(price, ema9, ema21, rsi, volMult) {
    return [
      `Bias 15m BULLISH (harga di atas EMA21)`,
      `Harga pullback ke area EMA9/EMA21 di 5m`,
      `Candle close di atas EMA9 (${price.toFixed(2)} > ${ema9.toFixed(2)})`,
      `RSI ${rsi.toFixed(1)} > 50 dan trending naik`,
      `Volume spike ${volMult.toFixed(2)}x rata-rata (min 1.8x)`,
    ];
  }

  _buildShortReasons(price, ema9, ema21, rsi, volMult) {
    return [
      `Bias 15m BEARISH (harga di bawah EMA21)`,
      `Harga pullback ke area EMA9/EMA21 di 5m`,
      `Candle close di bawah EMA9 (${price.toFixed(2)} < ${ema9.toFixed(2)})`,
      `RSI ${rsi.toFixed(1)} < 50 dan trending turun`,
      `Volume spike ${volMult.toFixed(2)}x rata-rata (min 1.8x)`,
    ];
  }
}

module.exports = new EMAScalpingStrategy();
