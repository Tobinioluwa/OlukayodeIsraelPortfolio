// The website's rules: pages, sign-in, saving and uploads.
// It does not care where it runs. Each host supplies its own storage:
// lib/disk-store.mjs for your computer or a normal server, lib/blob-store.mjs for Vercel.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { cleanContent, projectSlugs } from '../shared/schema.mjs';

const SESSION_MS = 8 * 60 * 60 * 1000;
const ATTEMPT_LIMIT = 8;
const ATTEMPT_MS = 15 * 60 * 1000;

// vercel.json repeats this policy for the files Vercel serves by itself. Keep the two the same.
export const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; media-src 'self' https:; connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
};

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const reply = (status, body, headers = {}) => ({ status, body, headers: { ...SECURITY, 'Cache-Control': 'no-store', ...headers } });
export const json = (status, value, headers = {}) => reply(status, JSON.stringify(value), { 'Content-Type': 'application/json', ...headers });

export function errorReply(error) {
  const status = error.status || (error instanceof URIError ? 400 : 500);
  if (status === 500) console.error(error);
  return json(status, { error: status === 500 ? 'Something went wrong on the server.' : error.message });
}

export const isPagePath = (path) => path === '/' || path === '/index.html' || path === '/work' || /^\/work\/[a-z0-9-]+$/.test(path);

const hash = (value) => createHash('sha256').update(String(value)).digest();
const sessionId = (token) => hash(token).toString('hex');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The sample password in .env.example only works on your own computer. */
export const passwordIsUsable = (password, localOnly) => password.length >= 10 && (localOnly || !password.startsWith('local-test-only'));

/*
 * A request is a plain object:
 *   { method, headers, address, https, readBody(limit) }
 * where headers uses lower-case names and address identifies the visitor.
 */
export function createApp({ store, password, passwordOk, setupMessage, readDefaults, readTemplate, siteUrl }) {
  async function loadContent(options) {
    const saved = await store.readContent(options);
    return cleanContent(JSON.parse(saved ?? await readDefaults()));
  }

  const token = (request) => (request.headers.cookie || '').split(';').map((p) => p.trim().split('=')).find(([k]) => k === 'session')?.[1];

  async function signedIn(request) {
    const value = token(request);
    if (!value || !/^[0-9a-f]{64}$/.test(value) || !passwordOk) return false;
    const session = await store.getSession(sessionId(value));
    // Changing the password signs everyone out.
    if (!session || session.password !== sessionId(password)) return false;
    if (session.expires > Date.now()) return true;
    await store.deleteSession(sessionId(value));
    return false;
  }

  function sameOrigin(request) {
    const { origin, host } = request.headers;
    if (!origin) return false;
    try { return new URL(origin).host === (request.headers['x-forwarded-host'] || host); } catch { return false; }
  }

  const sessionCookie = (request, value, maxAge) => `session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${request.https ? '; Secure' : ''}`;

  async function readJson(request, limit) {
    const body = await request.readBody(limit);
    try { return JSON.parse(body.toString('utf8')); } catch { throw new HttpError(400, 'That request could not be read.'); }
  }

  async function api(request, path, query) {
    const { method } = request;
    if (method === 'GET' && path === '/api/content') return json(200, await loadContent({ fresh: query?.get('fresh') === '1' }));
    if (method === 'GET' && path === '/api/session') {
      const ready = passwordOk && !setupMessage;
      return json(200, { signedIn: ready && await signedIn(request), ready, setupMessage: setupMessage || '', uploads: store.uploads });
    }
    if (method === 'GET') throw new HttpError(404, 'Not found.');
    if (!sameOrigin(request)) throw new HttpError(403, 'This request came from another website.');
    if (setupMessage) throw new HttpError(503, setupMessage);

    if (method === 'POST' && path === '/api/login') {
      if (!passwordOk) throw new HttpError(503, 'Set ADMIN_PASSWORD (10 characters or more) and restart or redeploy.');
      const body = await readJson(request, 4096);
      // Each try is counted before the password is checked, so tries sent at once cannot slip past.
      const allowed = await store.countAttempt(request.address, ATTEMPT_LIMIT, ATTEMPT_MS);
      if (!allowed) throw new HttpError(429, 'Too many tries. Wait 15 minutes and try again.');
      if (!timingSafeEqual(hash(body?.password), hash(password))) throw new HttpError(401, 'That password is not right.');
      await store.clearAttempts(request.address);
      const value = randomBytes(32).toString('hex');
      await store.saveSession(sessionId(value), { expires: Date.now() + SESSION_MS, password: sessionId(password) });
      return json(200, { signedIn: true }, { 'Set-Cookie': sessionCookie(request, value, SESSION_MS / 1000) });
    }

    if (!(await signedIn(request))) throw new HttpError(401, 'Sign in again to continue.');

    if (method === 'POST' && path === '/api/logout') {
      await store.deleteSession(sessionId(token(request)));
      return json(200, { signedIn: false }, { 'Set-Cookie': sessionCookie(request, '', 0) });
    }
    if (method === 'PUT' && path === '/api/content') {
      const input = await readJson(request, 1024 * 1024);
      if (!input?.site || !input?.hero) throw new HttpError(400, 'The content is incomplete, so nothing was saved.');
      const content = cleanContent(input);
      await store.writeContent(JSON.stringify(content, null, 2));
      return json(200, content);
    }
    if (method === 'POST' && path === '/api/upload') {
      const { status, body } = await store.handleUpload(request);
      return json(status, body);
    }
    throw new HttpError(404, 'Not found.');
  }

  /** Put the title and link preview details into the HTML so search engines see them. */
  async function page(request, path) {
    const { site, work } = await loadContent();
    let status = 200;
    const details = { title: site.pageTitle, description: site.description, image: site.shareImage };
    if (path === '/work') details.title = `All projects | ${site.name}`;
    else if (path.startsWith('/work/')) {
      const index = projectSlugs(work.items).indexOf(path.slice('/work/'.length));
      const project = work.visible ? work.items[index] : undefined;
      if (project) {
        details.title = `${project.title} | ${site.name}`;
        details.description = project.problem || project.kind || site.description;
        details.image = project.image || site.shareImage;
      } else {
        status = 404;
        details.title = `Project not found | ${site.name}`;
      }
    }
    const base = siteUrl || `${request.https ? 'https' : 'http'}://${request.headers.host}`;
    let shareImage = '';
    if (details.image) { try { shareImage = new URL(details.image, base).href; } catch { /* leave it out */ } }
    const values = { TITLE: details.title, DESCRIPTION: details.description.slice(0, 200), SHARE_IMAGE: shareImage };
    const html = (await readTemplate()).replace(/\{\{(TITLE|DESCRIPTION|SHARE_IMAGE)\}\}/g, (_, key) => escapeHtml(values[key]));
    return reply(status, html, { 'Content-Type': 'text/html; charset=utf-8' });
  }

  return { api, page };
}
