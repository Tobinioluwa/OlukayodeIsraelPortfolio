// The opening: thousands of small lights rise from the horizon and gather into a name.
// They move away from the pointer, burst when clicked, and drift apart as you scroll.

const REACH = 120; // extra drawing room around the name, so lights can fly past it

export function nameField(heading, colors) {
  const label = heading.firstElementChild;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'name-lights';
  const context = canvas.getContext('2d');
  if (!context) return { scatter() {}, destroy() {} };

  const hero = heading.closest('section');
  const pointer = { x: -9999, y: -9999 };
  let dots = [];
  let groups = [];
  let width = 0;
  let height = 0;
  let radius = 90;
  let spread = 0;
  let frame = 0;
  let started = 0;
  let visible = true;
  let alive = true;

  /** Draw the name off screen, then place a light wherever there is ink. */
  function build() {
    const box = heading.getBoundingClientRect();
    if (!box.width) return;
    const style = getComputedStyle(label);
    width = Math.round(box.width) + REACH * 2;
    height = Math.round(box.height) + REACH * 2;
    const ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const stencil = document.createElement('canvas');
    stencil.width = width;
    stencil.height = height;
    const ink = stencil.getContext('2d', { willReadFrequently: true });
    const text = label.textContent.toUpperCase();
    let size = parseFloat(style.fontSize);
    const useFont = () => { ink.font = `${style.fontWeight} ${size}px ${style.fontFamily}`; };
    useFont();
    const room = box.width * 0.96;
    const measured = ink.measureText(text).width;
    if (measured > room) { size *= room / measured; useFont(); }
    ink.textAlign = 'center';
    ink.textBaseline = 'middle';
    ink.fillText(text, width / 2, height / 2);
    const pixels = ink.getImageData(0, 0, width, height).data;

    const limit = innerWidth < 700 ? 2200 : 4800;
    let gap = 3;
    let points;
    do {
      points = [];
      for (let y = 0, row = 0; y < height; y += gap, row += 1) {
        for (let x = row % 2 ? gap / 2 : 0; x < width; x += gap) {
          if (pixels[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 140) points.push([x, y]);
        }
      }
      gap += 1;
    } while (points.length > limit);

    const dot = Math.max(1.8, (gap - 1) * 0.66);
    radius = Math.max(60, size * 0.42);
    // Four shades, drawn one at a time. Gold is only a pinch.
    groups = [[], [], [], []];
    dots = points.map(([tx, ty]) => {
      const chance = Math.random();
      const shade = chance < 0.025 ? 3 : chance < 0.3 ? 0 : chance < 0.72 ? 1 : 2;
      // Start on a wide arc below the name, like lights lifting off the horizon.
      const angle = Math.PI * (1.15 + Math.random() * 0.7);
      const distance = width * (0.55 + Math.random() * 0.25);
      const item = {
        tx, ty,
        x: width / 2 + Math.cos(angle) * distance,
        y: height + distance * 0.75 + Math.sin(angle) * distance * 0.55,
        vx: 0, vy: 0,
        wait: (tx / width) * 700 + Math.random() * 350,
        phase: Math.random() * Math.PI * 2,
        drift: Math.random() * 2 - 1,
        size: shade === 3 ? dot * 1.35 : dot * (0.8 + Math.random() * 0.4),
      };
      groups[shade].push(item);
      return item;
    });
    heading.append(canvas);
    heading.classList.add('lit');
    started = performance.now();
    draw(started);
    run();
  }

  function draw(now) {
    context.clearRect(0, 0, width, height);
    const age = now - started;
    const sweep = ((now * 0.00022) % 1.8 - 0.4) * width; // a glint that crosses the name
    const palette = [colors.accent, colors.light, '#ffffff', colors.gold];
    for (let shade = 0; shade < groups.length; shade += 1) {
      context.fillStyle = palette[shade];
      for (const d of groups[shade]) {
        if (age > d.wait) {
          const goalX = d.tx + (d.tx - width / 2) * spread * 1.4 + Math.sin(now * 0.0016 + d.phase) * 0.9 + d.drift * spread * 90;
          const goalY = d.ty + (d.ty - height / 2) * spread * 2.2 + Math.cos(now * 0.0019 + d.phase) * 0.9 - spread * 60 * Math.abs(d.drift);
          d.vx += (goalX - d.x) * 0.022;
          d.vy += (goalY - d.y) * 0.022;
          const dx = d.x - pointer.x;
          const dy = d.y - pointer.y;
          const near = dx * dx + dy * dy;
          if (near < radius * radius && near > 0.01) {
            const length = Math.sqrt(near);
            const push = (1 - length / radius) * 4.2;
            d.vx += (dx / length) * push;
            d.vy += (dy / length) * push;
          }
          d.vx *= 0.84;
          d.vy *= 0.84;
          d.x += d.vx;
          d.y += d.vy;
        }
        const glint = Math.abs(d.x - sweep - (d.y - height / 2) * 0.35) < 26 ? 1.45 : 1;
        const s = d.size * glint;
        context.fillRect(d.x - s / 2, d.y - s / 2, s, s);
      }
    }
  }

  function tick(now) {
    frame = 0;
    draw(now);
    run();
  }
  function run() {
    if (alive && visible && !frame) frame = requestAnimationFrame(tick);
  }

  const locate = (event) => {
    const box = canvas.getBoundingClientRect();
    pointer.x = event.clientX - box.left;
    pointer.y = event.clientY - box.top;
  };
  const leave = () => { pointer.x = -9999; pointer.y = -9999; };
  const burst = (event) => {
    if (event.target.closest('a, button')) return;
    locate(event);
    for (const d of dots) {
      const dx = d.x - pointer.x;
      const dy = d.y - pointer.y;
      const length = Math.max(20, Math.hypot(dx, dy));
      const force = Math.min(34, 2600 / length) * (0.5 + Math.random());
      d.vx += (dx / length) * force;
      d.vy += (dy / length) * force;
    }
    if (event.pointerType !== 'mouse') setTimeout(leave, 250);
  };
  hero.addEventListener('pointermove', locate);
  hero.addEventListener('pointerleave', leave);
  hero.addEventListener('pointercancel', leave);
  hero.addEventListener('pointerdown', burst);

  // Stop drawing when the opening is off screen.
  const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; run(); });
  watcher.observe(hero);

  let lastWidth = 0;
  const resizer = new ResizeObserver(([entry]) => {
    const next = Math.round(entry.contentRect.width);
    if (next && next !== lastWidth) { lastWidth = next; build(); }
  });
  document.fonts.load('800 100px Unbounded').catch(() => {}).then(() => { if (alive) resizer.observe(heading); });

  return {
    /** 0 keeps the name together; 1 has drifted fully apart. */
    scatter(amount) { spread = amount; },
    destroy() {
      alive = false;
      cancelAnimationFrame(frame);
      watcher.disconnect();
      resizer.disconnect();
    },
  };
}
