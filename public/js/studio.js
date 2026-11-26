// The AI studio: generated images and videos, with motion of their own.
//   - each piece "generates" into view out of small blocks
//   - uploaded videos play silently while they are on screen
//   - cards tilt towards the pointer
//   - a prompt bar types out the prompts behind the work
import { safeUrl } from '/shared/schema.mjs';
import { el, picture, openViewer } from '/js/dom.js';
import { videoFrame } from '/js/pages.js';

const SHAPES = { landscape: '4 / 3', portrait: '3 / 4', square: '1 / 1', wide: '16 / 9', tall: '9 / 16' };
const DEVELOP_MS = 1500;

let cleanup = () => {};

/** Cover a tile in blocks, then clear them from top to bottom behind a bright line. */
function develop(frame, colours) {
  frame.classList.remove('latent');
  frame.querySelector('.noise')?.remove();
  const width = frame.clientWidth;
  const height = frame.clientHeight;
  if (!width || !height) return;
  const canvas = el('canvas', { class: 'noise', 'aria-hidden': 'true' });
  canvas.width = width;
  canvas.height = height;
  const pen = canvas.getContext('2d');
  if (!pen) return;
  frame.append(canvas);

  const size = Math.max(10, Math.round(width / 24));
  const blocks = [];
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      // Each block waits for the line to reach it, plus a little randomness.
      const due = (y / height) * 0.7 + Math.random() * 0.3;
      const pick = Math.random();
      blocks.push({ x, y, due, colour: pick > 0.975 ? colours.gold : pick > 0.72 ? colours.light : pick > 0.4 ? colours.accent : colours.night });
    }
  }

  let start = 0;
  const draw = (now) => {
    start ||= now;
    const t = Math.min(1, (now - start) / DEVELOP_MS);
    pen.clearRect(0, 0, width, height);
    for (const block of blocks) {
      const left = block.due - t;
      if (left <= -0.04) continue;
      pen.globalAlpha = left > 0.12 ? 1 : Math.max(0.12, (left + 0.04) / 0.16);
      // Blocks close to the line flicker between colours.
      pen.fillStyle = left < 0.14 && Math.random() > 0.75 ? colours.light : block.colour;
      pen.fillRect(block.x, block.y, size + 1, size + 1);
    }
    pen.globalAlpha = 1;
    pen.fillStyle = colours.gold;
    if (t < 0.95) pen.fillRect(0, Math.min(height - 2, (t / 0.95) * height), width, 2);
    if (t < 1 && canvas.isConnected) requestAnimationFrame(draw);
    else canvas.remove();
  };
  draw(performance.now());
  // If the browser stops drawing (a hidden tab), never leave the work covered.
  setTimeout(() => canvas.remove(), DEVELOP_MS + 600);
}

/** Type each prompt, pause, clear it and move on to the next. */
function typewriter(target, lines, isVisible) {
  let line = 0;
  let length = 0;
  let adding = true;
  let timer = 0;
  const step = () => {
    let wait = 400;
    if (isVisible()) {
      const full = lines[line];
      length += adding ? 1 : -3;
      target.textContent = full.slice(0, Math.max(0, length));
      target.parentElement.scrollTop = target.parentElement.scrollHeight; // keep the newest words in view
      wait = adding ? 34 : 14;
      if (adding && length >= full.length) { adding = false; wait = 2600; }
      else if (!adding && length <= 0) { adding = true; length = 0; line = (line + 1) % lines.length; wait = 300; }
    }
    timer = setTimeout(step, wait);
  };
  timer = setTimeout(step, 300);
  return () => clearTimeout(timer);
}

export function studioChapter(studio, { isCalm }) {
  cleanup(); // The page is drawn again after each edit in the dashboard preview.
  const items = studio.items;
  const nameOf = (item) => item.title || (item.kind === 'video' ? 'AI video' : 'AI image');
  const colours = () => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['night', 'accent', 'light', 'gold'].map((key) => [key, style.getPropertyValue(`--${key}`).trim()]));
  };
  const motion = !isCalm() && 'IntersectionObserver' in window;
  const previews = new Set();
  const onScreen = new Set(); // previews that should be playing

  const open = (item) => {
    for (const video of previews) video.pause();
    const body = item.kind === 'video'
      ? videoFrame({ src: item.video, poster: item.image, title: item.title }, { title: nameOf(item), tone: item.tone })
      : el('div', { class: 'viewer-image' }, picture(item.image, item.title, item.tone, 'Your generated image goes here'));
    openViewer(nameOf(item), body,
      item.prompt && el('div', { class: 'made-with' }, el('h3', {}, 'Prompt'), el('p', {}, item.prompt)),
      item.tool && el('div', { class: 'made-with' }, el('h3', {}, 'Made with'), el('p', {}, item.tool)));
    // Carry on with the silent previews once the pop-up is closed.
    document.querySelector('.viewer').addEventListener('close', () => {
      for (const video of onScreen) video.play().catch(() => {});
    }, { once: true });
  };

  const tiles = items.map((item) => {
    const url = safeUrl(item.video);
    // Only uploaded or direct video files can play inside the tile. YouTube and Vimeo open in the viewer.
    const plays = item.kind === 'video' && /\.(mp4|webm)(\?.*)?$/i.test(url);
    let preview = null;
    if (plays) {
      preview = el('video', { class: 'shot', src: url, poster: safeUrl(item.image) || false, loop: true, playsinline: true, preload: 'metadata', tabindex: '-1', 'aria-hidden': 'true' });
      preview.muted = true;
      previews.add(preview);
    }
    const frame = el('span', { class: `gen-frame${motion ? ' latent' : ''}` },
      preview || picture(item.image, '', item.tone, ''),
      item.kind === 'video' && el('span', { class: 'play', 'aria-hidden': 'true' }),
      el('span', { class: 'sheen', 'aria-hidden': 'true' }));
    frame.style.aspectRatio = SHAPES[item.shape] || SHAPES.landscape;
    const button = el('button', { type: 'button', class: 'gen-card', 'aria-label': `${item.kind === 'video' ? 'Play' : 'View'} ${nameOf(item)}`, onclick: () => open(item) },
      frame,
      el('span', { class: 'gen-text' },
        el('span', { class: 'gen-title' }, nameOf(item)),
        el('span', { class: 'gen-meta' }, [item.kind === 'video' ? 'AI video' : 'AI image', item.tool].filter(Boolean).join(' · '))));

    button.addEventListener('pointermove', (event) => {
      if (isCalm() || event.pointerType !== 'mouse') return;
      const box = button.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      button.style.setProperty('--rx', `${((0.5 - y) * 9).toFixed(2)}deg`);
      button.style.setProperty('--ry', `${((x - 0.5) * 9).toFixed(2)}deg`);
      button.style.setProperty('--px', `${(x * 100).toFixed(1)}%`);
      button.style.setProperty('--py', `${(y * 100).toFixed(1)}%`);
    });
    button.addEventListener('pointerleave', () => {
      button.style.setProperty('--rx', '0deg');
      button.style.setProperty('--ry', '0deg');
    });
    return { item, frame, preview, node: el('li', {}, button) };
  });

  // ---------- filters ----------
  const kinds = [['', 'All'], ['image', 'Images'], ['video', 'Videos']];
  const mixed = new Set(items.map((i) => i.kind)).size > 1;
  const filters = mixed && el('div', { class: 'gen-filters', role: 'group', 'aria-label': 'Show' },
    kinds.map(([kind, label]) => el('button', {
      type: 'button',
      'aria-pressed': String(kind === ''),
      onclick: (event) => {
        for (const button of event.currentTarget.parentElement.children) button.setAttribute('aria-pressed', String(button === event.currentTarget));
        for (const tile of tiles) {
          tile.node.hidden = Boolean(kind) && tile.item.kind !== kind;
          if (!tile.node.hidden && motion && !isCalm()) develop(tile.frame, colours());
        }
      },
    }, label)));

  // ---------- prompt bar ----------
  const prompts = items.map((item) => item.prompt.trim()).filter(Boolean);
  const typed = el('span', { class: 'typed' });
  // Decoration only: every prompt can be read in full by opening its piece.
  const promptBar = prompts.length > 0 && !isCalm() && el('div', { class: 'prompt-bar', 'aria-hidden': 'true' },
    el('span', { class: 'prompt-label' }, 'Prompt'),
    el('span', { class: 'prompt-line' }, typed, el('span', { class: 'caret' })));

  const section = el('section', { class: 'chapter studio', id: 'studio' },
    el('div', { class: 'aurora', 'aria-hidden': 'true' }),
    el('div', { class: 'studio-inner' },
      el('div', { class: 'studio-head' }, el('h2', {}, studio.heading), studio.intro && el('p', {}, studio.intro)),
      promptBar,
      filters,
      el('ul', { class: 'gen-grid' }, tiles.map((tile) => tile.node))));

  // ---------- things that happen as you scroll to them ----------
  const observers = [];
  let stopTyping = () => {};
  if (motion) {
    const reveal = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal.unobserve(entry.target);
        develop(entry.target, colours());
      }
    }, { threshold: 0.25 });

    const playback = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting && !isCalm()) {
          onScreen.add(target);
          target.play().catch(() => {});
        } else {
          onScreen.delete(target);
          target.pause();
        }
      }
    }, { threshold: 0.5 });

    let inView = false;
    const watching = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      section.classList.toggle('awake', inView);
    });

    for (const tile of tiles) {
      reveal.observe(tile.frame);
      if (tile.preview) playback.observe(tile.preview);
    }
    watching.observe(section);
    observers.push(reveal, playback, watching);
    if (promptBar) stopTyping = typewriter(typed, prompts, () => inView);
  } else if (promptBar) {
    typed.textContent = prompts[0];
  }

  cleanup = () => {
    stopTyping();
    for (const observer of observers) observer.disconnect();
  };
  return section;
}
