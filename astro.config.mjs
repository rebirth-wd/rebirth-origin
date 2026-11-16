import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, posix } from 'node:path';

// After the build: add <link rel="modulepreload"> for every chunk the page's module scripts import (gsap, the rigs),
// so they download alongside the entry scripts instead of one round trip later.
const modulePreload = () => ({
  name: 'rb-modulepreload',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const root = fileURLToPath(dir);
      const walk = async (d) => (await Promise.all((await readdir(d, { withFileTypes: true }))
        .map((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])))).flat();
      const imports = async (url, seen) => {
        const src = await readFile(join(root, url), 'utf8').catch(() => '');
        for (const m of src.matchAll(/(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) {
          const dep = posix.join(posix.dirname(url), m[1]);
          if (!seen.has(dep)) { seen.add(dep); await imports(dep, seen); }
        }
        return seen;
      };
      for (const file of (await walk(root)).filter((f) => f.endsWith('.html'))) {
        let html = await readFile(file, 'utf8');
        const entries = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]);
        const deps = new Set();
        for (const e of entries) await imports(e, deps);
        const links = [...deps].filter((d) => !entries.includes(d)).map((d) => `<link rel="modulepreload" href="${d}">`).join('');
        if (links) await writeFile(file, html.replace('</head>', `${links}</head>`));
      }
    },
  },
});

export default defineConfig({
  server: { port: 4321, host: true },
  devToolbar: { enabled: false },
  integrations: [modulePreload()],
  vite: { plugins: [tailwindcss()] },
});
