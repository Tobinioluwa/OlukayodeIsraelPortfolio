// Prepares the files Vercel serves by itself. Not needed to run the site on your computer.
import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
// index.html is left out: the server fills in each page's title before sending it.
await cp('public', 'dist', { recursive: true, filter: (source) => !/^public[\\/]index\.html$/.test(source) });
await mkdir('dist/shared', { recursive: true });
await cp('shared/schema.mjs', 'dist/shared/schema.mjs');

// Package the code the dashboard uses to send files straight to storage.
await build({
  stdin: { contents: "export { upload } from '@vercel/blob/client';", resolveDir: '.', loader: 'js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: 'dist/vendor/blob-client.js',
  logLevel: 'info',
});
console.log('Built the files in dist/');
