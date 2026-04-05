// src/data/binance.js
// Binance Public API Client - Gratis, tanpa limit harian
// Replace Twelve Data sepenuhnya

const axios = require('axios');
const technicalindicators = require('technicalindicators');
const config = require('../../config');
const logger = require('../utils/logger');

class BinanceClient {
  constructor() {
    this.baseUrl = 'https://api.binance.com/api/v3';
  }

  // === HELPER: Ambil raw klines dari Binance ===
  async _getKlines(symbol, interval, limit = 100) {
    try {
      const res = await axios.get(`${this.baseUrl}/klines`, {
        params: { symbol, interval, limit },
        timeout: 10000,
      });

      // Binance format: [openTime, open, high, low, close, volume, ...]
      const candles = res.data.map(c => ({
        datetime: new Date(c[0]).toISOString(),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));

      return candles;
    } catch (err) {
      logger.error(`❌ Binance klines error ${symbol} ${interval}: ${err.message}`);
      throw err;
    }
  }

  // === GET OHLCV (sama seperti Twelve Data) ===
  async getOHLCV(symbol, interval, outputsize = 50) {
    logger.info(`📡 Binance: Ambil OHLCV ${symbol} ${interval}...`);
    const candles = await this._getKlines(symbol, interval, outputsize);
    return candles;
  }

  // === HITUNG EMA (menggunakan technicalindicators) ===
  async getEMA(symbol, interval, period, outputsize = 50) {
    const candles = await this._getKlines(symbol, interval, outputsize + period);
    const closes = candles.map(c => c.close);

    const emaInput = { values: closes, period };
    const emaValues = technicalindicators.EMA.calculate(emaInput);

    // Ambil hanya yang kita butuh (sesuaikan index)
    const result = candles.slice(-emaValues.length).map((candle, i) => ({
      datetime: candle.datetime,
      value: parseFloat(emaValues[i].toFixed(8)),
    }));

    return result;
  }

  // === HITUNG RSI ===
  async getRSI(symbol, interval, period = 14, outputsize = 50) {
    const candles = await this._getKlines(symbol, interval, outputsize + period);
    const closes = candles.map(c => c.close);

    const rsiInput = { values: closes, period };
    const rsiValues = technicalindicators.RSI.calculate(rsiInput);

    const result = candles.slice(-rsiValues.length).map((candle, i) => ({
      datetime: candle.datetime,
      value: parseFloat(rsiValues[i].toFixed(2)),
    }));

    return result;
  }

  // === AMBIL SEMUA INDIKATOR SEKALIGUS (paling efisien) ===
  async getAllIndicators(symbol, interval) {
    logger.info(`📡 Binance: Mengambil semua data ${symbol} ${interval}...`);

    const candles = await this._getKlines(symbol, interval, config.engine.candleLimit);

    const ema9 = await this.getEMA(symbol, interval, config.strategy.ema.fast, config.engine.candleLimit);
    const ema21 = await this.getEMA(symbol, interval, config.strategy.ema.slow, config.engine.candleLimit);
    const rsi = await this.getRSI(symbol, interval, config.strategy.rsi.period, config.engine.candleLimit);

    return {
      symbol,
      interval,
      candles,
      ema9,
      ema21,
      rsi,
      fetchedAt: new Date().toISOString(),
    };
  }

  // === HARGA TERKINI ===
  async getCurrentPrice(symbol) {
    try {
      const res = await axios.get(`${this.baseUrl}/ticker/price`, {
        params: { symbol },
        timeout: 8000,
      });
      return parseFloat(res.data.price);
    } catch (err) {
      logger.error(`❌ Binance price error ${symbol}: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new BinanceClient();
