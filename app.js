// Service worker registration (offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js'));
}

// PWA install prompt
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn?.classList.remove('hidden');
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) { alert('Su iPhone: usa Condividi → Aggiungi a Home'); return; }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

// Elements
const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const exportBtn = document.getElementById('exportBtn');
const copyHexBtn = document.getElementById('copyHexBtn');
const imgCanvas = document.getElementById('imgCanvas');
const results = document.getElementById('results');
const swatchesEl = document.getElementById('swatches');
const hexList = document.getElementById('hexList');

let imageBitmap = null;
let palette = [];

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const imgURL = URL.createObjectURL(file);
  const img = await createImageBitmap(await (await fetch(imgURL)).blob());
  const { w, h } = fitSize(img.width, img.height, 480);
  imgCanvas.width = w; imgCanvas.height = h;
  const ctx = imgCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  imageBitmap = img;
  analyzeBtn.disabled = false;
  exportBtn.disabled = true;
  results.classList.add('hidden');
});

analyzeBtn.addEventListener('click', () => {
  if (!imageBitmap) return;
  const ctx = imgCanvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, imgCanvas.width, imgCanvas.height).data;
  palette = kmeansPalette(data, 5, 10);
  renderPalette(palette);
  exportBtn.disabled = false;
  results.classList.remove('hidden');
  localStorage.setItem('pixelpalette:last', JSON.stringify(palette));
});

copyHexBtn.addEventListener('click', async () => {
  const text = hexList.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyHexBtn.textContent = 'Copiato ✔';
    setTimeout(() => (copyHexBtn.textContent = 'Copia HEX'), 1200);
  } catch {
    alert('Seleziona e copia manualmente.');
  }
});

exportBtn.addEventListener('click', () => {
  if (!palette.length) return;
  const png = palettePNG(palette, 1500, 360);
  const a = document.createElement('a');
  a.href = png;
  a.download = 'palette.png';
  a.click();
});

function fitSize(w, h, max) {
  if (Math.max(w, h) <= max) return { w, h };
  if (w >= h) return { w: max, h: Math.round(h * (max / w)) };
  return { w: Math.round(w * (max / h)), h: max };
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function renderPalette(cols) {
  swatchesEl.innerHTML = '';
  const hexes = cols.map(rgbToHex);
  hexList.value = hexes.join('\n');
  for (const c of cols) {
    const hex = rgbToHex(c);
    const box = document.createElement('div');
    box.className = 'swatch';
    box.innerHTML = `<div class="colorbox" style="background:${hex}"></div><div class="hex">${hex}</div>`;
    swatchesEl.appendChild(box);
  }
}
function kmeansPalette(data, k = 5, iters = 10) {
  const pixels = [];
  const stride = 16; // sample for speed
  for (let i = 0; i < data.length; i += stride) {
    const a = data[i + 3];
    if (a < 16) continue;
    pixels.push([data[i], data[i+1], data[i+2]]);
  }
  if (!pixels.length) return [[0,0,0]];
  const centroids = [];
  for (let i = 0; i < k; i++) centroids.push(pixels[Math.floor(Math.random()*pixels.length)].slice());
  let assignments = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < iters; iter++) {
    for (let p = 0; p < pixels.length; p++) {
      const px = pixels[p];
      let best=0, bestd=Infinity;
      for (let c=0;c<k;c++){
        const d = dist2(px, centroids[c]);
        if (d<bestd){bestd=d;best=c;}
      }
      assignments[p]=best;
    }
    const sums = Array.from({length:k},()=>[0,0,0,0]);
    for (let p=0;p<pixels.length;p++){
      const c=assignments[p];
      sums[c][0]+=pixels[p][0];
      sums[c][1]+=pixels[p][1];
      sums[c][2]+=pixels[p][2];
      sums[c][3]+=1;
    }
    for (let c=0;c<k;c++){
      const n=sums[c][3]||1;
      centroids[c]=[Math.round(sums[c][0]/n), Math.round(sums[c][1]/n), Math.round(sums[c][2]/n)];
    }
  }
  const counts = new Array(k).fill(0); assignments.forEach(c=>counts[c]++);
  return centroids.map((c,i)=>({c,n:counts[i]})).sort((a,b)=>b.n-a.n).map(o=>o.c);
}
function dist2(a,b){const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2];return dr*dr+dg*dg+db*db;}
function palettePNG(cols, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const bw = Math.floor(w / cols.length);
  cols.forEach((rgb, i) => {
    ctx.fillStyle = rgbToHex(rgb);
    ctx.fillRect(i*bw, 0, bw, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px ui-monospace, monospace';
    ctx.fillText(rgbToHex(rgb), i*bw + 16, h - 18);
  });
  return c.toDataURL('image/png');
}
// restore last
(() => {
  const last = localStorage.getItem('pixelpalette:last');
  if (!last) return;
  try { palette = JSON.parse(last); renderPalette(palette); results.classList.remove('hidden'); exportBtn.disabled = false; } catch {}
})();
