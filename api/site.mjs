// Runs on Vercel. vercel.json sends pages and dashboard requests here.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as sdk from '@vercel/blob';
import * as upload from '@vercel/blob/client';
import { createApp, passwordIsUsable, isPagePath, errorReply, HttpError } from '../lib/core.mjs';
import { blobStore } from '../lib/blob-store.mjs';

/** Build a handler from settings. Tests pass their own settings and a stand-in for storage. */
export function createHandler(env, blob = sdk, uploads = upload) {
  const password = env.ADMIN_PASSWORD || '';
  const hasData = Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);
  const mediaToken = env.MEDIA_READ_WRITE_TOKEN || '';

  let setupMessage = '';
  if (!hasData) setupMessage = 'Connect the private Blob store to this project, then redeploy. See the README.';
  else if (!mediaToken) setupMessage = 'Connect the public Blob store with the prefix MEDIA so that MEDIA_READ_WRITE_TOKEN is set, then redeploy. See the README.';

  const store = blobStore(blob, uploads, { mediaToken });
  // Until storage is connected, show the starting content instead of an error.
  if (!hasData) store.readContent = async () => null;

  const read = (...parts) => () => readFile(join(process.cwd(), ...parts), 'utf8');
  const app = createApp({
    store,
    password,
    passwordOk: passwordIsUsable(password, false),
    setupMessage,
    readDefaults: read('data', 'default-content.json'),
    readTemplate: read('public', 'index.html'),
    siteUrl: env.SITE_URL,
  });

  return async function handle(incoming) {
    let result;
    try {
      const url = new URL(incoming.url);
      const path = url.searchParams.get('route') || url.pathname;
      const headers = Object.fromEntries(incoming.headers);
      const request = {
        method: incoming.method === 'HEAD' ? 'GET' : incoming.method,
        headers,
        // Vercel fills in these headers itself, replacing anything a visitor sends.
        address: headers['x-real-ip'] || headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown',
        https: true,
        async readBody(limit) {
          const body = Buffer.from(await incoming.arrayBuffer());
          if (body.length > limit) throw new HttpError(413, 'That file is too large.');
          return body;
        },
      };
      if (path.startsWith('/api/')) result = await app.api(request, path, url.searchParams);
      else if (request.method === 'GET' && isPagePath(path)) result = await app.page(request, path);
      else throw new HttpError(404, 'Not found.');
    } catch (error) {
      result = errorReply(error);
    }
    return new Response(incoming.method === 'HEAD' ? null : result.body, { status: result.status, headers: result.headers });
  };
}

const handle = createHandler(process.env);

export default { fetch: (request) => handle(request) };
