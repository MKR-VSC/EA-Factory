import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        admin: resolve(__dirname, 'pages/admin-panel.html'),
        accounting: resolve(__dirname, 'pages/accounting-panel.html'),
        supervisorDashboard: resolve(__dirname, 'pages/supervisor-dashboard.html'),
        supervisorDailyReview: resolve(__dirname, 'pages/supervisor-daily-review.html'),
        factorySettings: resolve(__dirname, 'pages/factory-settings.html'),
        formDepartment: resolve(__dirname, 'pages/form-department.html'),
        prForm: resolve(__dirname, 'pages/pr-form.html'),
        qrSuccess: resolve(__dirname, 'pages/qr-success.html'),
      },
    },
  },
});
