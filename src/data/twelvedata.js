// src/data/twelvedata.js
// Client untuk Twelve Data API - mengambil data OHLCV, EMA, RSI

const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');

class TwelveDataClient {
  constructor() {
    this.apiKey = config.twelveData.apiKey;
    this.baseUrl = config.twelveData.baseUrl;

    // Rate limiter sederhana - tracking request per menit
    this.requestCount = 0;
    this.requestWindowStart = Date.now();
    this.maxRequestsPerMinute = 7; // Free tier limit 8/menit, kita pakai 7 untuk safety

    // Cache sederhana untuk mengurangi request berulang
    this.cache = new Map();
    this.cacheTtlMs = 30000; // Cache 30 detik
  }

  // ---- Rate Limiter ----
  async _waitForRateLimit() {
    const now = Date.now();
    const windowElapsed = now - this.requestWindowStart;

    // Reset window setiap menit
    if (windowElapsed > 60000) {
      this.requestCount = 0;
      this.requestWindowStart = now;
    }

    // Jika sudah mendekati limit, tunggu hingga window berikutnya
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitMs = 60000 - windowElapsed + 1000; // +1 detik buffer
      logger.info(`⏳ Rate limit tercapai, menunggu ${Math.ceil(waitMs / 1000)} detik...`);
      await new Promise(r => setTimeout(r, waitMs));
      this.requestCount = 0;
      this.requestWindowStart = Date.now();
    }
  }

  // ---- HTTP Request dengan retry ----
  async _request(endpoint, params = {}) {
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
    
    // Cek cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTtlMs) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    await this._waitForRateLimit();

    const url = `${this.baseUrl}${endpoint}`;
    const fullParams = { ...params, apikey: this.apiKey };

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.requestCount++;
        const response = await axios.get(url, {
          params: fullParams,
          timeout: 15000,
        });

        const data = response.data;

        // Cek error dari API
        if (data.status === 'error' || data.code) {
          throw new Error(`API Error: ${data.message || JSON.stringify(data)}`);
        }

        // Simpan ke cache
        this.cache.set(cacheKey, { data, timestamp: Date.now() });

        return data;
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          logger.warn(`⚠️ Request gagal (attempt ${attempt}/3): ${err.message}`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }

    throw new Error(`Request gagal setelah 3 percobaan: ${lastError.message}`);
  }

  // ---- Ambil data OHLCV (candlestick) ----
  async getOHLCV(symbol, interval, outputsize = 50) {
    try {
      const data = await this._request('/time_series', {
        symbol,
        interval,
        outputsize,
        format: 'JSON',
      });

      if (!data.values || !Array.isArray(data.values)) {
        throw new Error(`Data OHLCV tidak valid untuk ${symbol} ${interval}`);
      }

      // Balik array supaya index 0 = candle terlama, index -1 = terbaru
      const candles = data.values.reverse().map(v => ({
        datetime: v.datetime,
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume),
      }));

      return candles;
    } catch (err) {
      logger.error(`❌ Gagal ambil OHLCV ${symbol} ${interval}: ${err.message}`);
      throw err;
    }
  }

  // ---- Ambil nilai EMA ----
  async getEMA(symbol, interval, period, outputsize = 50) {
    try {
      const data = await this._request('/ema', {
        symbol,
        interval,
        time_period: period,
        outputsize,
        format: 'JSON',
      });

      if (!data.values || !Array.isArray(data.values)) {
        throw new Error(`Data EMA tidak valid untuk ${symbol}`);
      }

      // Return array dari nilai EMA (terlama ke terbaru)
      const values = data.values.reverse().map(v => ({
        datetime: v.datetime,
        value: parseFloat(v.ema),
      }));

      return values;
    } catch (err) {
      logger.error(`❌ Gagal ambil EMA${period} ${symbol}: ${err.message}`);
      throw err;
    }
  }

  // ---- Ambil nilai RSI ----
  async getRSI(symbol, interval, period = 14, outputsize = 50) {
    try {
      const data = await this._request('/rsi', {
        symbol,
        interval,
        time_period: period,
        outputsize,
        format: 'JSON',
      });

      if (!data.values || !Array.isArray(data.values)) {
        throw new Error(`Data RSI tidak valid untuk ${symbol}`);
      }

      const values = data.values.reverse().map(v => ({
        datetime: v.datetime,
        value: parseFloat(v.rsi),
      }));

      return values;
    } catch (err) {
      logger.error(`❌ Gagal ambil RSI ${symbol}: ${err.message}`);
      throw err;
    }
  }

  // ---- Ambil semua data yang dibutuhkan sekaligus ----
  // Mengembalikan semua indikator untuk satu pair & timeframe
  async getAllIndicators(symbol, interval) {
    logger.info(`📡 Mengambil data ${symbol} ${interval}...`);

    const cfg = config.strategy;

    try {
      // Ambil OHLCV terlebih dahulu
      const candles = await this.getOHLCV(symbol, interval, config.engine.candleLimit);
      
      // Ambil EMA 9 dan EMA 21
      const ema9 = await this.getEMA(symbol, interval, cfg.ema.fast, config.engine.candleLimit);
      const ema21 = await this.getEMA(symbol, interval, cfg.ema.slow, config.engine.candleLimit);
      
      // Ambil RSI 14
      const rsi = await this.getRSI(symbol, interval, cfg.rsi.period, config.engine.candleLimit);

      return {
        symbol,
        interval,
        candles,
        ema9,
        ema21,
        rsi,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.error(`❌ Gagal ambil semua indikator ${symbol} ${interval}: ${err.message}`);
      throw err;
    }
  }

  // ---- Ambil harga terkini ----
  async getCurrentPrice(symbol) {
    try {
      const data = await this._request('/price', {
        symbol,
        format: 'JSON',
      });

      return parseFloat(data.price);
    } catch (err) {
      logger.error(`❌ Gagal ambil harga ${symbol}: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new TwelveDataClient();
