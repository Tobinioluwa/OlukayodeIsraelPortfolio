# Motion portfolio

A scroll-driven portfolio with its own editing dashboard. It needs Node 20 or newer and no other packages.

## Run it

1. Copy `.env.example` to `.env` and set your own `ADMIN_PASSWORD`.
2. Run `npm start`.
3. Open http://localhost:4321 for the site, or http://localhost:4321/admin/ for the dashboard.

## What the dashboard can change

- Which sections show, and their order
- All text, projects, photos and videos, services, areas of work, testimonials and contact links
- Images (PNG, JPG, WebP or GIF, up to 5 MB each)
- Each project's own page, with walkthrough videos (MP4 or WebM up to 100 MB, or a YouTube or Vimeo link) and captioned screens
- Main colours, and full or calm motion

Edits appear in the live preview. Visitors see them only after you choose **Publish changes**.

## Pages

- `/` is the scroll journey
- `/work` lists all projects, with filters
- `/work/project-name` is one project. Its address comes from the project name. To rename a project without breaking links you have shared, fill in **Page address** with the old name.

## Where your content lives

| Path | What it holds |
| --- | --- |
| `data/content.json` | Published content (created the first time you publish) |
| `data/uploads/` | Your images |
| `data/backups/` | The last 20 earlier versions. To restore one, copy it over `content.json`. |
| `data/default-content.json` | The starting placeholders |

## Putting it online

The server saves to disk, so it needs a host that runs Node **and keeps files between restarts**
(for example, a small VPS, or a Render or Railway service with a persistent disk or volume).
Static or serverless hosting such as Netlify, GitHub Pages or Vercel will not keep your edits.

On the host, set:

- `ADMIN_PASSWORD`: a long, unique password. The sample one is refused online.
- `HOST=0.0.0.0` and `NODE_ENV=production`
- `SITE_URL`: your web address, used for link previews
- `DATA_DIR`: a folder on the persistent disk. Copy your `data` folder there.

Serve it over HTTPS. Sign-ins last 8 hours and end when the server restarts.
