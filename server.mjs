// Small web server with no dependencies: serves the site, saves content and uploads.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename, readdir, unlink, stat } from 'node:fs/promises';
import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { dirname, join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanContent, projectSlugs } from './shared/schema.mjs';

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
const DATA = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const UPLOADS = join(DATA, 'uploads');
const BACKUPS = join(DATA, 'backups');
const CONTENT = join(DATA, 'content.json');
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const LOCAL_ONLY = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
// The sample password in .env.example only works on your own computer.
const PASSWORD_OK = PASSWORD.length >= 10 && (LOCAL_ONLY || !PASSWORD.startsWith('local-test-only'));
const SESSION_MS = 8 * 60 * 60 * 1000;

const sessions = new Map();
const failures = new Map();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; media-src 'self' https:; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, status, value, headers = {}) => send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json', ...headers });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
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

async function readJson(req, limit) {
  const body = await readBody(req, limit);
  try { return JSON.parse(body.toString('utf8')); } catch { throw new HttpError(400, 'That request could not be read.'); }
}

async function loadContent() {
  const file = existsSync(CONTENT) ? CONTENT : join(ROOT, 'data', 'default-content.json');
  return cleanContent(JSON.parse(await readFile(file, 'utf8')));
}

async function saveContent(content) {
  await mkdir(BACKUPS, { recursive: true });
  if (existsSync(CONTENT)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(join(BACKUPS, `${stamp}.json`), await readFile(CONTENT));
    const old = (await readdir(BACKUPS)).sort().slice(0, -20);
    await Promise.all(old.map((name) => unlink(join(BACKUPS, name))));
  }
  // Write to a temporary file first so a crash cannot leave half a file behind.
  await writeFile(`${CONTENT}.tmp`, JSON.stringify(content, null, 2));
  await rename(`${CONTENT}.tmp`, CONTENT);
}

const cookie = (req, name) => (req.headers.cookie || '').split(';').map((p) => p.trim().split('=')).find(([k]) => k === name)?.[1];

function signedIn(req) {
  const token = cookie(req, 'session');
  const expires = token && sessions.get(token);
  if (!expires || expires < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const sessionCookie = (req, token, maxAge) => {
  const https = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  return `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
};

const hash = (value) => createHash('sha256').update(String(value)).digest();

/** Work out the image type from the file's first bytes, not from its name. */
function imageType(b) {
  if (b.length < 12) return null;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (/^GIF8[79]a/.test(b.toString('ascii', 0, 6))) return '.gif';
  return null;
}

/** MP4 or WebM, judged by the file's first bytes. */
function videoType(b) {
  if (b.length < 12) return null;
  if (b.toString('ascii', 4, 8) === 'ftyp' && /^(isom|iso[2-9]|mp4[12]|avc1|M4V |dash|MSNV)$/.test(b.toString('ascii', 8, 12))) return '.mp4';
  if (b.readUInt32BE(0) === 0x1a45dfa3) return '.webm';
  return null;
}

const MB = 1024 * 1024;

async function api(req, res, path) {
  if (req.method === 'GET' && path === '/api/content') return json(res, 200, await loadContent());
  if (req.method === 'GET' && path === '/api/session') return json(res, 200, { signedIn: signedIn(req), ready: PASSWORD_OK });

  if (req.method === 'GET') throw new HttpError(404, 'Not found.');
  if (!sameOrigin(req)) throw new HttpError(403, 'This request came from another website.');

  if (req.method === 'POST' && path === '/api/login') {
    if (!PASSWORD_OK) throw new HttpError(503, 'Set ADMIN_PASSWORD (10 characters or more) and restart the server.');
    const who = req.socket.remoteAddress;
    const record = failures.get(who);
    if (record && record.count >= 8 && record.until > Date.now()) throw new HttpError(429, 'Too many tries. Wait 15 minutes and try again.');
    const { password } = (await readJson(req, 4096)) || {};
    if (!timingSafeEqual(hash(password), hash(PASSWORD))) {
      const count = record && record.until > Date.now() ? record.count + 1 : 1;
      failures.set(who, { count, until: Date.now() + 15 * 60 * 1000 });
      throw new HttpError(401, 'That password is not right.');
    }
    failures.delete(who);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_MS);
    return json(res, 200, { signedIn: true }, { 'Set-Cookie': sessionCookie(req, token, SESSION_MS / 1000) });
  }

  if (!signedIn(req)) throw new HttpError(401, 'Sign in again to continue.');

  if (req.method === 'POST' && path === '/api/logout') {
    sessions.delete(cookie(req, 'session'));
    return json(res, 200, { signedIn: false }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (req.method === 'PUT' && path === '/api/content') {
    const input = await readJson(req, 1024 * 1024);
    if (!input?.site || !input?.hero) throw new HttpError(400, 'The content is incomplete, so nothing was saved.');
    const content = cleanContent(input);
    await saveContent(content);
    return json(res, 200, content);
  }
  if (req.method === 'POST' && path === '/api/upload') {
    const body = await readBody(req, 100 * MB);
    const picture = imageType(body);
    const ext = picture || videoType(body);
    if (!ext) throw new HttpError(415, 'Upload a PNG, JPG, WebP or GIF image, or an MP4 or WebM video.');
    if (picture && body.length > 5 * MB) throw new HttpError(413, 'Images can be up to 5 MB.');
    await mkdir(UPLOADS, { recursive: true });
    const name = randomBytes(12).toString('hex') + ext;
    await writeFile(join(UPLOADS, name), body);
    return json(res, 201, { url: `/uploads/${name}` });
  }
  throw new HttpError(404, 'Not found.');
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Put the title and link preview details into the HTML so search engines see them. */
async function sitePage(req, path) {
  const { site, work } = await loadContent();
  let status = 200;
  const page = { title: site.pageTitle, description: site.description, image: site.shareImage };
  if (path === '/work') page.title = `All projects | ${site.name}`;
  else if (path.startsWith('/work/')) {
    const index = projectSlugs(work.items).indexOf(path.slice('/work/'.length));
    const project = work.visible ? work.items[index] : undefined;
    if (project) {
      page.title = `${project.title} | ${site.name}`;
      page.description = project.problem || project.kind || site.description;
      page.image = project.image || site.shareImage;
    } else {
      status = 404;
      page.title = `Project not found | ${site.name}`;
    }
  }
  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const base = process.env.SITE_URL || `${protocol}://${req.headers.host}`;
  let shareImage = '';
  if (page.image) { try { shareImage = new URL(page.image, base).href; } catch { /* leave it out */ } }
  const values = { TITLE: page.title, DESCRIPTION: page.description.slice(0, 200), SHARE_IMAGE: shareImage };
  const html = await readFile(join(ROOT, 'public', 'index.html'), 'utf8');
  return [status, html.replace(/\{\{(TITLE|DESCRIPTION|SHARE_IMAGE)\}\}/g, (_, key) => escapeHtml(values[key]))];
}

async function serveFile(req, res, base, relative) {
  const file = resolve(base, `.${sep}${relative}`);
  if (!file.startsWith(base + sep) || !TYPES[extname(file)]) throw new HttpError(404, 'Not found.');
  let info;
  try { info = await stat(file); } catch { throw new HttpError(404, 'Not found.'); }
  if (!info.isFile()) throw new HttpError(404, 'Not found.');
  const headers = { ...SECURITY, 'Content-Type': TYPES[extname(file)], 'Cache-Control': base === UPLOADS ? 'public, max-age=31536000, immutable' : 'no-cache', 'Accept-Ranges': 'bytes' };

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
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Not allowed.');
    if (path === '/' || path === '/index.html' || path === '/work' || /^\/work\/[a-z0-9-]+$/.test(path)) {
      const [status, html] = await sitePage(req, path);
      return send(res, status, html, { 'Content-Type': TYPES['.html'] });
    }
    if (path === '/work/') return send(res, 301, '', { Location: '/work' });
    if (path === '/admin') return send(res, 301, '', { Location: '/admin/' });
    if (path === '/admin/') return await serveFile(req, res, join(ROOT, 'public'), 'admin/index.html');
    if (path === '/shared/schema.mjs') return await serveFile(req, res, join(ROOT, 'shared'), 'schema.mjs');
    if (path.startsWith('/uploads/')) return await serveFile(req, res, UPLOADS, path.slice('/uploads/'.length));
    return await serveFile(req, res, join(ROOT, 'public'), path.slice(1));
  } catch (error) {
    const status = error.status || (error instanceof URIError ? 400 : 500);
    if (status === 500) console.error(error);
    json(res, status, { error: status === 500 ? 'Something went wrong on the server.' : error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Portfolio:  http://localhost:${PORT}`);
  console.log(`Dashboard:  http://localhost:${PORT}/admin/`);
  if (!PASSWORD_OK) console.log('The dashboard is locked. Set ADMIN_PASSWORD in .env (10 characters or more).');
});
