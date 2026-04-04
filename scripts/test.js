// scripts/test.js
// Script testing komponen - jalankan SEBELUM deploy ke VPS
// Usage: node scripts/test.js

require('dotenv').config();

const axios = require('axios');

// Warna untuk console
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function ok(msg) { console.log(`${GREEN}✅ ${msg}${RESET}`); }
function fail(msg) { console.log(`${RED}❌ ${msg}${RESET}`); }
function warn(msg) { console.log(`${YELLOW}⚠️  ${msg}${RESET}`); }
function info(msg) { console.log(`   ${msg}`); }
function header(msg) { console.log(`\n${BOLD}${msg}${RESET}`); }

let passed = 0;
let failed = 0;
let warnings = 0;

// ==========================================
// TEST 1: Cek ENV Variables
// ==========================================
async function testEnvVars() {
  header('🔧 TEST 1: Environment Variables');

  const required = [
    'TELEGRAM_BOT_TOKEN',
    'TWELVE_DATA_API_KEY',
    'OPENROUTER_API_KEY',
  ];

  let allOk = true;
  for (const key of required) {
    if (!process.env[key] || process.env[key].includes('your_') || process.env[key].includes('xxx')) {
      fail(`${key} belum diset atau masih placeholder`);
      allOk = false;
      failed++;
    } else {
      const masked = process.env[key].slice(0, 8) + '...';
      ok(`${key}: ${masked}`);
      passed++;
    }
  }

  if (!allOk) {
    warn('Pastikan file .env sudah diisi dengan benar!');
    warnings++;
  }
}

// ==========================================
// TEST 2: Test Twelve Data API
// ==========================================
async function testTwelveData() {
  header('📊 TEST 2: Twelve Data API');

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || apiKey.includes('your_')) {
    warn('Twelve Data API key tidak diset, skip test');
    warnings++;
    return;
  }

  try {
    info('Testing BTC/USD OHLCV...');
    const res = await axios.get('https://api.twelvedata.com/time_series', {
      params: {
        symbol: 'BTC/USD',
        interval: '5min',
        outputsize: 5,
        apikey: apiKey,
      },
      timeout: 15000,
    });

    if (res.data.status === 'error') {
      fail(`API error: ${res.data.message}`);
      failed++;
      return;
    }

    if (res.data.values && res.data.values.length > 0) {
      const latest = res.data.values[0];
      ok(`BTC/USD data OK - Harga terakhir: $${parseFloat(latest.close).toFixed(2)}`);
      passed++;
    } else {
      fail('Data tidak ditemukan dalam response');
      failed++;
    }

    // Test SOL
    await new Promise(r => setTimeout(r, 2000)); // Rate limit
    info('Testing SOL/USD OHLCV...');
    const res2 = await axios.get('https://api.twelvedata.com/time_series', {
      params: {
        symbol: 'SOL/USD',
        interval: '5min',
        outputsize: 5,
        apikey: apiKey,
      },
      timeout: 15000,
    });

    if (res2.data.values && res2.data.values.length > 0) {
      const latest2 = res2.data.values[0];
      ok(`SOL/USD data OK - Harga terakhir: $${parseFloat(latest2.close).toFixed(4)}`);
      passed++;
    } else {
      fail('SOL/USD data tidak ditemukan');
      failed++;
    }

  } catch (err) {
    fail(`Twelve Data connection error: ${err.message}`);
    failed++;
  }
}

// ==========================================
// TEST 3: Test OpenRouter API
// ==========================================
async function testOpenRouter() {
  header('🤖 TEST 3: OpenRouter API');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.includes('your_')) {
    warn('OpenRouter API key tidak diset, skip test');
    warnings++;
    return;
  }

  try {
    info('Testing koneksi ke OpenRouter...');
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'qwen/qwen3.6-plus:free',
        messages: [{ role: 'user', content: 'Reply with: TEST OK' }],
        max_tokens: 20,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = res.data?.choices?.[0]?.message?.content;
    if (content) {
      ok(`OpenRouter OK - Response: "${content.substring(0, 30)}"`);
      passed++;
    } else {
      fail('Response kosong dari OpenRouter');
      failed++;
    }
  } catch (err) {
    if (err.response?.status === 401) {
      fail('OpenRouter: API key tidak valid (401 Unauthorized)');
    } else if (err.response?.status === 402) {
      fail('OpenRouter: Saldo habis (402 Payment Required)');
    } else {
      fail(`OpenRouter error: ${err.message}`);
    }
    failed++;
  }
}

// ==========================================
// TEST 4: Test Telegram Bot
// ==========================================
async function testTelegram() {
  header('📱 TEST 4: Telegram Bot');

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.includes('your_') || token.includes('123456789')) {
    warn('Telegram token tidak diset, skip test');
    warnings++;
    return;
  }

  try {
    info('Testing bot token...');
    const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, {
      timeout: 10000,
    });

    if (res.data.ok) {
      const bot = res.data.result;
      ok(`Telegram Bot OK - @${bot.username} (${bot.first_name})`);
      passed++;
    } else {
      fail(`Telegram error: ${res.data.description}`);
      failed++;
    }
  } catch (err) {
    if (err.response?.status === 401) {
      fail('Telegram: Token tidak valid');
    } else {
      fail(`Telegram connection error: ${err.message}`);
    }
    failed++;
  }
}

// ==========================================
// TEST 5: Test Strategy Logic
// ==========================================
async function testStrategy() {
  header('📈 TEST 5: Strategy Logic');

  try {
    // Mock data untuk test
    const mockCandles = Array.from({ length: 20 }, (_, i) => ({
      datetime: `2024-01-01 ${String(i).padStart(2, '0')}:00:00`,
      open: 45000 + i * 10,
      high: 45050 + i * 10,
      low: 44950 + i * 10,
      close: 45020 + i * 10,
      volume: 100 + Math.random() * 50,
    }));

    // Set volume spike di candle terakhir
    mockCandles[mockCandles.length - 1].volume = 250; // > 1.8x avg ~125

    const mockEma9 = mockCandles.map((c, i) => ({ datetime: c.datetime, value: c.close - 20 }));
    const mockEma21 = mockCandles.map((c, i) => ({ datetime: c.datetime, value: c.close - 50 }));
    const mockRsi = mockCandles.map((c, i) => ({ datetime: c.datetime, value: 52 + i * 0.5 }));

    const strategy = require('../src/strategy/emaScalping');
    const data5m = { candles: mockCandles, ema9: mockEma9, ema21: mockEma21, rsi: mockRsi };
    const data15m = { candles: mockCandles, ema9: mockEma9, ema21: mockEma21, rsi: mockRsi };

    const result = strategy.analyze('BTC/USD', data5m, data15m);

    if (result && result.hasOwnProperty('signal')) {
      ok(`Strategy logic berjalan OK - Result: ${result.signal}`);
      info(`Reason: ${result.reason || '-'}`);
      passed++;
    } else {
      fail('Strategy tidak mengembalikan hasil yang benar');
      failed++;
    }
  } catch (err) {
    fail(`Strategy error: ${err.message}`);
    info(err.stack);
    failed++;
  }
}

// ==========================================
// TEST 6: Cek node_modules
// ==========================================
async function testDependencies() {
  header('📦 TEST 6: Dependencies');

  const deps = [
    'axios',
    'dotenv',
    'node-telegram-bot-api',
    'node-cron',
    'winston',
    'fs-extra',
  ];

  for (const dep of deps) {
    try {
      require(dep);
      ok(`${dep} terinstall`);
      passed++;
    } catch {
      fail(`${dep} TIDAK terinstall - jalankan: npm install`);
      failed++;
    }
  }
}

// ==========================================
// JALANKAN SEMUA TEST
// ==========================================
async function runAll() {
  console.log('\n' + '═'.repeat(50));
  console.log('  CRYPTO SIGNAL BOT - TEST SUITE');
  console.log('═'.repeat(50));

  await testDependencies();
  await testEnvVars();
  await testTwelveData();
  await testOpenRouter();
  await testTelegram();
  await testStrategy();

  console.log('\n' + '═'.repeat(50));
  console.log(`${BOLD}HASIL:${RESET}`);
  console.log(`${GREEN}✅ Passed: ${passed}${RESET}`);
  console.log(`${RED}❌ Failed: ${failed}${RESET}`);
  console.log(`${YELLOW}⚠️  Warnings: ${warnings}${RESET}`);
  console.log('═'.repeat(50));

  if (failed === 0) {
    console.log(`\n${GREEN}${BOLD}🎉 Semua test passed! Bot siap dijalankan.${RESET}`);
    console.log(`   Jalankan: npm start`);
    console.log(`   Atau PM2: pm2 start ecosystem.config.js\n`);
  } else {
    console.log(`\n${RED}${BOLD}⚠️  Ada ${failed} test yang gagal. Perbaiki sebelum deploy!${RESET}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
