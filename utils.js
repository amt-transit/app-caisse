// c:\Users\JEANAFFA\Desktop\MonAppli Gemini\utils.js

// --- ECRAN DE CHARGEMENT GLOBAL ---
// Injecte l'écran IMMÉDIATEMENT dès que le script est lu (plus rapide que DOMContentLoaded)
(function initLoader() {
    if (document.getElementById('global-loader')) return;

    const loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:#f8fafc; z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; transition:opacity 0.4s ease;";
    loader.innerHTML = `
        <div style="position: relative; width: 70px; height: 70px; display: flex; justify-content: center; align-items: center;">
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 4px solid #cbd5e1; border-top-color: #3b82f6; border-radius: 50%; animation: spinLoader 1s linear infinite; box-sizing: border-box;"></div>
            <img src="favicon.png" alt="Favicon" style="width: 32px; height: 32px; object-fit: contain;">
        </div>
        <p style="margin-top:20px; color:#475569; font-family:sans-serif; font-weight:600; font-size:16px;">Chargement en cours...</p>
        <style>@keyframes spinLoader { 100% { transform: rotate(360deg); } }</style>
    `;
        
    if (document.body) {
        document.body.appendChild(loader);
    } else {
        const observer = new MutationObserver(() => {
            if (document.body) {
                document.body.appendChild(loader);
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true });
    }
})();

window.addEventListener('load', () => {
    // Délai supplémentaire (600ms) pour laisser le temps à Firebase d'afficher les premiers résultats
    setTimeout(() => {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 400); // Suppression du DOM après le fondu
        }
    }, 600);
});

// --- FORMATAGE MONÉTAIRE (CFA) ---
function formatCFA(n) {
    return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0);
}

// --- TEXTE VERS CLASSNAME (CSS) ---
// Transforme "Abidjan Nord" en "abidjan-nord" pour les classes CSS
function textToClassName(t) {
    return t ? t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-') : '';
}

// --- NETTOYAGE DES CHAÎNES DE CARACTÈRES ---
function cleanString(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        // Supprime les caractères invisibles de largeur nulle (Zero-width spaces)
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Remplace tous les types d'espaces (y compris les espaces insécables \u00A0) et sauts de ligne par un espace unique
        .replace(/\s+/g, ' ')
        .trim();
}

// --- DÉTECTION COMMUNE ---
// Liste utilisée par detectCommune
const UTILS_COMMUNES = {
    'COCODY': ['COCODY', 'ANGRE', 'RIVIERA', '2 PLATEAUX', 'PALMERAIE', 'GOLF', 'AMBASSADE'],
    'YOPOUGON': ['YOPOUGON', 'YOP', 'NIANGON', 'TOITS ROUGES', 'MAROC', 'ANDOKOI', 'SIDECI'],
    'ABOBO': ['ABOBO', 'PK 18', 'BOCABO', 'DOKUI', 'PLATEAU DOKUI'],
    'ADJAME': ['ADJAME', '220 LOGEMENTS', 'WILLIAMSVILLE'],
    'KOUMASSI': ['KOUMASSI', 'REMBLAIS', 'SOWETO', 'INCHALLAH', 'ZOE'],
    'MARCORY': ['MARCORY', 'ZONE 4', 'BIETRY', 'CHAMPROUX', 'INJS', 'PRIMA'],
    'TREICHVILLE': ['TREICHVILLE', 'BIAFRA', 'NANA YAMOUSSO'],
    'ATTECOUBE': ['ATTECOUBE', 'SEBROKO'],
    'PORT-BOUET': ['PORT-BOUET', 'PORT BOUET', 'AEROPORT', 'VRIDI', 'GONZAGUEVILLE', 'JEAN FOLLY'],
    'BINGERVILLE': ['BINGERVILLE', 'FEH KESSE'],
    'SONGON': ['SONGON', 'KASSEM'],
    'ANYAMA': ['ANYAMA'],
    'PLATEAU': ['PLATEAU', 'CITE ADMINISTRATIVE']
};

function detectCommune(lieu) {
    if (!lieu) return 'AUTRE';
    const upper = lieu.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Supprime les accents

    for (const [key, keywords] of Object.entries(UTILS_COMMUNES)) {
        if (keywords.some(kw => upper.includes(kw))) return key;
    }
    return 'AUTRE';
}

// --- BOUTON RETOUR EN HAUT (Global & Modals) ---
function initBackToTopButton() {
    // 1. Bouton Global (Window)
    let backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn) {
        backToTopBtn = document.createElement('button');
        backToTopBtn.id = 'backToTopBtn';
        backToTopBtn.title = 'Retour en haut';
        backToTopBtn.innerHTML = '&#8593;';
        document.body.appendChild(backToTopBtn);
        backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    const toggleGlobalBtn = () => {
        if ((window.pageYOffset || document.documentElement.scrollTop) > 300) backToTopBtn.classList.add('show');
        else backToTopBtn.classList.remove('show');
    };
    window.addEventListener('scroll', toggleGlobalBtn, { passive: true });

    // 2. Boutons Modals (.modal-content)
    const attachModalButtons = () => {
        document.querySelectorAll('.modal-content').forEach(modalContent => {
            if (modalContent.dataset.hasBackToTop) return;
            
            const modalBtn = document.createElement('button');
            modalBtn.className = 'modal-back-to-top';
            modalBtn.innerHTML = '&#8593;';
            modalBtn.title = 'Haut de page';
            modalContent.appendChild(modalBtn);
            modalContent.dataset.hasBackToTop = "true";

            modalBtn.addEventListener('click', () => modalContent.scrollTo({ top: 0, behavior: 'smooth' }));

            modalContent.addEventListener('scroll', () => {
                if (modalContent.scrollTop > 200) modalBtn.classList.add('show');
                else modalBtn.classList.remove('show');
            }, { passive: true });
        });
    };

    attachModalButtons();
    const observer = new MutationObserver(attachModalButtons);
    observer.observe(document.body, { childList: true, subtree: true });
}

// --- GESTIONNAIRE DE MODALES ESTHÉTIQUES (Remplacement Alert/Confirm/Prompt) ---
window.AppModal = {
    init: function() {
        if (document.getElementById('app-modal-overlay')) return;
        const html = `
            <div id="app-modal-overlay" class="app-modal-overlay">
                <div class="app-modal-box">
                    <div class="app-modal-icon" id="app-modal-icon"></div>
                    <h3 class="app-modal-title" id="app-modal-title"></h3>
                    <p class="app-modal-message" id="app-modal-message"></p>
                    <input type="text" id="app-modal-input" class="app-modal-input" style="display:none;" autocomplete="off">
                    <div class="app-modal-actions">
                        <button id="app-modal-cancel" class="app-modal-btn app-modal-btn-cancel">Annuler</button>
                        <button id="app-modal-confirm" class="app-modal-btn app-modal-btn-confirm">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    },
    show: function(options) {
        return new Promise((resolve) => {
            this.init();
            const overlay = document.getElementById('app-modal-overlay');
            const title = document.getElementById('app-modal-title');
            const message = document.getElementById('app-modal-message');
            const icon = document.getElementById('app-modal-icon');
            const input = document.getElementById('app-modal-input');
            const btnCancel = document.getElementById('app-modal-cancel');
            const btnConfirm = document.getElementById('app-modal-confirm');

            title.textContent = options.title || 'Information';
            message.innerHTML = (options.message || '').replace(/\n/g, '<br>');
            
            btnCancel.style.display = (options.type === 'confirm' || options.type === 'prompt') ? 'block' : 'none';
            btnConfirm.className = options.isDanger ? 'app-modal-btn app-modal-btn-danger' : 'app-modal-btn app-modal-btn-confirm';
            btnConfirm.textContent = options.confirmText || 'OK';

            if (options.type === 'prompt') {
                input.style.display = 'block';
                input.value = options.defaultValue || '';
                setTimeout(() => { input.focus(); input.select(); }, 100);
            } else {
                input.style.display = 'none';
            }

            if (options.type === 'error') icon.innerHTML = '❌';
            else if (options.type === 'success') icon.innerHTML = '✅';
            else if (options.type === 'confirm') icon.innerHTML = '❓';
            else icon.innerHTML = '💡';

            overlay.classList.add('active');

            const cleanup = () => { overlay.classList.remove('active'); btnConfirm.onclick = null; btnCancel.onclick = null; };
            btnConfirm.onclick = () => { cleanup(); resolve(options.type === 'prompt' ? input.value : true); };
            btnCancel.onclick = () => { cleanup(); resolve(options.type === 'prompt' ? null : false); };
        });
    },
    alert: function(message, title='Information') { return this.show({ type: 'info', message, title }); },
    error: function(message, title='Erreur') { return this.show({ type: 'error', message, title }); },
    success: function(message, title='Succès') { return this.show({ type: 'success', message, title }); },
    confirm: function(message, title='Confirmation', isDanger=false) { return this.show({ type: 'confirm', message, title, isDanger, confirmText: 'Confirmer' }); },
    prompt: function(message, defaultValue='', title='Saisie') { return this.show({ type: 'prompt', message, title, defaultValue, confirmText: 'Valider' }); }
};
