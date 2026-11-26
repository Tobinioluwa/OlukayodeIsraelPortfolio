// Line drawings for the service sheets. They take the sheet's text colour.
const SVG = 'http://www.w3.org/2000/svg';

function shape(tag, attributes) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

const box = (x, y, width, height, rx = 10, extra = {}) => shape('rect', { x, y, width, height, rx, ...extra });
const path = (d, extra = {}) => shape('path', { d, ...extra });
const circle = (cx, cy, r, extra = {}) => shape('circle', { cx, cy, r, ...extra });
const soft = { class: 'soft' };
const solid = { class: 'solid' };

const DRAWINGS = {
  website: () => [
    box(40, 40, 320, 220, 16), path('M40 78H360'),
    circle(62, 59, 4, solid), circle(78, 59, 4, solid), circle(94, 59, 4, solid),
    box(64, 102, 150, 18, 6, { class: 'solid grow' }), box(64, 132, 118, 9, 4, soft), box(64, 149, 134, 9, 4, soft),
    box(64, 176, 68, 24, 12, solid),
    box(238, 102, 98, 98, 12, soft), path('M246 188l30-36 20 22 14-16 20 30'),
    box(64, 218, 82, 24, 6, soft), box(159, 218, 82, 24, 6, soft), box(254, 218, 82, 24, 6, soft),
  ],
  app: () => [
    box(135, 20, 130, 260, 24), path('M180 36h40'),
    box(150, 56, 100, 62, 10, soft), box(150, 130, 100, 30, 8, { class: 'soft rise' }),
    box(150, 168, 100, 30, 8, { class: 'soft rise two' }), box(150, 206, 100, 30, 8, { class: 'soft rise three' }),
    circle(170, 258, 5, solid), circle(200, 258, 5), circle(230, 258, 5),
    box(36, 92, 74, 120, 14, soft), box(290, 92, 74, 120, 14, soft),
    path('M110 152h19M271 152h19', { class: 'flow' }),
  ],
  camera: () => [
    box(60, 82, 280, 168, 22), path('M132 82l18-30h100l18 30'),
    circle(200, 166, 62), circle(200, 166, 42, soft), circle(200, 166, 20, { class: 'solid pulse' }),
    box(86, 104, 40, 18, 6, solid), circle(308, 112, 8, { class: 'record' }),
    path('M28 66V30h36M336 30h36v36M372 244v36h-36M64 280H28v-36'),
  ],
  story: () => [
    box(46, 46, 220, 128, 20), path('M92 174v40l46-40'),
    path('M76 84h150M76 110h160M76 136h104', { class: 'flow' }),
    box(198, 152, 158, 96, 20, { class: 'soft float' }), path('M312 248v28l-34-28'),
    circle(240, 200, 6, solid), circle(277, 200, 6, solid), circle(314, 200, 6, solid),
  ],
  workflow: () => [
    box(30, 122, 78, 56, 14), box(161, 42, 78, 56, 14), box(161, 202, 78, 56, 14), box(292, 122, 78, 56, 14),
    path('M108 150c30 0 22-80 53-80M108 150c30 0 22 80 53 80M239 70c31 0 22 80 53 80M239 230c31 0 22-80 53-80', { class: 'flow' }),
    circle(69, 150, 11, solid), circle(200, 70, 11, soft), circle(200, 230, 11, soft),
    path('M319 151l10 10 18-21'),
  ],
};

export const DRAWING_NAMES = Object.keys(DRAWINGS);

export function drawing(name) {
  const svg = shape('svg', { viewBox: '0 0 400 300', class: 'drawing', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(...(DRAWINGS[name] || DRAWINGS.website)());
  return svg;
}
