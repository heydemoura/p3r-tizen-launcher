// Each pose maps its screen tiles to native-resolution pixels shared by the loop.
'use strict';
function makeHomeMotion(canvas, spec, map, pages, capture, software) {
  const cols = spec.width / spec.tile, rows = Math.ceil(spec.height / spec.tile);
  const tilesPerRow = spec.pageSize / spec.tile;
  const damage = !software && typeof HOME_MOTION_DAMAGE !== 'undefined' ? HOME_MOTION_DAMAGE : null;
  const matches = damage && damage.columns === cols && damage.rows === rows && damage.frames === spec.frames;
  const gl = !software && canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: Boolean(capture || matches) });
  if (!gl) return softwareMotion();

  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  if (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) < pages.length + 1) throw Error('Insufficient texture units for Home');
  const samplers = pages.map((_, i) => 'uniform sampler2D page' + i + ';').join('\n');
  const samples = pages.map((image, i) => {
    const sample = 'gl_FragColor = texture2D(page' + i + ', texel / vec2(' + image.naturalWidth + '.0,' + image.naturalHeight + '.0));';
    return i < pages.length - 1 ? 'if (bank < ' + (i + 0.5) + ') {' + sample + '} else ' : '{' + sample + '}';
  }).join('');
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, `attribute vec2 p; void main(){
    gl_Position = vec4(p * vec2(2.0 / ${cols}.0, -2.0 / ${rows}.0) + vec2(-1.,1.), 0., 1.);
  }`));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision highp float;
    uniform sampler2D poses; uniform vec2 origin;
    ${samplers}
    void main() {
      vec2 pixel = floor(vec2(gl_FragCoord.x, ${spec.height}.0 - gl_FragCoord.y));
      vec2 cell = floor(pixel / ${spec.tile}.0);
      vec3 id = floor(texture2D(poses, (origin + cell + 0.5) / vec2(${map.naturalWidth}.0,${map.naturalHeight}.0)).rgb * 255.0 + 0.5);
      float index = dot(id, vec3(1.0, 256.0, 65536.0));
      float bank = floor(index / ${tilesPerRow * tilesPerRow}.0);
      vec2 tile = vec2(mod(index, ${tilesPerRow}.0), mod(floor(index / ${tilesPerRow}.0), ${tilesPerRow}.0));
      vec2 texel = tile * ${spec.tile}.0 + mod(pixel, ${spec.tile}.0) + 0.5;
      ${samples}
    }`));
  gl.bindAttribLocation(program, 0, 'p'); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  // The first four vertices always cover the whole pose. The remaining triangles update
  // only the rectangles that changed, in one draw call for each adjacent pair of poses.
  const corners = [0, 0, cols, 0, 0, rows, cols, rows];
  let vertices = new Float32Array(corners), offsets = null;
  if (matches && gl.getContextAttributes().preserveDrawingBuffer) {
    try {
      const rects = atob(damage.rects), limits = damage.offsets;
      if (limits.length !== spec.frames || limits[0] !== 0 || limits[limits.length - 1] * 4 !== rects.length) {
        throw Error('Incomplete Home damage map');
      }
      const mesh = new Uint8Array(8 + rects.length * 3);
      mesh.set(corners);
      for (let i = 0, v = 8; i < rects.length; i += 4, v += 12) {
        const x1 = rects.charCodeAt(i), y1 = rects.charCodeAt(i + 1);
        const x2 = rects.charCodeAt(i + 2), y2 = rects.charCodeAt(i + 3);
        mesh[v] = x1;     mesh[v+1] = y1; mesh[v+2] = x2; mesh[v+3] = y1;
        mesh[v+4] = x1;   mesh[v+5] = y2; mesh[v+6] = x2; mesh[v+7] = y1;
        mesh[v+8] = x2;   mesh[v+9] = y2; mesh[v+10] = x1; mesh[v+11] = y2;
      }
      vertices = mesh;
      offsets = limits;
    } catch (_) { /* A missing or damaged optional map leaves full-frame drawing available. */ }
  }
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, offsets ? gl.UNSIGNED_BYTE : gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND); gl.disable(gl.DITHER);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  for (const [unit, image] of [map, ...pages].entries()) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.uniform1i(gl.getUniformLocation(program, unit === 0 ? 'poses' : 'page' + (unit - 1)), unit);
  }
  if (gl.getError() !== gl.NO_ERROR) throw Error('Could not upload Home textures');
  const origin = gl.getUniformLocation(program, 'origin');
  map = pages = null; // Textures now own the pixels.
  let lastPose = -2;
  return { backend: 'webgl', draw(pose) {
    gl.uniform2f(origin, (pose % spec.posesAcross) * cols, Math.floor(pose / spec.posesAcross) * rows);
    if (offsets && Math.abs(pose - lastPose) === 1) {
      const edge = Math.min(pose, lastPose);
      gl.drawArrays(gl.TRIANGLES, 4 + offsets[edge] * 6, (offsets[edge + 1] - offsets[edge]) * 6);
    } else {
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    lastPose = pose;
  } };

  // Browsers without WebGL use the same source pixels and reuse tiles that did not move.
  function softwareMotion() {
    function pixels(image) {
      const source = document.createElement('canvas');
      source.width = image.naturalWidth; source.height = image.naturalHeight;
      const ctx = source.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, source.width, source.height).data;
    }
    const lookup = pixels(map), banks = pages.map(image => new Uint32Array(pixels(image).buffer));
    const ctx = canvas.getContext('2d', { alpha: false });
    const frame = ctx.createImageData(spec.width, spec.height), output = new Uint32Array(frame.data.buffer);
    const previous = new Int32Array(cols * rows).fill(-1);
    return { backend: 'canvas2d', draw(pose) {
      const left = (pose % spec.posesAcross) * cols, top = Math.floor(pose / spec.posesAcross) * rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const p = 4 * ((top + y) * map.naturalWidth + left + x), id = lookup[p] + 256 * lookup[p + 1] + 65536 * lookup[p + 2];
        if (previous[y * cols + x] === id) continue;
        previous[y * cols + x] = id;
        const tile = id % (tilesPerRow * tilesPerRow), bank = banks[Math.floor(id / (tilesPerRow * tilesPerRow))];
        let src = (Math.floor(tile / tilesPerRow) * spec.pageSize + tile % tilesPerRow) * spec.tile;
        let dst = (y * spec.width + x) * spec.tile;
        for (let row = 0; row < spec.tile && y * spec.tile + row < spec.height; row++) {
          for (let col = 0; col < spec.tile; col++) output[dst + col] = bank[src + col];
          src += spec.pageSize; dst += spec.width;
        }
      }
      ctx.putImageData(frame, 0, 0);
    } };
  }
}
