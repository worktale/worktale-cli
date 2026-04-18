import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import fs from 'fs';

function partialsPlugin() {
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const partialsDir = resolve(__dirname, 'src/partials');
        return html.replace(/<%(\w+)%>/g, (match, name) => {
          const filePath = resolve(partialsDir, `${name}.html`);
          if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8');
          }
          return match;
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), partialsPlugin()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        foundations: resolve(__dirname, 'foundations.html'),
        dailyPractice: resolve(__dirname, 'daily-practice.html'),
        aiSessions: resolve(__dirname, 'ai-sessions.html'),
        advancedCli: resolve(__dirname, 'advanced-cli.html'),
        desktop: resolve(__dirname, 'desktop.html'),
        cloud: resolve(__dirname, 'cloud.html'),
        mastery: resolve(__dirname, 'mastery.html'),
        reference: resolve(__dirname, 'reference.html'),
      },
    },
  },
});
