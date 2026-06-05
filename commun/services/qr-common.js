// Génération de QR code (sans dépendance fragile).
//
// On utilise « qrcode-generator » (Kazuhiko Arase), qui expose un global
// window.qrcode très fiable, puis on dessine NOUS-MÊMES les modules sur un
// canvas -> PNG dataURL directement exploitable par jsPDF.addImage().
//
// Usage : const dataUrl = await makeQrDataUrl('https://...'); // PNG ou null

const QR_SRCS = [
    'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
    'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js'
];

let _qrPromise = null;

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('load failed: ' + src));
        document.head.appendChild(s);
    });
}

export function loadQrLib() {
    if (typeof window.qrcode === 'function') return Promise.resolve(window.qrcode);
    if (_qrPromise) return _qrPromise;
    _qrPromise = (async () => {
        for (const src of QR_SRCS) {
            try {
                await injectScript(src);
                if (typeof window.qrcode === 'function') return window.qrcode;
            } catch (e) { /* essaie le CDN suivant */ }
        }
        throw new Error('qrcode introuvable après chargement');
    })().catch((e) => { _qrPromise = null; throw e; });
    return _qrPromise;
}

// Renvoie un PNG dataURL du QR (ou null si échec). Ne bloque jamais le PDF.
export async function makeQrDataUrl(text, opts = {}) {
    let qrcode;
    try { qrcode = await loadQrLib(); }
    catch (e) { console.warn('[QR] lib non chargée :', e && e.message); return null; }
    try {
        const qr = qrcode(0, 'M'); // type auto, correction d'erreur niveau M
        qr.addData(String(text || ''));
        qr.make();
        const count = qr.getModuleCount();
        const margin = 2; // en modules (zone silencieuse)
        const target = opts.width || 240;
        const cell = Math.max(3, Math.floor(target / (count + margin * 2)));
        const size = (count + margin * 2) * cell;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = opts.light || '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = opts.dark || '#1A3553';
        for (let r = 0; r < count; r++) {
            for (let col = 0; col < count; col++) {
                if (qr.isDark(r, col)) {
                    ctx.fillRect((col + margin) * cell, (r + margin) * cell, cell, cell);
                }
            }
        }
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.warn('[QR] génération échouée :', e && e.message);
        return null;
    }
}
