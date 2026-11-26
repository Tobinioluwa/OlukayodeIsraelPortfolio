// Storage for your own computer, or a server that keeps its files.
import { readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { HttpError } from './core.mjs';

const MB = 1024 * 1024;

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

export function diskStore(folder) {
  const uploadsFolder = join(folder, 'uploads');
  const backups = join(folder, 'backups');
  const contentFile = join(folder, 'content.json');
  const sessions = new Map(); // sign-ins end when the server restarts
  const attempts = new Map();

  return {
    uploads: 'server',
    uploadsFolder,

    async readContent() {
      return existsSync(contentFile) ? readFile(contentFile, 'utf8') : null;
    },

    async writeContent(text) {
      await mkdir(backups, { recursive: true });
      if (existsSync(contentFile)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await writeFile(join(backups, `${stamp}.json`), await readFile(contentFile));
        const old = (await readdir(backups)).sort().slice(0, -20);
        await Promise.all(old.map((name) => unlink(join(backups, name))));
      }
      // Write to a temporary file first so a crash cannot leave half a file behind.
      await writeFile(`${contentFile}.tmp`, text);
      await rename(`${contentFile}.tmp`, contentFile);
    },

    async getSession(id) { return sessions.get(id) ?? null; },
    async saveSession(id, session) { sessions.set(id, session); },
    async deleteSession(id) { sessions.delete(id); },

    async countAttempt(address, limit, windowMs) {
      const now = Date.now();
      for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
      const count = attempts.get(address)?.count || 0;
      if (count >= limit) return false;
      attempts.set(address, { count: count + 1, until: now + windowMs });
      return true;
    },
    async clearAttempts(address) { attempts.delete(address); },

    async handleUpload(request) {
      const body = await request.readBody(100 * MB);
      const picture = imageType(body);
      const ext = picture || videoType(body);
      if (!ext) throw new HttpError(415, 'Upload a PNG, JPG, WebP or GIF image, or an MP4 or WebM video.');
      if (picture && body.length > 5 * MB) throw new HttpError(413, 'Images can be up to 5 MB.');
      await mkdir(uploadsFolder, { recursive: true });
      const name = randomBytes(12).toString('hex') + ext;
      await writeFile(join(uploadsFolder, name), body);
      return { status: 201, body: { url: `/uploads/${name}` } };
    },
  };
}
