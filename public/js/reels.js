// The two scroll "reels": the project wheel and the photo and video film strip.
// Each screen has three rows (heading, moving content, controls) so nothing can overlap.
import { projectSlugs } from '/shared/schema.mjs';
import { el, picture, openViewer } from '/js/dom.js';
import { videoFrame } from '/js/pages.js';

export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

/** How far the page has moved through a tall section, from 0 to 1. */
export function progressOf(section) {
  const box = section.getBoundingClientRect();
  return clamp(-box.top / Math.max(1, box.height - innerHeight));
}

/** Linger on each item and move quickly between them, so things come to rest centred. */
export function dwell(position) {
  const whole = Math.floor(position);
  const t = clamp((position - whole - 0.2) / 0.6);
  return whole + t * t * (3 - 2 * t);
}

/** Previous and next buttons, a position count and a short description. */
export function stepper(section, count, isCalm) {
  let index = 0;
  const go = (to) => {
    const top = section.getBoundingClientRect().top + scrollY;
    const share = count > 1 ? clamp(to, 0, count - 1) / (count - 1) : 0;
    scrollTo({ top: top + share * (section.offsetHeight - innerHeight), behavior: isCalm() ? 'auto' : 'smooth' });
  };
  const back = el('button', { type: 'button', class: 'arrow back-arrow', 'aria-label': 'Previous', onclick: () => go(index - 1) });
  const forward = el('button', { type: 'button', class: 'arrow', 'aria-label': 'Next', onclick: () => go(index + 1) });
  const position = el('span', { class: 'position' });
  const words = el('div', { class: 'step-words', 'aria-live': 'polite' });
  const action = el('div', { class: 'step-action' });
  const node = el('div', { class: 'stepper' }, el('div', { class: 'step-arrows' }, back, position, forward), words, action);

  return {
    node,
    go,
    update(next, title = '', detail = '', button = null) {
      index = next;
      back.disabled = index === 0;
      forward.disabled = index === count - 1;
      position.textContent = `${index + 1} of ${count}`;
      words.replaceChildren(...[title && el('p', { class: 'step-title' }, title), detail && el('p', { class: 'step-detail' }, detail)].filter(Boolean));
      action.replaceChildren(...[button].filter(Boolean));
    },
  };
}

/** Shared movement: turn scrolling into a position between the first and last item. */
function reelScene(section, count, area, measure, place, onChange) {
  let shown = 0;
  let active = -1;
  let size = '';
  return (instant) => {
    const next = `${area.clientWidth}x${area.clientHeight}`;
    const resized = next !== size;
    if (resized) { size = next; measure(area.clientWidth, area.clientHeight); }
    const target = dwell(progressOf(section) * Math.max(0, count - 1));
    shown = instant ? target : shown + (target - shown) * 0.13;
    place(shown);
    const nearest = Math.round(shown);
    if (nearest !== active) { active = nearest; onChange(active); }
  };
}

/** A tap on a side item brings it to the middle; a tap on the middle item opens it. */
function centreFirst(node, index, current, controls, isCalm) {
  node.addEventListener('click', (event) => {
    if (isCalm() || index === current() || event.metaKey || event.ctrlKey || event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    controls.go(index);
  }, true);
  // Keyboard users: bring whatever has focus to the middle.
  node.addEventListener('focus', () => { if (!isCalm() && node.matches(':focus-visible')) controls.go(index); });
}

// ---------- project wheel ----------

export function workChapter(work, { scenes, isCalm }) {
  const items = work.items;
  const slugs = projectSlugs(items);
  const section = el('section', { class: 'chapter work reel', id: 'work' });
  section.style.setProperty('--count', items.length);
  const controls = stepper(section, items.length, isCalm);
  const rim = el('div', { class: 'rim', 'aria-hidden': 'true' });
  const wheel = el('ul', { class: 'wheel' });
  const area = el('div', { class: 'reel-area' }, rim, wheel);
  let active = 0;

  const cards = items.map((project, i) => {
    const link = el('a', { class: 'card', href: `/work/${slugs[i]}`, 'aria-label': `View ${project.title}, ${project.kind}` },
      picture(project.image, '', project.tone, project.title));
    centreFirst(link, i, () => active, controls, isCalm);
    const item = el('li', {}, link, el('div', { class: 'card-text' }, el('h3', {}, project.title), el('p', {}, project.kind)));
    wheel.append(item);
    return item;
  });

  section.append(el('div', { class: 'stage' },
    el('div', { class: 'section-head' }, el('h2', {}, work.heading), el('a', { class: 'button ghost', href: '/work' }, 'See all projects')),
    area, controls.node));

  let angle = 0.2;
  /** Size the wheel so the middle card and its neighbours always fit the space. */
  function measure(width, height) {
    const top = 16;
    const cardWidth = Math.max(110, Math.min(Math.min(height * 0.8, 460) * 0.75, width * (width < 700 ? 0.62 : 0.3)));
    const cardHeight = cardWidth * 4 / 3;
    const room = Math.max(12, height - top - cardHeight - 6);
    const spacing = cardWidth * 1.14;
    angle = clamp(room / (spacing / 2 + cardWidth / 2), 0.06, 0.24);
    const radius = spacing / Math.sin(angle);
    area.style.setProperty('--card-w', `${cardWidth}px`);
    area.style.setProperty('--card-h', `${cardHeight}px`);
    area.style.setProperty('--top', `${top}px`);
    area.style.setProperty('--pivot', `${cardHeight / 2 + radius}px`);
    area.style.setProperty('--radius', `${radius}px`);
  }

  scenes.push(reelScene(section, items.length, area, measure, (shown) => {
    cards.forEach((card, i) => {
      const offset = i - shown;
      const distance = Math.abs(offset);
      card.style.setProperty('--angle', `${(offset * angle).toFixed(4)}rad`);
      card.style.setProperty('--near', clamp(1 - distance).toFixed(3));
      card.style.opacity = clamp(2.3 - distance).toFixed(3);
      card.style.zIndex = String(100 - Math.round(distance * 2));
    });
  }, (index) => {
    active = index;
    const project = items[index];
    if (project) controls.update(index, project.title, project.kind, el('a', { class: 'button solid', href: `/work/${slugs[index]}` }, 'View project'));
  }));
  return section;
}

// ---------- photo and video film strip ----------

export function galleryChapter(gallery, { scenes, isCalm }) {
  const items = gallery.items;
  const section = el('section', { class: 'chapter gallery reel', id: 'gallery' });
  section.style.setProperty('--count', items.length);
  const controls = stepper(section, items.length, isCalm);
  const strip = el('ul', { class: 'film' });
  const area = el('div', { class: 'reel-area' }, strip);
  let active = 0;

  const nameOf = (item) => item.caption || (item.kind === 'video' ? 'Video' : 'Photo');
  const open = (item) => openViewer(nameOf(item), item.kind === 'video'
    ? videoFrame({ src: item.video, poster: item.image, title: item.caption }, { title: nameOf(item), tone: item.tone }, 'Video coming soon')
    : el('div', { class: 'viewer-image' }, picture(item.image, item.caption, item.tone, 'Your photo goes here')));

  const frames = items.map((item, i) => {
    const button = el('button', { type: 'button', class: `shot-button ${item.kind}`, 'aria-label': `${item.kind === 'video' ? 'Play' : 'View'} ${nameOf(item)}`, onclick: () => open(item) },
      picture(item.image, '', item.tone, item.caption),
      item.kind === 'video' && el('span', { class: 'play', 'aria-hidden': 'true' }),
      el('span', { class: 'viewfinder', 'aria-hidden': 'true' }));
    centreFirst(button, i, () => active, controls, isCalm);
    const frame = el('li', {}, button, el('p', { class: 'frame-caption' }, item.caption));
    strip.append(frame);
    return frame;
  });

  section.append(el('div', { class: 'stage' },
    el('div', { class: 'section-head' }, el('h2', {}, gallery.heading), gallery.intro && el('p', {}, gallery.intro)),
    area, controls.node));

  let spacing = 400;
  function measure(width, height) {
    const small = width < 700;
    let frameHeight = Math.max(120, Math.min(height - 64, 500));
    const frameWidth = Math.min(frameHeight * 1.45, width * (small ? 0.78 : 0.56));
    frameHeight = Math.min(frameHeight, frameWidth * (small ? 1.2 : 0.75));
    spacing = frameWidth * 0.96;
    area.style.setProperty('--frame-w', `${frameWidth}px`);
    area.style.setProperty('--frame-h', `${frameHeight}px`);
  }

  scenes.push(reelScene(section, items.length, area, measure, (shown) => {
    frames.forEach((frame, i) => {
      const offset = i - shown;
      const near = clamp(1 - Math.abs(offset));
      frame.style.setProperty('--x', `${(offset * spacing).toFixed(1)}px`);
      frame.style.setProperty('--near', near.toFixed(3));
      frame.style.zIndex = String(100 - Math.round(Math.abs(offset) * 2));
    });
    // The perforations travel with the film.
    area.style.setProperty('--travel', `${(-shown * spacing).toFixed(1)}px`);
  }, (index) => {
    active = index;
    const item = items[index];
    if (!item) return;
    frames.forEach((frame, i) => frame.classList.toggle('focus', i === index));
    controls.update(index, nameOf(item), item.kind === 'video' ? 'Video' : 'Photograph',
      el('button', { type: 'button', class: 'button solid', onclick: () => open(item) }, item.kind === 'video' ? 'Play video' : 'View photo'));
  }));
  return section;
}
