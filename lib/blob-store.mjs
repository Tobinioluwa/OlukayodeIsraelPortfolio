// Storage for Vercel, using two Vercel Blob stores:
//   private: your content, earlier versions, sign-ins and the sign-in limit
//   public:  photos and videos, which visitors need to see
import { createHash } from 'node:crypto';
import { HttpError } from './core.mjs';

const MB = 1024 * 1024;
const CACHE_MS = 15 * 1000;

// What may be uploaded, by file ending. SVG and web pages are left out on purpose.
export const UPLOAD_TYPES = {
  png: ['image/png', 5 * MB], jpg: ['image/jpeg', 5 * MB], webp: ['image/webp', 5 * MB], gif: ['image/gif', 5 * MB],
  mp4: ['video/mp4', 100 * MB], webm: ['video/webm', 100 * MB],
};

/**
 * @param sdk     { put, get, del, list } from @vercel/blob
 * @param upload  { handleUpload } from @vercel/blob/client
 * @param options { data: credentials for the private store, mediaToken: token for the public store }
 */
export function blobStore(sdk, upload, { data = {}, mediaToken }) {
  let cached;

  async function read(pathname) {
    // useCache: false asks for the newest version.
    const found = await sdk.get(pathname, { ...data, access: 'private', useCache: false });
    if (!found || found.statusCode !== 200) return null;
    return { text: await new Response(found.stream).text(), etag: found.blob.etag };
  }

  const write = (pathname, text, extra = {}) => sdk.put(pathname, text, {
    ...data, access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', ...extra,
  });

  const attemptPath = (address) => `attempts/${createHash('sha256').update(String(address)).digest('hex')}.json`;

  return {
    uploads: 'blob',

    async readContent({ fresh = false } = {}) {
      // Visitors may see a copy up to 15 seconds old. This saves storage requests.
      if (!fresh && cached && cached.until > Date.now()) return cached.text;
      const found = await read('content.json');
      cached = { text: found?.text ?? null, until: Date.now() + CACHE_MS };
      return cached.text;
    },

    async writeContent(text) {
      const previous = await read('content.json');
      if (previous) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await write(`backups/${stamp}.json`, previous.text);
      }
      await write('content.json', text);
      cached = { text, until: Date.now() + CACHE_MS };
      if (previous) {
        const { blobs } = await sdk.list({ ...data, prefix: 'backups/', limit: 1000 });
        const old = blobs.map((b) => b.pathname).sort().slice(0, -20);
        if (old.length) await sdk.del(old, data);
      }
    },

    async getSession(id) {
      const found = await read(`sessions/${id}.json`);
      return found ? JSON.parse(found.text) : null;
    },
    async saveSession(id, session) { await write(`sessions/${id}.json`, JSON.stringify(session)); },
    async deleteSession(id) { await sdk.del(`sessions/${id}.json`, data); },

    async countAttempt(address, limit, windowMs) {
      const pathname = attemptPath(address);
      for (let tries = 0; tries < 6; tries += 1) {
        const found = await read(pathname);
        const record = found && JSON.parse(found.text);
        const count = record && record.until > Date.now() ? record.count : 0;
        if (count >= limit) return false;
        try {
          // Write only if nobody else has written since we looked.
          await write(pathname, JSON.stringify({ count: count + 1, until: Date.now() + windowMs }),
            found ? { ifMatch: found.etag } : { allowOverwrite: false });
          return true;
        } catch (error) {
          // Try again if another request changed or created the record first.
          const changed = /precondition failed/i.test(error?.message);
          if (!changed && (found || !(await read(pathname)))) throw error;
        }
      }
      return false; // many tries arriving together are treated as too many
    },
    async clearAttempts(address) { await sdk.del(attemptPath(address), data); },

    // The browser sends files straight to storage. This only gives a signed-in owner permission.
    async handleUpload(request) {
      const body = JSON.parse((await request.readBody(16 * 1024)).toString('utf8'));
      if (body?.type !== 'blob.generate-client-token') throw new HttpError(400, 'That upload request is not supported.');
      const result = await upload.handleUpload({
        body,
        token: mediaToken,
        request: new Request('https://upload.invalid/api/upload', { method: 'POST' }),
        onBeforeGenerateToken: async (pathname) => {
          const ending = /^media\/[a-z0-9-]{1,80}\.([a-z0-9]+)$/.exec(pathname)?.[1];
          const rule = ending && Object.hasOwn(UPLOAD_TYPES, ending) ? UPLOAD_TYPES[ending] : null;
          if (!rule) throw new HttpError(415, 'Upload a PNG, JPG, WebP or GIF image, or an MP4 or WebM video.');
          return {
            allowedContentTypes: [rule[0]],
            maximumSizeInBytes: rule[1],
            addRandomSuffix: true,
            validUntil: Date.now() + 30 * 60 * 1000,
          };
        },
      });
      return { status: 200, body: result };
    },
  };
}
