// c:\Users\JEANAFFA\Desktop\MonAppli Gemini\utils.js

// --- FORMATAGE MONÉTAIRE (CFA) ---
function formatCFA(n) {
    return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0);
}

// --- TEXTE VERS CLASSNAME (CSS) ---
// Transforme "Abidjan Nord" en "abidjan-nord" pour les classes CSS
function textToClassName(t) {
    return t ? t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-') : '';
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
