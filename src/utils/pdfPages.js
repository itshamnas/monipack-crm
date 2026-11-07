/**
 * Turn an uploaded PDF (e.g. a CR certificate) into page images so it can be placed inside our own PDF reports.
 * Uses Mozilla pdf.js (Apache-2.0), served from /vendor/pdfjs and loaded only when needed.
 */
let loading = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/pdfjs/pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { loading = null; reject(new Error('Could not load the PDF reader')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** blob (application/pdf) -> ['data:image/jpeg;base64,…', …] one per page (max 10 pages) */
export async function pdfToImages(blob, { maxPages = 10, scale = 1.6 } = {}) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(canvas.toDataURL('image/jpeg', 0.88));
  }
  return { images: out, totalPages: doc.numPages };
}
