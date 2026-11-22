// The Persona roster at 0:38 supplies the stage and the six clean portrait poses.
// Each is captured just as the old battle caption disappears, before the next pose fades in.
'use strict';
function makeInputSettings() {
  const width = 1920, height = 1080, slots = 8, first = 275, step = 62, rowWidth = 960;
  const aqua = '#29effa';
  const portraits = [
    ['unicorn', 898, 0], ['rakshasa', 880, 0], ['orpheus', 931, 0],
    ['forneus', 809, 0], ['archangel', 879, 40], ['slime', 878, 229],
  ];
  // Quarter-pixel (x,y) offsets measured on nine horizontal lines of each recorded
  // figure at 20 Hz. Interpolation between samples is continuous on a 60 Hz display.
  const motion = [
    [
      [74,-56,74,-56,48,-111,5,-48,11,-15,0,-3,-13,-1,-13,-1,-13,-1],
      [74,-57,74,-57,50,-112,5,-48,10,-14,0,-2,-12,-1,-12,-1,-12,-1],
      [74,-56,74,-56,51,-113,5,-48,10,-13,0,-2,-11,0,-11,-1,-11,-1],
      [74,-55,74,-55,51,-113,5,-48,9,-12,0,-2,-11,0,-12,-1,-12,-1],
      [74,-54,74,-54,51,-113,5,-47,9,-11,1,-2,-14,1,-14,0,-14,0],
      [74,-53,74,-53,51,-112,5,-47,9,-10,2,-2,-15,1,-15,0,-15,0],
      [73,-52,73,-52,52,-111,3,-47,9,-10,3,-1,-14,0,-14,0,-14,0],
      [73,-52,73,-52,52,-110,2,-47,10,-9,4,-1,-12,1,-12,1,-12,1],
      [72,-52,72,-52,51,-109,3,-48,9,-8,3,-1,-10,1,-10,1,-10,1],
      [70,-52,70,-52,50,-105,5,-49,9,-7,3,-1,-8,0,-8,0,-8,0],
      [69,-52,69,-52,50,-102,5,-49,9,-6,3,-1,-6,0,-6,0,-6,0],
      [69,-52,69,-52,50,-100,5,-49,9,-6,3,-1,-5,0,-5,0,-5,0],
      [67,-53,67,-53,49,-97,5,-50,9,-5,4,-1,-4,-1,-4,-1,-4,-1],
      [66,-57,66,-57,48,-93,6,-49,10,-5,5,-2,-3,-1,-3,-1,-3,-1],
      [64,-60,64,-60,48,-89,8,-47,9,-5,5,-1,-3,-1,-3,-1,-3,-1]
    ],
    [
      [-103,-162,-103,-167,-45,-83,-42,-83,-44,-70,-1,-76,-1,-76,-1,-76,-1,-76],
      [-97,-149,-87,-143,-38,-67,-36,-73,-36,-59,-4,-59,-4,-59,-4,-59,-4,-59],
      [-70,-111,-44,-84,-28,-50,-28,-59,-32,-46,-12,-44,-12,-44,-12,-44,-12,-44],
      [-20,-47,-4,-29,-18,-35,-19,-45,-24,-33,-12,-31,-12,-31,-12,-31,-12,-31],
      [3,-8,14,2,-7,-20,-10,-30,-11,-18,18,-30,18,-30,18,-30,18,-30],
      [4,6,20,22,3,-6,-1,-16,3,-4,109,-73,109,-73,109,-73,109,-73],
      [6,31,19,42,15,6,8,-2,16,9,180,-137,181,-141,181,-141,181,-141],
      [12,65,14,57,26,16,18,10,28,20,201,-132,203,-152,203,-152,203,-152],
      [23,78,22,82,35,29,28,24,36,34,202,-95,209,-132,209,-132,209,-132],
      [32,81,35,104,44,44,38,35,43,49,203,-67,209,-106,209,-106,209,-106],
      [43,99,47,121,54,58,46,48,51,64,199,-34,204,-70,204,-70,204,-70],
      [52,118,55,134,63,72,51,62,57,78,189,-2,198,-43,198,-43,198,-43],
      [56,142,59,148,69,88,54,77,61,93,170,34,195,-19,195,-19,195,-19],
      [56,157,60,158,73,103,55,90,61,106,152,62,191,3,191,3,191,3],
      [51,170,57,166,76,114,54,104,60,117,123,95,185,25,185,25,185,25],
      [47,180,54,172,78,121,52,116,59,126,93,121,176,42,176,42,176,42],
      [45,189,52,177,79,124,51,126,57,132,77,132,163,58,163,58,163,58],
      [42,191,52,179,80,124,50,130,54,133,67,135,148,75,148,75,148,75],
      [37,185,51,174,78,120,48,129,50,129,65,132,126,93,126,93,126,93],
      [33,176,53,166,76,114,47,123,45,123,70,123,99,107,99,107,99,107],
      [31,161,53,154,73,106,46,112,38,112,47,117,75,113,75,113,75,113],
      [29,144,47,139,69,97,44,101,33,100,30,111,60,111,60,111,60,111],
      [26,124,39,121,62,86,41,88,29,86,24,101,48,103,48,103,48,103],
      [22,104,32,99,53,75,36,75,25,72,22,89,37,93,37,93,37,93],
      [16,82,24,78,42,62,29,61,18,57,13,71,22,79,22,79,22,79],
      [10,58,17,58,30,48,21,46,12,43,4,52,11,62,11,62,11,62],
      [5,31,11,32,17,27,13,27,6,24,-1,31,2,39,2,39,2,39]
    ],
    [
      [2,-160,2,-160,-3,-173,-4,-191,0,-175,-16,-186,-24,-188,-21,-199,-22,-200],
      [4,-153,3,-153,-2,-166,-3,-183,0,-169,-15,-180,-22,-181,-20,-192,-20,-193],
      [5,-144,4,-144,-1,-158,-3,-175,1,-160,-14,-173,-21,-172,-19,-183,-19,-183],
      [6,-133,5,-133,-1,-147,-2,-163,1,-149,-13,-160,-18,-161,-18,-171,-19,-171],
      [6,-121,6,-121,0,-135,-2,-149,2,-135,-11,-148,-16,-147,-17,-156,-19,-157],
      [6,-107,6,-108,1,-121,-1,-133,2,-121,-10,-138,-14,-131,-15,-140,-16,-141],
      [6,-93,6,-94,2,-106,-1,-117,2,-107,-9,-124,-12,-115,-13,-123,-13,-124],
      [6,-79,6,-79,2,-90,0,-99,2,-92,-8,-106,-10,-98,-11,-104,-11,-105],
      [5,-63,5,-63,2,-73,0,-80,2,-75,-6,-86,-8,-80,-9,-84,-9,-85],
      [4,-47,4,-48,2,-55,0,-60,1,-56,-5,-65,-6,-61,-6,-64,-6,-64],
      [4,-31,3,-31,1,-36,0,-41,1,-37,-3,-43,-4,-41,-4,-43,-4,-43]
    ],
    [
      [3,0,3,0,3,0,3,0,3,0,3,0,3,0,3,0,3,0],
      [3,0,3,0,3,0,3,0,3,0,3,0,3,0,3,0,3,0],
      [2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0],
      [2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0],
      [2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0],
      [2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0],
      [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      [1,-66,1,-66,1,-66,1,-66,1,-84,1,-95,-13,-96,-13,-96,-13,-96],
      [0,-209,0,-209,0,-209,-1,-217,-1,-270,0,-323,-47,-331,-48,-337,-48,-337],
      [-4,-199,-4,-199,-4,-199,-5,-227,-3,-281,-6,-371,-62,-383,-66,-406,-66,-406],
      [-10,-145,-10,-145,-10,-145,-11,-171,-11,-245,-23,-326,-53,-315,-62,-343,-62,-343],
      [-15,-105,-15,-105,-16,-105,-15,-115,-26,-225,-36,-281,-39,-249,-47,-273,-47,-273],
      [-16,-60,-16,-60,-17,-61,-16,-71,-23,-171,-32,-221,-27,-185,-33,-203,-33,-203],
      [-11,-24,-11,-24,-13,-30,-17,-37,-3,-97,-22,-147,-18,-124,-20,-129,-20,-129]
    ],
    [
      [-56,-126,-56,-126,-54,-122,-43,-106,-49,-110,-51,-104,-49,-100,-39,-18,-39,-18],
      [-51,-113,-51,-113,-49,-110,-39,-96,-43,-99,-43,-97,-43,-94,-34,-11,-33,-11],
      [-46,-100,-46,-100,-44,-97,-35,-86,-37,-86,-36,-90,-37,-86,-29,-3,-28,-3],
      [-40,-86,-40,-86,-39,-83,-30,-76,-32,-73,-30,-83,-31,-78,-24,5,-23,5],
      [-34,-72,-34,-72,-33,-69,-25,-65,-26,-61,-24,-71,-24,-68,-19,15,-18,15],
      [-27,-58,-27,-58,-26,-56,-20,-53,-20,-49,-18,-59,-18,-56,-13,9,-13,9],
      [-20,-44,-20,-44,-19,-42,-14,-40,-14,-37,-12,-46,-12,-43,-10,-23,-9,-23],
      [-12,-29,-12,-29,-12,-28,-9,-27,-8,-25,-6,-31,-6,-29,-6,-29,-6,-29]
    ],
    [
      [-67,-33,-64,-42,-54,-55,-36,-56,-12,-34,22,-43,25,-20,24,-16,24,-16],
      [-52,-25,-49,-32,-38,-43,-22,-43,-2,-28,22,-27,35,-14,26,-7,26,-7],
      [-37,-17,-34,-22,-24,-29,-12,-28,3,-17,20,-13,29,-5,22,-1,22,-1],
      [-24,-9,-21,-12,-14,-16,-5,-15,2,-6,16,-4,19,1,17,3,17,3],
      [-11,-3,-9,-4,-5,-5,-1,-5,0,1,9,2,11,4,10,4,10,4]
    ]
  ];
  const images = new Map();
  let loading;
  function warmup() {
    if (!loading) {
      const files = ['water', 'surface', ...portraits.map(p => p[0])];
      loading = Promise.all(files.map(name => new Promise(resolve => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => { images.set(name, image); resolve(); };
        image.onerror = () => resolve();
        image.src = 'assets/input-settings/' + name + '.webp';
      })));
    }
    return loading;
  }

  function sprite(w, h, paint) {
    const image = document.createElement('canvas');
    image.width = w; image.height = h;
    paint(image.getContext('2d'));
    return image;
  }
  const clamp = x => Math.max(0, Math.min(1, x));
  const out = x => 1 - Math.pow(1 - clamp(x), 3);
  function polygon(c, color, points) {
    c.fillStyle = color; c.beginPath(); c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i+1]);
    c.closePath(); c.fill();
  }
  function drawSurface(c, sheet, elapsed) {
    // In the recording each water drawing holds for ten frames at 60 Hz.
    const frame = Math.floor(Math.max(0, elapsed) * 6 / 1000) % 7;
    const sx = frame % 4 * 555, sy = Math.floor(frame / 4) * 192;
    c.drawImage(sheet, sx, sy, 555, 192, 1365, 0, 555, 192);
    // Continue the same mirrored water as the stage plate beneath the sloping title.
    c.drawImage(sheet, sx, sy, 545, 192, 275, 0, 545, 192);
    c.save();
    c.scale(-1, 1);
    c.drawImage(sheet, sx, sy, 545, 192, -1365, 0, 545, 192);
    c.drawImage(sheet, sx, sy, 275, 192, -275, 0, 275, 192);
    c.restore();
  }
  function drawPose(c, index, image, x, y, elapsed, reducedMotion) {
    if (reducedMotion || elapsed < 1) { c.drawImage(image, x, y); return; }
    const poses = motion[index], last = poses.length - 1;
    const phase = (elapsed / 50) % (last*2);
    const cursor = phase < last ? phase : 2*last-phase;
    const a = Math.floor(cursor), b = Math.min(a+1,last), mix = cursor-a;
    const amplitude = out(elapsed / 260) / 4;
    const offset = k => (poses[a][k] + (poses[b][k]-poses[a][k])*mix)*amplitude;
    // Both ends of adjacent strips share the same screen coordinates. The resulting
    // shear follows the recorded head, torso and limbs without double exposure.
    const w=image.naturalWidth, h=image.naturalHeight, bands=poses[0].length/2-1;
    let start=0, x0=offset(0), y0=offset(1);
    for (let i=1;i<=bands;i++) {
      const end=Math.round(i*h/bands), depth=end-start;
      const x1=offset(i*2), y1=offset(i*2+1);
      c.save();
      c.transform(1,0,(x1-x0)/depth,1+(y1-y0)/depth,x+x0,y+start+y0);
      const sample=depth+(i<bands ? 1 : 0);
      c.drawImage(image,0,start,w,sample,0,0,w,sample);
      c.restore();
      start=end; x0=x1; y0=y1;
    }
  }
  function heading() {
    return sprite(1430, 310, c => {
      polygon(c, '#fff', [0,0, 1396,0, 0,304]);
      c.font = '310px MenuI, sans-serif';
      c.save();
      c.scale(1290 / c.measureText('INPUTS').width, 1.10);
      c.fillStyle = '#d4d3d5'; c.fillText('INPUTS', -25, 194);
      c.restore();
    });
  }
  function cursor() {
    return sprite(90, 89, c => {
      polygon(c, '#b5ffff', [4,20, 37,1, 85,38, 62,71, 32,87]);
      polygon(c, '#068cd3', [4,20, 36,3, 79,37, 59,67, 30,85]);
      polygon(c, '#6bf6ff', [7,19, 37,5, 57,27, 21,43]);
      polygon(c, '#23c9fa', [21,43, 57,27, 68,56, 31,79]);
      polygon(c, '#aafcff', [37,5, 75,36, 57,27]);
      polygon(c, '#0ba2dc', [57,27, 78,37, 68,56]);
      polygon(c, '#0874bd', [31,79, 68,56, 58,69]);
      c.strokeStyle = '#e9ffff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(10,16); c.lineTo(37,3); c.lineTo(62,24); c.stroke();
    });
  }
  function portBadge(row) {
    const port = String(row.port || row.defaultName || '');
    const hdmi = /^HDMI\s*(\d+)$/i.exec(port);
    return hdmi ? 'Port ' + hdmi[1] : port === 'TV' || port === 'TV antenna' ? 'Tuner' : port;
  }
  function fitName(c, name, maxWidth) {
    let size = 45;
    c.font = size + 'px RowB, serif';
    const measured = c.measureText(name).width;
    if (measured <= maxWidth) return name;
    size = Math.max(36, Math.floor(size * maxWidth / measured));
    c.font = size + 'px RowB, serif';
    const chars = Array.from(name);
    if (c.measureText(name).width <= maxWidth) return name;
    while (chars.length && c.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
    return chars.join('') + '…';
  }
  function rowSprite(row, focused) {
    return sprite(rowWidth, 78, c => {
      if (focused) {
        c.fillStyle = '#ff123a'; c.beginPath(); c.roundRect(-10, 1, rowWidth+9, 67, 11); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.roundRect(-10, 10, rowWidth+9, 66, 10); c.fill();
      }
      c.fillStyle = focused ? '#00f6ff' : '#07103b';
      c.fillRect(107, 16, 234, 49);
      c.font = '46px HintB, sans-serif'; c.textAlign = 'center';
      c.fillStyle = focused ? '#061435' : aqua;
      c.fillText(portBadge(row), 225, 55, 218);
      c.textAlign = 'left'; c.fillStyle = focused ? '#070817' : '#52e7f8';
      const name = fitName(c, String(row.name || row.defaultName), rowWidth-398);
      c.fillText(name, 367, 54);
    });
  }
  function emptySlot() {
    return sprite(480,24,c => {
      c.strokeStyle = '#35c5ed'; c.lineWidth = 4; c.setLineDash([31,15]);
      c.beginPath(); c.moveTo(0,12); c.lineTo(455,12); c.stroke();
    });
  }
  function headline(text) {
    return sprite(1080, 184, c => {
      c.font = '136px MenuI, sans-serif'; c.fillStyle = '#2fc7ff';
      // The water makes each successive letter sit on a slightly different baseline.
      const chars = Array.from(text), widths = chars.map(ch => c.measureText(ch).width - 8);
      const scale = Math.min(1, 1030/widths.reduce((a,b) => a+b, 0));
      c.translate(24,0); c.scale(scale,1); c.transform(1,0,.15,1,-15,0);
      let x=0;
      for (let i=0;i<chars.length;i++) {
        c.fillText(chars[i], x, 133 + Math.sin(i*.8)*4);
        x+=widths[i];
      }
    });
  }
  function guide(status, hasRow) {
    return sprite(850, 180, c => {
      const tint=c.createLinearGradient(0,0,0,180);
      tint.addColorStop(0,'rgba(1,5,59,0)'); tint.addColorStop(.3,'rgba(1,5,59,.83)'); tint.addColorStop(1,'#030948');
      c.fillStyle=tint; c.fillRect(0,0,850,180);
      const edge=c.createLinearGradient(0,0,125,0);
      edge.addColorStop(0,'transparent'); edge.addColorStop(1,'#fff');
      c.globalCompositeOperation='destination-in'; c.fillStyle=edge; c.fillRect(0,0,850,180);
      c.globalCompositeOperation='source-over';
      c.font='34px HintR, sans-serif'; c.fillStyle='white'; c.textAlign='right';
      c.fillText(status || 'Choose an input to rename.', 804, 77, 750);
      c.fillStyle='#d4efff'; c.font='22px Hint, sans-serif'; c.textAlign='left'; c.fillText('Guide',90,100);
      c.fillStyle='#a7cefd'; c.fillRect(154,94,696,2);
      let right=804;
      function hint(key, label) {
        c.textAlign='right'; c.font='34px Hint, sans-serif'; c.fillStyle='white';
        c.fillText(label,right,152); right-=c.measureText(label).width+13;
        c.font='24px UiBI, sans-serif';
        const w=c.measureText(key).width+20;
        c.lineWidth=3; c.strokeStyle='#fff'; c.beginPath(); c.roundRect(right-w,119,w,37,18); c.stroke();
        c.textAlign='center'; c.fillText(key,right-w/2,146);right-=w+28;
      }
      hint('↩','Back');
      if (hasRow) hint('OK','Rename');
      else if (status.toLowerCase().includes('retry')) hint('OK','Retry');
    });
  }
  let title, gem, dashes, states, priorRows, rowArt, guideArt, lastStatus, hadRow;
  function draw(c, t, rows, selected, top, sinceEntry, sinceSelection, previousSelection, reducedMotion, status='') {
    warmup();
    if (!title) {
      title=heading(); gem=cursor(); dashes=emptySlot();
      states=[headline('DISCONNECTED'),headline('CONNECTED')];
    }
    if (rows !== priorRows) {
      priorRows=rows;
      rowArt=rows.map(row => [rowSprite(row,false),rowSprite(row,true)]);
    }
    const row=rows[selected];
    if (!guideArt || status!==lastStatus || !!row!==hadRow) {
      guideArt=guide(status,!!row);lastStatus=status;hadRow=!!row;
    }
    c.save();
    const water=images.get('water');
    if (water) c.drawImage(water,0,0,width,height);
    else { c.fillStyle='#0a147b';c.fillRect(0,0,width,height); }
    const surface=images.get('surface');
    if (surface && !reducedMotion) drawSurface(c,surface,sinceEntry);
    // Angular pink fragments drift upward across the water throughout the roster shot.
    if (!reducedMotion) {
      for (let i=0;i<7;i++) {
        const phase=((t*(.032+i*.0025)+i*151)%1240+1240)%1240;
        const x=420+(i*259)%1490+Math.sin(t/1500+i)*24, y=1150-phase;
        const a=(1-Math.cos(phase*Math.PI*2/1240))*.5, k=3+i%3*2;
        c.globalAlpha=.28*a; polygon(c,'#ee29ad',[x-k,y-k*1.7, x+k*2,y, x,y+k, x-k*1.5,y]);
      }
    }
    c.globalAlpha=1;c.drawImage(title,0,0);
    const enter=reducedMotion?1:out((sinceEntry-120)/260);
    const focus=reducedMotion?1:out(sinceSelection/165);
    if (row) {
      const index=selected%portraits.length, art=portraits[index], image=images.get(art[0]);
      if (image) {
        c.globalAlpha=focus*enter;
        const elapsed=Math.max(0,Math.min(sinceEntry-380,sinceSelection-165));
        drawPose(c,index,image,art[1]+(1-enter)*510,art[2],elapsed,reducedMotion);
      }
      const caption=reducedMotion?1:clamp((sinceEntry-455)/180)*clamp(sinceSelection/180);
      c.globalAlpha=caption*.76;
      c.drawImage(states[row.connected?1:0],816,629);
    }
    c.globalAlpha=1;
    for (let i=0;i<slots;i++) {
      const index=top+i, y=first+i*step;
      if (rowArt[index]) c.drawImage(rowArt[index][0],0,y-39);
      else c.drawImage(dashes,148,y-12);
    }
    if (row) {
      const y=first+(selected-top)*step;
      if (!reducedMotion && sinceSelection<78 && previousSelection>=top && previousSelection<top+slots && previousSelection!==selected) {
        c.globalAlpha=.85*(1-clamp(sinceSelection/78));c.fillStyle='#ff1743';
        c.fillRect(0,first+(previousSelection-top)*step-31,rowWidth,18);
      }
      c.globalAlpha=1;c.drawImage(rowArt[selected][1],0,y-39);
      c.drawImage(gem,71+(!reducedMotion?Math.sin(t/180)*2:0),y-45);
    }
    c.drawImage(guideArt,1070,900);
    c.restore();
  }
  return { draw, warmup, get ready() { return warmup(); } };
}
