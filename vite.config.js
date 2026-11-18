// Az alkalmazás logikája a src/app/*.js fájlokban van, témánként szétválasztva.
// Ezek egy közös hatókörben futnak: a build sorrendben (fájlnév szerint) összefűzi őket
// egyetlen modulba ("virtual:app"). Új fájl = új téma; a sorrendet a számozás adja.
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const APP_DIR = path.resolve('src/app');
const cfg = JSON.parse(fs.readFileSync('src/config.json', 'utf8'));

function appBundle() {
  const files = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js')).sort();
  let src = files.map(f => `// ---- ${f} ----\n` + fs.readFileSync(path.join(APP_DIR, f), 'utf8')).join('\n');
  src = src.split('/*SB_URL*/').join(cfg.supabaseUrl)
           .split('/*SB_KEY*/').join(cfg.supabaseKey)
           .split('/*BUILD*/').join(String(Math.floor(Date.now() / 1000)));
  return `export function startApp(){\n'use strict';\n${src}\n}\n`;
}

export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
  plugins: [{
    name: 'app-bundle',
    resolveId: id => (id === 'virtual:app' ? '\0virtual:app' : null),
    load: id => (id === '\0virtual:app' ? appBundle() : null),
    configureServer(server) {
      server.watcher.add(APP_DIR);
      server.watcher.on('change', f => { if (f.startsWith(APP_DIR)) { const m = server.moduleGraph.getModuleById('\0virtual:app'); if (m) server.moduleGraph.invalidateModule(m); server.ws.send({ type: 'full-reload' }); } });
    }
  }, {
    name: 'sb-in-html',
    transformIndexHtml: html => html.split('/*SB_URL*/').join(cfg.supabaseUrl)
  }]
});
