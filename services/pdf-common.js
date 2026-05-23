// Chargement UNIQUE de jsPDF + plugin autotable (versions figées).
//
// Avant : chaque écran réinjectait les scripts avec des versions différentes
// d'autotable (3.5.28 vs 3.8.2) → bug latent. Ici on fige les versions et on
// mémorise la promesse pour ne charger qu'une fois.
//
// Usage : `const { jsPDF } = await loadJsPdf();` puis `new jsPDF(...)`.

const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';

let _pdfPromise = null;

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

export function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf);
    if (_pdfPromise) return _pdfPromise;
    _pdfPromise = injectScript(JSPDF_SRC)
        .then(() => injectScript(AUTOTABLE_SRC))
        .then(() => window.jspdf)
        .catch((e) => { _pdfPromise = null; throw e; });
    return _pdfPromise;
}
