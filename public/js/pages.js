// The pages visitors open to look at work closely: all projects, and one project.
import { projectSlugs, safeUrl } from '/shared/schema.mjs';
import { el, picture, tagList, openViewer, shapeFrame } from '/js/dom.js';

// ---------- all projects ----------

export function projectsPage(work) {
  const slugs = projectSlugs(work.items);
  const cards = work.items.map((project, i) => ({
    project,
    node: el('li', { class: 'tile' },
      el('div', { class: 'tile-cover' }, picture(project.image, '', project.tone, project.title)),
      el('div', { class: 'tile-text' },
        tagList(project.tags),
        el('h2', {}, project.title),
        el('p', { class: 'tile-kind' }, project.kind),
        project.problem && el('div', { class: 'insight' }, el('h3', {}, 'Problem'), el('p', {}, project.problem)),
        project.solution && el('div', { class: 'insight' }, el('h3', {}, 'Solution'), el('p', {}, project.solution)),
        el('a', { class: 'button solid stretched', href: `/work/${slugs[i]}`, 'aria-label': `View project: ${project.title}` }, 'View project'))),
  }));

  const count = el('p', { class: 'count', role: 'status' });
  const allTags = [...new Set(work.items.flatMap((p) => p.tags))];
  let chosen = '';
  const filters = ['', ...allTags].map((tag) => el('button', { type: 'button', onclick: () => { chosen = tag; apply(); } }, tag || 'All'));
  function apply() {
    let shown = 0;
    for (const { project, node } of cards) {
      node.hidden = Boolean(chosen) && !project.tags.includes(chosen);
      if (!node.hidden) shown += 1;
    }
    filters.forEach((button, i) => button.setAttribute('aria-pressed', String(['', ...allTags][i] === chosen)));
    count.textContent = `Showing ${shown} ${shown === 1 ? 'project' : 'projects'}`;
  }
  apply();

  return el('section', { class: 'page', id: 'projects' },
    el('h1', {}, 'All projects'),
    allTags.length > 1 && el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by type' }, filters),
    count,
    el('ul', { class: 'tiles' }, cards.map((c) => c.node)));
}

// ---------- one project ----------

/** Turn a YouTube or Vimeo link into its player address. */
function playerFor(url) {
  const youtube = url.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}`;
  const vimeo = url.match(/^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : '';
}

export function videoFrame(video, project, emptyLabel = 'Your walkthrough video goes here') {
  return shapeFrame(player(video, project, emptyLabel), { shape: video.shape, image: video.poster, video: video.src });
}

function player(video, project, emptyLabel) {
  const url = safeUrl(video.src);
  if (!url) {
    return el('div', { class: 'media empty' }, picture(video.poster, '', project.tone, emptyLabel), el('span', { class: 'play', 'aria-hidden': 'true' }));
  }
  const player = playerFor(url);
  if (player) {
    return el('div', { class: 'media' }, el('iframe', { src: player, title: video.title || `${project.title} video`, loading: 'lazy', allow: 'fullscreen; picture-in-picture; encrypted-media', allowfullscreen: true }));
  }
  return el('div', { class: 'media' }, el('video', {
    src: url, poster: safeUrl(video.poster) || false, controls: true, playsinline: true, preload: 'metadata',
    'aria-label': video.title || `${project.title} video`,
    // Only one video plays at a time.
    onplay: (event) => { for (const other of document.querySelectorAll('video')) if (other !== event.target) other.pause(); },
  }));
}

const numbered = (kind, index, title) => el('h3', {}, el('span', { class: 'number' }, `${kind} ${index + 1}`), title);

export function projectPage(work, index) {
  const slugs = projectSlugs(work.items);
  const project = work.items[index];
  if (!project) {
    return el('section', { class: 'page missing' },
      el('h1', {}, 'That project is not here'),
      el('p', {}, 'It may have been renamed or removed.'),
      el('a', { class: 'button solid', href: '/work' }, 'See all projects'));
  }
  const url = safeUrl(project.link);
  const nextIndex = (index + 1) % work.items.length;
  const next = work.items[nextIndex];
  const insight = (heading, body) => body && el('section', { class: 'insight' }, el('h2', {}, heading), el('p', {}, body));

  return el('article', { class: 'page project', id: 'project' },
    el('a', { class: 'back', href: '/work' }, 'Back to all projects'),
    el('header', {},
      tagList(project.tags),
      el('h1', {}, project.title),
      el('p', { class: 'project-kind' }, project.kind),
      el('p', { class: 'project-actions' },
        project.videos.length > 0 && el('button', { type: 'button', class: 'button solid', onclick: () => document.getElementById('videos').scrollIntoView() }, project.videos.length > 1 ? 'Watch the videos' : 'Watch the video'),
        url && el('a', { class: 'button ghost', href: url, target: '_blank', rel: 'noopener' }, /^https:\/\/(www\.)?github\.com\//i.test(url) ? 'View the code on GitHub' : 'Visit the live project'))),
    safeUrl(project.image) && el('div', { class: 'cover' }, picture(project.image, project.imageAlt, project.tone, '')),
    el('div', { class: 'insights' },
      insight('Problem', project.problem),
      insight('Solution', project.solution),
      insight('My role', project.role),
      insight('Outcome', project.outcome)),
    project.videos.length > 0 && el('section', { class: 'media-list', id: 'videos', 'aria-label': 'Walkthrough videos' },
      project.videos.map((video, i) => el('div', { class: 'media-block' },
        el('div', { class: 'media-note' }, numbered('Video', i, video.title), el('p', {}, video.description)),
        videoFrame(video, project)))),
    project.screens.length > 0 && el('section', { class: 'media-list', 'aria-label': 'Screens' },
      project.screens.map((screen, i) => el('div', { class: 'media-block' },
        el('div', { class: 'media-note' }, numbered('Screen', i, screen.title), el('p', {}, screen.description)),
        safeUrl(screen.image)
          ? el('button', { type: 'button', class: 'screen', 'aria-label': `Enlarge ${screen.title || 'screenshot'}`, onclick: () => openViewer(screen.title || project.title, el('img', { src: safeUrl(screen.image), alt: screen.description || screen.title })) },
            el('img', { src: safeUrl(screen.image), alt: screen.description || screen.title, loading: 'lazy' }))
          : el('div', { class: 'media' }, picture('', '', project.tone, 'Your screenshot goes here'))))),
    work.items.length > 1 && el('a', { class: 'next', href: `/work/${slugs[nextIndex]}` },
      el('span', {}, 'Next project'),
      el('strong', {}, next.title),
      el('span', {}, next.kind)));
}
