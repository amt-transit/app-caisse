
// --- CONFIGURATION & CONSTANTES (Refactorisation) ---
const CONSTANTS = {
    COLLECTION: 'livraisons',
    ARCHIVE_COLLECTION: 'livraisons_archives',
    STORAGE_KEYS: {
        CONTAINER_NAME: 'currentContainerName'
    },
    COMMUNES: {
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
    },
    DEBOUNCE_DELAY: 300
};

// Configuration PDF.js Worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// --- STATE MANAGEMENT ---
let deliveries = [];
let archivedDeliveries = [];
let filteredDeliveries = [];
let pendingImport = [];
let currentContainerName = localStorage.getItem(CONSTANTS.STORAGE_KEYS.CONTAINER_NAME) || 'Aucun';
let currentTab = 'EN_COURS'; // 'EN_COURS' ou 'A_VENIR'
let selectedIds = new Set(); // Pour stocker les IDs sélectionnés
let currentSort = {
    column: null,
    direction: 'asc' // 'asc' ou 'desc'
};
let itemsPerPage = 100; // Nombre d'éléments par page
let programDetailsSort = { column: null, direction: 'asc' };
let currentProgramView = { date: null, livreur: null };
let isImporting = false;

// --- UTILS (Performance) ---
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedFilterDeliveries = debounce(() => filterDeliveries(), CONSTANTS.DEBOUNCE_DELAY);

// Correction encodage (UTF-8 mal interprété comme "TOURÃ‰")
function fixEncoding(str) {
    if (!str) return '';
    return str
        .replace(/Ã©/g, 'é')
        .replace(/Ã¨/g, 'è')
        .replace(/Ã /g, 'à')
        .replace(/Ã¢/g, 'â')
        .replace(/Ãª/g, 'ê')
        .replace(/Ã®/g, 'î')
        .replace(/Ã´/g, 'ô')
        .replace(/Ã»/g, 'û')
        .replace(/Ã§/g, 'ç')
        .replace(/Ã¯/g, 'ï')
        .replace(/Ã«/g, 'ë')
        .replace(/Ã‰/g, 'É')
        .replace(/Ãˆ/g, 'È')
        .replace(/Ã€/g, 'À');
}

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    if (typeof db === 'undefined') {
        console.error("Firebase DB non initialisé");
        return;
    }
    initRealtimeSync();
    updateContainerTitle();
    initActiveContainerInput();
    initAutoAddress();
    initBackToTopButton();
    initDuplicateCleaner(); // Initialisation du bouton de nettoyage
});

// Synchronisation Temps Réel avec Firestore
function initRealtimeSync() {
    // 1. Migration unique (LocalStorage -> Firebase) si nécessaire
    const localData = localStorage.getItem('deliveries');
    if (localData) {
        const parsed = JSON.parse(localData);
        if (parsed.length > 0 && confirm(`MIGRATION : ${parsed.length} livraisons trouvées en local. Migrer vers le serveur ?`)) {
            const batch = db.batch();
            parsed.forEach(item => {
                const docRef = db.collection(CONSTANTS.COLLECTION).doc();
                const { id, ...data } = item; // On laisse Firestore générer l'ID
                batch.set(docRef, data);
            });
            batch.commit().then(() => {
                localStorage.removeItem('deliveries');
                showToast("Migration terminée !", "success");
            });
        }
    }

    // 2. Écouteur sur la collection 'livraisons'
    db.collection(CONSTANTS.COLLECTION)
        .orderBy('dateAjout', 'desc')
        .limit(2000) // Augmentation de la limite pour voir plus de données
        .onSnapshot((snapshot) => {
            deliveries = [];
            snapshot.forEach((doc) => {
                deliveries.push({ id: doc.id, ...doc.data() });
            });
            
            // Mise à jour de l'interface
            filterDeliveries();
            updateStats();
            updateAutocomplete();
            updateLocationFilterOptions();
            updateAvailableContainersList();
        }, (error) => {
            console.error("Erreur sync:", error);
            showToast("Erreur de synchronisation !", "error");
        });
}

// Gestion des onglets
function switchTab(tab) {
    currentTab = tab;
    
    // Mise à jour visuelle des boutons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (tab === 'EN_COURS') {
        document.getElementById('tabEnCours').classList.add('active');
    } else if (tab === 'A_VENIR') {
        document.getElementById('tabAVenir').classList.add('active');
    } else if (tab === 'PARIS') {
        document.getElementById('tabParis').classList.add('active');
    } else {
        document.getElementById('tabProgramme').classList.add('active');
    }

    // Gestion des barres d'outils (Afficher uniquement celle de l'onglet actif)
    document.querySelectorAll('.tab-toolbar').forEach(el => el.style.display = 'none');
    const activeToolbar = document.getElementById(`toolbar-${tab}`);
    if (activeToolbar) {
        activeToolbar.style.display = 'flex';
    }
    
    // Gestion de la section Conteneur Actif (Visible uniquement sur l'onglet 3)
    const activeContainerSection = document.getElementById('activeContainerSection');
    if (activeContainerSection) {
        const input = document.getElementById('activeContainerInput');
        const btn = activeContainerSection.querySelector('button');
        const label = activeContainerSection.querySelector('span');
        const select = document.getElementById('quickContainerSelect');
        const filterWrapper = document.getElementById('filterContainerWrapper');

        if (tab === 'EN_COURS') {
            activeContainerSection.style.display = 'flex';
            if(input) input.style.display = '';
            if(btn) btn.style.display = '';
            if(label) label.style.display = '';
            if(filterWrapper) filterWrapper.style.display = '';
            if(select) select.style.display = 'none';
        } else if (tab === 'A_VENIR') {
            activeContainerSection.style.display = 'flex';
            if(input) input.style.display = 'none';
            if(btn) btn.style.display = 'none';
            if(label) label.style.display = 'none';
            if(filterWrapper) filterWrapper.style.display = 'none';
            if(select) select.style.display = '';
        } else {
            activeContainerSection.style.display = 'none';
        }
    }

    // --- CHARGEMENT DU FILTRE SPÉCIFIQUE À L'ONGLET ---
    if (tab === 'EN_COURS' || tab === 'A_VENIR') {
        const key = `container_filter_${tab}`;
        currentContainerName = localStorage.getItem(key) || 'Aucun';
        const isActive = localStorage.getItem(`${key}_active`) === 'true';
        
        const input = document.getElementById('activeContainerInput');
        if (input) input.value = currentContainerName !== 'Aucun' ? currentContainerName : '';
        
        const cb = document.getElementById('filterByContainerCb');
        if (cb) cb.checked = isActive;
        
        updateContainerTitle();
    }

    selectedIds.clear(); // On vide la sélection quand on change d'onglet
    
    // Réinitialiser le tri
    currentSort.column = null;
    currentSort.direction = 'asc';

    updateLocationFilterOptions();
    filterDeliveries();
    updateStats(); // Met à jour les stats pour la vue actuelle
    updateAvailableContainersList(); // Met à jour la liste des conteneurs disponibles pour le filtre
}

// Gestion du conteneur actif
function initActiveContainerInput() {
    const input = document.getElementById('activeContainerInput');
    
    // Initialisation spécifique à l'onglet par défaut
    if (currentTab === 'EN_COURS' || currentTab === 'A_VENIR') {
        const key = `container_filter_${currentTab}`;
        const saved = localStorage.getItem(key);
        if (saved) currentContainerName = saved;
        updateContainerTitle();
    }

    if (input && currentContainerName !== 'Aucun') {
        input.value = currentContainerName;
    }
    
    // INJECTION DYNAMIQUE : Checkbox pour filtrer par ce conteneur
    if (input) {
        let wrapper = document.getElementById('filterContainerWrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'filterContainerWrapper';
            input.parentNode.appendChild(wrapper);
        }
        
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.marginLeft = '10px';
        wrapper.style.backgroundColor = '#e0f2fe';
        wrapper.style.padding = '4px 8px';
        wrapper.style.borderRadius = '6px';
        wrapper.style.border = '1px solid #bae6fd';

        if (!document.getElementById('filterByContainerCb')) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'filterByContainerCb';
        // Restauration de l'état coché/décoché
        const key = `container_filter_${currentTab}`;
        cb.checked = localStorage.getItem(`${key}_active`) === 'true';
        cb.style.marginRight = '5px';
        cb.addEventListener('change', () => {
            // Sauvegarde de l'état
            if (currentTab === 'EN_COURS' || currentTab === 'A_VENIR') localStorage.setItem(`container_filter_${currentTab}_active`, cb.checked);
            filterDeliveries();
        });

        const lbl = document.createElement('label');
        lbl.htmlFor = 'filterByContainerCb';
        lbl.textContent = 'Filtrer la vue';
        lbl.style.fontSize = '12px';
        lbl.style.fontWeight = 'bold';
        lbl.style.color = '#0284c7';
        lbl.style.cursor = 'pointer';

        wrapper.appendChild(cb);
        wrapper.appendChild(lbl);
        }
    }
}

// --- NOUVEAU : Gestionnaire de liste des conteneurs (Pour l'onglet À VENIR) ---
function updateAvailableContainersList() {
    // On ne l'affiche que pour À VENIR
    if (currentTab !== 'A_VENIR') {
        const select = document.getElementById('quickContainerSelect');
        if (select) select.style.display = 'none';
        return;
    }

    const containerSelectId = 'quickContainerSelect';
    let select = document.getElementById(containerSelectId);

    // Création dynamique du sélecteur s'il n'existe pas dans la toolbar active
    if (!select) {
        // On essaie de trouver l'endroit où l'injecter (à côté du champ conteneur actif)
        const wrapper = document.getElementById('activeContainerSection');
        if (wrapper) {
            select = document.createElement('select');
            select.id = containerSelectId;
            select.className = 'form-control';
            select.style.maxWidth = '200px';
            select.style.marginLeft = '10px';
            select.innerHTML = '<option value="">-- Sélectionner un Conteneur --</option>';
            select.addEventListener('change', (e) => {
                const val = e.target.value;
                const input = document.getElementById('activeContainerInput');
                if(input) input.value = val;
                
                // Force le filtre pour A_VENIR
                const cb = document.getElementById('filterByContainerCb');
                if (cb && currentTab === 'A_VENIR') {
                    cb.checked = !!val;
                    localStorage.setItem(`container_filter_${currentTab}_active`, cb.checked);
                }
                setActiveContainer(); // Déclenche la logique existante
            });
            wrapper.appendChild(select);
        }
    }

    if (select) {
        select.style.display = '';
        // Récupérer les conteneurs uniques de l'onglet actuel
        const relevantDeliveries = deliveries.filter(d => d.containerStatus === currentTab);
        const containers = [...new Set(relevantDeliveries.map(d => d.conteneur).filter(c => c))].sort();
        
        let html = '<option value="">-- Choisir Conteneur --</option>';
        containers.forEach(c => {
            const selected = c === currentContainerName ? 'selected' : '';
            html += `<option value="${c}" ${selected}>${c}</option>`;
        });
        select.innerHTML = html;
    }
}

function setActiveContainer() {
    const input = document.getElementById('activeContainerInput');
    const newVal = input.value.trim();
    if (newVal) {
        currentContainerName = newVal;
        
        // Sauvegarde spécifique à l'onglet
        if (currentTab === 'EN_COURS' || currentTab === 'A_VENIR') {
            localStorage.setItem(`container_filter_${currentTab}`, currentContainerName);
        } else {
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.CONTAINER_NAME, currentContainerName);
        }
        
        updateContainerTitle();
        showToast(`Conteneur actif défini : ${newVal}`, 'success');
        // Si le filtre est coché, on rafraîchit la liste
        if (document.getElementById('filterByContainerCb')?.checked) {
            filterDeliveries();
        }
    } else {
        showToast('Veuillez saisir un numéro de conteneur', 'error');
    }
}

// Gestion du menu déroulant Communes
function toggleCommuneDropdown() {
    document.getElementById('communeDropdownList').classList.toggle('show');
}

// Gestion du menu déroulant Lieux
function toggleLocationDropdown() {
    document.getElementById('locationDropdownList').classList.toggle('show');
}

// Gestion du menu déroulant Statuts
function toggleStatusDropdown() {
    document.getElementById('statusDropdownList').classList.toggle('show');
}

// Filtrer les options dans le menu déroulant (Recherche Excel-like)
function filterLocationOptions() {
    const input = document.getElementById('locationSearchInput');
    const filter = input.value.toLowerCase();
    const container = document.getElementById('locationCheckboxes');
    const labels = container.getElementsByTagName('label');

    for (let i = 0; i < labels.length; i++) {
        const txtValue = labels[i].textContent || labels[i].innerText;
        labels[i].style.display = txtValue.toLowerCase().indexOf(filter) > -1 ? "" : "none";
    }
}

// Tout sélectionner / désélectionner (uniquement les visibles)
function toggleAllLocations() {
    const selectAllCb = document.getElementById('locationSelectAll');
    const container = document.getElementById('locationCheckboxes');
    const checkboxes = container.querySelectorAll('label:not([style*="display: none"]) input[type="checkbox"]');
    
    checkboxes.forEach(cb => cb.checked = selectAllCb.checked);
    filterDeliveries();
}

// Fermer le menu si on clique ailleurs
document.addEventListener('click', function(event) {
    if (!event.target.closest('.dropdown-filter')) {
        const dropdowns = document.getElementsByClassName("dropdown-menu");
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show')) {
                dropdowns[i].classList.remove('show');
            }
        }
    }
});

// Import PDF
async function importPDF(event) {
    if (isImporting) return;
    const file = event.target.files[0];
    if (!file) return;
    
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.querySelector('.loading-text').textContent = `Lecture du PDF ${file.name}...`;
        overlay.style.display = 'flex';
    }
    isImporting = true;
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        
        let allText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            allText += pageText + '\n';
        }
        
        const parsed = parsePDFText(allText);
        
        // Enrichissement automatique des adresses (Auto-Address)
        for (const item of parsed) {
            if ((!item.lieuLivraison || !item.lieuLivraison.trim()) && item.destinataire) {
                const foundAddr = await findAddressForRecipient(item.destinataire);
                if (foundAddr) {
                    item.lieuLivraison = foundAddr;
                    item.commune = detectCommune(foundAddr);
                }
            }
        }

        if (parsed.length > 0) {
            pendingImport = parsed;
            showPreviewModal(parsed);
        } else {
            showToast('Aucune livraison trouvée', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Erreur lors de la lecture du PDF', 'error');
    } finally {
        if (overlay) overlay.style.display = 'none';
        isImporting = false;
        event.target.value = '';
    }
}

// Parser PDF
function parsePDFText(text) {
    const deliveries = [];
    const lines = text.split('\n');
    const refRegex = /([A-Z]{2}-\d{3}-[A-Z0-9]+)/; // Accepte D53, E12, 123, etc.
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(refRegex);
        
        if (match) {
            const ref = match[1];
            const parts = line.split(/\s+/);
            
            let montant = '';
            let startIdx = 1;
            
            for (let j = 1; j < Math.min(parts.length, 4); j++) {
                if (parts[j].includes('CFA') || parts[j+1]?.includes('CFA')) {
                    montant = parts[j] + (parts[j+1] === 'CFA' ? ' CFA' : '');
                    startIdx = parts[j+1] === 'CFA' ? j + 2 : j + 1;
                    break;
                }
                if (parts[j] === '0' && parts[j+1] === 'CFA') {
                    montant = '0 CFA';
                    startIdx = j + 2;
                    break;
                }
            }
            
            const restParts = parts.slice(startIdx);
            
            let expediteur = '';
            let lieu = '';
            let destinataire = '';
            let description = '';
            
            let lieuIdx = -1;
            const communes = ['COCODY', 'ABOBO', 'YOPOUGON', 'ADJAME', 'ADJAMÉ', 'KOUMASSI', 'MARCORY', 'TREICHVILLE', 'ATTECOUBE', 'ATTÉCOUBÉ', 'PORT-BOUET', 'BINGERVILLE', 'SONGON', 'ANYAMA', 'PLATEAU'];
            
            for (let j = 0; j < restParts.length; j++) {
                if (communes.some(c => restParts[j].toUpperCase().includes(c)) || restParts[j] === 'PAS') {
                    lieuIdx = j;
                    break;
                }
            }
            
            if (lieuIdx > 0) {
                expediteur = restParts.slice(0, lieuIdx).join(' ');
                
                let destIdx = lieuIdx + 1;
                for (let j = lieuIdx; j < Math.min(lieuIdx + 8, restParts.length); j++) {
                    if (/^\d/.test(restParts[j]) || (restParts[j].length > 3 && /^[A-Z]/.test(restParts[j]) && j > lieuIdx + 2)) {
                        destIdx = j;
                        break;
                    }
                }
                
                lieu = restParts.slice(lieuIdx, destIdx).join(' ');
                const remaining = restParts.slice(destIdx).join(' ');
                
                const descMatch = remaining.match(/(\d+\s+[A-Z].*)/);
                if (descMatch) {
                    description = descMatch[1];
                    destinataire = remaining.substring(0, descMatch.index).trim();
                } else {
                    destinataire = remaining;
                }
            } else {
                expediteur = restParts.slice(0, 3).join(' ');
                lieu = restParts.slice(3, 6).join(' ');
                destinataire = restParts.slice(6, 9).join(' ');
                description = restParts.slice(9).join(' ');
            }
            
            deliveries.push({
                id: Date.now() + i,
                ref: ref,
                montant: montant,
                expediteur: fixEncoding(expediteur),
                commune: detectCommune(fixEncoding(lieu)),
                lieuLivraison: fixEncoding(lieu),
                destinataire: fixEncoding(destinataire),
                description: fixEncoding(description),
                status: 'EN_ATTENTE',
                dateAjout: new Date().toISOString()
            });
        }
    }
    
    return deliveries;
}

// Import Excel
function importExcel(event) {
    console.log("Début importExcel");
    if (isImporting) return;
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        alert("Erreur CRITIQUE : La bibliothèque Excel n'est pas chargée.\nVérifiez votre connexion internet et rechargez la page.");
        return;
    }
    
    // Afficher le Modal de Progression (ou l'overlay si modal absent)
    const progressModal = document.getElementById('importProgressModal');
    const overlay = document.getElementById('loadingOverlay');
    
    if (progressModal) {
        progressModal.classList.add('active');
        document.getElementById('importProgressBar').style.width = '0%';
        document.getElementById('importProgressText').textContent = `Lecture de ${file.name}...`;
    } else if (overlay) {
        overlay.querySelector('.loading-text').textContent = `Importation de ${file.name}...`;
        overlay.style.display = 'flex';
    }
    isImporting = true;

    const reader = new FileReader();
    reader.onload = function(e) {
        // Utiliser setTimeout pour laisser le temps au navigateur d'afficher le spinner
        setTimeout(async () => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                
                // Lecture brute pour détecter le format (Liste simple ou Tableau structuré)
                const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                let imported = [];
                // Regex améliorée : Accepte tiret (-), underscore (_), espace ( ), point (.) comme séparateurs
                const refRegex = /[A-Z]{2}[-_\s.]\d{3}[-_\s.][A-Z0-9]+/i;

                // Recherche de la ligne d'en-tête (Scan des 20 premières lignes)
                let headerRowIndex = -1;
                // Liste élargie des mots-clés pour l'en-tête
                const headerKeywords = ['REF', 'REFERENCE', 'CODE', 'DATE DU TRANSFERT', 'N° COLIS', 'NUMERO COLIS', 'TRACKING', 'N°', 'MONTANT', 'PRIX', 'EXPEDITEUR', 'DESTINATAIRE'];

                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    if (rawData[i] && rawData[i].some(cell => 
                        headerKeywords.includes(String(cell).toUpperCase().trim())
                    )) {
                        headerRowIndex = i;
                        break;
                    }
                }

                if (headerRowIndex === -1) {
                    // CAS 1 : Pas d'en-tête détecté -> ANALYSE INTELLIGENTE PAR LIGNE
                    // On cherche la structure dans chaque ligne indépendamment
                    imported = rawData.map((row, i) => {
                        if (!Array.isArray(row) || row.length === 0) return null;
                        
                        // 1. Trouver la Référence (Priorité absolue)
                        let ref = '';
                        let refIdx = -1;
                        
                        for (let j = 0; j < row.length; j++) {
                            const val = String(row[j] || '').trim().toUpperCase();
                            if (refRegex.test(val)) {
                                ref = val;
                                refIdx = j;
                                break;
                            }
                        }
                        
                        if (!ref) return null; // Pas de ref sur cette ligne -> on ignore

                        // 2. Trouver les autres infos autour de la Ref
                        let montant = '';
                        let expediteur = '';
                        let destinataire = '';
                        let lieu = '';
                        let description = '';
                        let numero = '';

                        // On analyse les autres cellules de la ligne
                        const otherCells = row.map((c, idx) => ({ val: String(c || '').trim(), idx })).filter(c => c.idx !== refIdx && c.val !== '');
                        
                        for (const cell of otherCells) {
                            const val = cell.val;
                            
                            // Détection Montant (Chiffres + evt CFA)
                            // On nettoie les sauts de ligne pour le test
                            const cleanVal = val.replace(/[\n\r]+/g, ' ');
                            if (!montant && /^[\d\s.,]+(?:CFA)?$/i.test(cleanVal) && val.replace(/[^\d]/g, '').length > 0) {
                                montant = val;
                                continue;
                            }
                            
                            // Détection Numéro
                            if (!numero && /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}/.test(val.replace(/\s/g,''))) {
                                numero = val;
                                continue;
                            }

                            // Détection Lieu (Communes connues)
                            const upperVal = val.toUpperCase();
                            if (!lieu && Object.keys(CONSTANTS.COMMUNES).some(c => upperVal.includes(c))) {
                                lieu = val;
                                continue;
                            }

                            // Reste : Expéditeur / Destinataire / Description (Heuristique positionnelle)
                            if (!expediteur) { expediteur = val; continue; }
                            if (!destinataire) { destinataire = val; continue; }
                            if (!description) { description = val; continue; }
                        }

                        return {
                            id: Date.now() + i,
                            ref: ref,
                            montant: montant,
                            expediteur: fixEncoding(expediteur),
                            commune: detectCommune(fixEncoding(lieu || expediteur || destinataire)),
                            lieuLivraison: fixEncoding(lieu),
                            destinataire: fixEncoding(destinataire),
                            description: fixEncoding(description),
                            numero: numero,
                            status: 'EN_ATTENTE',
                            dateAjout: new Date().toISOString(),
                            quantite: 1
                        };
                    }).filter(d => d !== null);
                } else {
                    // CAS 2 : Tableau structuré avec en-têtes
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { range: headerRowIndex });
                    imported = jsonData.map((row, i) => {
                        const r = {};
                        Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);
                        return {
                            id: Date.now() + i,
                        ref: String(r.REF || r.REFERENCE || r.CODE || '').trim().toUpperCase(), // Force Majuscule pour correspondance
                            prixOriginal: String(r.PRIX || r.VALEUR || r['PRIX TOTAL'] || r['MONTANT TOTAL'] || ''), // Capture du Prix Total pour calcul
                            montant: String(r.RESTANT || r.MONTANT || r.PRIX || r['RESTANT A PAYER'] || r['RENSTANT A PAYER'] || r['MONTANT A PAYER'] || ''),
                            expediteur: fixEncoding(String(r.EXPEDITEUR || r['EXPÉDITEUR'] || r.EXP || '')),
                            commune: detectCommune(fixEncoding(String(r.LIVRE || r.LIEU || r.COMMUNE || r['LIEU DE LIVRAISON'] || r.ADRESSE || r.ADRESSES || ''))),
                            lieuLivraison: fixEncoding(String(r.LIVRE || r.LIEU || r['LIEU DE LIVRAISON'] || r.ADRESSE || r.ADRESSES || '')),
                            destinataire: fixEncoding(String(r.DESTINATAIRE || r.CLIENT || r.DESTINATEUR || '')),
                            description: fixEncoding(String(r.DESCRIPTION || r.NATURE || r['TYPE COLIS'] || '')),
                            info: fixEncoding(String(r.INFO || r.INFORMATION || r.COMMENTAIRE || '')),
                            numero: String(r.NUMERO || r.TEL || r.TELEPHONE || r.CONTACT || ''),
                            quantite: parseInt(r.QTE || r.QUANTITE || r.QUANTITÉ || 1), // Récupération Quantité
                            status: 'EN_ATTENTE',
                            dateAjout: new Date().toISOString()
                        };
                    }).filter(d => d.ref && d.ref.trim() !== '');
                }
                
                // Enrichissement automatique des adresses (Auto-Address)
                for (let i = 0; i < imported.length; i++) {
                    const item = imported[i];

                    // Feedback visuel tous les 5 items pour ne pas bloquer l'UI et montrer la progression
                    if (i % 5 === 0) {
                        const pct = Math.round(((i + 1) / imported.length) * 100);
                        if (progressModal) {
                             document.getElementById('importProgressBar').style.width = `${pct}%`;
                             document.getElementById('importProgressText').textContent = `Analyse ligne ${i + 1}/${imported.length} (${pct}%)`;
                        } else if (overlay) {
                             overlay.querySelector('.loading-text').textContent = `Analyse ligne ${i + 1}/${imported.length}...`;
                        }
                        await new Promise(r => setTimeout(r, 0));
                    }

                    if ((!item.lieuLivraison || !item.lieuLivraison.trim()) && item.destinataire) {
                        const foundAddr = await findAddressForRecipient(item.destinataire);
                        if (foundAddr) {
                            item.lieuLivraison = foundAddr;
                            item.commune = detectCommune(foundAddr);
                        }
                    }
                    // Extraction Numéro si manquant (Regex)
                    if (!item.numero && item.destinataire) {
                        // Regex améliorée pour gérer les espaces/tirets et nettoyer le nom
                        const phoneRegex = /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/;
                        const phoneMatch = item.destinataire.match(phoneRegex);
                        if (phoneMatch) {
                            // On assigne le numéro trouvé et nettoyé
                            item.numero = phoneMatch[0].replace(/[\s.-]/g, ''); 
                            // On nettoie le nom du destinataire en retirant le numéro et les caractères de fin
                            item.destinataire = item.destinataire.replace(phoneMatch[0], '').trim().replace(/[-–,;:\s]+$/, '');
                        }
                    }
                }

                if (imported.length > 0) {
                    pendingImport = imported;
                    showPreviewModal(imported);
                    showToast('Fichier analysé avec succès !', 'success');
                } else {
                    let msg = "⚠️ Aucune donnée valide trouvée.\n\nVérifiez que votre fichier contient une colonne 'REF' ou 'REFERENCE'.";
                    if (rawData.length > 0 && rawData[0].length === 1) {
                        msg += "\n\n💡 DIAGNOSTIC : Il semble que votre fichier CSV ne soit pas lu correctement (tout est dans une seule colonne). Essayez de l'enregistrer en format Excel (.xlsx) avant d'importer.";
                    }
                    alert(msg);
                }
            } catch (error) {
                console.error(error);
                alert("Erreur technique lors de l'importation :\n" + error.message);
            } finally {
                // Masquer l'écran de chargement
                if (overlay) overlay.style.display = 'none';
                if (progressModal) progressModal.classList.remove('active');
                isImporting = false;
            }
        }, 100);
    };
    
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// Recherche d'adresse pour un destinataire (Local + Archives)
async function findAddressForRecipient(name) {
    if (!name) return null;
    const val = name.trim();
    
    // 1. Recherche locale (Active)
    const localMatch = deliveries.find(d => 
        d.destinataire && d.destinataire.toLowerCase() === val.toLowerCase() && d.lieuLivraison
    );
    if (localMatch) return localMatch.lieuLivraison;

    // 2. Recherche Firestore Active (Pour les items hors limite 500)
    try {
        const snapActive = await db.collection(CONSTANTS.COLLECTION)
            .where('destinataire', '==', val)
            .limit(10)
            .get();
        
        for (const doc of snapActive.docs) {
            const d = doc.data();
            if (d.lieuLivraison && d.lieuLivraison.trim() !== "") return d.lieuLivraison;
        }
    } catch (e) { console.error("Erreur recherche adresse active", e); }

    // 3. Recherche Archives (Firestore)
    try {
        const snap = await db.collection(CONSTANTS.ARCHIVE_COLLECTION)
            .where('destinataire', '==', val)
            .limit(1)
            .get();
        if (!snap.empty) return snap.docs[0].data().lieuLivraison;
    } catch (e) { console.error("Erreur recherche adresse archive", e); }
    return null;
}

// Aperçu modal
function showPreviewModal(data) {
    // Pré-sélectionner le statut selon l'onglet actuel
    const statusSelect = document.getElementById('importContainerStatus');
    if (statusSelect && ['PARIS', 'EN_COURS', 'A_VENIR'].includes(currentTab)) {
        statusSelect.value = currentTab;
    }

    document.getElementById('previewCount').textContent = `${data.length} livraisons détectées`;
    
    const tbody = document.getElementById('previewBody');
    tbody.innerHTML = data.map(d => {
        // Vérification des doublons
        const existing = deliveries.find(item => item.ref === d.ref);
        let duplicateInfo = '';
        let rowClass = '';
        
        if (existing) {
            duplicateInfo = `<span class="duplicate-badge" style="color: #1565c0; background: #e3f2fd; padding: 2px 6px; border-radius: 4px;">🔄 Sera déplacé de ${existing.containerStatus || 'Inconnu'}</span>`;
            rowClass = 'duplicate-row';
        }

        return `
        <tr class="${rowClass}">
            <td>${d.ref}</td>
            <td style="font-weight:bold; text-align:center;">${d.quantite || 1}</td>
            <td>${d.expediteur.substring(0, 30)}</td>
            <td><span class="commune-badge badge-${d.commune.toLowerCase().replace(/[éè]/g, 'e').replace('-', '')}">${d.commune}</span></td>
            <td>${d.lieuLivraison.substring(0, 40)}...</td>
            <td>${duplicateInfo}</td>
        </tr>
    `}).join('');
    
    document.getElementById('previewModal').classList.add('active');
}

function closePreviewModal() {
    document.getElementById('previewModal').classList.remove('active');
    document.getElementById('importConteneur').value = '';
    pendingImport = [];
}

async function confirmImport() {
    const conteneur = document.getElementById('importConteneur').value;
    const containerStatus = document.getElementById('importContainerStatus').value;

    // --- NOUVEAU : Pré-traitement pour fusionner les doublons DANS le fichier importé ---
    const uniqueImports = new Map();
    const pickBest = (oldV, newV) => {
        const o = String(oldV || '').trim();
        const n = String(newV || '').trim();
        if (!n) return o; // Si nouveau vide, garder ancien
        if (!o) return n; // Si ancien vide, prendre nouveau
        // Si les deux existent, on privilégie le plus long (plus d'infos)
        return n.length >= o.length ? n : o;
    };

    for (const item of pendingImport) {
        let ref = item.ref.toUpperCase();
        
        // LOGIQUE DE REGROUPEMENT (En Cours) : On nettoie les suffixes _1_512 pour grouper sur la racine
        // Ex: KA-086-D41_1_512 -> KA-086-D41
        if (containerStatus === 'EN_COURS') {
             const match = ref.match(/^([A-Z]{2}[-_\s.]\d{3}[-_\s.][A-Z0-9]+)(?:_.*)?$/);
             if (match) {
                 ref = match[1]; // On garde juste la racine
             }
        }

        if (!ref) continue;

        if (uniqueImports.has(ref)) {
            // Le doublon existe, on fusionne les données
            const existing = uniqueImports.get(ref);
            const originalLieu = existing.lieuLivraison;

            existing.montant = pickBest(existing.montant, item.montant);
            
            // FUSION DESCRIPTION (Concaténation pour ne rien perdre)
            if (item.description && item.description.trim() !== "") {
                if (!existing.description) existing.description = item.description;
                else if (!existing.description.includes(item.description)) {
                     existing.description = `${existing.description} - ${item.description}`;
                }
            }

            existing.info = pickBest(existing.info, item.info);
            existing.expediteur = pickBest(existing.expediteur, item.expediteur);
            existing.destinataire = pickBest(existing.destinataire, item.destinataire);
            existing.lieuLivraison = pickBest(existing.lieuLivraison, item.lieuLivraison);
            existing.numero = pickBest(existing.numero, item.numero);
            existing.quantite = (existing.quantite || 1) + (item.quantite || 1); // Cumul des quantités si doublon exact
            
            if (existing.lieuLivraison !== originalLieu) {
                 existing.commune = detectCommune(existing.lieuLivraison);
            }
            
            // On met à jour la ref de l'objet existant (pour être sûr d'avoir la version courte)
            existing.ref = ref;
        } else {
            // Première fois qu'on voit cette référence, on l'ajoute
            uniqueImports.set(ref, { ...item, ref: ref });
        }
    }
    const finalImportList = Array.from(uniqueImports.values());

    // Afficher le Modal de Progression
    const progressModal = document.getElementById('importProgressModal');
    if (progressModal) {
        progressModal.classList.add('active');
        document.getElementById('importProgressBar').style.width = '0%';
        document.getElementById('importProgressText').textContent = 'Préparation des données...';
    }

    // Préparation des opérations par lots (Batch Chunking)
    const operations = []; 
    let createdCount = 0;
    let updatedCount = 0;
    
    for (let i = 0; i < finalImportList.length; i++) {
        const importItem = finalImportList[i];

        // Feedback visuel Préparation (Mise à jour tous les 5 items pour fluidité)
        if (progressModal && i % 5 === 0) {
             const pct = Math.round(((i + 1) / finalImportList.length) * 100);
             document.getElementById('importProgressBar').style.width = `${pct}%`;
             document.getElementById('importProgressText').textContent = `Préparation ${i + 1}/${finalImportList.length} (${pct}%)`;
             await new Promise(r => setTimeout(r, 0)); // Pause pour laisser l'interface se mettre à jour
        }

        // Vérifier si la référence existe déjà dans la base de données (Insensible à la casse)
        const existingItem = deliveries.find(d => d.ref.toUpperCase() === importItem.ref.toUpperCase());

        // --- LOGIQUE INTELLIGENTE : RECHERCHE PAR RÉFÉRENCE DE BASE ---
        // Si l'item n'a pas d'infos complètes, on cherche son "Parent" (ex: MD-067-E2 pour MD-067-E2_1_969)
        if (containerStatus === 'EN_COURS' && (!importItem.expediteur || !importItem.destinataire)) {
            // On tente d'extraire la base (tout ce qui est avant le premier underscore ou tiret final)
            // Ex: MD-067-E2_1 -> MD-067-E2
            const baseRefMatch = importItem.ref.match(/^([A-Z]{2}-\d{3}-[A-Z0-9]+)(?:_.*)?$/);
            const baseRef = baseRefMatch ? baseRefMatch[1] : null;

            if (baseRef) {
                // On cherche le parent dans la base locale (A_VENIR, PARIS, etc.)
                const parentItem = deliveries.find(d => d.ref === baseRef);
                if (parentItem) {
                    if (!importItem.expediteur) importItem.expediteur = parentItem.expediteur;
                    if (!importItem.destinataire) importItem.destinataire = parentItem.destinataire;
                    if (!importItem.lieuLivraison) importItem.lieuLivraison = parentItem.lieuLivraison;
                    if (!importItem.commune || importItem.commune === 'AUTRE') importItem.commune = parentItem.commune;
                }
            }
        }

        if (existingItem) {
            // CAS 1 : La référence existe -> On déplace le colis existant
            const docRef = db.collection(CONSTANTS.COLLECTION).doc(existingItem.id);
            const updates = { containerStatus: containerStatus };
            
            // --- SAUVEGARDE DU PRIX ORIGINAL (PARIS) ---
            // Si le colis vient de PARIS (ou a un montant existant) et qu'on met à jour,
            // on sauvegarde l'ancien montant comme "prixOriginal" s'il n'existe pas déjà.
            // Cela permet de garder la trace du "Prix Total" même si le montant devient un "Reste à payer".
            if (existingItem.montant && !existingItem.prixOriginal) {
                // On nettoie le montant pour ne garder que le chiffre
                updates.prixOriginal = existingItem.montant;
            }

            if (containerStatus === 'EN_COURS') {
                // LOGIQUE SIMPLIFIÉE (Demande utilisateur) :
                // On met à jour UNIQUEMENT la quantité (comptée dans le fichier importé) et le statut.
                // On conserve les données existantes (Description, Expéditeur, etc.) sans fusionner.
                
                updates.quantite = importItem.quantite; // Quantité issue du comptage des racines dans l'import
                
                if (conteneur) updates.conteneur = conteneur;
                else if (importItem.conteneur) updates.conteneur = importItem.conteneur;

                if (existingItem.containerStatus === 'PARIS') {
                    updates.directFromParis = true; // ALERTE : A sauté l'étape "À Venir" (Client non prévenu)
                } else if (existingItem.containerStatus === 'A_VENIR') {
                    updates.directFromParis = false; // Flux normal
                }
                updates.importedFromTransit = true;
            } else {
                // LOGIQUE STANDARD (Fusion) pour les autres onglets (PARIS, A_VENIR)
                
                // Pour le montant, on privilégie la nouvelle valeur importée (ex: Reste à payer dans A_VENIR)
                if (importItem.montant && importItem.montant.trim() !== '') {
                    updates.montant = importItem.montant;
                } else {
                    updates.montant = existingItem.montant;
                }

                updates.description = pickBest(existingItem.description, importItem.description);
                updates.info = pickBest(existingItem.info, importItem.info);
                updates.expediteur = pickBest(existingItem.expediteur, importItem.expediteur);
                updates.destinataire = pickBest(existingItem.destinataire, importItem.destinataire);
                updates.lieuLivraison = pickBest(existingItem.lieuLivraison, importItem.lieuLivraison);
                updates.numero = pickBest(existingItem.numero, importItem.numero);
                if (importItem.quantite && importItem.quantite !== existingItem.quantite) updates.quantite = importItem.quantite;
                if (updates.lieuLivraison !== existingItem.lieuLivraison) updates.commune = detectCommune(updates.lieuLivraison);
                if (conteneur) updates.conteneur = conteneur;
                else if (importItem.conteneur) updates.conteneur = importItem.conteneur;
                
                updates.importedFromTransit = firebase.firestore.FieldValue.delete();
            }
            
            operations.push({ type: 'update', ref: docRef, data: updates });
            updatedCount++;
        } else {
            // CAS 2 : La référence n'existe pas -> On crée un nouveau colis
            const docRef = db.collection(CONSTANTS.COLLECTION).doc();
            // On retire l'ID temporaire (numérique) avant l'envoi
            const { id: _tempId, ...itemData } = importItem;

            // Nettoyage des valeurs undefined (Firestore ne les supporte pas)
            Object.keys(itemData).forEach(key => itemData[key] === undefined && delete itemData[key]);

            operations.push({ type: 'set', ref: docRef, data: { 
                ...itemData, 
                conteneur: conteneur || importItem.conteneur || '', 
                quantite: importItem.quantite || 1, // Stockage de la quantité
                containerStatus: containerStatus,
                dateAjout: new Date().toISOString()
            }});
            createdCount++;
        }

        // --- TRANSFERT VERS RÉCEPTION ABIDJAN (TRANSACTIONS) ---
        if (containerStatus === 'EN_COURS') {
            // On vérifie si la transaction existe déjà pour éviter les doublons
            const transQuery = await db.collection('transactions').where('reference', '==', importItem.ref).get();
            
            if (transQuery.empty) {
                // LOGIQUE FINANCIÈRE AVANCÉE (Comme Arrivages)
                
                let restant = 0;
                let totalPrix = 0;

                if (existingItem) {
                    // CAS 1 : Données issues de l'historique (Paris -> A Venir -> En Cours)
                    // Le montant actuel dans la fiche est le "Reste à payer" (mis à jour dans A_VENIR)
                    restant = parseFloat((existingItem.montant || '0').replace(/[^\d]/g, '')) || 0;
                    
                    // Le prix total est le prix original (Paris). Si pas de prix original, on suppose que le reste est le prix total.
                    const original = parseFloat((existingItem.prixOriginal || '0').replace(/[^\d]/g, '')) || 0;
                    totalPrix = original > 0 ? original : restant;
                } else {
                    // CAS 2 : Import direct sans historique (Nouveau colis)
                    restant = parseFloat((importItem.montant || '0').replace(/[^\d]/g, '')) || 0;
                    totalPrix = parseFloat((importItem.prixOriginal || '0').replace(/[^\d]/g, '')) || 0;
                    if (totalPrix === 0) totalPrix = restant;
                }

                // 4. Calcul du montant payé à Paris
                let mParis = 0;
                if (totalPrix > restant) {
                    mParis = totalPrix - restant; // La différence a été payée
                }

                const transRef = db.collection('transactions').doc();
                
                operations.push({ type: 'set', ref: transRef, data: {
                    date: new Date().toISOString().split('T')[0],
                    reference: importItem.ref,
                    nom: importItem.destinataire || importItem.expediteur || 'Client', // Client principal
                    conteneur: conteneur || importItem.conteneur || '',
                    prix: totalPrix, // CORRECTION : Utilisation de la bonne variable
                    montantParis: mParis,
                    montantAbidjan: 0,
                    reste: -restant, // La dette est exactement le montant restant
                    isDeleted: false,
                    description: importItem.description || '',
                    adresseDestinataire: importItem.lieuLivraison || '',
                    nomDestinataire: importItem.destinataire || '',
                    numero: importItem.numero || '', // Nouveau champ Numéro
                    saisiPar: sessionStorage.getItem('userName') || 'Import Livraison',
                    quantite: importItem.quantite || 1 // IMPORTANT : Pour le calcul magasinage
                }});
            }
        }
    }

    // EXÉCUTION DES BATCHS PAR PAQUETS DE 400 (Pour éviter la limite de 500)
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let opCount = 0;
    let batchPromises = [];

    for (const op of operations) {
        if (op.type === 'set') batch.set(op.ref, op.data);
        else if (op.type === 'update') batch.update(op.ref, op.data);
        else if (op.type === 'delete') batch.delete(op.ref);

        opCount++;
        if (opCount >= BATCH_SIZE) {
            batchPromises.push(batch.commit());
            batch = db.batch();
            opCount = 0;
        }
    }
    
    // Mise à jour du conteneur en cours si renseigné
    if (conteneur) {
        currentContainerName = conteneur;
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.CONTAINER_NAME, currentContainerName);
        
        // FIX : Mise à jour du stockage spécifique à l'onglet cible pour éviter que switchTab ne l'écrase
        if (containerStatus === 'EN_COURS' || containerStatus === 'A_VENIR') {
            localStorage.setItem(`container_filter_${containerStatus}`, currentContainerName);
            localStorage.setItem(`container_filter_${containerStatus}_active`, 'true'); // On active le filtre
        }

        updateContainerTitle();
        // Mettre à jour le champ dans la toolbar aussi
        const activeInput = document.getElementById('activeContainerInput');
        if (activeInput) activeInput.value = currentContainerName;
    }

    if (opCount > 0) batchPromises.push(batch.commit());

    // Suivi de la progression des lots
    const totalBatches = batchPromises.length;
    let completedBatches = 0;

    const trackedPromises = batchPromises.map(p => p.then(res => {
        completedBatches++;
        if (progressModal) {
            const pct = Math.round((completedBatches / totalBatches) * 100);
            document.getElementById('importProgressBar').style.width = `${pct}%`;
            document.getElementById('importProgressText').textContent = `Enregistrement ${pct}% (${completedBatches}/${totalBatches} lots)`;
        }
        return res;
    }));

    Promise.all(trackedPromises).then(() => {
        // Masquer la progression
        if (progressModal) progressModal.classList.remove('active');

        // Si on importe dans l'autre onglet, on bascule dessus pour voir le résultat
        if (containerStatus !== currentTab) {
            switchTab(containerStatus);
        }
        
        closePreviewModal();
        
        // Afficher le Rapport Détaillé (Modal) au lieu de l'alerte
        const resultModal = document.getElementById('importResultModal');
        if (resultModal) {
            const content = document.getElementById('importResultContent');
            content.innerHTML = `
                <div style="display:flex; align-items:center; margin-bottom:15px; color:#065f46; background:#d1fae5; padding:10px; border-radius:8px;">
                    <span style="font-size:1.5em; margin-right:15px;">✅</span>
                    <div><strong>${createdCount}</strong> Nouveaux colis créés</div>
                </div>
                <div style="display:flex; align-items:center; color:#1e40af; background:#dbeafe; padding:10px; border-radius:8px;">
                    <span style="font-size:1.5em; margin-right:15px;">🔄</span>
                    <div><strong>${updatedCount}</strong> Colis mis à jour (Infos complétées)</div>
                </div>
            `;
            resultModal.classList.add('active');
        } else {
            alert(`Rapport d'importation :\n\n✅ ${createdCount} Nouveaux colis créés\n🔄 ${updatedCount} Colis mis à jour`);
        }

        pendingImport = []; // Nettoyage
    }).catch(err => {
        if (progressModal) progressModal.classList.remove('active');
        console.error("Erreur Import:", err);
        if (err.code === 'resource-exhausted') {
            alert("⚠️ ALERTE QUOTA FIREBASE ATTEINT !\n\nVous avez dépassé la limite d'écriture quotidienne autorisée par Firebase (Plan Gratuit : 20 000 écritures/jour).\n\nL'enregistrement a été bloqué par le serveur. Veuillez réessayer demain (après minuit, heure du Pacifique) ou passer au plan Blaze.");
        } else {
            showToast("Erreur lors de l'enregistrement : " + err.message, 'error');
        }
    });
}

// --- FONCTION DE SYNCHRONISATION FORCÉE (Réparation) ---
async function forceSyncTransactions() {
    if (!confirm("Voulez-vous forcer la synchronisation des transactions ?\n\nCela va copier les Noms, Adresses et Numéros corrects de l'onglet 'En Cours' vers la Caisse (Saisie) pour corriger les erreurs.")) return;

    const loadingToast = document.createElement('div');
    loadingToast.className = 'toast';
    loadingToast.textContent = "Synchronisation en cours...";
    loadingToast.style.background = "#3b82f6";
    document.body.appendChild(loadingToast);

    try {
        const enCoursItems = deliveries.filter(d => d.containerStatus === 'EN_COURS');
        let batch = db.batch();
        let count = 0;
        let updatedCount = 0;

        for (const item of enCoursItems) {
            if (!item.ref) continue;

            // On cherche la transaction correspondante
            const q = await db.collection('transactions').where('reference', '==', item.ref).get();
            
            if (!q.empty) {
                q.forEach(doc => {
                    const t = doc.data();
                    const updates = {};
                    
                    // On met à jour avec les données fiables de Livraison
                    const newNom = item.destinataire || item.expediteur || 'Client';
                    if (newNom && t.nom !== newNom) updates.nom = newNom;
                    if (item.destinataire && t.nomDestinataire !== item.destinataire) updates.nomDestinataire = item.destinataire;
                    if (item.lieuLivraison && t.adresseDestinataire !== item.lieuLivraison) updates.adresseDestinataire = item.lieuLivraison;
                    if (item.numero && t.numero !== item.numero) updates.numero = item.numero;
                    if (item.description && t.description !== item.description) updates.description = item.description;

                    if (Object.keys(updates).length > 0) {
                        batch.update(doc.ref, updates);
                        updatedCount++;
                        count++;
                    }
                });
            }
            if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
        }
        if (count > 0) await batch.commit();
        loadingToast.remove();
        alert(`✅ Synchronisation terminée !\n${updatedCount} fiches corrigées dans la Caisse.`);
    } catch (e) { console.error(e); loadingToast.remove(); alert("Erreur : " + e.message); }
}

// Export Excel
function exportToExcel() {
    if (deliveries.length === 0) {
        showToast('Aucune livraison à exporter', 'error');
        return;
    }
    
    const data = filteredDeliveries.map(d => ({ // Export uniquement ce qu'on voit (filtré)
        'CONTENEUR': d.conteneur || '',
        'QTE': d.quantite || 1,
        'REF': d.ref,
        'RESTANT': d.montant,
        'EXPEDITEUR': d.expediteur,
        'LIVRE': d.lieuLivraison,
        'DESTINATAIRE': d.destinataire,
        'NUMERO': d.numero || (d.destinataire || '').replace(/\s/g, '').match(/(?:\+225|00225|01|05|07)\d{8}|0\d{9}/)?.[0] || '',
        'LIVREUR': d.livreur || '',
        'DATE_PROGRAMME': d.dateProgramme || '',
        'DESCRIPTION': d.description,
        'STATUT_LIVRAISON': d.status === 'LIVRE' ? 'LIVRE' : 'EN ATTENTE',
        'STATUT_CONTENEUR': d.containerStatus === 'A_VENIR' ? 'A VENIR' : 'EN COURS',
        'POSITION': d.containerStatus === 'PARIS' ? 'PARIS' : (d.containerStatus === 'A_VENIR' ? 'EN MER' : 'ABIDJAN'),
        'COMMUNE': d.commune
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Livraisons");
    
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `LIVRAISON_${date}.xlsx`);
    showToast('Excel exporté !', 'success');
}

// Affichage tableau
function renderTable() {
    const tbody = document.getElementById('deliveriesBody');
    const theadRow = document.querySelector('#deliveriesTable thead tr');

    if (filteredDeliveries.length === 0) {
        // Restaurer les en-têtes par défaut si vide pour éviter un tableau cassé
        if (currentTab !== 'PROGRAMME') {
             theadRow.innerHTML = `
                <th class="col-checkbox"><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
                <th style="width: 100px;">REF</th>
                <th style="width: 120px;">CONTENEUR</th>
                <th style="width: 60px;">Qté</th>
                <th style="width: 100px;">MONTANT</th>
                <th style="width: 150px;">EXPEDITEUR</th>
                <th style="width: 80px;">COMMUNE</th>
                <th style="width: 250px;">LIEU DE LIVRAISON</th>
                <th style="width: 180px;">DESTINATAIRE</th>
                <th style="width: 150px;">LIVREUR</th>
                <th style="width: 100px;">DATE</th>
                <th style="width: 250px;">DESCRIPTION</th>
                <th style="width: 80px;">STATUT</th>
                <th style="width: 150px;">ACTIONS</th>
            `;
        } else {
             theadRow.innerHTML = `
                <th>DATE</th>
                <th>LIVREUR</th>
                <th>NB COLIS</th>
                <th>STATUT</th>
                <th>ACTIONS</th>
            `;
        }

        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <h3>Aucune livraison</h3>
                    <p>Importez un PDF/Excel ou ajoutez manuellement</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // --- MODE PROGRAMME : Affichage groupé par Livreur/Date ---
    if (currentTab === 'PROGRAMME') {
        // Changer les en-têtes
        theadRow.innerHTML = `
            <th>DATE</th>
            <th>LIVREUR</th>
            <th>COMMUNES</th>
            <th>NB COLIS</th>
            <th>STATUT</th>
            <th>ACTIONS</th>
        `;

        // Grouper les livraisons
        const groups = {};
        filteredDeliveries.forEach(d => {
            const key = `${d.dateProgramme}__${d.livreur}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(d);
        });

        tbody.innerHTML = Object.entries(groups).map(([key, items]) => {
            const [date, livreur] = key.split('__');
            const total = items.length;
            const delivered = items.filter(i => i.status === 'LIVRE').length;
            const progress = Math.round((delivered / total) * 100);
            
            // Récupérer les communes uniques
            const communes = [...new Set(items.map(i => i.commune))].join(', ');
            
            return `
                <tr style="cursor: pointer; background: #f8f9fa;" onclick="viewProgramDetails('${date}', '${livreur}')">
                    <td><strong>${date}</strong></td>
                    <td><strong>${livreur}</strong></td>
                    <td><small>${communes}</small></td>
                    <td><span class="badge-cocody">${total} Colis</span></td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <progress value="${delivered}" max="${total}" style="width: 100px;"></progress>
                            <span>${delivered}/${total}</span>
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-small" onclick="event.stopPropagation(); viewProgramDetails('${date}', '${livreur}')">👁️ Voir détails</button>
                    </td>
                </tr>
            `;
        }).join('');
        return;
    }

    // --- MODE STANDARD : Liste des colis ---
    
    // Restaurer les en-têtes
    let statusHeader = '<th style="width: 80px;">STATUT</th>';
    if (currentTab === 'PARIS' || currentTab === 'A_VENIR') {
        statusHeader = '';
    }

    // Colonne "Notifié" uniquement pour l'onglet À VENIR
    let notifiedHeader = '';
    if (currentTab === 'A_VENIR') {
        notifiedHeader = '<th style="width: 80px;">NOTIFIÉ</th>';
    }

    if (currentTab === 'PARIS') {
        theadRow.innerHTML = `
            <th class="col-checkbox"><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
            <th style="width: 100px;">DATE</th>
            <th class="sortable" onclick="sortTable('conteneur')" style="width: 120px;">CONTENEUR ${getSortIcon('conteneur')}</th>
            <th class="sortable" onclick="sortTable('ref')" style="width: 100px;">RÉF ${getSortIcon('ref')}</th>
            <th style="width: 60px;">Qté</th>
            <th class="sortable" onclick="sortTable('montant')" style="width: 100px;">MONTANT ${getSortIcon('montant')}</th>
            <th class="sortable" onclick="sortTable('expediteur')" style="width: 150px;">EXPÉDITEUR ${getSortIcon('expediteur')}</th>
            <th class="sortable" onclick="sortTable('lieuLivraison')" style="width: 250px;">LIEU DE LIVRAISON ${getSortIcon('lieuLivraison')}</th>
            <th class="sortable" onclick="sortTable('destinataire')" style="width: 180px;">DESTINATAIRE ${getSortIcon('destinataire')}</th>
            <th style="width: 120px;">NUMÉRO</th>
            <th style="width: 250px;">DESCRIPTION</th>
            <th style="width: 100px;">ACTES</th>
        `;
    } else {
        theadRow.innerHTML = `
            <th class="col-checkbox"><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
            <th class="sortable" onclick="sortTable('conteneur')" style="width: 120px;">CONTENEUR ${getSortIcon('conteneur')}</th>
            <th class="sortable" onclick="sortTable('ref')" style="width: 100px;">REF ${getSortIcon('ref')}</th>
            <th style="width: 60px;">Qté</th>
            <th class="sortable" onclick="sortTable('montant')" style="width: 100px;">MONTANT ${getSortIcon('montant')}</th>
            <th class="sortable" onclick="sortTable('expediteur')" style="width: 150px;">EXPEDITEUR ${getSortIcon('expediteur')}</th>
            <th class="sortable" onclick="sortTable('lieuLivraison')" style="width: 250px;">LIEU DE LIVRAISON ${getSortIcon('lieuLivraison')}</th>
            <th class="sortable" onclick="sortTable('destinataire')" style="width: 180px;">DESTINATAIRE ${getSortIcon('destinataire')}</th>
            <th style="width: 120px;">NUMÉRO</th>
            <th style="width: 250px;">DESCRIPTION</th>
            <th style="width: 150px;">INFO</th>
            ${notifiedHeader}
            <th class="sortable" onclick="sortTable('livreur')" style="width: 150px;">LIVREUR (DATE) ${getSortIcon('livreur')}</th>
            ${statusHeader}
            <th style="width: 150px;">ACTIONS</th>
        `;
    }

    // Mise à jour de la case "Tout sélectionner"
    const selectAllCheckbox = document.getElementById('selectAll');
    if(selectAllCheckbox) selectAllCheckbox.checked = filteredDeliveries.length > 0 && filteredDeliveries.every(d => selectedIds.has(d.id));

    let tableRows = filteredDeliveries.slice(0, itemsPerPage).map(d => {
        const rowClass = d.status === 'LIVRE' ? 'delivered' : '';
        
        let statusClass = 'status-attente';
        let statusText = '⏳ Attente';

        if (d.status === 'LIVRE') {
            statusClass = 'status-livre';
            statusText = '✅ Livré';
        } else if (d.status === 'EN_COURS') {
            statusClass = 'status-en-cours';
            statusText = '🚚 En Cours';
        } else if (d.status === 'INCIDENT') {
            statusClass = 'status-incident';
            statusText = '⚠️ Incident';
        } else if (d.status === 'RETOUR') {
            statusClass = 'status-retour';
            statusText = '↩️ Retour';
        }

        let transitIndicator = '';
        if (currentTab === 'EN_COURS') {
            if (d.directFromParis) {
                // ALERTE ROUGE : Vient directement de Paris (Pas passé par À Venir)
                transitIndicator = '<span title="⚠️ DIRECT DE PARIS (Client non notifié en transit)" style="cursor:help; font-size:1.2em;">⚠️</span> ';
            } else if (d.importedFromTransit) {
                transitIndicator = '<span title="Arrivé depuis À VENIR">🚢</span> ';
            }
        }

        let statusCell = `<td class="status"><span class="status-badge ${statusClass}">${statusText}</span></td>`;
        if (currentTab === 'PARIS' || currentTab === 'A_VENIR') {
            statusCell = '';
        }

        // Cellule Notification (À VENIR)
        let notifiedCell = '';
        if (currentTab === 'A_VENIR') {
            const isChecked = d.clientNotified ? 'checked' : '';
            notifiedCell = `<td style="text-align:center;">
                <input type="checkbox" ${isChecked} onchange="toggleClientNotified('${d.id}', this.checked)" title="Marquer client comme appelé">
            </td>`;
        }

        // --- LOGIQUE WHATSAPP & BOUTONS ---
        let phoneCandidate = d.numero;

        // Recherche intelligente du numéro
        if (!phoneCandidate) {
            const fieldsToCheck = [d.destinataire, d.description, d.info];
            const robustRegex = /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/;
            
            for (const field of fieldsToCheck) {
                if (field) {
                    const match = field.match(robustRegex);
                    if (match) {
                        phoneCandidate = match[0];
                        break; // On prend le premier trouvé
                    }
                }
            }
        }

        let waBtn = '';
        if (phoneCandidate) {
            // Nettoyage final pour l'API WhatsApp (chiffres uniquement)
            let phone = phoneCandidate.replace(/[^\d]/g, '').replace(/^00/, '');
            
            if (phone.length === 10) phone = '225' + phone; // Ajout indicatif CI par défaut
            
            const msg = `Bonjour, votre colis ${d.ref} (${d.conteneur || ''}) est disponible pour la livraison.`;
            waBtn = `<a href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}" target="_blank" class="btn btn-success btn-small" style="background-color:#25D366; border:none; padding:4px 6px; margin-right:4px;" title="Contacter sur WhatsApp">📱</a>`;
        }

        let actionButtons = waBtn;

        // Boutons BL et Livré uniquement pour EN_COURS (Masqués pour PARIS et A_VENIR)
        if (currentTab !== 'PARIS' && currentTab !== 'A_VENIR') {
            actionButtons += `<button class="btn btn-small" style="background-color:#64748b; padding:4px 6px;" onclick="printDeliverySlip('${d.id}')" title="Imprimer Bon de Livraison">📄</button>`;
            if (d.status !== 'LIVRE') {
                actionButtons += `<button class="btn btn-success btn-small" onclick="markAsDelivered('${d.id}')" title="Marquer comme livré">✅</button>`;
            } else {
                actionButtons += `<button class="btn btn-warning btn-small" onclick="markAsPending('${d.id}')" title="Marquer en attente">⏳</button>`;
            }
        }
        actionButtons += `<button class="btn btn-danger btn-small" onclick="deleteDelivery('${d.id}')" title="Supprimer">🗑️</button>`;

        // Extraction et Nettoyage (Destinataire / Numéro)
        let displayDestinataire = d.destinataire || '';
        let displayPhone = d.numero || '';
        
        // Regex pour trouver un numéro dans le nom (avec ou sans espaces)
        const phoneRegex = /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/;
        const match = displayDestinataire.match(phoneRegex);
        
        if (match) {
            const foundNumber = match[0];
            if (!displayPhone) displayPhone = foundNumber.replace(/[\s.-]/g, ''); // Normalisation
            displayDestinataire = displayDestinataire.replace(foundNumber, '').trim();
            displayDestinataire = displayDestinataire.replace(/[-–,;:\s]+$/, ''); // Nettoyage fin
        }

        if (currentTab === 'PARIS') {
            return `
                <tr class="${rowClass}">
                    <td class="col-checkbox"><input type="checkbox" onchange="toggleSelection('${d.id}')" ${selectedIds.has(d.id) ? 'checked' : ''}></td>
                    <td>${d.dateAjout ? new Date(d.dateAjout).toLocaleDateString('fr-FR') : '-'}</td>
                    <td>${d.conteneur || '-'}</td>
                    <td class="ref">${d.ref}</td>
                    <td style="text-align:center;"><input type="number" class="editable-cell" value="${d.quantite || 1}" onchange="updateDeliveryQuantity('${d.id}', this.value)" style="width: 50px; text-align:center; font-weight:bold;"></td>
                    <td class="montant"><input type="text" class="editable-cell" value="${(d.montant || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryAmount('${d.id}', this.value)" style="width: 100%;"></td>
                    <td>${d.expediteur}</td>
                    <td><input type="text" class="editable-cell" value="${(d.lieuLivraison || '').replace(/"/g, '&quot;')}" list="sharedLocationsList" onchange="updateDeliveryLocation('${d.id}', this.value)"></td>
                    <td><input type="text" class="editable-cell" value="${displayDestinataire.replace(/"/g, '&quot;')}" onchange="updateDeliveryRecipient('${d.id}', this.value)"></td>
                    <td><input type="text" class="editable-cell" value="${displayPhone}" onchange="updateDeliveryPhone('${d.id}', this.value)" style="font-weight:bold; color:#0d47a1; width:100%;"></td>
                    <td>${d.description || '-'}</td>
                    <td><div class="actions">${actionButtons}</div></td>
                </tr>
            `;
        }

        return `
            <tr class="${rowClass}">
                <td class="col-checkbox"><input type="checkbox" onchange="toggleSelection('${d.id}')" ${selectedIds.has(d.id) ? 'checked' : ''}></td>
                <td>${d.conteneur || '-'}</td>
                <td class="ref">${transitIndicator}${d.ref}</td>
                <td style="text-align:center;"><input type="number" class="editable-cell" value="${d.quantite || 1}" onchange="updateDeliveryQuantity('${d.id}', this.value)" style="width: 50px; text-align:center; font-weight:bold;"></td>
                <td class="montant"><input type="text" class="editable-cell" value="${(d.montant || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryAmount('${d.id}', this.value)" style="width: 100%;"></td>
                <td>${d.expediteur}</td>
                <td><input type="text" class="editable-cell" value="${(d.lieuLivraison || '').replace(/"/g, '&quot;')}" list="sharedLocationsList" onchange="updateDeliveryLocation('${d.id}', this.value)"></td>
                <td><input type="text" class="editable-cell" value="${displayDestinataire.replace(/"/g, '&quot;')}" onchange="updateDeliveryRecipient('${d.id}', this.value)"></td>
                <td><input type="text" class="editable-cell" value="${displayPhone}" onchange="updateDeliveryPhone('${d.id}', this.value)" style="font-weight:bold; color:#0d47a1; width:100%;"></td>
                <td>${d.description || '-'}</td>
                <td><input type="text" class="editable-cell" value="${(d.info || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryInfo('${d.id}', this.value)"></td>
                ${notifiedCell}
                <td>
                    <strong>${d.livreur || '-'}</strong><br>
                    <small>${d.dateProgramme || ''}</small>
                </td>
                ${statusCell}
                <td>
                    <div class="actions">${actionButtons}</div>
                </td>
            </tr>
        `
    }).join('');

    // Ajouter le bouton "Afficher plus" si nécessaire
    if (filteredDeliveries.length > itemsPerPage) {
        tableRows += `<tr><td colspan="12" style="text-align: center;"><button class="btn" onclick="loadMoreItems()">Afficher plus</button></td></tr>`;
    }

    tbody.innerHTML = tableRows;
}

// Détails du programme (Modal)
function viewProgramDetails(date, livreur) {
    // Réinitialiser le tri si on change de programme
    if (currentProgramView.date !== date || currentProgramView.livreur !== livreur) {
        programDetailsSort = { column: null, direction: 'asc' };
    }
    currentProgramView = { date, livreur };

    // On récupère les items et on les trie selon leur ordre défini (s'il existe), sinon par défaut
    let items = deliveries.filter(d => d.dateProgramme === date && d.livreur === livreur);
    
    // Tri
    if (programDetailsSort.column) {
        items.sort((a, b) => {
            let valA = a[programDetailsSort.column] || '';
            let valB = b[programDetailsSort.column] || '';

            if (programDetailsSort.column === 'montant') {
                valA = parseFloat(valA.replace(/[^\d]/g, '')) || 0;
                valB = parseFloat(valB.replace(/[^\d]/g, '')) || 0;
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }

            if (valA < valB) return programDetailsSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return programDetailsSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Tri par ordre personnalisé 'orderInRoute' s'il existe
        items.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
    }
    
    document.getElementById('detailLivreur').textContent = livreur;
    document.getElementById('detailDate').textContent = date;
    
    // Configuration du bouton export PDF
    document.getElementById('btnExportPdf').onclick = function() { exportRoadmapPDF(date, livreur); };
    document.getElementById('btnOpenMap').onclick = function() { openBingMapsRoute(date, livreur); };

    const table = document.getElementById('programDetailsTable');
    table.innerHTML = `
        <thead>
            <tr>
                <th style="width: 50px;" onclick="sortProgramDetails(null)" class="sortable">ORDRE ${!programDetailsSort.column ? '↓' : '↕'}</th>
                <th class="sortable" onclick="sortProgramDetails('ref')">REF ${getProgramSortIcon('ref')}</th>
                <th class="sortable" onclick="sortProgramDetails('montant')">MONTANT ${getProgramSortIcon('montant')}</th>
                <th class="sortable" onclick="sortProgramDetails('expediteur')">EXPEDITEUR ${getProgramSortIcon('expediteur')}</th>
                <th class="sortable" onclick="sortProgramDetails('lieuLivraison')">LIEU DE LIVRAISON ${getProgramSortIcon('lieuLivraison')}</th>
                <th class="sortable" onclick="sortProgramDetails('destinataire')">DESTINATAIRE ${getProgramSortIcon('destinataire')}</th>
                <th>DESCRIPTION</th>
                <th>INFO</th>
                <th class="sortable" onclick="sortProgramDetails('status')">STATUT ${getProgramSortIcon('status')}</th>
                <th>ACTIONS</th>
            </tr>
        </thead>
        <tbody>
            ${items.map((d, index) => {
                let statusClass = 'status-attente';
                let statusText = 'ATTENTE';

                if (d.status === 'LIVRE') {
                    statusClass = 'status-livre';
                    statusText = 'LIVRÉ';
                } else if (d.status === 'EN_COURS') {
                    statusClass = 'status-en-cours';
                    statusText = 'EN COURS';
                }
                
                // Afficher les boutons de déplacement uniquement si le tri par défaut est actif
                const showMoveButtons = !programDetailsSort.column;

                return `
                <tr class="${d.status === 'LIVRE' ? 'delivered' : ''}">
                    <td>
                        ${showMoveButtons ? `<div style="display: flex; flex-direction: column; gap: 2px;">
                            ${index > 0 ? `<button class="btn-small" style="padding: 0 5px;" onclick="moveDeliveryOrder(${d.id}, -1, '${date}', '${livreur}')">▲</button>` : ''}
                            ${index < items.length - 1 ? `<button class="btn-small" style="padding: 0 5px;" onclick="moveDeliveryOrder(${d.id}, 1, '${date}', '${livreur}')">▼</button>` : ''}
                        </div>` : `<span style="color:#999;">${index + 1}</span>`}
                    </td>
                    <td class="ref">${d.ref}</td>
                    <td class="montant">${d.montant}</td>
                    <td>${d.expediteur}</td>
                    <td style="display: flex; align-items: center; gap: 5px;">
                        <input type="text" class="editable-cell" value="${(d.lieuLivraison || '').replace(/"/g, '&quot;')}" list="sharedLocationsList" onchange="updateDeliveryLocation(${d.id}, this.value)">
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((d.lieuLivraison || '') + ' ' + d.commune + ' Abidjan')}" target="_blank" title="Voir sur la carte" style="text-decoration: none;">
                            📍
                        </a>
                    </td>
                    <td><input type="text" class="editable-cell" value="${(d.destinataire || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryRecipient(${d.id}, this.value)"></td>
                    <td>${d.description || ''}</td>
                    <td><input type="text" class="editable-cell" value="${(d.info || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryInfo(${d.id}, this.value)"></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="actions">
                        ${d.status !== 'LIVRE' ? 
                            `<button class="btn btn-success btn-small" onclick="markAsDelivered(${d.id}); viewProgramDetails('${date}', '${livreur}')">✅</button>` : 
                            `<button class="btn btn-warning btn-small" onclick="markAsPending(${d.id}); viewProgramDetails('${date}', '${livreur}')">⏳</button>`
                        }
                        <button class="btn btn-danger btn-small" onclick="removeFromProgram(${d.id}); viewProgramDetails('${date}', '${livreur}')" title="Retirer du programme">❌</button>
                        </div>
                    </td>
                </tr>
            `}).join('')}
        </tbody>
    `;
    
    document.getElementById('programDetailsModal').classList.add('active');
}

function sortProgramDetails(column) {
    if (programDetailsSort.column === column) {
        programDetailsSort.direction = programDetailsSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        programDetailsSort.column = column;
        programDetailsSort.direction = 'asc';
    }
    viewProgramDetails(currentProgramView.date, currentProgramView.livreur);
}

function getProgramSortIcon(column) {
    if (programDetailsSort.column !== column) return '↕';
    return programDetailsSort.direction === 'asc' ? '↑' : '↓';
}

// Fonction pour ouvrir l'itinéraire complet dans Bing Maps (Supporte jusqu'à 25 points)
function openBingMapsRoute(date, livreur) {
    // Récupérer les items dans l'ordre actuel
    let items = deliveries.filter(d => d.dateProgramme === date && d.livreur === livreur);
    items.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));

    if (items.length === 0) return;

    // Bing Maps URL (Format: https://www.bing.com/maps?rtp=adr.Adresse1~adr.Adresse2...)
    // Bing supporte environ 25 points, contre 10 pour Google Maps
    let baseUrl = "https://www.bing.com/maps?rtp=";
    
    // On ajoute "Abidjan" pour aider à localiser les quartiers
    const destinations = items.map(d => `adr.${encodeURIComponent(`${d.lieuLivraison} ${d.commune} Abidjan`)}`).join('~');
    
    window.open(baseUrl + destinations, '_blank');
}

// Fonction d'export PDF pour la feuille de route
function exportRoadmapPDF(date, livreur) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF(); // Par défaut : portrait, A4
    
    // Titre
    doc.setFontSize(18);
    doc.text(`Feuille de route - ${livreur} - ${date}`, 14, 22);
    
    // Données
    let items = deliveries.filter(d => d.dateProgramme === date && d.livreur === livreur);
    items.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
    
    const tableColumn = ["REF", "MONTANT", "EXPEDITEUR", "LIEU DE LIVRAISON", "DESTINATAIRE", "DESCRIPTION", "INFO"];
    const tableRows = [];

    items.forEach(d => {
        const rowData = [
            d.ref,
            d.montant,
            d.expediteur,
            d.lieuLivraison,
            d.destinataire,
            d.description,
            d.info || ''
        ];
        tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 30,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [102, 126, 234] }
    });

    doc.save(`Feuille_de_route_${livreur}_${date}.pdf`);
}

// Fonction d'export PDF pour un Bon de Livraison individuel
function printDeliverySlip(id) {
    const d = deliveries.find(i => i.id == id);
    if(!d) return;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // En-tête
    doc.setFontSize(22);
    doc.setTextColor(40);
    doc.text("BON DE LIVRAISON", 105, 20, null, null, "center");
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 150, 30);
    doc.text(`Réf : ${d.ref}`, 20, 30);

    // Cadre Expéditeur / Destinataire
    doc.setDrawColor(200);
    doc.rect(15, 40, 85, 40);
    doc.rect(110, 40, 85, 40);
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("EXPÉDITEUR", 20, 48);
    doc.text("DESTINATAIRE", 115, 48);
    
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(d.expediteur || 'Non spécifié', 75), 20, 58);
    doc.text(doc.splitTextToSize((d.destinataire || 'Non spécifié') + '\n' + (d.lieuLivraison || '') + '\n' + (d.commune || ''), 75), 115, 58);

    // Détails Colis
    doc.autoTable({
        startY: 90,
        head: [['Description', 'Conteneur', 'Montant à Payer']],
        body: [[d.description || 'Colis divers', d.conteneur || '-', d.montant || '0 CFA']],
        theme: 'grid',
        headStyles: { fillColor: [60, 60, 60] }
    });

    // Zone Signature
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.text("Signature Client :", 130, finalY);
    doc.rect(120, finalY + 5, 70, 30);

    doc.save(`BL_${d.ref}.pdf`);
}

function moveDeliveryOrder(id, direction, date, livreur) {
    // Récupérer tous les items de ce programme
    let items = deliveries.filter(d => d.dateProgramme === date && d.livreur === livreur);
    items.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));

    const index = items.findIndex(d => d.id === id);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;

    // Échanger les positions
    const itemA = items[index];
    const itemB = items[newIndex];

    // Assigner des ordres si pas encore définis
    items.forEach((item, idx) => item.orderInRoute = idx);

    // Swap
    const tempOrder = itemA.orderInRoute;
    itemA.orderInRoute = itemB.orderInRoute;
    itemB.orderInRoute = tempOrder;

    saveDeliveries();
    viewProgramDetails(date, livreur);
}

function removeFromProgram(id) {
    if (confirm('Retirer ce colis du programme ? Il repassera "En attente".')) {
        const delivery = deliveries.find(d => d.id === id);
        if (delivery) {
            delivery.livreur = '';
            delivery.dateProgramme = '';
            delivery.status = 'EN_ATTENTE';
            delivery.orderInRoute = null;
            saveDeliveries();
            filterDeliveries();
            updateStats();
            showToast('Colis retiré du programme', 'success');
        }
    }
}

function closeProgramDetailsModal() {
    document.getElementById('programDetailsModal').classList.remove('active');
}

// Gestion de la sélection
function toggleSelection(id) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
    } else {
        selectedIds.add(id);
    }
    renderTable();
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll').checked;
    if (selectAll) {
        filteredDeliveries.forEach(d => selectedIds.add(d.id));
    } else {
        filteredDeliveries.forEach(d => selectedIds.delete(d.id));
    }
    renderTable();
}

// Programmation
function openProgramModal() {
    if (selectedIds.size === 0) {
        showToast('Veuillez sélectionner au moins une livraison', 'error');
        return;
    }
    document.getElementById('selectedCount').textContent = selectedIds.size;
    // Pré-remplir la date avec la date du jour
    document.getElementById('progDate').valueAsDate = new Date();
    
    // Remplir la liste des programmes existants
    const select = document.getElementById('existingProgramSelect');
    if (select) {
        select.innerHTML = '<option value="">-- Nouveau Programme --</option>';
        const programs = {};
        deliveries.forEach(d => {
            if (d.livreur && d.dateProgramme) {
                const key = `${d.dateProgramme}__${d.livreur}`;
                if (!programs[key]) programs[key] = { date: d.dateProgramme, livreur: d.livreur, count: 0, active: false };
                programs[key].count++;
                // Le programme est considéré actif s'il contient au moins un colis non livré
                if (d.status !== 'LIVRE') {
                    programs[key].active = true;
                }
            }
        });
        
        Object.values(programs).sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
            if (p.active) {
                select.innerHTML += `<option value="${p.date}|${p.livreur}">📅 ${p.date} - 👤 ${p.livreur} (${p.count} colis)</option>`;
            }
        });
    }

    document.getElementById('programModal').classList.add('active');
}

function closeProgramModal() {
    document.getElementById('programModal').classList.remove('active');
    document.getElementById('progLivreur').value = '';
}

function fillProgramFields() {
    const select = document.getElementById('existingProgramSelect');
    const val = select.value;
    if (val) {
        const [date, livreur] = val.split('|');
        document.getElementById('progDate').value = date;
        document.getElementById('progLivreur').value = livreur;
    } else {
        document.getElementById('progLivreur').value = '';
        document.getElementById('progDate').valueAsDate = new Date();
    }
}

function confirmProgram() {
    const livreur = document.getElementById('progLivreur').value;
    const dateProg = document.getElementById('progDate').value;

    if (!livreur || !dateProg) {
        showToast('Veuillez remplir le livreur et la date', 'error');
        return;
    }

    const batch = db.batch();
    selectedIds.forEach(id => {
        batch.update(db.collection(CONSTANTS.COLLECTION).doc(id), {
            livreur: livreur, dateProgramme: dateProg, status: 'EN_COURS'
        });
    });
    batch.commit().then(() => {
        closeProgramModal();
        selectedIds.clear();
        showToast('Programme enregistré !', 'success');
    });
}

// Attribution de Conteneur en masse
function openAssignContainerModal() {
    if (selectedIds.size === 0) {
        showToast('Veuillez sélectionner au moins une livraison', 'error');
        return;
    }
    document.getElementById('assignSelectedCount').textContent = selectedIds.size;
    // Pré-remplir avec le conteneur en cours si disponible
    if (currentContainerName !== 'Aucun') {
        document.getElementById('assignConteneurInput').value = currentContainerName;
    }
    document.getElementById('assignContainerStatus').value = ''; // Reset status select
    document.getElementById('assignContainerModal').classList.add('active');
}

function closeAssignContainerModal() {
    document.getElementById('assignContainerModal').classList.remove('active');
    document.getElementById('assignConteneurInput').value = '';
}

function confirmAssignContainer() {
    const newConteneur = document.getElementById('assignConteneurInput').value;
    const newStatus = document.getElementById('assignContainerStatus').value;

    const batch = db.batch();
    selectedIds.forEach(id => {
        const updates = { conteneur: newConteneur };
        if (newStatus) {
            updates.containerStatus = newStatus;
            // Logique transit simplifiée pour batch (suppose lecture locale à jour)
            // Pour être puriste, on devrait lire chaque doc, mais ici on fait confiance à l'état local synchronisé
        }
        batch.update(db.collection(CONSTANTS.COLLECTION).doc(id), updates);
    });

    batch.commit().then(() => {
        closeAssignContainerModal();
        selectedIds.clear();
        showToast('Attribution terminée !', 'success');
    });
}

// --- ACTIONS GROUPÉES (Suppression & Statut) ---

let pendingDeleteContext = null;

function deleteSelectedDeliveries() {
    if (selectedIds.size === 0) {
        showToast('Veuillez sélectionner au moins une livraison', 'error');
        return;
    }

    // Si on est dans EN_COURS, on demande quoi faire (Renvoyer ou Supprimer)
    if (currentTab === 'EN_COURS') {
        openDeleteChoiceModal({ type: 'bulk' });
        return;
    }
    
    // Suppression standard pour les autres onglets
    permanentlyDeleteSelected(false);
}

// Fonction utilitaire pour supprimer la transaction associée (Arrivages)
function deleteTransactionByRef(ref) {
    if (!ref) return;
    db.collection('transactions').where('reference', '==', ref).get()
        .then(snapshot => {
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            if (!snapshot.empty) batch.commit();
        })
        .catch(err => console.error("Erreur suppression transaction liée:", err));
}

function openBulkStatusModal() {
    if (selectedIds.size === 0) {
        showToast('Veuillez sélectionner au moins une livraison', 'error');
        return;
    }
    document.getElementById('bulkStatusCount').textContent = selectedIds.size;
    document.getElementById('bulkStatusModal').classList.add('active');
}

function closeBulkStatusModal() {
    document.getElementById('bulkStatusModal').classList.remove('active');
}

function confirmBulkStatusChange() {
    const newStatus = document.getElementById('bulkStatusSelect').value;
    const batch = db.batch();
    selectedIds.forEach(id => {
        batch.update(db.collection(CONSTANTS.COLLECTION).doc(id), { status: newStatus });
    });
    batch.commit().then(() => {
        closeBulkStatusModal();
        selectedIds.clear();
        showToast('Statuts mis à jour !', 'success');
    });
}

// --- FONCTION DE SYNCHRONISATION FORCÉE (Réparation) ---
async function forceSyncTransactions() {
    if (!confirm("Voulez-vous forcer la synchronisation des transactions ?\n\nCela va copier les Noms, Adresses, Numéros ET MONTANTS corrects de l'onglet 'En Cours' vers la Caisse (Saisie) pour corriger les erreurs.")) return;

    const loadingToast = document.createElement('div');
    loadingToast.className = 'toast';
    loadingToast.textContent = "Synchronisation en cours...";
    loadingToast.style.background = "#3b82f6";
    document.body.appendChild(loadingToast);

    try {
        const enCoursItems = deliveries.filter(d => d.containerStatus === 'EN_COURS');
        let batch = db.batch();
        let count = 0;
        let updatedCount = 0;

        for (const item of enCoursItems) {
            if (!item.ref) continue;

            // On cherche la transaction correspondante
            const q = await db.collection('transactions').where('reference', '==', item.ref).get();
            
            if (!q.empty) {
                q.forEach(doc => {
                    const t = doc.data();
                    const updates = {};
                    
                    // On met à jour avec les données fiables de Livraison
                    const newNom = item.destinataire || item.expediteur || 'Client';
                    if (newNom && t.nom !== newNom) updates.nom = newNom;
                    if (item.destinataire && t.nomDestinataire !== item.destinataire) updates.nomDestinataire = item.destinataire;
                    if (item.lieuLivraison && t.adresseDestinataire !== item.lieuLivraison) updates.adresseDestinataire = item.lieuLivraison;
                    if (item.numero && t.numero !== item.numero) updates.numero = item.numero;
                    if (item.description && t.description !== item.description) updates.description = item.description;

                    // --- CORRECTION MONTANTS ---
                    const restant = parseFloat((item.montant || '0').replace(/[^\d]/g, '')) || 0;
                    const original = parseFloat((item.prixOriginal || '0').replace(/[^\d]/g, '')) || 0;
                    const totalPrix = original > 0 ? original : restant;
                    
                    let mParis = 0;
                    if (totalPrix > restant) {
                        mParis = totalPrix - restant;
                    }

                    if (t.prix !== totalPrix || t.montantParis !== mParis) {
                        updates.prix = totalPrix;
                        updates.montantParis = mParis;
                        const currentAbidjan = t.montantAbidjan || 0;
                        updates.reste = (mParis + currentAbidjan) - totalPrix;
                    }

                    if (Object.keys(updates).length > 0) {
                        batch.update(doc.ref, updates);
                        updatedCount++;
                        count++;
                    }
                });
            }
            if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
        }
        if (count > 0) await batch.commit();
        loadingToast.remove();
        alert(`✅ Synchronisation terminée !\n${updatedCount} fiches corrigées dans la Caisse.`);
    } catch (e) { console.error(e); loadingToast.remove(); alert("Erreur : " + e.message); }
}

// --- GESTION DES ARCHIVES ---

function archiveCompletedDeliveries() {
    // Identifier les colis livrés
    const completed = deliveries.filter(d => d.status === 'LIVRE');
    
    if (completed.length === 0) {
        showToast('Aucun colis livré à archiver', 'error');
        return;
    }

    if (confirm(`Voulez-vous archiver ${completed.length} colis livrés ?\nIls seront retirés de la liste principale mais resteront consultables dans les archives.`)) {
        // Ajouter la date d'archivage
        const now = new Date().toISOString();
        const batch = db.batch();
        
        completed.forEach(d => {
            const archiveRef = db.collection(CONSTANTS.ARCHIVE_COLLECTION).doc(d.id);
            batch.set(archiveRef, { ...d, dateArchivage: now });
            const activeRef = db.collection(CONSTANTS.COLLECTION).doc(d.id);
            batch.delete(activeRef);
        });
        
        batch.commit().then(() => showToast('Archivage terminé !', 'success'));
    }
}

function openArchivesModal() {
    document.getElementById('archivesModal').classList.add('active');
    document.getElementById('archivesBody').innerHTML = '<tr><td colspan="7">Chargement...</td></tr>';
    
    db.collection(CONSTANTS.ARCHIVE_COLLECTION)
        .orderBy('dateArchivage', 'desc')
        .limit(100)
        .get()
        .then(snapshot => {
            archivedDeliveries = [];
            snapshot.forEach(doc => archivedDeliveries.push({ id: doc.id, ...doc.data() }));
            renderArchivesTable(archivedDeliveries);
        });
}

function closeArchivesModal() {
    document.getElementById('archivesModal').classList.remove('active');
}

function searchArchives() {
    const query = document.getElementById('archiveSearch').value.toLowerCase();
    const filtered = archivedDeliveries.filter(d => 
        `${d.ref} ${d.conteneur} ${d.destinataire} ${d.livreur}`.toLowerCase().includes(query)
    );
    renderArchivesTable(filtered);
}

function restoreFromArchive(id) {
    if (confirm('Êtes-vous sûr de vouloir restaurer ce colis vers la liste principale ?')) {
        db.collection(CONSTANTS.ARCHIVE_COLLECTION).doc(id).get().then(doc => {
            if(doc.exists) {
                const data = doc.data();
                delete data.dateArchivage;
                const batch = db.batch();
                batch.set(db.collection(CONSTANTS.COLLECTION).doc(id), data);
                batch.delete(db.collection(CONSTANTS.ARCHIVE_COLLECTION).doc(id));
                batch.commit().then(() => {
                    showToast("Restauré !", "success");
                    openArchivesModal();
                });
            }
        });
    }
}

function renderArchivesTable(data) {
    const tbody = document.getElementById('archivesBody');
    // Tri par date d'archivage décroissante (plus récent en haut)
    data.sort((a, b) => new Date(b.dateArchivage) - new Date(a.dateArchivage));
    
    tbody.innerHTML = data.map(d => `
        <tr>
            <td>${new Date(d.dateArchivage).toLocaleDateString()}</td>
            <td class="ref">${d.ref}</td>
            <td>${d.conteneur || '-'}</td>
            <td>${d.destinataire}</td>
            <td>${d.livreur || '-'}</td>
            <td>${d.dateProgramme || '-'}</td>
            <td>
                <button class="btn btn-warning btn-small" onclick="restoreFromArchive('${d.id}')">♻️ Restaurer</button>
            </td>
        </tr>
    `).join('');
}

// Filtres
// Correction de la fonction de filtrage pour être plus fluide
function filterDeliveries() {
    // Récupération des communes sélectionnées (Multi-select)
    const checkboxes = document.querySelectorAll('#communeDropdownList input[type="checkbox"]:checked');
    const selectedCommunes = Array.from(checkboxes).map(cb => cb.value);
    
    // Mise à jour du texte du bouton
    const btn = document.getElementById('communeFilterBtn');
    if (selectedCommunes.length === 0) {
        btn.textContent = '📍 Toutes les communes';
    } else if (selectedCommunes.length === 1) {
        btn.textContent = `📍 ${selectedCommunes[0]}`;
    } else {
        btn.textContent = `📍 ${selectedCommunes.length} communes`;
    }

    // Récupération des lieux sélectionnés (Multi-select)
    const locationCheckboxes = document.querySelectorAll('#locationCheckboxes input[type="checkbox"]:checked');
    const selectedLocations = Array.from(locationCheckboxes).map(cb => cb.value);

    // Mise à jour du texte du bouton Lieux
    const locBtn = document.getElementById('locationFilterBtn');
    if (selectedLocations.length === 0) {
        locBtn.textContent = '📍 Tous les lieux';
    } else if (selectedLocations.length === 1) {
        locBtn.textContent = `📍 ${selectedLocations[0]}`;
    } else {
        locBtn.textContent = `📍 ${selectedLocations.length} lieux`;
    }

    // Récupération des statuts sélectionnés (Multi-select)
    const statusCheckboxes = document.querySelectorAll('#statusDropdownList input[type="checkbox"]:checked');
    const selectedStatuses = Array.from(statusCheckboxes).map(cb => cb.value);

    // Mise à jour du texte du bouton Statuts
    const statusBtn = document.getElementById('statusFilterBtn');
    if (selectedStatuses.length === 0) {
        statusBtn.textContent = '📊 Tous les statuts';
    } else if (selectedStatuses.length === 1) {
        const map = { 'EN_ATTENTE': '⏳ En Attente', 'EN_COURS': '🚚 En Cours', 'LIVRE': '✅ Livré' };
        statusBtn.textContent = map[selectedStatuses[0]] || selectedStatuses[0];
    } else {
        statusBtn.textContent = `📊 ${selectedStatuses.length} statuts`;
    }

    // Filtre Conteneur Actif
    const filterContainerCb = document.getElementById('filterByContainerCb');
    const isContainerFilterActive = filterContainerCb && filterContainerCb.checked;

    const searchQuery = document.getElementById('searchBox').value.toLowerCase().trim();
    
    filteredDeliveries = deliveries.filter(d => {
        const matchCommune = selectedCommunes.length === 0 || selectedCommunes.includes(d.commune);
        const matchLocation = selectedLocations.length === 0 || (d.lieuLivraison && selectedLocations.includes(d.lieuLivraison.trim()));
        const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(d.status);
        
        // Filtre par onglet
        let matchTab = false;
        const itemContainerStatus = d.containerStatus || 'EN_COURS';

        if (currentTab === 'PROGRAMME') {
            matchTab = d.dateProgramme && d.dateProgramme !== '';
        } else if (currentTab === 'PARIS') {
            matchTab = itemContainerStatus === 'PARIS';
        } else if (currentTab === 'A_VENIR') {
            matchTab = itemContainerStatus === 'A_VENIR';
        } else if (currentTab === 'EN_COURS') {
            matchTab = itemContainerStatus === 'EN_COURS';
        }
        
        // Recherche multi-champs plus performante
        const searchString = `${d.ref} ${d.expediteur} ${d.destinataire} ${d.lieuLivraison} ${d.livreur || ''}`.toLowerCase();
        const matchSearch = !searchQuery || searchString.includes(searchQuery);
        
        // Match Conteneur Actif
        let matchContainer = true;
        // CORRECTION : On n'applique le filtre conteneur QUE sur les onglets En Cours et À Venir
        if (['EN_COURS', 'A_VENIR'].includes(currentTab) && isContainerFilterActive && currentContainerName !== 'Aucun') {
            matchContainer = (d.conteneur === currentContainerName);
        }
        
        return matchCommune && matchStatus && matchSearch && matchTab && matchLocation && matchContainer;
    });

    // Appliquer le tri
    if (currentTab === 'PROGRAMME') {
        // Tri par date décroissante par défaut pour l'onglet programme
        filteredDeliveries.sort((a, b) => new Date(b.dateProgramme) - new Date(a.dateProgramme));
    } else if (currentSort.column) {
        filteredDeliveries.sort((a, b) => {
            // Gestion spécifique pour la REF (Tri complexe : Suffixe DESC, puis Nombre ASC)
            if (currentSort.column === 'ref') {
                const getParts = (str) => {
                    const parts = (str || '').split('-');
                    const suffix = parts.length > 0 ? parts[parts.length - 1] : '';
                    const number = parts.length > 1 ? parseInt(parts[parts.length - 2], 10) : 0;
                    return { suffix, number: isNaN(number) ? 0 : number };
                };

                const pA = getParts(a.ref);
                const pB = getParts(b.ref);

                // 1. Tri sur le suffixe (Inverse de la direction globale car demandé décroissant par défaut)
                // Si direction='asc', on veut E4 avant E3 (Décroissant)
                if (pA.suffix < pB.suffix) return currentSort.direction === 'asc' ? 1 : -1;
                if (pA.suffix > pB.suffix) return currentSort.direction === 'asc' ? -1 : 1;

                // 2. Tri sur le nombre (Suit la direction globale : croissant par défaut)
                // Si direction='asc', on veut 1 avant 23 (Croissant)
                if (pA.number < pB.number) return currentSort.direction === 'asc' ? -1 : 1;
                if (pA.number > pB.number) return currentSort.direction === 'asc' ? 1 : -1;
                
                return 0;
            }

            let valA = a[currentSort.column] || '';
            let valB = b[currentSort.column] || '';

            // Gestion spécifique pour les montants (enlever ' CFA' et espaces pour trier numériquement)
            if (currentSort.column === 'montant') {
                valA = parseFloat(valA.replace(/[^\d]/g, '')) || 0;
                valB = parseFloat(valB.replace(/[^\d]/g, '')) || 0;
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }

            if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    renderTable();
}

// Fonction de tri
function sortTable(column) {
    if (currentSort.column === column) {
        // Inverse la direction si on clique sur la même colonne
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    filterDeliveries();
}

function getSortIcon(column) {
    if (currentSort.column !== column) return '↕';
    return currentSort.direction === 'asc' ? '↑' : '↓';
}

// Mise à jour du lieu de livraison en direct
function updateDeliveryLocation(id, newLocation) {
    const detected = detectCommune(newLocation);
    const updates = { lieuLivraison: newLocation };
    if (detected !== 'AUTRE') updates.commune = detected;
    
    db.collection(CONSTANTS.COLLECTION).doc(id).update(updates);

    // PROPAGATION : Mettre à jour tous les colis du même destinataire (tous onglets confondus)
    const currentItem = deliveries.find(d => d.id === id);
    if (currentItem && currentItem.destinataire && currentItem.destinataire.trim() !== "") {
        const recipientName = currentItem.destinataire.trim();
        
        // REQUÊTE FIRESTORE pour toucher TOUS les onglets (même ceux non chargés localement)
        db.collection(CONSTANTS.COLLECTION)
            .where('destinataire', '==', recipientName)
            .limit(500)
            .get()
            .then(snapshot => {
                const batch = db.batch();
                let count = 0;
                
                snapshot.forEach(doc => {
                    // On ne met à jour que si l'ID est différent ET que le lieu est différent (pour économiser des écritures)
                    if (doc.id !== id && doc.data().lieuLivraison !== newLocation) {
                        batch.update(doc.ref, updates);
                        count++;
                    }
                });

                if (count > 0) {
                    batch.commit().then(() => showToast(`Adresse propagée à ${count} autres colis de ${recipientName}`, 'success'));
                }
            })
            .catch(err => console.error("Erreur propagation adresse:", err));
    }
}

// Mise à jour du destinataire en direct
function updateDeliveryRecipient(id, newRecipient) {
    db.collection(CONSTANTS.COLLECTION).doc(id).update({ destinataire: newRecipient });
}

// Mise à jour du numéro en direct
function updateDeliveryPhone(id, newPhone) {
    db.collection(CONSTANTS.COLLECTION).doc(id).update({ numero: newPhone });
}

// Mise à jour du montant en direct
function updateDeliveryAmount(id, newAmount) {
    db.collection(CONSTANTS.COLLECTION).doc(id).update({ montant: newAmount });
}

// Mise à jour de la quantité en direct
function updateDeliveryQuantity(id, newQty) {
    db.collection(CONSTANTS.COLLECTION).doc(id).update({ quantite: parseInt(newQty) || 1 });
}

// Mise à jour de l'info manuelle en direct
function updateDeliveryInfo(id, newInfo) {
    db.collection(CONSTANTS.COLLECTION).doc(id).update({ info: newInfo });
}

// Mise à jour du statut "Client Notifié" (Onglet À Venir)
function toggleClientNotified(id, isChecked) {
    db.collection(CONSTANTS.COLLECTION).doc(id).update({ clientNotified: isChecked });
}

// Actions
function markAsDelivered(id) {
    db.collection(CONSTANTS.COLLECTION).doc(id).update({
        status: 'LIVRE',
        dateLivraison: new Date().toISOString()
    }).then(() => showToast('Marqué comme LIVRÉ', 'success'));
}

function markAsPending(id) {
    db.collection(CONSTANTS.COLLECTION).doc(id).update({ status: 'EN_ATTENTE' });
}

function deleteDelivery(id) {
    const d = deliveries.find(item => item.id === id);

    // Si on est dans EN_COURS, on demande quoi faire
    if (d && d.containerStatus === 'EN_COURS') {
        openDeleteChoiceModal({ type: 'single', id: id });
        return;
    }

    permanentlyDeleteSingle(id, false);
}

// Modal ajout
function showAddModal() {
    if (['EN_COURS', 'A_VENIR', 'PARIS'].includes(currentTab)) {
        document.getElementById('newContainerStatus').value = currentTab;
    }
    document.getElementById('addModal').classList.add('active');
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
    document.getElementById('deliveryForm').reset();
}

document.getElementById('deliveryForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const refInput = document.getElementById('ref').value.trim();
    
    // 1. Vérification Doublon (Référence Unique)
    const existingItem = deliveries.find(d => d.ref === refInput);

    const newItem = {
        containerStatus: document.getElementById('newContainerStatus').value,
        conteneur: document.getElementById('conteneur').value.trim(),
        quantite: parseInt(document.getElementById('quantite').value) || 1, // Récupération de la saisie
        ref: refInput,
        montant: document.getElementById('montant').value.trim(),
        expediteur: document.getElementById('expediteur').value.trim(),
        commune: document.getElementById('commune').value,
        numero: document.getElementById('numero').value.trim(),
        lieuLivraison: document.getElementById('lieuLivraison').value.trim(),
        destinataire: document.getElementById('destinataire').value.trim(),
        description: document.getElementById('description').value.trim(),
        status: 'EN_ATTENTE',
        dateAjout: new Date().toISOString()
    };
    
    if (existingItem) {
        if (!confirm(`La référence ${refInput} existe déjà.\nVoulez-vous fusionner les informations (garder les plus complètes) ?`)) {
            return;
        }

        const docRef = db.collection(CONSTANTS.COLLECTION).doc(existingItem.id);
        const updates = {};

        // Fonction de fusion intelligente (Garder le plus long = plus d'infos)
        const pickBest = (oldV, newV) => {
            const o = String(oldV || '').trim();
            const n = String(newV || '').trim();
            if (!n) return o;
            if (!o) return n;
            return n.length >= o.length ? n : o;
        };

        updates.containerStatus = newItem.containerStatus;
        if (newItem.conteneur) updates.conteneur = newItem.conteneur;
        updates.quantite = (existingItem.quantite || 0) + newItem.quantite; // On cumule les quantités en cas de fusion

        updates.montant = pickBest(existingItem.montant, newItem.montant);
        updates.expediteur = pickBest(existingItem.expediteur, newItem.expediteur);
        updates.destinataire = pickBest(existingItem.destinataire, newItem.destinataire);
        updates.lieuLivraison = pickBest(existingItem.lieuLivraison, newItem.lieuLivraison);
        updates.description = pickBest(existingItem.description, newItem.description);
        
        if (updates.lieuLivraison !== existingItem.lieuLivraison) {
            updates.commune = newItem.commune;
        }

        docRef.update(updates).then(() => {
            showToast('Livraison fusionnée avec succès !', 'success');
            closeAddModal();
            if (newItem.containerStatus !== currentTab) switchTab(newItem.containerStatus);
        });

    } else {
        db.collection(CONSTANTS.COLLECTION).add(newItem).then(() => {
            // --- SYNC TRANSACTION (Si En Cours) ---
            // Si on ajoute manuellement un colis "En Cours", on crée la transaction financière correspondante
            if (newItem.containerStatus === 'EN_COURS') {
                const price = parseFloat((newItem.montant || '0').replace(/[^\d]/g, '')) || 0;
                db.collection('transactions').add({
                    date: newItem.dateAjout.split('T')[0],
                    reference: newItem.ref,
                    nom: newItem.destinataire || newItem.expediteur || 'Client',
                    conteneur: newItem.conteneur || '',
                    prix: price,
                    montantParis: 0,
                    montantAbidjan: 0,
                    reste: -price, // Dette initiale
                    isDeleted: false,
                    description: newItem.description || '',
                    adresseDestinataire: newItem.lieuLivraison || '',
                    nomDestinataire: newItem.destinataire || '',
                    numero: newItem.numero || '',
                    saisiPar: sessionStorage.getItem('userName') || 'Saisie Livraison',
                    quantite: newItem.quantite || 1
                });
            }
            showToast('Livraison ajoutée !', 'success');
            closeAddModal();
            if (newItem.containerStatus !== currentTab) {
                switchTab(newItem.containerStatus);
            }
        });
    }
});

// Mise à jour du titre du conteneur
function updateContainerTitle() {
    const titleEl = document.getElementById('currentContainerTitle');
    const displayEl = document.getElementById('displayActiveContainer');
    
    if (titleEl) {
        titleEl.textContent = `Conteneur en cours : ${currentContainerName}`;
    }
    if (displayEl) {
        displayEl.textContent = currentContainerName;
    }
}

// Auto-complétion des lieux de livraison
function updateAutocomplete() {
    const datalist = document.getElementById('sharedLocationsList');
    if (!datalist) return;

    // Récupère les lieux uniques de TOUS les colis (quel que soit le statut)
    const locations = [...new Set(deliveries
        .filter(d => d.lieuLivraison)
        .map(d => d.lieuLivraison.trim()))].sort();

    datalist.innerHTML = locations.map(loc => `<option value="${loc}">`).join('');
}

// Mise à jour des options du filtre de lieu
function updateLocationFilterOptions() {
    const container = document.getElementById('locationDropdownList');
    if (!container) return;

    // 1. Sauvegarder la sélection actuelle pour ne pas la perdre lors du rafraîchissement
    const currentCheckboxes = document.querySelectorAll('#locationCheckboxes input[type="checkbox"]:checked');
    const selectedValues = Array.from(currentCheckboxes).map(cb => cb.value);

    // 2. Filtrer les données pertinentes
    // Filtrer les livraisons pertinentes pour l'onglet actuel
    const relevantDeliveries = deliveries.filter(d => {
        const itemContainerStatus = d.containerStatus || 'EN_COURS';

        if (currentTab === 'PROGRAMME') {
            return d.dateProgramme && d.dateProgramme !== '';
        } else if (currentTab === 'PARIS') {
            return itemContainerStatus === 'PARIS';
        } else if (currentTab === 'A_VENIR') {
            return itemContainerStatus === 'A_VENIR';
        } else if (currentTab === 'EN_COURS') {
            return itemContainerStatus === 'EN_COURS';
        }
        return false;
    });

    // 3. Extraire les lieux uniques
    const locations = [...new Set(relevantDeliveries.map(d => d.lieuLivraison ? d.lieuLivraison.trim() : '').filter(l => l !== ''))].sort();

    // 4. Construire le HTML avec Recherche et Tout Sélectionner
    let html = `
        <div class="dropdown-search">
            <input type="text" id="locationSearchInput" placeholder="🔍 Rechercher..." onkeyup="filterLocationOptions()" onclick="event.stopPropagation()">
        </div>
        <div class="dropdown-actions">
            <label><input type="checkbox" id="locationSelectAll" onchange="toggleAllLocations()"> (Tout sélectionner)</label>
        </div>
        <div id="locationCheckboxes" class="dropdown-list-container">
    `;

    html += locations.map(loc => {
        const isChecked = selectedValues.includes(loc) ? 'checked' : '';
        return `<label><input type="checkbox" value="${loc}" ${isChecked} onchange="filterDeliveries()"> ${loc}</label>`;
    }).join('');

    html += `</div>`;

    container.innerHTML = html;
    
    // Mettre à jour le texte du bouton (au cas où la sélection a changé ou est vide au départ)
    // On déclenche un filtre "virtuel" pour mettre à jour le texte sans re-filtrer tout le tableau si pas nécessaire, 
    // mais ici appeler filterDeliveries() est plus simple pour tout synchroniser.
    // Cependant, pour éviter une boucle infinie si appelé depuis filterDeliveries, on met juste à jour le texte ici si besoin, 
    // mais le plus simple est de laisser l'état tel quel. Le texte se mettra à jour au prochain clic.
    // Pour l'initialisation, on force le texte par défaut si vide.
    if (selectedValues.length === 0) {
        document.getElementById('locationFilterBtn').textContent = '📍 Tous les lieux';
    } else {
        const btn = document.getElementById('locationFilterBtn');
        btn.textContent = selectedValues.length === 1 ? `📍 ${selectedValues[0]}` : `📍 ${selectedValues.length} lieux`;
    }
}

// Stats
function updateStats() {
    // Calcul des stats basé sur filteredDeliveries (donc l'onglet actif) ou deliveries global selon préférence.
    // Ici on affiche les stats de l'onglet actif pour que ce soit cohérent avec la vue.
    document.getElementById('totalDeliveries').textContent = filteredDeliveries.length;
    document.getElementById('pendingDeliveries').textContent = 
        filteredDeliveries.filter(d => d.status === 'EN_ATTENTE' || d.status === 'EN_COURS').length;
    document.getElementById('completedDeliveries').textContent = 
        filteredDeliveries.filter(d => d.status === 'LIVRE').length;
}

// Sauvegarde
function saveDeliveries() {
    // Obsolète avec Firestore
}

// Toast
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Charger plus d'éléments
function loadMoreItems() {
    itemsPerPage += 100; // Augmenter le nombre d'éléments à afficher
    renderTable(); // Re-render le tableau avec la nouvelle limite
}

// --- AUTO-REMPLISSAGE ADRESSE ---
function initAutoAddress() {
    const destInput = document.getElementById('destinataire');
    const lieuInput = document.getElementById('lieuLivraison');
    
    if (!destInput || !lieuInput) return;

    destInput.addEventListener('change', async function() {
        const val = this.value.trim();
        // Si pas de nom ou si le lieu est déjà rempli, on ne fait rien
        if (!val || lieuInput.value.trim() !== '') return;

        // 1. Recherche dans les données locales (Active) - Insensible à la casse
        // On cherche le colis le plus récent pour ce destinataire
        const localMatch = deliveries.find(d => 
            d.destinataire && d.destinataire.toLowerCase() === val.toLowerCase() && d.lieuLivraison
        );
        
        if (localMatch) {
            lieuInput.value = localMatch.lieuLivraison;
            showToast(`📍 Adresse trouvée : ${localMatch.lieuLivraison}`, 'success');
            return;
        }

        // 2. Recherche dans les archives (Firestore) - Match exact
        try {
            const snap = await db.collection(CONSTANTS.ARCHIVE_COLLECTION).where('destinataire', '==', val).limit(1).get();
            if (!snap.empty) {
                const data = snap.docs[0].data();
                if (data.lieuLivraison) {
                    lieuInput.value = data.lieuLivraison;
                    showToast(`🗄️ Adresse trouvée (Archives) : ${data.lieuLivraison}`, 'success');
                }
            }
        } catch (e) { console.error("Erreur auto-adresse", e); }
    });
}

// --- OUTIL DE NETTOYAGE DES DOUBLONS EXISTANTS ---
function initDuplicateCleaner() {
    // Vérifie si le bouton existe déjà pour éviter les doublons visuels
    if (document.getElementById('btnCleanDuplicates')) return;

    const btn = document.createElement('button');
    btn.id = 'btnCleanDuplicates';
    btn.innerHTML = "🧹 Nettoyer Doublons";
    btn.className = "btn"; 
    // Style : Fixé en bas à gauche, orange pour attirer l'attention mais distinct des actions principales
    btn.style.cssText = "position: fixed; bottom: 20px; left: 20px; z-index: 1000; background-color: #f59e0b; color: white; padding: 10px 15px; border-radius: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: none; cursor: pointer; font-weight: bold; font-size: 12px;";
    btn.onclick = removeDuplicatesFromDatabase;
    document.body.appendChild(btn);
}

async function removeDuplicatesFromDatabase() {
    if (!confirm("⚠️ MAINTENANCE BASE DE DONNÉES ⚠️\n\nVoulez-vous rechercher et fusionner les doublons existants (même Référence) ?\n\nCette action va :\n1. Regrouper les colis par Référence\n2. Fusionner les informations (garder les plus complètes)\n3. Supprimer les doublons superflus\n\nCette action est irréversible.")) return;

    const loadingToast = document.createElement('div');
    loadingToast.className = 'toast';
    loadingToast.textContent = "Analyse des doublons en cours...";
    loadingToast.style.background = "#3b82f6";
    document.body.appendChild(loadingToast);

    try {
        const groups = {};
        // 1. Regroupement par Référence
        deliveries.forEach(d => {
            if (!d.ref) return;
            const key = d.ref.toUpperCase().trim();
            if (!groups[key]) groups[key] = [];
            groups[key].push(d);
        });

        let batch = db.batch();
        let opCount = 0;
        let deletedCount = 0;
        let updatedCount = 0;

        // Fonction utilitaire pour garder la chaîne la plus longue (plus d'infos)
        const pickBest = (oldV, newV) => {
            const o = String(oldV || '').trim();
            const n = String(newV || '').trim();
            if (!n) return o;
            if (!o) return n;
            return n.length >= o.length ? n : o;
        };

        for (const ref in groups) {
            const group = groups[ref];
            if (group.length > 1) {
                // Tri pour déterminer le "Maître" (Celui à garder)
                // On garde celui qui a le statut le plus avancé (LIVRE > EN_COURS > ...)
                group.sort((a, b) => {
                    const score = s => { if (s === 'LIVRE') return 4; if (s === 'EN_COURS') return 3; if (s === 'A_VENIR') return 2; return 1; };
                    return score(b.status) - score(a.status);
                });

                const master = group[0];
                const duplicates = group.slice(1);
                let updates = {};
                let hasUpdates = false;

                // Fusion des données des doublons vers le master
                duplicates.forEach(dup => {
                    ['montant', 'expediteur', 'destinataire', 'lieuLivraison', 'commune', 'description', 'numero', 'conteneur', 'quantite', 'livreur', 'dateProgramme'].forEach(field => {
                        const best = pickBest(master[field], dup[field]);
                        if (best !== master[field]) {
                            updates[field] = best;
                            master[field] = best; // Mise à jour locale
                            hasUpdates = true;
                        }
                    });
                    // Suppression du doublon
                    batch.delete(db.collection(CONSTANTS.COLLECTION).doc(dup.id));
                    opCount++; deletedCount++;
                });

                if (hasUpdates) {
                    batch.update(db.collection(CONSTANTS.COLLECTION).doc(master.id), updates);
                    opCount++; updatedCount++;
                }

                if (opCount >= 400) { await batch.commit(); batch = db.batch(); opCount = 0; }
            }
        }
        if (opCount > 0) await batch.commit();
        loadingToast.remove();
        alert(deletedCount > 0 ? `✅ Nettoyage terminé !\n\n🗑️ ${deletedCount} doublons supprimés\n💾 ${updatedCount} fiches fusionnées` : "👍 Base de données saine : Aucun doublon trouvé.");
    } catch (error) { console.error(error); loadingToast.remove(); alert("Erreur : " + error.message); }
}

// --- GESTION DU MODAL DE CHOIX DE SUPPRESSION ---

function openDeleteChoiceModal(context) {
    pendingDeleteContext = context;
    document.getElementById('deleteChoiceModal').classList.add('active');
}

window.closeDeleteChoiceModal = function() {
    document.getElementById('deleteChoiceModal').classList.remove('active');
    pendingDeleteContext = null;
};

window.confirmDeleteAction = function(action) {
    const context = pendingDeleteContext; // FIX: Sauvegarder le contexte avant de le nettoyer
    closeDeleteChoiceModal();
    if (!context) return;

    if (context.type === 'bulk') {
        if (action === 'MOVE') {
            moveSelectedToAVenir();
        } else if (action === 'DELETE') {
            permanentlyDeleteSelected(true); // true = skip confirm
        }
    } else if (context.type === 'single') {
        if (action === 'MOVE') {
            moveSingleToAVenir(context.id);
        } else if (action === 'DELETE') {
            permanentlyDeleteSingle(context.id, true);
        }
    }
};

// Fonctions utilitaires de suppression/déplacement
function moveSelectedToAVenir() {
    const batch = db.batch();
    selectedIds.forEach(id => {
        batch.update(db.collection(CONSTANTS.COLLECTION).doc(id), {
            containerStatus: 'A_VENIR',
            status: 'EN_ATTENTE',
            livreur: firebase.firestore.FieldValue.delete(),
            dateProgramme: firebase.firestore.FieldValue.delete(),
            importedFromTransit: firebase.firestore.FieldValue.delete(),
            directFromParis: firebase.firestore.FieldValue.delete()
        });
        const item = deliveries.find(d => d.id === id);
        if (item && item.ref) deleteTransactionByRef(item.ref);
    });
    batch.commit().then(() => {
        selectedIds.clear();
        showToast('Colis renvoyés vers À VENIR', 'success');
    });
}

function permanentlyDeleteSelected(skipConfirm = false) {
    if (!skipConfirm && !confirm(`Voulez-vous vraiment supprimer ces ${selectedIds.size} livraisons ?`)) return;

    const batch = db.batch();
    selectedIds.forEach(id => {
        batch.delete(db.collection(CONSTANTS.COLLECTION).doc(id));
        const item = deliveries.find(d => d.id === id);
        if (item && item.ref) deleteTransactionByRef(item.ref);
    });
    batch.commit().then(() => {
        selectedIds.clear();
        showToast('Livraisons supprimées', 'success');
    }).catch(error => {
        console.error("Erreur suppression groupée:", error);
        showToast("Erreur lors de la suppression groupée", "error");
    });
}

function moveSingleToAVenir(id) {
    const d = deliveries.find(item => item.id === id);
    db.collection(CONSTANTS.COLLECTION).doc(id).update({
        containerStatus: 'A_VENIR',
        status: 'EN_ATTENTE',
        livreur: firebase.firestore.FieldValue.delete(),
        dateProgramme: firebase.firestore.FieldValue.delete(),
        importedFromTransit: firebase.firestore.FieldValue.delete(),
        directFromParis: firebase.firestore.FieldValue.delete()
    }).then(() => {
        if (d && d.ref) deleteTransactionByRef(d.ref);
        showToast('Colis renvoyé vers À VENIR', 'success');
    });
}

function permanentlyDeleteSingle(id, skipConfirm = false) {
    if (!skipConfirm && !confirm('⚠️ ATTENTION : Êtes-vous sûr de vouloir supprimer définitivement cette livraison ?\nCette action est irréversible.')) return;

    const d = deliveries.find(item => item.id === id);
    db.collection(CONSTANTS.COLLECTION).doc(id).delete()
        .then(() => {
            if (d && d.ref) deleteTransactionByRef(d.ref);
            showToast('Livraison supprimée', 'success');
        })
        .catch(error => {
            console.error("Erreur suppression:", error);
            showToast("Erreur lors de la suppression: " + error.message, "error");
        });
}
