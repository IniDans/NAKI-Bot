// pm2 config for running the bot on an always-on machine (e.g. a laptop or VPS).
// Start:   npm run build && pm2 start ecosystem.config.cjs && pm2 save
// Logs:    pm2 logs naki
// Restart: pm2 restart naki   (after a new build)
module.exports = {
  apps: [
    {
      name: 'naki',
      script: 'dist/index.js',
      cwd: __dirname,
      env: { NODE_ENV: 'production' },
      autorestart: true,
      // Back off between crash restarts so a dead database or network
      // doesn't turn into a tight restart loop against Discord / cPanel.
      exp_backoff_restart_delay: 2000,
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
