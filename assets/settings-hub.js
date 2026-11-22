// The System screen in the menu recording uses a round window with a revolving title.
function makeSettingsHub() {
  const W = 1920, H = 1080, cx = 1549, cy = -195, radius = 1111;
  const text = ['APPS', 'INPUT SETTINGS'];
  const hints = ['Manage apps', 'Rename TV inputs'];
  const rows = [{ x: 1434, y: 299, angle: -.105 }, { x: 1470, y: 414, angle: -.063 }];
  const room = new Image(), surface = new Image();
  room.src = 'assets/settings-hub/room.webp';
  surface.src = 'assets/settings-hub/surface.webp';
  const ready = Promise.all([room, surface].map(image => {
    if (image.decode) return image.decode().catch(() => {});
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
  const clamp = n => Math.min(1, Math.max(0, n));
  const ease = n => 1 - (1 - clamp(n)) ** 3;
  const phase = (n, start, duration) => clamp((n - start) / duration);
  function layer(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    return canvas;
  }
  function triangle(c, ax, ay, bx, by, dx, dy, color) {
    c.fillStyle = color;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(dx, dy); c.closePath(); c.fill();
  }

  // Words and their selection wedges are rasterized once, including the black
  // overhanging part of the letters where the oblique white wedge cuts them off.
  function command(label, row, selected) {
    const scratch = layer(1, 1).getContext('2d');
    const size = row ? (selected ? 96 : 83) : (selected ? 113 : 92);
    scratch.font = size + 'px MenuI, sans-serif';
    scratch.letterSpacing = (-size * .045) + 'px';
    scratch.wordSpacing = '10px';
    const wordWidth = Math.ceil(scratch.measureText(label).width * .93);
    const image = layer(wordWidth + 200, size + 87), c = image.getContext('2d');
    const x = image.width / 2, y = image.height * .65;
    c.font = scratch.font; c.letterSpacing = scratch.letterSpacing; c.wordSpacing = scratch.wordSpacing; c.textAlign = 'center';
    const word = color => {
      c.save(); c.translate(x, y); c.transform(.93, 0, -.18, 1, 0, 0);
      c.fillStyle = color;
      // Match the tight, heavy italic type in the game's System stack.
      c.fillText(label, -1.4, 0); c.fillText(label, 1.4, 0); c.fillText(label, 0, -.9); c.restore();
    };
    if (!selected) {
      word(row ? '#28dcff' : '#8cfcff');
      return image;
    }
    const l = x - wordWidth / 2 - 72, r = x + wordWidth / 2 + 64;
    const point = y - .28 * size, top = y - .95 * size, base = y + .18 * size;
    function blade(offset) {
      c.beginPath(); c.moveTo(l - offset, point + offset * .2);
      c.lineTo(x - wordWidth / 2 + .28 * size, y - .65 * size - offset * .45);
      c.lineTo(r + offset, top - offset * .55); c.lineTo(r - 49 + offset * .4, base + offset * .63);
      c.lineTo(x - wordWidth / 2 + size * .34, y + .04 * size + offset * .4); c.closePath();
    }
    blade(13); c.fillStyle = '#ff0080'; c.fill();
    word('#080413');
    c.save(); blade(0);
    c.fillStyle = '#fff'; c.fill(); c.clip(); word('#f10000'); c.restore();
    return image;
  }

  function guide(caption) {
    const image = layer(514, 136), c = image.getContext('2d');
    c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = '#070b2c'; c.fillStyle = '#fff';
    function outlined(label, x, y) { c.strokeText(label, x, y); c.fillText(label, x, y); }
    c.textAlign = 'right'; c.font = '30px UiBI, sans-serif'; outlined(caption, 465, 38);
    const left = 465 - c.measureText(caption).width;
    c.textAlign = 'left'; c.font = 'italic bold 14px sans-serif'; outlined('Command', left, 57);
    c.fillStyle = '#080d29'; c.fillRect(left + 73, 49, 514 - left - 73, 7);
    c.fillStyle = '#fff'; c.fillRect(left + 73, 52, 514 - left - 73, 2);
    c.textAlign = 'right'; c.font = '23px UiBI, sans-serif'; outlined('OK  Confirm      Back  Return', 465, 100);
    return image;
  }

  let glyphs, choices, help, plate;
  function warmup() {
    if (!glyphs) {
      const c = layer(1, 1).getContext('2d');
      c.font = '379px MenuI, sans-serif';
      glyphs = Array.from('SETTINGS', letter => {
        const advance = c.measureText(letter).width;
        const image = layer(Math.ceil(advance + 120), 386), ic = image.getContext('2d');
        ic.font = c.font; ic.fillStyle = '#050505'; ic.textAlign = 'center';
        ic.fillText(letter, image.width / 2, 326);
        return { advance, image };
      });
      choices = text.map((label, i) => [command(label, i, false), command(label, i, true)]);
      help = hints.map(guide);
    }
  }
  if (document.fonts) document.fonts.ready.then(() => { glyphs = choices = help = plate = null; });

  function backdrop(c, rotation) {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    let angle = 2.674 + rotation;
    const bandRadius = 1385, spacing = .86;
    for (const {advance, image} of glyphs) {
      const half = spacing * advance / (2 * bandRadius);
      angle -= half;
      c.save(); c.translate(cx + bandRadius * Math.cos(angle), cy + bandRadius * Math.sin(angle));
      c.rotate(angle - Math.PI / 2); c.scale(.94, 1); c.drawImage(image, -image.width / 2, -326); c.restore();
      angle -= half;
    }
    if (room.naturalWidth) c.drawImage(room, 0, 0, W, H);
    else {
      c.fillStyle = '#090950'; c.beginPath(); c.arc(cx, cy, radius, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111780'; c.beginPath(); c.arc(cx + 60, cy - 35, radius, 0, Math.PI * 2); c.fill();
    }
  }
  room.onload = () => { plate = null; };
  function steadyPlate() {
    if (!plate) { plate = layer(W, H); backdrop(plate.getContext('2d'), 0); }
    return plate;
  }

  // The edge-on glass flecks are particularly visible when they cross the title.
  const flakes = [
    [129, 630, 24, .4, '#f4baee'], [404, 865, 40, 2.8, '#ffa964'],
    [674, 774, 37, 1.3, '#58deff'], [785, 918, 39, 3.6, '#887eff'],
    [935, 859, 27, 4.4, '#ff66c7'], [1050, 809, 34, 5.8, '#e71746'],
    [557, 1031, 16, 2.1, '#a1f4ff']
  ];
  function glass(c, t) {
    for (const [x, y, size, offset, color] of flakes) {
      const a = offset + t * .00068, spin = Math.cos(a), sway = Math.sin(a);
      c.save(); c.translate(x + sway * 13, y + Math.cos(a * .75) * 16); c.rotate(a * .45);
      c.globalAlpha *= .20 + .50 * Math.abs(spin);
      triangle(c, -size * spin, 2, size * spin * .75, -size * .45, size * spin * .40, size * .58, color);
      c.restore();
    }
  }
  function iris(c, progress) {
    const r = 1640 * Math.pow(progress, 2.0), x = 608, y = 401;
    c.beginPath();
    c.moveTo(x - .62*r, y - .78*r);
    c.bezierCurveTo(x - .19*r, y - .82*r, x + .06*r, y - 1.07*r, x + .48*r, y - .95*r);
    c.bezierCurveTo(x + .86*r, y - .86*r, x + 1.06*r, y - .36*r, x + .99*r, y + .02*r);
    c.bezierCurveTo(x + .85*r, y + .41*r, x + .74*r, y + .85*r, x + .37*r, y + .99*r);
    c.bezierCurveTo(x - .06*r, y + 1.12*r, x - .27*r, y + .78*r, x - .67*r, y + .66*r);
    c.bezierCurveTo(x - 1.16*r, y + .49*r, x - 1.06*r, y - .63*r, x - .62*r, y - .78*r);
    c.closePath(); c.clip();
  }
  function draw(c, t, selected, sinceEntry, sinceSelection, previousSelection, reducedMotion) {
    warmup();
    const age = reducedMotion ? 1500 : Math.max(0, sinceEntry);
    c.save();
    if (age < 340) {
      c.fillStyle = 'rgba(7, 37, 175,' + (.73 * ease(age / 140)) + ')';
      c.fillRect(0, 0, W, H);
      iris(c, phase(age, 44, 296));
    }
    const turn = (1 - ease(phase(age, 216, 536))) * 1.62;
    if (turn > .001) backdrop(c, turn);
    else c.drawImage(steadyPlate(), 0, 0);
    if (surface.naturalWidth && !reducedMotion) {
      const step = Math.floor(t * 60 / 1000) % 94, frame = Math.min(step, 94 - step);
      c.drawImage(surface, frame % 4 * 960, Math.floor(frame / 4) * 158, 960, 158, 452, 0, 1468, 240);
    }
    glass(c, reducedMotion ? 0 : t);
    const selectionIn = reducedMotion || previousSelection === selected ? 1 : ease(sinceSelection / 125);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], reveal = ease(phase(age, 378 + (1 - i) * 98, 265));
      if (reveal === 0) continue;
      const focused = selected === i, normal = choices[i][0];
      c.save(); c.translate(row.x + 65 * (1 - reveal), row.y + 24 * (1 - reveal));
      c.rotate(row.angle); c.globalAlpha *= reveal;
      const scale = focused ? selectionIn * ease(phase(age, 652, 203)) : 0;
      if (scale < 1) {
        c.save(); c.globalAlpha *= 1 - scale;
        c.drawImage(normal, -normal.width / 2, -normal.height / 2); c.restore();
      }
      if (focused) {
        const hot = choices[i][1];
        if (scale > 0) {
          c.globalAlpha *= scale; c.scale(.91 + .09 * scale, .80 + .20 * scale);
          c.drawImage(hot, -hot.width / 2, -hot.height / 2);
        }
      }
      c.restore();
    }
    c.globalAlpha *= ease(phase(age, 297, 220));
    c.drawImage(help[selected], W - 514, H - 136);
    c.restore();
  }
  return { draw, warmup, ready };
}
