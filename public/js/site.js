import { cleanContent, safeUrl, projectSlugs } from '/shared/schema.mjs';
import { el, inkFor, paint, picture, tagList } from '/js/dom.js';
import { clamp, progressOf, dwell, stepper, workChapter, galleryChapter } from '/js/reels.js';
import { drawing } from '/js/art.js';
import { projectsPage, projectPage } from '/js/pages.js';
import { nameField } from '/js/name-field.js';
import { studioChapter } from '/js/studio.js';

const main = document.querySelector('#main');
const menu = document.querySelector('#menu');
const rail = document.querySelector('.rail');
const menuButton = document.querySelector('.menu-button');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const isPreview = new URLSearchParams(location.search).has('preview') && window.parent !== window;

let content;
let scenes = []; // functions that update one scroll scene per frame
let calm = false;
let lights; // the animated name on the opening screen
let route = location.pathname;

// ---------- chapters ----------

function heroChapter({ hero, order, ...rest }) {
  const first = order.find((id) => rest[id].visible);
  const title = el('h1', { class: 'name' }, el('span', {}, hero.title));
  title.style.setProperty('--length', Math.max(3, hero.title.length));
  const horizon = el('div', { class: 'horizon', 'aria-hidden': 'true' });
  const copy = el('div', { class: 'hero-copy' },
    el('p', { class: 'greeting' }, hero.greeting),
    title,
    hero.role && el('p', { class: 'role' }, hero.role),
    el('p', { class: 'intro' }, hero.intro),
    el('p', { class: 'actions' },
      first && el('a', { class: 'button solid', href: `#${first}` }, hero.primaryLabel),
      rest.contact.visible && el('a', { class: 'button ghost', href: '#contact' }, hero.secondaryLabel)));
  const section = el('section', { class: 'hero', id: 'top' }, horizon, copy);

  scenes.push(() => {
    const p = clamp(-section.getBoundingClientRect().top / section.offsetHeight);
    horizon.style.setProperty('--lift', p.toFixed(4));
    copy.style.transform = `translate3d(0, ${p * 18}vh, 0)`;
    copy.style.opacity = String(1 - p * 1.1);
    lights?.scatter(clamp(p * 1.8));
  });
  return section;
}

function servicesChapter(services, { scenes, isCalm }) {
  const items = services.items;
  const section = el('section', { class: 'chapter services reel', id: 'services' });
  section.style.setProperty('--count', items.length);
  const controls = stepper(section, items.length, isCalm);
  const stack = el('ul', { class: 'stack' });
  const sheets = items.map((service, i) => {
    const sheet = paint(el('li', { class: 'sheet' },
      el('div', { class: 'sheet-text' },
        el('h3', {}, service.title),
        el('p', {}, service.body),
        tagList(service.tags)),
      el('div', { class: 'sheet-art' }, safeUrl(service.image)
        ? picture(service.image, '', service.tone, '')
        : drawing(service.art))), service.tone);
    sheet.style.zIndex = String(items.length - i);
    stack.append(sheet);
    return sheet;
  });
  section.append(el('div', { class: 'stage' },
    el('div', { class: 'section-head' }, el('h2', {}, services.heading)),
    el('div', { class: 'stack-area' }, stack),
    controls.node));

  let shown = 0;
  let active = -1;
  scenes.push((instant) => {
    const target = dwell(progressOf(section) * Math.max(0, items.length - 1));
    shown = instant ? target : shown + (target - shown) * 0.14;
    sheets.forEach((sheet, i) => {
      const gone = clamp(shown - i); // 0 = on the pile, 1 = tilted away
      const waiting = Math.max(0, i - shown);
      sheet.style.transform = gone > 0
        ? `translate3d(0, ${-gone * 55}%, 0) rotateX(${gone * 62}deg) rotateZ(${gone * (i % 2 ? 3 : -3)}deg)`
        : `translate3d(0, ${Math.min(waiting, 3) * 18}px, 0) scale(${1 - Math.min(waiting, 3) * 0.04})`;
      sheet.style.opacity = String(1 - clamp((gone - 0.35) / 0.55));
    });
    const nearest = Math.round(shown);
    if (nearest !== active) {
      active = nearest;
      sheets.forEach((sheet, i) => sheet.classList.toggle('front', i === active));
      controls.update(active);
    }
  });
  return section;
}

function aboutChapter(about) {
  const panel = (name, ...children) => el('div', { class: `panel ${name}` }, ...children);
  const hasHistory = about.experience.length > 0;
  const bento = el('div', { class: 'bento' },
    panel('bio', ...about.bio.split(/\n+/).filter(Boolean).map((p) => el('p', {}, p))),
    panel('portrait', picture(about.photo, 'Portrait of Tobi', '#16306f', 'Your photo')),
    ...about.facts.map((fact) => panel('fact', el('strong', {}, fact.value), el('span', {}, fact.label))));
  const strands = about.strands.length > 0 && el('div', { class: 'strands' },
    about.strands.map((strand) => panel('strand', el('h4', {}, strand.title), el('p', {}, strand.body), tagList(strand.tags))));
  const extras = (about.skills.length > 0 || hasHistory) && el('div', { class: 'extras' },
    about.skills.length > 0 && panel('skills', el('h3', {}, 'More skills'), tagList(about.skills)),
    hasHistory && panel('history', el('h3', {}, 'Experience and education'),
      el('ol', {}, about.experience.map((e) => el('li', {}, el('strong', {}, e.role), el('span', {}, e.place), el('span', {}, e.years))))));
  const section = el('section', { class: 'chapter about', id: 'about' },
    el('h2', {}, about.heading), bento,
    strands && about.strandsHeading && el('h3', { class: 'strands-heading' }, about.strandsHeading),
    strands, extras);
  // A soft light follows the pointer across the panels.
  section.addEventListener('pointermove', (event) => {
    for (const node of section.querySelectorAll('.panel')) {
      const box = node.getBoundingClientRect();
      node.style.setProperty('--mx', `${event.clientX - box.left}px`);
      node.style.setProperty('--my', `${event.clientY - box.top}px`);
    }
  });
  return section;
}

function wordsChapter(words, { scenes }) {
  const fan = el('ul', { class: 'fan' }, words.items.map((item, i) => {
    const card = el('li', {}, el('blockquote', {}, el('p', {}, item.quote), el('footer', {}, el('strong', {}, item.person), el('span', {}, item.detail))));
    card.style.setProperty('--turn', `${(i - (words.items.length - 1) / 2) * 4}deg`);
    return card;
  }));
  const section = el('section', { class: 'chapter words', id: 'words' }, el('h2', {}, words.heading), fan);
  scenes.push(() => {
    const box = section.getBoundingClientRect();
    fan.style.setProperty('--open', clamp((innerHeight - box.top) / (innerHeight * 0.8)).toFixed(3));
  });
  return section;
}

function contactChapter(contact, { name, scenes }) {
  const email = contact.email.trim();
  const horizon = el('div', { class: 'horizon', 'aria-hidden': 'true' });
  const section = el('section', { class: 'chapter contact', id: 'contact' },
    horizon,
    el('div', { class: 'contact-copy' },
      el('h2', {}, contact.heading),
      el('p', {}, contact.body),
      el('p', { class: 'actions' },
        email && el('a', { class: 'button solid', href: `mailto:${email}` }, `Email ${email}`),
        contact.links.filter((l) => safeUrl(l.url)).map((l) => el('a', { class: 'button ghost', href: safeUrl(l.url), target: '_blank', rel: 'noopener' }, l.label)))),
    el('footer', {}, `© ${new Date().getFullYear()} ${name}`));
  scenes.push(() => {
    const box = section.getBoundingClientRect();
    horizon.style.setProperty('--lift', (1 - clamp((innerHeight - box.top) / box.height)).toFixed(4));
  });
  return section;
}

const BUILDERS = { work: workChapter, gallery: galleryChapter, studio: studioChapter, services: servicesChapter, about: aboutChapter, words: wordsChapter, contact: contactChapter };

// ---------- render ----------

function render(next) {
  content = next;
  const { theme, site } = content;
  const root = document.documentElement;
  for (const key of ['night', 'accent', 'light', 'gold', 'paper']) root.style.setProperty(`--${key}`, theme[key]);
  root.style.setProperty('--ink', inkFor(theme.night));
  root.style.setProperty('--on-accent', inkFor(theme.accent));
  root.style.setProperty('--on-paper', inkFor(theme.paper));
  calm = theme.motion === 'calm' || reducedMotion.matches;
  root.classList.toggle('calm', calm);
  document.querySelector('.brand').textContent = site.name;
  document.querySelector('.brand').setAttribute('href', '/');

  const visible = content.order.filter((id) => {
    const section = content[id];
    return section.visible && !(section.items && section.items.length === 0);
  });
  lights?.destroy();
  lights = undefined;
  scenes = [];

  const home = route === '/' || route === '/index.html';
  document.body.classList.toggle('subpage', !home);
  if (home) {
    main.replaceChildren(heroChapter(content), ...visible.map((id) => BUILDERS[id](content[id], { scenes, isCalm: () => calm, name: site.fullName || site.name })));
    if (!calm) lights = nameField(main.querySelector('.name'), theme);
    document.title = site.pageTitle;
  } else {
    const work = content.work;
    const index = work.visible ? projectSlugs(work.items).indexOf(route.slice('/work/'.length)) : -1;
    const page = route === '/work' ? projectsPage(work.visible ? work : { ...work, items: [] }) : projectPage(work, index);
    main.replaceChildren(page);
    document.title = `${route === '/work' ? 'All projects' : work.items[index]?.title || 'Project not found'} | ${site.name}`;
  }

  const anchor = (id) => (home ? `#${id}` : `/#${id}`);
  const links = visible.map((id) => [id, content[id].navLabel || id]);
  menu.replaceChildren(...links.map(([id, label]) => (!home && id === 'work'
    ? el('a', { href: '/work', 'aria-current': 'page' }, label)
    : el('a', { href: anchor(id) }, label))));
  rail.replaceChildren(...(home ? [['top', 'Start'], ...links].map(([id, label]) => el('a', { href: `#${id}` }, el('span', {}, label))) : []));
  frame(true);
}

function markChapter() {
  if (document.body.classList.contains('subpage')) return;
  let current = 'top';
  for (const section of main.querySelectorAll('section[id]')) {
    if (section.getBoundingClientRect().top <= innerHeight / 2) current = section.id;
  }
  for (const a of [...rail.children, ...menu.children]) {
    if (a.hash === `#${current}`) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
  document.body.dataset.chapter = current;
}

function frame(instant = false) {
  markChapter();
  if (calm) return; // Without motion, nothing is moved or hidden.
  for (const scene of scenes) scene(instant);
}

let running = 0;
let frames = 0;
function tick() {
  frame(false);
  // Keep drawing for a moment after the last scroll so easing can settle.
  running = --frames > 0 ? requestAnimationFrame(tick) : 0;
}
function wake() {
  frames = 60;
  if (!running) running = requestAnimationFrame(tick);
}
addEventListener('scroll', wake, { passive: true });
addEventListener('resize', () => { frame(true); wake(); });
reducedMotion.addEventListener('change', () => content && render(content));

// ---------- menu ----------

function setMenu(open) {
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.textContent = open ? 'Close' : 'Menu';
  document.body.classList.toggle('menu-open', open);
}
menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); menuButton.focus(); }
});

// ---------- start ----------

if (isPreview) {
  // The dashboard sends unsaved edits here so you can see them before publishing.
  const show = (next, y = 0) => {
    render(next);
    scrollTo({ top: y, behavior: 'instant' });
    frame(true);
  };
  addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type !== 'preview') return;
    const next = cleanContent(event.data.content);
    const { jump } = event.data;
    const before = route;
    if (jump?.startsWith('project:')) route = `/work/${projectSlugs(next.work.items)[Number(jump.slice(8))]}`;
    else if (jump) route = '/';
    show(next, before === route ? scrollY : 0);
    if (jump && !jump.startsWith('project:')) document.getElementById(jump)?.scrollIntoView({ behavior: 'instant' });
    frame(true);
  });
  // Keep links to project pages inside the preview, so unsaved edits stay visible.
  main.parentElement.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="/"]');
    if (!link || link.target) return;
    event.preventDefault();
    const url = new URL(link.href);
    route = url.pathname;
    show(content);
    if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  });
}

try {
  const response = await fetch('/api/content');
  if (!response.ok) throw new Error(response.statusText);
  render(await response.json());
  if (location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  if (isPreview) window.parent.postMessage({ type: 'preview-ready' }, location.origin);
} catch {
  main.replaceChildren(el('p', { class: 'notice' }, 'The portfolio could not load. Refresh the page to try again.'));
}
