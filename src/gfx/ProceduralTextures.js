import * as THREE from 'three';

const cache = new Map();

function canvasTexture(key, size, draw, { wrap = true, repeat = 2 } = {}) {
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (wrap) tex.repeat.set(repeat, repeat);
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Soft rice grain noise for California / Onigiri. */
export function riceTexture() {
  return canvasTexture('rice', 128, (ctx, s) => {
    ctx.fillStyle = '#f7f2e8';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const a = 0.08 + Math.random() * 0.12;
      ctx.fillStyle = `rgba(210,200,185,${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.2 + Math.random(), 0.5 + Math.random() * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: 3 });
}

/** Fried batter / panko speckles. */
export function batterTexture() {
  return canvasTexture('batter', 128, (ctx, s) => {
    ctx.fillStyle = '#e8b84a';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 1 + Math.random() * 3;
      ctx.fillStyle = Math.random() > 0.5
        ? `rgba(200,140,40,${0.25 + Math.random() * 0.4})`
        : `rgba(255,230,160,${0.15 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: 2 });
}

/** Nori seaweed weave. */
export function noriTexture() {
  return canvasTexture('nori', 64, (ctx, s) => {
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(40,70,40,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < s; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i);
      ctx.stroke();
    }
  }, { repeat: 4 });
}

/** Wood plank grain for platforms. */
export function woodGrainTexture() {
  return canvasTexture('wood', 256, (ctx, s) => {
    ctx.fillStyle = '#6b4226';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * s + Math.sin(i) * 3;
      ctx.strokeStyle = `rgba(${40 + (i % 5) * 8},${25 + (i % 3) * 6},12,${0.15 + (i % 4) * 0.05})`;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < s; x += 8) {
        ctx.lineTo(x, y + Math.sin(x * 0.08 + i) * 2.5);
      }
      ctx.stroke();
    }
  }, { repeat: 1.5 });
}

/** Stone mottling for ground. */
export function stoneTexture() {
  return canvasTexture('stone', 128, (ctx, s) => {
    ctx.fillStyle = '#6a6a70';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 2 + Math.random() * 10;
      const v = 80 + Math.floor(Math.random() * 60);
      ctx.fillStyle = `rgba(${v},${v},${v + 5},${0.15 + Math.random() * 0.25})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: 2 });
}

/** Soft noise normal-ish bump via luminance (used as map tint). */
export function noiseTintTexture(seed = 0) {
  return canvasTexture(`noise-${seed}`, 64, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = 180 + Math.floor(Math.random() * 50);
      img.data[i] = n;
      img.data[i + 1] = n;
      img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: 4 });
}
