import { SCHEMA, SECTION_IDS, blankItem, cleanContent } from '/shared/schema.mjs';

const app = document.querySelector('#app');
const status = document.querySelector('#status');

let content;      // what you are editing
let published;    // what visitors see, as text, to spot unsaved changes
let current = 'layout';
const openItems = new WeakSet();

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'value' || key === 'checked') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

let statusTimer;
function say(message, isError = false) {
  clearTimeout(statusTimer);
  status.textContent = message;
  status.className = isError ? 'error show' : 'show';
  if (!isError) statusTimer = setTimeout(() => { status.className = ''; }, 4000);
}

async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, options); } catch { throw new Error('The server could not be reached. Check that it is running.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'That did not work. Try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

// ---------- sign in ----------

/** Shows the sign-in form. After a timed-out session it keeps your unsaved edits. */
function showSignIn(ready = true) {
  const input = el('input', { type: 'password', id: 'password', autocomplete: 'current-password', required: true });
  const problem = el('p', { class: 'problem', role: 'alert' });
  const form = el('form', { class: 'signin', onsubmit: async (event) => {
    event.preventDefault();
    problem.textContent = '';
    try {
      await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }) });
      status.className = '';
      await openDashboard();
    } catch (error) { problem.textContent = error.message; }
  } },
    el('h1', {}, 'Portfolio dashboard'),
    ready ? null : el('p', { class: 'problem' }, 'The dashboard is locked. Add ADMIN_PASSWORD (10 characters or more) to the .env file, then restart the server.'),
    el('label', { for: 'password' }, 'Password'), input,
    el('button', { class: 'primary', disabled: !ready }, 'Sign in'),
    problem,
    el('a', { href: '/' }, 'View the portfolio'));
  app.replaceChildren(form);
  input.focus();
}

async function openDashboard() {
  if (!content) {
    content = cleanContent(await api('/api/content'));
    published = JSON.stringify(content);
  }
  buildShell();
}

// ---------- saving ----------

const isDirty = () => JSON.stringify(content) !== published;
let publishButton, discardButton, saveState, preview, previewReady = false, previewTimer;

function changed() {
  const dirty = isDirty();
  publishButton.disabled = !dirty;
  discardButton.disabled = !dirty;
  saveState.textContent = dirty ? 'Unpublished changes' : 'Everything is published';
  saveState.classList.toggle('dirty', dirty);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(sendPreview, 250);
}

function sendPreview(jump) {
  if (previewReady) preview.contentWindow.postMessage({ type: 'preview', content, jump }, location.origin);
}

async function publish() {
  publishButton.disabled = true;
  const sent = JSON.stringify(content);
  try {
    const saved = await api('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: sent });
    published = JSON.stringify(saved);
    // Keep anything typed while the save was in progress.
    if (JSON.stringify(content) === sent) { content = saved; drawEditor(); }
    changed();
    say('Published. Visitors now see your changes.');
  } catch (error) {
    changed();
    if (error.status === 401) { showSignIn(); say('Your session ended. Sign in again; your edits are still here.', true); }
    else say(error.message, true);
  }
}

addEventListener('beforeunload', (event) => { if (content && isDirty()) event.preventDefault(); });
addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && publishButton?.isConnected) {
    event.preventDefault();
    if (isDirty()) publish();
  }
});
addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== preview?.contentWindow) return;
  if (event.data?.type === 'preview-ready') { previewReady = true; sendPreview(); }
});

// ---------- layout of the dashboard ----------

const PAGES = [['layout', 'Page layout'], ...SCHEMA.map((g) => [g.key, g.label])];
let nav, editor;

function buildShell() {
  previewReady = false;
  publishButton = el('button', { class: 'primary', type: 'button', onclick: publish }, 'Publish changes');
  discardButton = el('button', { type: 'button', onclick: () => {
    if (!confirm('Discard every change you have not published?')) return;
    content = JSON.parse(published);
    drawEditor(); changed(); say('Changes discarded.');
  } }, 'Discard changes');
  saveState = el('span', { class: 'save-state' });
  preview = el('iframe', { src: '/?preview=1', title: 'Live preview of your portfolio' });
  const frameHolder = el('div', { class: 'frame-holder' }, preview);
  const sizes = [['Desktop', 1280], ['Phone', 390]].map(([label, width], i) => el('button', { type: 'button', 'aria-pressed': String(i === 0), onclick: (event) => {
    for (const b of sizes) b.setAttribute('aria-pressed', String(b === event.currentTarget));
    frameHolder.dataset.width = width;
    fitPreview(frameHolder);
  } }, label));
  frameHolder.dataset.width = 1280;

  nav = el('nav', { class: 'pages', 'aria-label': 'Parts of your portfolio' });
  editor = el('main', { class: 'editor' });

  app.replaceChildren(el('div', { class: 'shell' },
    el('header', {},
      el('h1', {}, 'Dashboard'), saveState,
      el('div', { class: 'header-actions' },
        el('button', { type: 'button', class: 'preview-toggle', onclick: () => { document.body.classList.toggle('show-preview'); fitPreview(frameHolder); } }, 'Preview'),
        el('a', { class: 'link-button', href: '/', target: '_blank' }, 'Open site'),
        discardButton, publishButton,
        el('button', { type: 'button', onclick: async () => {
          if (isDirty() && !confirm('Sign out and lose the changes you have not published?')) return;
          try { await api('/api/logout', { method: 'POST' }); } catch { /* the session is already gone */ }
          content = undefined;
          showSignIn();
        } }, 'Sign out'))),
    nav, editor,
    el('aside', { class: 'preview' },
      el('div', { class: 'preview-bar' }, el('span', {}, 'Live preview'), el('div', {}, sizes)),
      frameHolder)));

  new ResizeObserver(() => fitPreview(frameHolder)).observe(frameHolder);
  drawEditor();
  changed();
}

/** Show the preview at a real screen width, scaled down to fit the column. */
function fitPreview(holder) {
  const width = Number(holder.dataset.width);
  if (!holder.clientWidth) return;
  const scale = Math.min(1, holder.clientWidth / width);
  preview.style.width = `${width}px`;
  preview.style.height = `${holder.clientHeight / scale}px`;
  preview.style.transform = `scale(${scale})`;
  preview.style.left = `${Math.max(0, (holder.clientWidth - width * scale) / 2)}px`;
}

function drawEditor() {
  nav.replaceChildren(...PAGES.map(([key, label]) => el('button', { type: 'button', 'aria-current': key === current ? 'page' : false, onclick: () => {
    current = key;
    drawEditor();
    editor.scrollTop = 0;
    sendPreview(SECTION_IDS.includes(key) ? key : 'top');
  } }, label)));

  if (current === 'layout') return editor.replaceChildren(...layoutPage());
  const group = SCHEMA.find((g) => g.key === current);
  editor.replaceChildren(...[
    el('h2', {}, group.label),
    group.section && checkbox('Show this section on the site', content[group.key].visible, (v) => { content[group.key].visible = v; }),
    ...group.fields.map((field) => fieldControl(field, content[group.key], `${group.key}-${field.key}`))].filter(Boolean));
}

function move(array, from, to) {
  array.splice(to, 0, ...array.splice(from, 1));
}

function layoutPage() {
  const rows = content.order.map((id, i) => {
    const label = SCHEMA.find((g) => g.key === id).label;
    const shift = (to) => () => {
      move(content.order, i, to);
      drawEditor(); changed();
      editor.querySelector(`[data-row="${id}"] button:not(:disabled)`)?.focus();
    };
    return el('li', { 'data-row': id },
      checkbox(label, content[id].visible, (v) => { content[id].visible = v; }),
      el('span', { class: 'row-actions' },
        el('button', { type: 'button', disabled: i === 0, 'aria-label': `Move ${label} up`, onclick: shift(i - 1) }, 'Move up'),
        el('button', { type: 'button', disabled: i === content.order.length - 1, 'aria-label': `Move ${label} down`, onclick: shift(i + 1) }, 'Move down')));
  });
  return [
    el('h2', {}, 'Page layout'),
    el('p', { class: 'hint' }, 'Choose which sections visitors see and the order they appear in. The opening screen always comes first.'),
    el('ol', { class: 'layout-list' }, rows),
  ];
}

// ---------- form controls ----------

function checkbox(label, checked, onChange) {
  return el('label', { class: 'check' },
    el('input', { type: 'checkbox', checked, onchange: (e) => { onChange(e.target.checked); changed(); } }),
    el('span', {}, label));
}

function fieldControl(field, target, id) {
  const set = (value) => { target[field.key] = value; changed(); };
  const wrap = (control, extra) => el('div', { class: 'field' }, el('label', { for: id }, field.label), control, extra);

  switch (field.type) {
    case 'long':
      return wrap(el('textarea', { id, rows: 4, maxlength: field.max, value: target[field.key], oninput: (e) => set(e.target.value) }));
    case 'choice': {
      const select = el('select', { id, onchange: (e) => set(e.target.value) }, field.options.map(([value, label]) => el('option', { value }, label)));
      select.value = target[field.key];
      return wrap(select);
    }
    case 'color':
      return wrap(el('input', { id, type: 'color', value: target[field.key], oninput: (e) => set(e.target.value) }));
    case 'toggle':
      return checkbox(field.label, target[field.key], (v) => { target[field.key] = v; });
    case 'tags':
      return wrap(el('input', { id, type: 'text', value: target[field.key].join(', '), oninput: (e) => set(e.target.value.split(',').map((t) => t.trim()).filter(Boolean)) }));
    case 'url': {
      const note = el('small', {});
      const check = (v) => { note.textContent = v && !/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(v) ? 'Start the address with https://, or it will not be saved.' : ''; };
      check(target[field.key]);
      return wrap(el('input', { id, type: 'text', inputmode: 'url', maxlength: field.max, placeholder: 'https://', value: target[field.key], oninput: (e) => { set(e.target.value.trim()); check(e.target.value.trim()); } }), note);
    }
    case 'image': return imageControl(field, target, id);
    case 'video': return videoControl(field, target, id);
    case 'list': return listControl(field, target[field.key], id);
    default:
      return wrap(el('input', { id, type: 'text', maxlength: field.max, value: target[field.key], oninput: (e) => set(e.target.value) }));
  }
}

function imageControl(field, target, id) {
  const box = el('div', { class: 'image-box' });
  const draw = () => {
    const url = target[field.key];
    const file = el('input', { id, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', onchange: async (event) => {
      const chosen = event.target.files[0];
      if (!chosen) return;
      if (chosen.size > 5 * 1024 * 1024) return say('That image is over 5 MB. Make it smaller and try again.', true);
      say('Uploading the image…');
      try {
        const result = await api('/api/upload', { method: 'POST', body: chosen });
        target[field.key] = result.url;
        draw(); changed();
        say('Image uploaded. Publish to show it on the site.');
      } catch (error) {
        if (error.status === 401) { showSignIn(); say('Your session ended. Sign in again; your edits are still here.', true); }
        else say(error.message, true);
      }
    } });
    box.replaceChildren(...[
      url ? el('img', { src: url, alt: 'Current image' }) : el('span', { class: 'no-image' }, 'No image yet'),
      el('div', {}, file,
        url && el('button', { type: 'button', onclick: () => { target[field.key] = ''; draw(); changed(); } }, 'Remove image'),
        el('small', {}, 'PNG, JPG, WebP or GIF, up to 5 MB. Around 1600 pixels wide works well.'))].filter(Boolean));
  };
  draw();
  return el('div', { class: 'field' }, el('label', { for: id }, field.label), box);
}

function videoControl(field, target, id) {
  const box = el('div', { class: 'video-box' });
  const draw = () => {
    const url = target[field.key];
    const file = el('input', { type: 'file', accept: 'video/mp4,video/webm', 'aria-label': 'Upload a video file', onchange: async (event) => {
      const chosen = event.target.files[0];
      if (!chosen) return;
      if (chosen.size > 100 * 1024 * 1024) return say('That video is over 100 MB. Compress it, or paste a YouTube or Vimeo link.', true);
      say('Uploading the video. Keep this page open…');
      try {
        const result = await api('/api/upload', { method: 'POST', body: chosen });
        target[field.key] = result.url;
        draw(); changed();
        say('Video uploaded. Publish to show it on the site.');
      } catch (error) {
        if (error.status === 401) { showSignIn(); say('Your session ended. Sign in again; your edits are still here.', true); }
        else say(error.message, true);
      }
    } });
    box.replaceChildren(...[
      el('input', { id, type: 'text', inputmode: 'url', maxlength: field.max, placeholder: 'Paste a YouTube, Vimeo or video link', value: url, onchange: (e) => { target[field.key] = e.target.value.trim(); changed(); } }),
      file,
      url && el('button', { type: 'button', onclick: () => { target[field.key] = ''; draw(); changed(); } }, 'Remove video'),
      el('small', {}, 'Upload an MP4 or WebM up to 100 MB, or paste a link.')].filter(Boolean));
  };
  draw();
  return el('div', { class: 'field' }, el('label', { for: id }, field.label), box);
}

function listControl(field, items, id) {
  const holder = el('fieldset', { class: 'list' });
  const nameOf = (item, i) => item[field.fields[0].key] || item.caption || `Untitled ${field.itemName} ${i + 1}`;
  const draw = () => {
    holder.replaceChildren(
      el('legend', {}, `${field.label} (${items.length} of ${field.max})`),
      ...items.map((item, i) => {
        const title = el('span', {}, nameOf(item, i));
        const redraw = (to) => () => { move(items, i, to); draw(); changed(); };
        const details = el('details', { open: openItems.has(item), ontoggle: (e) => { if (e.target.open) openItems.add(item); else openItems.delete(item); } },
          el('summary', {}, title),
          el('div', { class: 'item-body', oninput: () => { title.textContent = nameOf(item, i); } },
            ...field.fields.map((f) => fieldControl(f, item, `${id}-${i}-${f.key}`)),
            el('div', { class: 'row-actions' },
              id === 'work-items' && el('button', { type: 'button', onclick: () => {
                sendPreview(`project:${i}`);
                document.body.classList.add('show-preview');
              } }, 'Preview this page'),
              el('button', { type: 'button', disabled: i === 0, onclick: redraw(i - 1) }, 'Move up'),
              el('button', { type: 'button', disabled: i === items.length - 1, onclick: redraw(i + 1) }, 'Move down'),
              el('button', { type: 'button', class: 'danger', onclick: () => {
                if (!confirm(`Delete "${nameOf(item, i)}"?`)) return;
                items.splice(i, 1); draw(); changed();
              } }, `Delete ${field.itemName}`))));
        return details;
      }),
      el('button', { type: 'button', class: 'add', disabled: items.length >= field.max, onclick: () => {
        const item = blankItem(field.fields);
        items.push(item); openItems.add(item); draw(); changed();
      } }, `Add ${field.itemName}`));
  };
  draw();
  return holder;
}

// ---------- start ----------

try {
  const session = await api('/api/session');
  if (session.signedIn) await openDashboard();
  else showSignIn(session.ready);
} catch (error) {
  say(error.message, true);
}
