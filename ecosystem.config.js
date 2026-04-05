// ecosystem.config.js
// Konfigurasi PM2 untuk menjalankan bot di background

module.exports = {
  apps: [
    {
      name: 'btc-sol-ai-bot',
      script: 'index.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000,    // Tunggu 5 detik sebelum restart
      max_restarts: 10,       // Maksimal restart otomatis
      min_uptime: '30s',      // Bot dianggap stabil setelah 30 detik
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
