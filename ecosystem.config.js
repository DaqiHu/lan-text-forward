module.exports = {
  apps: [{
    name: 'lan-paste',
    script: 'dist/server.js',
    env: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '~/lan-paste-error.log',
    out_file: '~/lan-paste-out.log',
    merge_logs: true,
    max_restarts: 10,
    restart_delay: 3000,
  }],
};
