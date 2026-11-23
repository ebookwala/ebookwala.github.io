import * as pdfjsLib from './pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

const statusEl = document.getElementById('status');
const viewerEl = document.getElementById('viewer');
const controlsEl = document.getElementById('controls');
const canvas = document.getElementById('pageCanvas');
const ctx = canvas.getContext('2d');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');

let pdfDoc = null;
let currentPage = 1;
let scale = 1.2;
let rendering = false;

function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function updatePageInfo() {
  pageInfo.textContent = 'Page ' + currentPage + ' / ' + pdfDoc.numPages;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= pdfDoc.numPages;
}

async function renderPage(num) {
  if (!pdfDoc || rendering) return;
  rendering = true;
  try {
    const page = await pdfDoc.getPage(num);
    const viewportWidth = viewerEl.clientWidth || window.innerWidth;
    const baseViewport = page.getViewport({ scale: 1 });
    const fitScale = (viewportWidth - 20) / baseViewport.width;
    const viewport = page.getViewport({ scale: Math.max(fitScale, 0.5) * scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    updatePageInfo();
  } catch (e) {
    statusEl.textContent = 'Page render karne mein samasya hui.';
    statusEl.style.display = 'flex';
  } finally {
    rendering = false;
  }
}

prevBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    renderPage(currentPage);
  }
});

nextBtn.addEventListener('click', () => {
  if (pdfDoc && currentPage < pdfDoc.numPages) {
    currentPage += 1;
    renderPage(currentPage);
  }
});

// simple pinch-to-zoom
let lastDist = null;
viewerEl.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastDist != null) {
      const delta = dist - lastDist;
      scale = Math.min(3, Math.max(0.6, scale + delta * 0.004));
      renderPage(currentPage);
    }
    lastDist = dist;
    e.preventDefault();
  }
}, { passive: false });
viewerEl.addEventListener('touchend', () => { lastDist = null; });

async function main() {
  const url = getParam('file');
  if (!url) {
    statusEl.textContent = 'Book file nahi mili.';
    return;
  }
  try {
    const loadingTask = pdfjsLib.getDocument({ url: url, withCredentials: false });
    pdfDoc = await loadingTask.promise;
    statusEl.style.display = 'none';
    viewerEl.style.display = 'flex';
    controlsEl.style.display = 'flex';
    await renderPage(currentPage);
  } catch (e) {
    statusEl.textContent = 'Book load nahi ho payi. Internet check karein.';
  }
}

window.addEventListener('resize', () => { if (pdfDoc) renderPage(currentPage); });

main();
