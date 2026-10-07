import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { cpSync, existsSync } from 'fs';

/**
 * หน้าเว็บทุกหน้าโหลด JS แบบ <script src="/..."> ธรรมดา (ไม่ใช่ type="module")
 * Vite จะไม่ bundle และไม่คัดลอกไฟล์เหล่านี้ไปที่ dist ให้เอง
 * ปลั๊กอินนี้จึงคัดลอกโฟลเดอร์ที่จำเป็นไปไว้ใน dist หลัง build
 * เพื่อให้ dist ใช้งาน/Deploy ได้ครบ
 */
const STATIC_DIRS = ['core', 'auth', 'services', 'js', 'css', 'images', 'icons', 'src/assets'];
const STATIC_FILES = ['manifest.json'];

function copyStaticScripts(): Plugin {
  return {
    name: 'copy-static-scripts',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      for (const item of [...STATIC_DIRS, ...STATIC_FILES]) {
        const from = resolve(__dirname, item);
        if (!existsSync(from)) continue;
        cpSync(from, resolve(outDir, item), {
          recursive: true,
          filter: (src) => !/\.(bak|md|txt)$/i.test(src),
        });
      }
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
  },
  plugins: [copyStaticScripts()],
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
