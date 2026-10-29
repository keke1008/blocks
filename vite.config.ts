import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Emits sw.js from sw/sw.js with this build's file list and a version derived
 * from it, so the service worker changes exactly when the app does.
 */
function serviceWorker(): Plugin {
  return {
    name: 'blocks-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = ['manifest.webmanifest', ...readdirSync('public/icons').map((f) => `icons/${f}`)];
      const files = [...new Set([...built, ...publicFiles])].sort();
      const version = createHash('sha256')
        .update(files.join('\n'))
        .update(String(bundle['index.html']?.type === 'asset' ? bundle['index.html'].source : ''))
        .digest('hex')
        .slice(0, 12);
      const precache = ['./', ...files.map((f) => `./${f}`)];
      const source = readFileSync('sw/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// Relative base so the build works under the GitHub Pages sub-path (/<repo>/).
export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
});
