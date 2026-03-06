import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import fs from 'fs';

// Plugin to handle <%header%> and <%footer%> partial templates
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
        docs: resolve(__dirname, 'docs.html'),
        terms: resolve(__dirname, 'terms.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        contact: resolve(__dirname, 'contact.html'),
        brand: resolve(__dirname, 'brand.html'),
      },
    },
  },
});
