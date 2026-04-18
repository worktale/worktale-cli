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
        landerNda: resolve(__dirname, 'lander-nda.html'),
        landerAi: resolve(__dirname, 'lander-ai.html'),
        landerFreelance: resolve(__dirname, 'lander-freelance.html'),
        alternatives: resolve(__dirname, 'worktale-alternatives.html'),
        vsWakatime: resolve(__dirname, 'worktale-vs-wakatime.html'),
        vsRescuetime: resolve(__dirname, 'worktale-vs-rescuetime.html'),
        vsActivitywatch: resolve(__dirname, 'worktale-vs-activitywatch.html'),
        vsGitStats: resolve(__dirname, 'worktale-vs-git-stats.html'),
        blog: resolve(__dirname, 'blog.html'),
        plugin: resolve(__dirname, 'plugin.html'),
        thanks: resolve(__dirname, 'thanks.html'),
        pricing: resolve(__dirname, 'pricing.html'),
        blogLaunch: resolve(__dirname, 'blog/worktale-v1-launch.html'),
        blogV11Agents: resolve(__dirname, 'blog/worktale-v1-1-ai-agents.html'),
        blogCloudBeta: resolve(__dirname, 'blog/worktale-cloud-beta.html'),
        blogV14Desktop: resolve(__dirname, 'blog/worktale-v1-4-desktop-ai-sessions.html'),
      },
    },
  },
});
