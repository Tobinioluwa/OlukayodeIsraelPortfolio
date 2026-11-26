# Motion portfolio

A scroll-driven portfolio with its own editing dashboard. It needs Node 20 or newer. Running it on your computer needs no other packages.

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

## Putting it online with Vercel

Vercel's free Hobby plan is for **personal, non-commercial** use. A portfolio that asks people to hire you may count as commercial. Read [Vercel's terms](https://vercel.com/legal/terms) or ask Vercel before relying on the free plan.

1. In Vercel, choose **Add New > Project** and import this repository. Keep the settings it reads from `vercel.json`.
2. Add the environment variable `ADMIN_PASSWORD`: a long password you do not use anywhere else. Then deploy.
3. In the project, open **Storage** and create a Blob store with **Private** access. Connect it to the project and keep the default prefix, `BLOB`.
4. Create a second Blob store with **Public** access. Connect it to the project with the prefix `MEDIA`.
5. Check **Settings > Environment Variables** for `MEDIA_READ_WRITE_TOKEN`. Uploads need it. If it is missing, copy the store's read-write token into a variable with that name.
6. Redeploy. Open your site address with `/admin/` on the end and sign in.
7. Optional: add `SITE_URL` with your site's address (used for link previews), then redeploy.

Do not set `HOST`, `DATA_DIR` or `CLIENT_IP_HEADER` on Vercel.

**How Vercel stores things**

| Store | What it holds | Who can see it |
| --- | --- | --- |
| Private | Content, the last 20 earlier versions, sign-ins | Only your site |
| Public | Photos and videos | Anyone who has the file's address |

An uploaded file is public as soon as it uploads, even before you publish. Removing it in the dashboard does not delete it from storage. Delete it in Vercel's Storage page.

The free plan has monthly limits on storage and traffic, and videos use them quickly. YouTube or Vimeo links use none of your storage.

The online site starts with the starting content. Content published on your computer is not copied online.

## Putting it online on a server that keeps files

`server.mjs` also runs on a host such as Render or a small VPS, **if the host keeps files between restarts** (a paid disk or volume).

Set:

- `ADMIN_PASSWORD`: a long, unique password. The sample one is refused online.
- `HOST=0.0.0.0` and `NODE_ENV=production`
- `SITE_URL`: your web address, used for link previews
- `CLIENT_IP_HEADER`: on Render, `cf-connecting-ip`. It lets the sign-in limit tell visitors apart. On another host, name only a header that the host sets itself, and leave this unset if you are not sure.
- `DATA_DIR`: a folder on the persistent disk. Copy your `data` folder there.

Serve it over HTTPS. Sign-ins last 8 hours and end when the server restarts.
