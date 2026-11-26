// Runs the site on your computer, or on a server that keeps its files. It needs no packages.
// (Vercel uses api/site.mjs instead. Both share the rules in lib/core.mjs.)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { dirname, join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { createApp, passwordIsUsable, isPagePath, reply, errorReply, HttpError, SECURITY } from './lib/core.mjs';
import { diskStore } from './lib/disk-store.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

// Read .env if present. Real environment variables win.
if (existsSync(join(ROOT, '.env'))) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || '127.0.0.1';
const LOCAL_ONLY = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const PASSWORD_OK = passwordIsUsable(PASSWORD, LOCAL_ONLY);
const CLIENT_IP_HEADER = (process.env.CLIENT_IP_HEADER || '').trim().toLowerCase();

const store = diskStore(resolve(process.env.DATA_DIR || join(ROOT, 'data')));
const app = createApp({
  store,
  password: PASSWORD,
  passwordOk: PASSWORD_OK,
  readDefaults: () => readFile(join(ROOT, 'data', 'default-content.json'), 'utf8'),
  readTemplate: () => readFile(join(ROOT, 'public', 'index.html'), 'utf8'),
  siteUrl: process.env.SITE_URL,
});

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

function send(res, { status, body, headers }) {
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) tooBig = true;
      else chunks.push(chunk);
    });
    req.on('end', () => (tooBig ? fail(new HttpError(413, 'That file is too large.')) : done(Buffer.concat(chunks))));
    req.on('error', fail);
  });
}

/**
 * Who is trying to sign in. Behind a host's proxy every visitor shares the proxy's address,
 * so one person's wrong guesses would lock out everyone. Set CLIENT_IP_HEADER to a header
 * your host fills in itself. Never name one that visitors can set, or the limit can be dodged.
 */
function visitorAddress(req) {
  const sent = CLIENT_IP_HEADER && String(req.headers[CLIENT_IP_HEADER] || '').trim();
  return sent && isIP(sent) ? sent : req.socket.remoteAddress;
}

const toRequest = (req) => ({
  method: req.method === 'HEAD' ? 'GET' : req.method,
  headers: req.headers,
  address: visitorAddress(req),
  https: req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production',
  readBody: (limit) => readBody(req, limit),
});

async function serveFile(req, res, base, relative) {
  const file = resolve(base, `.${sep}${relative}`);
  if (!file.startsWith(base + sep) || !TYPES[extname(file)]) throw new HttpError(404, 'Not found.');
  let info;
  try { info = await stat(file); } catch { throw new HttpError(404, 'Not found.'); }
  if (!info.isFile()) throw new HttpError(404, 'Not found.');
  const headers = { ...SECURITY, 'Content-Type': TYPES[extname(file)], 'Cache-Control': base === store.uploadsFolder ? 'public, max-age=31536000, immutable' : 'no-cache', 'Accept-Ranges': 'bytes' };

  // Video players ask for pieces of a file so that people can skip around.
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
    if (start > end) {
      res.writeHead(416, { ...SECURITY, 'Content-Range': `bytes */${info.size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !info.size) return res.end();
  createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith('/api/')) return send(res, await app.api(toRequest(req), path, url.searchParams));
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Not allowed.');
    if (isPagePath(path)) return send(res, await app.page(toRequest(req), path));
    if (path === '/work/') return send(res, reply(301, '', { Location: '/work' }));
    if (path === '/admin') return send(res, reply(301, '', { Location: '/admin/' }));
    if (path === '/admin/') return await serveFile(req, res, join(ROOT, 'public'), 'admin/index.html');
    if (path === '/shared/schema.mjs') return await serveFile(req, res, join(ROOT, 'shared'), 'schema.mjs');
    if (path.startsWith('/uploads/')) return await serveFile(req, res, store.uploadsFolder, path.slice('/uploads/'.length));
    return await serveFile(req, res, join(ROOT, 'public'), path.slice(1));
  } catch (error) {
    send(res, errorReply(error));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Portfolio:  http://localhost:${PORT}`);
  console.log(`Dashboard:  http://localhost:${PORT}/admin/`);
  if (!PASSWORD_OK) console.log('The dashboard is locked. Set ADMIN_PASSWORD in .env (10 characters or more).');
});
