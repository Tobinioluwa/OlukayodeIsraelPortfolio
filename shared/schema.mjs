// One description of every editable field. The admin builds its forms from it,
// and the server uses it to clean whatever gets saved.

const text = (key, label, max = 160) => ({ key, label, type: 'text', max });
const long = (key, label, max = 1200) => ({ key, label, type: 'long', max });
const link = (key, label) => ({ key, label, type: 'url', max: 500 });
const image = (key, label) => ({ key, label, type: 'image', max: 500 });
const video = (key, label) => ({ key, label, type: 'video', max: 500 });
const color = (key, label) => ({ key, label, type: 'color' });
const toggle = (key, label) => ({ key, label, type: 'toggle' });
const choice = (key, label, options) => ({ key, label, type: 'choice', options });
const tags = (key, label) => ({ key, label: `${label} (separate with commas)`, type: 'tags', max: 40 });
const list = (key, label, itemName, fields, max = 24) => ({ key, label, type: 'list', itemName, fields, max });

// Sections that can be reordered and hidden. The opening screen always comes first.
export const SECTION_IDS = ['work', 'gallery', 'services', 'about', 'words', 'contact'];

export const SCHEMA = [
  { key: 'site', label: 'Name and search', fields: [
    text('name', 'Short name (top of every page)', 60),
    text('fullName', 'Full name', 90),
    text('pageTitle', 'Browser tab title', 70),
    long('description', 'Description shown in search results and link previews', 200),
    image('shareImage', 'Link preview image'),
  ] },
  { key: 'theme', label: 'Colours and motion', fields: [
    color('night', 'Background'),
    color('accent', 'Main blue'),
    color('light', 'Light blue'),
    color('gold', 'Gold details'),
    color('paper', 'Services backdrop'),
    choice('motion', 'Motion', [['full', 'Full scroll journey'], ['calm', 'Calm, with no scroll effects']]),
  ] },
  { key: 'hero', label: 'Opening screen', fields: [
    text('greeting', 'Line above the title', 80),
    text('title', 'Big name made of lights (short works best)', 14),
    text('role', 'What you do, in one line', 110),
    long('intro', 'Introduction', 240),
    text('primaryLabel', 'Main button text', 30),
    text('secondaryLabel', 'Second button text', 30),
  ] },
  { key: 'work', label: 'Projects', section: true, fields: [
    text('navLabel', 'Menu name', 20),
    text('heading', 'Heading', 60),
    list('items', 'Projects', 'project', [
      text('title', 'Project name', 60),
      text('slug', 'Page address (optional; set it to keep links working if you rename)', 60),
      text('kind', 'Type of project', 60),
      image('image', 'Cover image'),
      text('imageAlt', 'Describe the image for screen readers', 160),
      color('tone', 'Card colour when there is no image'),
      tags('tags', 'Tags'),
      long('problem', 'Problem'),
      long('solution', 'What you designed'),
      long('role', 'Your role', 300),
      long('outcome', 'Outcome (only real results)', 500),
      link('link', 'Live project link'),
      list('videos', 'Walkthrough videos', 'video', [
        text('title', 'Video title', 60),
        long('description', 'What the video shows', 240),
        video('src', 'Video'),
        image('poster', 'Picture shown before it plays'),
      ], 8),
      list('screens', 'Screens', 'screen', [
        text('title', 'Screen name', 60),
        long('description', 'What this screen does', 300),
        image('image', 'Screenshot'),
      ], 20),
    ]),
  ] },
  { key: 'gallery', label: 'Photo and video', section: true, fields: [
    text('navLabel', 'Menu name', 20),
    text('heading', 'Heading', 40),
    long('intro', 'Supporting line', 160),
    list('items', 'Photos and videos', 'photo or video', [
      text('caption', 'Caption', 80),
      choice('kind', 'This is a', [['photo', 'Photo'], ['video', 'Video']]),
      image('image', 'Photo, or the picture shown before a video plays'),
      video('video', 'Video (only for videos)'),
      color('tone', 'Colour when there is no image'),
    ], 24),
  ] },
  { key: 'services', label: 'Services', section: true, fields: [
    text('navLabel', 'Menu name', 20),
    text('heading', 'Heading', 60),
    list('items', 'Services', 'service', [
      text('title', 'Service name', 70),
      long('body', 'Description', 280),
      tags('tags', 'What is included'),
      choice('art', 'Drawing', [['website', 'Website'], ['app', 'App screens'], ['camera', 'Camera'], ['story', 'Conversation'], ['workflow', 'Workflow']]),
      image('image', 'Your own image (replaces the drawing)'),
      color('tone', 'Sheet colour'),
    ], 8),
  ] },
  { key: 'about', label: 'About', section: true, fields: [
    text('navLabel', 'Menu name', 20),
    text('heading', 'Heading', 60),
    long('bio', 'About you', 900),
    image('photo', 'Your photo'),
    text('strandsHeading', 'Heading above your areas of work', 60),
    list('strands', 'Areas of work', 'area', [
      text('title', 'Area name', 30),
      long('body', 'How you use it', 220),
      tags('tags', 'Skills in this area'),
    ], 4),
    tags('skills', 'Other skills'),
    list('facts', 'Highlights', 'highlight', [text('value', 'Large text', 12), text('label', 'Explanation', 60)], 4),
    list('experience', 'Experience and education', 'entry', [
      text('role', 'Role or qualification', 70), text('place', 'Company or school', 70), text('years', 'Years', 30),
    ], 10),
  ] },
  { key: 'words', label: 'Testimonials', section: true, fields: [
    text('navLabel', 'Menu name', 20),
    text('heading', 'Heading', 60),
    list('items', 'Testimonials', 'testimonial', [
      long('quote', 'Quote (use real words, with permission)', 360), text('person', 'Name', 60), text('detail', 'Role or company', 80),
    ], 8),
  ] },
  { key: 'contact', label: 'Contact', section: true, fields: [
    text('navLabel', 'Menu name', 20),
    text('heading', 'Heading', 60),
    long('body', 'Supporting line', 240),
    text('email', 'Public email address', 120),
    list('links', 'Profile links', 'link', [text('label', 'Name', 30), link('url', 'Address')], 8),
  ] },
];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Allow web, mail and phone links, plus paths on this site. Anything else becomes empty. */
export function safeUrl(value) {
  const url = String(value ?? '').trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  if (/^\/(?![\/\\])/.test(url) || /^#/.test(url)) return url;
  return '';
}

function cleanString(value, max) {
  return (typeof value === 'string' ? value : '').slice(0, max);
}

function cleanField(field, value) {
  switch (field.type) {
    case 'color': return /^#[0-9a-f]{6}$/i.test(value) ? value : '#1a120e';
    case 'toggle': return value === true;
    case 'choice': return field.options.some(([v]) => v === value) ? value : field.options[0][0];
    case 'url':
    case 'video':
    case 'image': return safeUrl(cleanString(value, field.max));
    case 'tags': return (Array.isArray(value) ? value : []).slice(0, 24).map((t) => cleanString(t, field.max).trim()).filter(Boolean);
    case 'list': return (Array.isArray(value) ? value : []).slice(0, field.max).map((item) => cleanGroup(field.fields, item));
    default: return cleanString(value, field.max);
  }
}

function cleanGroup(fields, value) {
  const source = isObject(value) ? value : {};
  return Object.fromEntries(fields.map((f) => [f.key, cleanField(f, source[f.key])]));
}

export function cleanContent(input) {
  const source = isObject(input) ? input : {};
  const out = {};
  for (const group of SCHEMA) {
    out[group.key] = cleanGroup(group.fields, source[group.key]);
    if (group.section) out[group.key].visible = source[group.key]?.visible !== false;
  }
  const order = (Array.isArray(source.order) ? source.order : []).filter((id) => SECTION_IDS.includes(id));
  out.order = [...new Set([...order, ...SECTION_IDS])];
  return out;
}

export function slugify(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
}

/** One unique page address per project, in the same order as the projects. */
export function projectSlugs(items) {
  const used = new Set();
  return items.map((item) => {
    const base = slugify(item.slug || item.title);
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

/** A blank list item with sensible starting values. */
export const blankItem = (fields) => cleanGroup(fields, {});
