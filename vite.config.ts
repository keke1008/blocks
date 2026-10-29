import { defineConfig } from 'vite';

// Relative base so the build works under the GitHub Pages sub-path (/<repo>/).
export default defineConfig({
  base: './',
});
