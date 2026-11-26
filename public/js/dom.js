// Small building blocks shared by the home page and the project pages.
import { safeUrl } from '/shared/schema.mjs';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== '' && c !== 0));
  return node;
}

/** Pick dark or white text, whichever reads better on a colour. */
export function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? '#050a16' : '#ffffff';
}

export function paint(node, tone) {
  node.style.setProperty('--tone', tone);
  node.style.setProperty('--tone-ink', inkFor(tone));
  return node;
}

/** An uploaded image, or a drawn stand-in that is clearly a placeholder. */
export function picture(src, alt, tone, label) {
  const url = safeUrl(src);
  if (url) return el('img', { class: 'shot', src: url, alt, loading: 'lazy', decoding: 'async' });
  return paint(el('span', { class: 'shot blank' }, el('span', {}, label)), tone);
}

const SHAPES = { landscape: 4 / 3, wide: 16 / 9, portrait: 3 / 4, tall: 9 / 16, square: 1 };

/**
 * Work out a frame's width divided by its height, and pass it to `use`.
 * "Automatic" measures the video or picture. It may answer later, or not at all.
 */
export function whenShaped({ shape, image, video }, use) {
  if (SHAPES[shape]) return use(SHAPES[shape]);
  const clip = safeUrl(video);
  const still = safeUrl(image);
  // Very long or very thin files are limited, so they cannot break the layout.
  const found = (width, height) => { if (width && height) use(Math.min(2.4, Math.max(0.45, width / height))); };
  if (/youtube\.com\/shorts\//i.test(clip)) use(SHAPES.tall);
  else if (/\.(mp4|webm)(\?.*)?$/i.test(clip)) {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.addEventListener('loadedmetadata', () => found(probe.videoWidth, probe.videoHeight), { once: true });
    probe.src = clip;
  } else if (still) {
    const probe = new Image();
    probe.addEventListener('load', () => found(probe.naturalWidth, probe.naturalHeight), { once: true });
    probe.src = still;
  }
}

/** Give a frame the shape of what is inside it. Tall ones are also kept to the screen's height. */
export function shapeFrame(node, item) {
  whenShaped(item, (ratio) => {
    node.style.setProperty('--ratio', ratio.toFixed(4));
    node.classList.toggle('upright', ratio < 1.1);
  });
  return node;
}

export const tagList = (items) => items.length && el('ul', { class: 'tags' }, items.map((t) => el('li', {}, t)));

// ---------- pop-up for enlarging an image ----------

const viewer = document.querySelector('.viewer');

export function openViewer(titleText, ...body) {
  viewer.replaceChildren(
    el('div', { class: 'viewer-head' },
      el('h2', { id: 'viewer-title' }, titleText),
      el('button', { type: 'button', class: 'button ghost', onclick: () => viewer.close() }, 'Close')),
    el('div', { class: 'viewer-body' }, ...body),
  );
  viewer.showModal();
  viewer.scrollTop = 0;
  document.documentElement.classList.add('locked');
}
viewer.addEventListener('close', () => document.documentElement.classList.remove('locked'));
viewer.addEventListener('click', (event) => { if (event.target === viewer) viewer.close(); });
