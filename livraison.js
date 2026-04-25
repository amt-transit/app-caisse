
import { db } from '../firebase-config.js';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, writeBatch, deleteField, arrayUnion } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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
window.selectedIds = selectedIds;
let currentSort = {
    column: null,
    direction: 'asc' // 'asc' ou 'desc'
};
let itemsPerPage = 100; // Nombre d'éléments par page
let programDetailsSort = { column: null, direction: 'asc' };
let currentProgramView = { date: null, livreur: null };
let isImporting = false;
let transactionsMap = new Map(); // NOUVEAU : Mémoire des dettes de la Caisse

// Rôle Utilisateur
const userRole = sessionStorage.getItem('userRole');
const isViewer = userRole === 'spectateur';

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

    initRealtimeSync();
    updateContainerTitle();
    initActiveContainerInput();
    initAutoAddress();
    initBackToTopButton();
    if (!isViewer) initDuplicateCleaner(); // Initialisation du bouton de nettoyage
    if (!isViewer) initAuditSyncButton(); // Initialisation du bouton Audit
    initScanHistoryModal();

    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.removeAttribute('oninput');
        searchBox.addEventListener('input', debouncedFilterDeliveries);
    }
});

// Synchronisation Temps Réel avec Firestore
function initRealtimeSync() {
    // 1. Migration unique (LocalStorage -> Firebase) si nécessaire
    const localData = localStorage.getItem('deliveries');
    if (localData) {
        const parsed = JSON.parse(localData);
        if (parsed.length > 0) {
            AppModal.confirm(`MIGRATION : ${parsed.length} livraisons trouvées en local. Migrer vers le serveur ?`, "Migration requise").then(confirmed => {
                if (confirmed) {
                    const batch = writeBatch(db);
                    parsed.forEach(item => {
                        const docRef = doc(collection(db, CONSTANTS.COLLECTION));
                        const { id, ...data } = item; 
                        batch.set(docRef, data);
                    });
                    batch.commit().then(() => {
                        localStorage.removeItem('deliveries');
                        showToast("Migration terminée !", "success");
                    });
                }
            });
        }
    }

    // 2. Écouteur sur la collection 'livraisons'
    const qLivraisons = query(collection(db, CONSTANTS.COLLECTION), orderBy('dateAjout', 'desc'));
    onSnapshot(qLivraisons, (snapshot) => {
            deliveries = [];
            snapshot.forEach((doc) => {
                deliveries.push({ id: doc.id, ...doc.data() });
            });
            
            window.deliveries = deliveries;
            
            filterDeliveries();
            updateStats();
            updateAutocomplete();
            updateLocationFilterOptions();
            updateAvailableContainersList();
        }, (error) => {
            console.error("Erreur sync livraisons:", error);
            showToast("Erreur de synchronisation !", "error");
        });

    // --- NOUVEAU : 3. Écouteur sur la Caisse (Transactions) ---
    // On écoute la caisse en permanence pour avoir les vrais montants
    const qTrans = query(collection(db, 'transactions'), where('isDeleted', '==', false));
    onSnapshot(qTrans, (snap) => {
            transactionsMap.clear();
            snap.forEach(doc => {
                const t = doc.data();
                if (t.reference) {
                    // Dans la caisse, la dette est un chiffre négatif (ex: -15000). 
                    // Si c'est 0, c'est payé.
                    let resteAPayer = 0;
                    if (t.reste < 0) {
                        resteAPayer = Math.abs(t.reste); // Transforme -15000 en 15000
                    }
                    // On stocke le montant sous forme de texte pour la livraison
                    transactionsMap.set(t.reference.toUpperCase().trim(), resteAPayer + " CFA");
                }
            });
            
            // NOUVEAU : Synchronisation en arrière-plan (Issue 4) sans boucle infinie dans renderTable
            if (deliveries.length > 0) {
                const batch = writeBatch(db);
                let batchCount = 0;
                deliveries.forEach(d => {
                    if (d.containerStatus === 'EN_COURS' && d.ref) {
                        const realCaisseAmount = transactionsMap.get(d.ref.toUpperCase().trim());
                        if (realCaisseAmount !== undefined && realCaisseAmount !== d.montant) {
                            batch.update(doc(db, CONSTANTS.COLLECTION, d.id), { montant: realCaisseAmount });
                            d.montant = realCaisseAmount; // Maj locale pour éviter décalage
                            batchCount++;
                        }
                    }
                });
                if (batchCount > 0 && batchCount <= 500) {
                    batch.commit().catch(e => console.error("Erreur auto-sync transactions", e));
                }
            }
            
            // Rafraîchir l'affichage instantanément si on est dans l'onglet En Cours
            if (currentTab === 'EN_COURS') filterDeliveries();
        }, (error) => {
            console.error("Erreur sync Transactions:", error);
        });
}

// --- DESCRIPTIONS CONTEXTUELLES (GUIDANCE) ---
const TAB_DESCRIPTIONS = {
    'EN_COURS': "📍 <strong>ABIDJAN (Réception) :</strong> Gestion des colis physiquement arrivés et prêts à être livrés. <span style='color:#d97706;'>⚠️ C'est ici que la dette financière est calculée.</span>",
    'A_VENIR': "🌊 <strong>TRANSIT (Mer) :</strong> Suivi des colis chargés dans les conteneurs. Vérifiez les numéros et notifiez les clients.",
    'PARIS': "🇫🇷 <strong>DÉPART (France) :</strong> Saisie initiale des colis reçus à l'entrepôt de départ. Aucune transaction financière n'est encore créée.",
    'PROGRAMME': "🚚 <strong>DISTRIBUTION :</strong> Organisation des tournées. Assignez des livreurs, imprimez les feuilles de route et validez la remise."
};

// Gestion des onglets
function switchTab(tab) {
    currentTab = tab;
    
    // Mise à jour visuelle des boutons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (tab === 'EN_COURS') document.getElementById('tabEnCours').classList.add('active');
    else if (tab === 'A_VENIR') document.getElementById('tabAVenir').classList.add('active');
    else if (tab === 'PARIS') document.getElementById('tabParis').classList.add('active');
    else if (tab === 'PROGRAMME') document.getElementById('tabProgramme').classList.add('active');

    // --- GESTION DE L'AFFICHAGE DU CONTENU ---
    const tableContainer = document.querySelector('.table-container');
    const toolbar = document.querySelector('.toolbar');
    
    tableContainer.style.display = 'block';
    toolbar.style.display = 'flex';


    // Mise à jour de la description contextuelle
    const descEl = document.getElementById('tabDescription');
    if (descEl) descEl.innerHTML = TAB_DESCRIPTIONS[tab] || '';

    // Gestion des barres d'outils (Afficher uniquement celle de l'onglet actif)
    document.querySelectorAll('.tab-toolbar').forEach(el => el.style.display = 'none');
    const activeToolbar = document.getElementById(`toolbar-${tab}`);
    if (activeToolbar) {
        activeToolbar.style.display = 'flex';
        
        // MASQUAGE SPECTATEUR : Boutons d'ajout et d'import
        if (isViewer) {
            const addBtn = activeToolbar.querySelector('button[onclick="showAddModal()"]');
            const labels = activeToolbar.querySelectorAll('label.btn'); // Boutons import
            
            if (addBtn) addBtn.style.display = 'none';
            if (labels) labels.forEach(l => l.style.display = 'none');
        }
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
    if (currentTab !== 'A_VENIR') {
        const select = document.getElementById('quickContainerSelect');
        if (select) select.style.display = 'none';
        return;
    }

    const containerSelectId = 'quickContainerSelect';
    let select = document.getElementById(containerSelectId);

    if (select) {
        select.style.display = '';
        
        // 1. On force l'attachement de l'événement (Correction du bug de clic)
        select.onchange = (e) => {
            const val = e.target.value;
            const input = document.getElementById('activeContainerInput');
            if(input) input.value = val === 'SANS_CONTENEUR' ? '' : val;
            
            currentContainerName = val ? val.trim() : 'Aucun';
            localStorage.setItem(`container_filter_${currentTab}`, currentContainerName);

            const cb = document.getElementById('filterByContainerCb');
            if (cb && currentTab === 'A_VENIR') {
                cb.checked = !!val;
                localStorage.setItem(`container_filter_${currentTab}_active`, cb.checked);
            }
            
            updateContainerTitle();
            filterDeliveries();
        };

        // 2. Extraire les données
        const relevantDeliveries = deliveries.filter(d => d.containerStatus === currentTab);
        const containers = [...new Set(relevantDeliveries.map(d => d.conteneur ? d.conteneur.trim() : '').filter(c => c))].sort();
        
        // Compter combien de colis sont "Orphelins" (sans conteneur)
        const sansConteneurCount = relevantDeliveries.filter(d => !d.conteneur || d.conteneur.trim() === '').length;

        // 3. Auto-Reset si le conteneur n'existe plus
        if (currentContainerName !== 'Aucun' && currentContainerName !== 'SANS_CONTENEUR' && !containers.includes(currentContainerName)) {
            currentContainerName = 'Aucun';
            localStorage.setItem(`container_filter_${currentTab}`, 'Aucun');
            const cb = document.getElementById('filterByContainerCb');
            if (cb) {
                cb.checked = false;
                localStorage.setItem(`container_filter_${currentTab}_active`, 'false');
            }
        }

        const selectedValue = currentContainerName !== 'Aucun' ? currentContainerName : '';

        // 4. Construction du menu
        let html = '<option value="">-- Tous les colis en mer --</option>';
        if (sansConteneurCount > 0) {
            // NOUVEAU : Option d'alerte pour les colis sans conteneur
            html += `<option value="SANS_CONTENEUR" ${selectedValue === 'SANS_CONTENEUR' ? 'selected' : ''}>⚠️ Sans Conteneur (${sansConteneurCount} colis)</option>`;
        }
        
        containers.forEach(c => {
            const selected = c === selectedValue ? 'selected' : '';
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

// Gestion du menu déroulant Paiements
function togglePaymentDropdown() {
    document.getElementById('paymentDropdownList').classList.toggle('show');
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
                expediteur: cleanString(fixEncoding(expediteur)),
                commune: detectCommune(fixEncoding(lieu)),
                lieuLivraison: cleanString(fixEncoding(lieu)),
                destinataire: cleanString(fixEncoding(destinataire)),
                description: cleanString(fixEncoding(description)),
                status: 'EN_ATTENTE',
                dateAjout: new Date().toISOString()
            });
        }
    }
    
    return deliveries;
}

// Helper pour parser les dates Excel (Numéro de série ou Texte)
function parseImportDate(val) {
    if (!val) return null;
    if (typeof val === 'number' && !isNaN(val)) {
        return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString();
    }
    const strVal = String(val).trim();
    const parts = strVal.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date.toISOString();
    }
    const date = new Date(strVal);
    if (!isNaN(date.getTime())) return date.toISOString();
    return null;
}

// Import Excel
function importExcel(event) {
    console.log("Début importExcel");
    if (isImporting) return;
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        AppModal.error("Erreur CRITIQUE : La bibliothèque Excel n'est pas chargée.\nVérifiez votre connexion internet et rechargez la page.", "Erreur Technique");
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
                            const val = cleanString(row[j]).toUpperCase();
                            if (refRegex.test(val)) {
                                ref = val;
                                refIdx = j;
                                break;
                            }
                        }
                        
                        if (!ref) return null; // Pas de ref sur cette ligne -> on ignore

                        // --- DÉBUT MODIFICATION : DÉTECTION DU FICHIER SCANNEUR ---
                        // Si la ligne vient d'un scanneur (contient ARRIVE A DESTINATION ou la réf a le format _1_6)
                        const isScannerFile = row.some(c => String(c).toUpperCase().includes('ARRIVE A DESTINATION')) || /_\d+_\d+$/.test(ref);

                        if (isScannerFile) {
                            return {
                                id: Date.now() + i,
                                ref: ref, // ex: MD-127-E2_1_6
                                status: 'EN_ATTENTE',
                                dateAjout: new Date().toISOString(),
                                quantite: 1, // Chaque ligne du scan vaut 1 colis
                                // On laisse tout vide pour forcer la récupération depuis "À Venir"
                                expediteur: '', destinataire: '', lieuLivraison: '', description: '', montant: '', numero: '', commune: ''
                            };
                        }
                        // --- FIN MODIFICATION ---

                        // 2. Trouver les autres infos autour de la Ref
                        let montant = '';
                        let expediteur = '';
                        let destinataire = '';
                        let lieu = '';
                        let description = '';
                        let numero = '';

                        // On analyse les autres cellules de la ligne
                        const otherCells = row.map((c, idx) => ({ val: cleanString(c), idx })).filter(c => c.idx !== refIdx && c.val !== '');
                        
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
                            expediteur: cleanString(fixEncoding(expediteur)),
                            commune: detectCommune(cleanString(fixEncoding(lieu || expediteur || destinataire))),
                            lieuLivraison: cleanString(fixEncoding(lieu)),
                            destinataire: cleanString(fixEncoding(destinataire)),
                            description: cleanString(fixEncoding(description)),
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
                        Object.keys(row).forEach(k => r[cleanString(k).toUpperCase()] = row[k]);

                            const dateRaw = r.DATE || r['DATE AJOUT'] || r['DATE ARRIVEE'] || r['DATE DU TRANSFERT'] || '';
                            const parsedDate = parseImportDate(dateRaw) || new Date().toISOString();
                        return {
                            id: Date.now() + i,
                            ref: cleanString(r.REF || r.REFERENCE || r.CODE || r['N° COLIS'] || r['NUMERO COLIS'] || r.TRACKING || r['N°'] || '').toUpperCase(), // Force Majuscule pour correspondance
                            prixOriginal: cleanString(r.PRIX || r.VALEUR || r['PRIX TOTAL'] || r['MONTANT TOTAL'] || ''), // Capture du Prix Total pour calcul
                            montant: cleanString(r.RESTANT || r.MONTANT || r.PRIX || r['RESTANT A PAYER'] || r['RENSTANT A PAYER'] || r['MONTANT A PAYER'] || r.COLONNE3 || ''),
                            expediteur: cleanString(fixEncoding(String(r.EXPEDITEUR || r['EXPÉDITEUR'] || r.EXP || ''))),
                            commune: detectCommune(cleanString(fixEncoding(String(r.LIVRE || r.LIEU || r.COMMUNE || r['LIEU DE LIVRAISON'] || r.ADRESSE || r.ADRESSES || '')))),
                            lieuLivraison: cleanString(fixEncoding(String(r.LIVRE || r.LIEU || r['LIEU DE LIVRAISON'] || r.ADRESSE || r.ADRESSES || ''))),
                            destinataire: cleanString(fixEncoding(String(r.DESTINATAIRE || r.CLIENT || r.DESTINATEUR || r.COLONNE2 || ''))),
                            description: cleanString(fixEncoding(String(r.DESCRIPTION || r.NATURE || r['TYPE COLIS'] || ''))),
                            info: cleanString(fixEncoding(String(r.INFO || r.INFORMATION || r.COMMENTAIRE || ''))),
                            numero: cleanString(r.NUMERO || r.TEL || r.TELEPHONE || r.CONTACT || ''),
                                quantite: parseInt(r.QTE || r.QUANTITE || r.QUANTITÉ || r['NOMBRE COLIS'] || 1), // Récupération Quantité
                            status: 'EN_ATTENTE',
                                dateAjout: parsedDate
                        };
                    }).filter(d => d.ref && d.ref.trim() !== '');
                }
                
                // Enrichissement automatique des adresses (Auto-Address)
                for (let i = 0; i < imported.length; i++) {
                    const item = imported[i];

                    // Feedback visuel tous les 5 items pour ne pas bloquer l'UI et montrer la progression
                    if (i % 50 === 0) { // OPTIMISATION : Mise à jour moins fréquente
                        const pct = Math.round(((i + 1) / imported.length) * 100);
                        if (progressModal) {
                             document.getElementById('importProgressBar').style.width = `${pct}%`;
                             document.getElementById('importProgressText').textContent = `Analyse ligne ${i + 1}/${imported.length} (${pct}%)`;
                        } else if (overlay) {
                             overlay.querySelector('.loading-text').textContent = `Analyse ligne ${i + 1}/${imported.length}...`;
                        }
                        await new Promise(r => setTimeout(r, 0));
                    }

                    // --- DÉBUT MODIFICATION : RECHERCHE DU PARENT (À VENIR / PARIS) ---
                    // On extrait la racine de la référence (ex: MD-127-E2 au lieu de MD-127-E2_1_6)
                    const baseRefMatch = item.ref.match(/^([A-Z]{2}[-_\s.]\d{3}[-_\s.][A-Z0-9]+)(?:_.*)?$/i);
                    const baseRef = baseRefMatch ? baseRefMatch[1] : item.ref;

                    // On cherche cette racine dans notre base de données locale
                    const parentItem = deliveries.find(d => d.ref.toUpperCase() === baseRef.toUpperCase());

                    if (parentItem) {
                        // Si on trouve le colis dans "À Venir", on copie toutes ses informations vers le scan
                        // FIX : On privilégie les données du fichier importé (item) si elles existent, sinon on prend le parent
                        item.expediteur = item.expediteur || parentItem.expediteur;
                        item.destinataire = item.destinataire || parentItem.destinataire;
                        item.lieuLivraison = item.lieuLivraison || parentItem.lieuLivraison;
                        item.commune = item.commune || parentItem.commune;
                        // Pour le montant, on garde la valeur importée (même 0) si elle existe
                        item.montant = (item.montant && item.montant.trim() !== '') ? item.montant : parentItem.montant;
                        item.numero = item.numero || parentItem.numero;
                        // Optionnel : Ajouter le type de carton lu par le scan à la description
                        if (!item.description && parentItem.description) {
                            item.description = parentItem.description;
                        }
                    }
                    // --- FIN MODIFICATION ---

                    if ((!item.lieuLivraison || !item.lieuLivraison.trim()) && item.destinataire) {
                        // OPTIMISATION : Recherche uniquement LOCALE pendant l'import massif
                        const val = item.destinataire.trim().toLowerCase();
                        const localMatch = deliveries.find(d => 
                            d.destinataire && d.destinataire.toLowerCase() === val && d.lieuLivraison
                        );
                        if (localMatch) {
                            item.lieuLivraison = localMatch.lieuLivraison;
                            item.commune = detectCommune(localMatch.lieuLivraison);
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
                    AppModal.alert(msg, "Échec de l'importation");
                }
            } catch (error) {
                console.error(error);
                AppModal.error("Erreur technique lors de l'importation :\n" + error.message, "Erreur Import");
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
        const snapActive = await getDocs(query(collection(db, CONSTANTS.COLLECTION), where('destinataire', '==', val)));
        
        for (const docSnap of snapActive.docs) {
            const d = docSnap.data();
            if (d.lieuLivraison && d.lieuLivraison.trim() !== "") return d.lieuLivraison;
        }
    } catch (e) { console.error("Erreur recherche adresse active", e); }

    // 3. Recherche Archives (Firestore)
    try {
        let snap = await getDocs(query(collection(db, CONSTANTS.ARCHIVE_COLLECTION), where('destinataire', '==', val), limit(1)));
        
        // Essai 2 : Recherche en Majuscules (Si pas trouvé)
        if (snap.empty) {
            snap = await getDocs(query(collection(db, CONSTANTS.ARCHIVE_COLLECTION), where('destinataire', '==', val.toUpperCase()), limit(1)));
        }

        if (!snap.empty) return snap.docs[0].data().lieuLivraison;
    } catch (e) { console.error("Erreur recherche adresse archive", e); }
    return null;
}

// Aperçu modal
function showPreviewModal(data) {
    // Pré-remplir le conteneur avec le conteneur actif de l'onglet courant
    const importConteneurInput = document.getElementById('importConteneur');
    if (importConteneurInput && currentContainerName && currentContainerName !== 'Aucun' && currentContainerName !== 'SANS_CONTENEUR') {
        importConteneurInput.value = currentContainerName;
    }

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
    let containerStatus = document.getElementById('importContainerStatus').value;

    // SÉCURITÉ : Forcer la destination selon l'onglet actif. 
    // Si le menu HTML n'a pas l'option 'PARIS', il force 'EN_COURS' par erreur.
    if (currentTab === 'PARIS') containerStatus = 'PARIS';
    else if (currentTab === 'A_VENIR') containerStatus = 'A_VENIR';
    else if (currentTab === 'EN_COURS') containerStatus = 'EN_COURS';

    // --- NOUVEAU : Pré-traitement pour fusionner les doublons DANS le fichier importé ---
    const uniqueImports = new Map();
        const seenOriginalRefs = new Set(); // Pour éliminer les doublons stricts (ex: double scan)
    const pickBest = (oldV, newV) => {
        const o = String(oldV || '').trim();
        const n = String(newV || '').trim();
        if (!n) return o; // Si nouveau vide, garder ancien
        if (!o) return n; // Si ancien vide, prendre nouveau
        // Si les deux existent, on privilégie le plus long (plus d'infos)
        return n.length >= o.length ? n : o;
    };

    for (const item of pendingImport) {
            let originalRef = item.ref.toUpperCase();
            
            // Élimination des doublons stricts (ex: deux fois AB-031-E6_2_486 scannés par erreur)
            if (seenOriginalRefs.has(originalRef)) {
                continue; // On ignore la ligne si c'est un doublon parfait (même code exact)
            }
            seenOriginalRefs.add(originalRef);

            let ref = originalRef;
        
        // LOGIQUE DE REGROUPEMENT (En Cours) : On nettoie les suffixes _1_512 pour grouper sur la racine
        // Ex: KA-086-D41_1_512 -> KA-086-D41
        if (containerStatus === 'EN_COURS') {
             const match = ref.match(/^([A-Z]{2}[-_\s.]\d{3}[-_\s.][A-Z0-9]+)(?:_.*)?$/);
             if (match) {
                 ref = match[1]; // On garde juste la racine
             }
        }

        if (!ref) continue;

        const scanData = { scanRef: originalRef, date: new Date().toISOString() };

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
            
            if (!existing.scanHistory) existing.scanHistory = [];
            existing.scanHistory.push(scanData);
            
            if (existing.lieuLivraison !== originalLieu) {
                 existing.commune = detectCommune(existing.lieuLivraison);
            }
            
            // On met à jour la ref de l'objet existant (pour être sûr d'avoir la version courte)
            existing.ref = ref;
        } else {
            // Première fois qu'on voit cette référence, on l'ajoute
            uniqueImports.set(ref, { ...item, ref: ref, scanHistory: [scanData] });
        }
    }
    const finalImportList = Array.from(uniqueImports.values());

    // --- NOUVEAU : RAPPROCHEMENT / DÉPOTAGE ---
    let missingExpectedItems = [];
    if (containerStatus === 'EN_COURS' && conteneur) {
        const expectedItems = deliveries.filter(d => d.containerStatus === 'A_VENIR' && (d.conteneur || '').trim().toUpperCase() === conteneur.toUpperCase());
        
        if (expectedItems.length > 0) {
            const scannedRefsSet = new Set(finalImportList.map(item => item.ref.toUpperCase()));
            missingExpectedItems = expectedItems.filter(item => !scannedRefsSet.has(item.ref.toUpperCase()));

            const modal = document.getElementById('rapprochementModal');
            if (modal) {
                document.getElementById('rapConteneur').textContent = conteneur.toUpperCase();
                document.getElementById('rapScannes').textContent = finalImportList.length;
                document.getElementById('rapAttendus').textContent = expectedItems.length;
                document.getElementById('rapConformes').textContent = expectedItems.length - missingExpectedItems.length;
                document.getElementById('rapMissingCount').textContent = missingExpectedItems.length;

                const ul = document.getElementById('rapMissingList');
                if (missingExpectedItems.length > 0) {
                    ul.innerHTML = missingExpectedItems.map(item => `<li>${item.ref} - ${item.destinataire || 'Inconnu'}</li>`).join('');
                } else {
                    ul.innerHTML = "<li style='color:#10b981; list-style-type:none;'>✅ Aucun colis manquant, le dépotage est parfait !</li>";
                }

                modal.classList.add('active');

                const confirmed = await new Promise(resolve => {
                    document.getElementById('rapConfirmBtn').onclick = () => { modal.classList.remove('active'); resolve(true); };
                    document.getElementById('rapCancelBtn').onclick = () => { modal.classList.remove('active'); resolve(false); };
                    document.getElementById('closeRapModal').onclick = () => { modal.classList.remove('active'); resolve(false); };
                });

                if (!confirmed) return; // L'utilisateur a annulé, on arrête l'importation
            }
        }
    }

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
    
    // --- OPTIMISATION ---
    // Pré-charger l'existence des transactions pour éviter 1 requête Firestore par ligne
    const existingTransRefs = new Set();
    if (containerStatus === 'EN_COURS' && finalImportList.length > 0) {
        if (progressModal) document.getElementById('importProgressText').textContent = 'Vérification des transactions existantes...';
        const allRefs = finalImportList.map(item => item.ref);
        const chunks = [];
        for (let i = 0; i < allRefs.length; i += 10) chunks.push(allRefs.slice(i, i + 10));
        
        // Exécuter les requêtes en parallèle (très rapide)
        const transPromises = chunks.map(chunk => getDocs(query(collection(db, 'transactions'), where('reference', 'in', chunk))));
        const transSnapshots = await Promise.all(transPromises);
        transSnapshots.forEach(snap => snap.forEach(doc => existingTransRefs.add(doc.data().reference)));
    }

    for (let i = 0; i < finalImportList.length; i++) {
        const importItem = finalImportList[i];

        // Feedback visuel Préparation (Mise à jour tous les 50 items pour fluidité)
        if (progressModal && i % 50 === 0) {
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
            const docRef = doc(db, CONSTANTS.COLLECTION, existingItem.id);
            
            // --- PROTECTION CONTRE LA RÉGRESSION (Ne pas faire reculer un colis) ---
            // Si le colis est déjà "EN_COURS" (Arrivé), on ne le renvoie pas vers "PARIS" ou "A_VENIR".
            // Si le colis est "A_VENIR", on ne le renvoie pas vers "PARIS".
            let targetStatus = containerStatus;
            const currentStatus = existingItem.containerStatus;

            if (currentStatus === 'EN_COURS' && (containerStatus === 'PARIS' || containerStatus === 'A_VENIR')) {
                targetStatus = currentStatus; // On force le maintien en "EN_COURS"
            } else if (currentStatus === 'A_VENIR' && containerStatus === 'PARIS') {
                targetStatus = currentStatus; // On force le maintien en "A_VENIR"
            }

            const updates = { containerStatus: targetStatus };
            
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
                
                if (importItem.scanHistory && importItem.scanHistory.length > 0) {
                    updates.scanHistory = arrayUnion(...importItem.scanHistory);
                }
                
                if (conteneur) updates.conteneur = conteneur;
                else if (importItem.conteneur) updates.conteneur = importItem.conteneur;

                if (existingItem.containerStatus === 'PARIS') {
                    updates.directFromParis = true; // ALERTE : A sauté l'étape "À Venir" (Client non prévenu)
                } else if (existingItem.containerStatus === 'A_VENIR') {
                    updates.directFromParis = false; // Flux normal
                }
                updates.importedFromTransit = true;
                if (targetStatus !== currentStatus) {
                    updates.dateAjout = new Date().toISOString(); // Ne met à jour la date que si le statut change (préserve la date d'arrivée)
                }
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
                
                // On ne supprime le flag de transit que si le colis n'est PAS "En Cours"
                // (Si on est protégé et qu'on reste En Cours, on garde l'historique et l'icône bateau)
                if (targetStatus !== 'EN_COURS') {
                    updates.importedFromTransit = deleteField();
                }
                if (targetStatus !== currentStatus) {
                    updates.dateAjout = new Date().toISOString(); // Ne met à jour la date que si le statut change
                }
            }
            
            operations.push({ type: 'update', ref: docRef, data: updates });
            updatedCount++;
        } else {
            // CAS 2 : La référence n'existe pas -> On crée un nouveau colis
            const docRef = doc(collection(db, CONSTANTS.COLLECTION));
            // On retire l'ID temporaire (numérique) avant l'envoi
            const { id: _tempId, ...itemData } = importItem;

            // Nettoyage des valeurs undefined (Firestore ne les supporte pas)
            Object.keys(itemData).forEach(key => itemData[key] === undefined && delete itemData[key]);

            operations.push({ type: 'set', ref: docRef, data: { 
                ...itemData, 
                conteneur: conteneur || importItem.conteneur || '', 
                quantite: importItem.quantite || 1, // Stockage de la quantité
                scanHistory: importItem.scanHistory || [], // Ajout du scan history
                containerStatus: containerStatus,
            dateAjout: itemData.dateAjout || new Date().toISOString() // Respecte la date du fichier Excel
            }});
            createdCount++;
        }

        // --- TRANSFERT VERS RÉCEPTION ABIDJAN (TRANSACTIONS) ---
        if (containerStatus === 'EN_COURS') {
            // OPTIMISATION : Utilisation du cache pré-chargé (Instantané)
            const transExists = existingTransRefs.has(importItem.ref);
            
            if (!transExists) {
                // LOGIQUE FINANCIÈRE AVANCÉE (Comme Arrivages)
                
                let restant = 0;
                let totalPrix = 0;

                if (existingItem) {
                    // CAS 1 : Données issues de l'historique (Paris -> A Venir -> En Cours)
                    
                    // LOGIQUE CORRIGÉE : Le "restant" est TOUJOURS la valeur de l'item existant dans la base (A Venir / Paris).
                    // L'import "En Cours" (scanner) est purement logistique et n'a pas d'impact financier direct sur le calcul.
                    const currentMontantStr = existingItem.montant || '0';
                    restant = parseFloat(String(currentMontantStr).replace(/[^\d]/g, '')) || 0;
                    
                    // Le prix total est le prix original (Paris). Si pas de prix original, on suppose que le reste est le prix total.
                    let original = parseFloat((existingItem.prixOriginal || '0').replace(/[^\d]/g, '')) || 0;
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

                const importDateStr = importItem.dateAjout ? importItem.dateAjout.split('T')[0] : new Date().toISOString().split('T')[0];

                // --- AJOUT : Historique Paiement pour Paris ---
                const paymentHistory = [];
                if (mParis > 0) {
                    paymentHistory.push({
                        date: importDateStr,
                        montantParis: mParis,
                        montantAbidjan: 0,
                        modePaiement: 'Espèce',
                        agent: '',
                        saisiPar: sessionStorage.getItem('userName') || 'Import Livraison'
                    });
                }

                const transRef = doc(collection(db, 'transactions'));
                
                operations.push({ type: 'set', ref: transRef, data: {
                    date: importDateStr,
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
                    quantite: importItem.quantite || 1, // IMPORTANT : Pour le calcul magasinage
                    paymentHistory: paymentHistory
                }});
            }
        }
    }

    // --- NOUVEAU : MARQUER LES COLIS MANQUANTS EN INCIDENT ---
    if (missingExpectedItems && missingExpectedItems.length > 0) {
        for (const item of missingExpectedItems) {
            operations.push({
                type: 'update',
                ref: doc(db, CONSTANTS.COLLECTION, item.id),
                data: {
                    status: 'INCIDENT',
                    info: (item.info ? item.info + ' | ' : '') + 'Manquant au dépotage (' + new Date().toLocaleDateString('fr-FR') + ')'
                }
            });
            updatedCount++;
        }
    }

    // EXÉCUTION DES BATCHS PAR PAQUETS DE 400 (Pour éviter la limite de 500)
    const BATCH_SIZE = 400;
    let batch = writeBatch(db);
    let opCount = 0;
    let batchPromises = [];

    for (const op of operations) {
        if (op.type === 'set') batch.set(op.ref, op.data);
        else if (op.type === 'update') batch.update(op.ref, op.data);
        else if (op.type === 'delete') batch.delete(op.ref);

        opCount++;
        if (opCount >= BATCH_SIZE) {
            batchPromises.push(batch.commit());
            batch = writeBatch(db);
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
                <div style="display:flex; align-items:center; color:#1e40af; background:#dbeafe; padding:10px; border-radius:8px; ${ignoredArchivedCount > 0 ? 'margin-bottom:15px;' : ''}">
                    <span style="font-size:1.5em; margin-right:15px;">🔄</span>
                    <div><strong>${updatedCount}</strong> Colis mis à jour (Infos complétées)</div>
                </div>
                ${ignoredArchivedCount > 0 ? `
                <div style="display:flex; align-items:center; color:#92400e; background:#ffedd5; padding:10px; border-radius:8px;">
                    <span style="font-size:1.5em; margin-right:15px;">🗄️</span>
                    <div><strong>${ignoredArchivedCount}</strong> Colis ignorés (Déjà archivés)</div>
                </div>` : ''}
            `;
            resultModal.classList.add('active');
        } else {
            AppModal.success(`Rapport d'importation :\n\n✅ ${createdCount} Nouveaux colis créés\n🔄 ${updatedCount} Colis mis à jour${ignoredArchivedCount > 0 ? `\n🗄️ ${ignoredArchivedCount} Colis ignorés (Déjà archivés)` : ''}`, "Succès");
        }

        pendingImport = []; // Nettoyage
    }).catch(err => {
        if (progressModal) progressModal.classList.remove('active');
        console.error("Erreur Import:", err);
        if (err.code === 'resource-exhausted') {
            AppModal.error("⚠️ ALERTE QUOTA FIREBASE ATTEINT !\n\nVous avez dépassé la limite d'écriture quotidienne autorisée par Firebase (Plan Gratuit : 20 000 écritures/jour).\n\nL'enregistrement a été bloqué par le serveur. Veuillez réessayer demain (après minuit, heure du Pacifique) ou passer au plan Blaze.", "Quota Dépassé");
        } else {
            showToast("Erreur lors de l'enregistrement : " + err.message, 'error');
        }
    });
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
        
        // --- MESSAGES VIDES CONTEXTUELS (Guidance) ---
        let emptyTitle = "Aucune livraison";
        let emptySub = "Importez un PDF/Excel ou ajoutez manuellement";
        
        if (currentTab === 'PARIS') {
            emptyTitle = "Entrepôt Paris vide";
            emptySub = "Commencez par saisir les colis reçus ou importez le manifeste Excel.";
        } else if (currentTab === 'A_VENIR') {
            emptyTitle = "Rien en transit";
            emptySub = "Les colis assignés à un conteneur depuis l'onglet 'Paris' apparaîtront ici.";
        } else if (currentTab === 'EN_COURS') {
            emptyTitle = "Aucun colis à Abidjan";
            emptySub = "Importez le fichier du scanner ou validez l'arrivée d'un conteneur.";
        } else if (currentTab === 'PROGRAMME') {
            emptyTitle = "Aucun programme";
            emptySub = "Allez dans 'En Cours', sélectionnez des colis et cliquez sur 'Programmer'.";
        }

        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <h3>${emptyTitle}</h3>
                    <p>${emptySub}</p>
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
        // --- NOUVEAU : SYNCHRONISATION ET SÉCURITÉ DU MONTANT ---
        // Si le colis est à Abidjan (En Cours), on VÉRIFIE la Caisse
        if (d.containerStatus === 'EN_COURS' && d.ref) {
            const realCaisseAmount = transactionsMap.get(d.ref.toUpperCase().trim());
            
            // Si la Caisse a un montant différent de celui du colis (ex: le client vient de payer)
            if (realCaisseAmount !== undefined && realCaisseAmount !== d.montant) {
                // 1. On corrige silencieusement la base de données Livraison en arrière-plan
                updateDoc(doc(db, CONSTANTS.COLLECTION, d.id), { montant: realCaisseAmount });
                // 2. On corrige l'affichage immédiatement
                d.montant = realCaisseAmount;
            }
        }
        const rowClass = d.status === 'LIVRE' ? 'delivered' : '';
        
        // --- NOUVEAU : BADGE ARRIVAGE PARTIEL ---
        let partielBadge = '';
        if (d.arrivagePartiel && d.quantiteAttendue) {
            partielBadge = `<div style="margin-top:6px;"><span style="background-color:#ef4444; color:white; padding:2px 4px; border-radius:4px; font-size:10px; font-weight:bold; white-space:nowrap;" title="Quantité attendue au départ : ${d.quantiteAttendue}">⚠️ Partiel (${d.quantite}/${d.quantiteAttendue})</span></div>`;
        }

        let statusClass = 'status-attente';
        let statusText = '⏳ Attente';

        if (d.status === 'LIVRE') {
            statusClass = 'status-livre';
            statusText = '✅ Livré';
        } else if (d.status === 'LIVRAISON_PARTIELLE' || d.status === 'PARTIEL') {
            statusClass = 'status-attente'; // On utilise le style jaune/orange existant
            statusText = `🌗 Livré : ${d.quantiteLivree || 0} / Reste : ${d.quantiteRestante !== undefined ? d.quantiteRestante : (d.quantite || 1)}`;
        } else if (d.status === 'EN_COURS') {
            statusClass = 'status-en-cours';
            statusText = '🚚 En Cours';
        } else if (d.status === 'INCIDENT') {
            statusClass = 'status-incident';
            statusText = '⚠️ Incident';
        } else if (d.status === 'RETOUR') {
            statusClass = 'status-retour';
            statusText = '↩️ Retour';
        } else if (d.status === 'ABANDONNE') {
            statusClass = 'status-abandonne';
            statusText = '⚫ Abandonné';
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
        if (currentTab === 'A_VENIR' && !isViewer) {
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

        const displayDestinataire = d.destinataire || '';
        const displayPhone = phoneCandidate || '';

        let waBtn = '';
        if (phoneCandidate) {
            // Nettoyage final pour l'API WhatsApp (chiffres uniquement)
            let phone = phoneCandidate.replace(/[^\d]/g, '').replace(/^00/, '');
            
            if (phone.length === 10) phone = '225' + phone; // Ajout indicatif CI par défaut
            
            const msg = `Bonjour, votre colis ${d.ref} (${d.conteneur || ''}) est disponible pour la livraison.`;
            waBtn = `<a href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}" target="_blank" class="btn btn-success btn-small" style="background-color:#25D366; border:none; padding:4px 6px; margin-right:4px;" title="Contacter sur WhatsApp">📱</a>`;
        }

        // --- AMÉLIORATION 7 : Notification spéciale pour "À Venir" ---
        if (currentTab === 'A_VENIR' && !isViewer && phoneCandidate) {
            let phone = phoneCandidate.replace(/[^\d]/g, '');
            if (phone.length === 10 && phone.startsWith('0')) phone = '225' + phone.substring(1);
            else if (phone.length === 10) phone = '225' + phone;
            
            const msgNotifier = encodeURIComponent(
                `Bonjour ${displayDestinataire || 'Client'},\n\n` +
                `🚢 Votre colis Réf: *${d.ref}* (Conteneur ${d.conteneur || 'en transit'}) ` +
                `est en route vers Abidjan.\n\n` +
                `Merci de confirmer votre lieu de livraison :\n` +
                `${d.lieuLivraison || '(à confirmer)'}\n\n` +
                `— AMT TRANS'IT`
            );
            waBtn += `<a href="https://wa.me/${phone}?text=${msgNotifier}" target="_blank" class="btn btn-small" style="background:#10b981; color:white; padding:4px 6px; margin-left:4px; text-decoration:none;" title="Notifier le client de l'arrivée imminente">💬 Notifier</a>`;
        }

        let actionButtons = waBtn;

        // Boutons BL et Livré uniquement pour EN_COURS (Masqués pour PARIS et A_VENIR)
        if (currentTab !== 'PARIS' && currentTab !== 'A_VENIR' && !isViewer) {
            actionButtons += `<button class="btn btn-small" style="background-color:#64748b; padding:4px 6px;" onclick="printDeliverySlip('${d.id}')" title="Imprimer Bon de Livraison">📄</button>`;
            if (d.status !== 'LIVRE' && d.status !== 'ABANDONNE') {
                actionButtons += `<button class="btn btn-success btn-small" onclick="markAsDelivered('${d.id}')" title="Marquer comme livré">✅</button>`;
                actionButtons += `<button class="btn btn-small" style="background-color:#1e293b; color:white; padding:4px 6px; margin-left:4px;" onclick="openAbandonModal('${d.id}')" title="Déclarer comme Abandonné">⚫</button>`;
            } else if (d.status === 'LIVRE') {
                actionButtons += `<button class="btn btn-warning btn-small" onclick="markAsPending('${d.id}')" title="Marquer en attente">⏳</button>`;
            } else if (d.status === 'ABANDONNE') {
                // Si c'est déjà abandonné, on peut le remettre en attente ou re-télécharger le PDF
                actionButtons += `<button class="btn btn-warning btn-small" onclick="markAsPending('${d.id}')" title="Annuler l'abandon (Repasser en attente)">⏳</button>`;
                actionButtons += `<button class="btn btn-small" style="background-color:#1e293b; color:white; padding:4px 6px; margin-left:4px;" onclick="generateAbandonmentPDFFromId('${d.id}')" title="Re-télécharger l'Acte d'Abandon">📄</button>`;
            }
        }
        if (!isViewer) {
            actionButtons += `<button class="btn btn-danger btn-small" onclick="deleteDelivery('${d.id}')" title="Supprimer">🗑️</button>`;
        }

        // Gestion Couleur Montant (Vert = Payé, Orange = Reste)
        const montantVal = parseFloat((d.montant || '0').replace(/[^\d]/g, '')) || 0;
        let montantStyle = "width: 100%;";
        let displayMontant = (d.montant || '').replace(/"/g, '&quot;');
        
        if (montantVal === 0) {
            montantStyle += " background-color: #dcfce7; color: #166534; font-weight: bold;"; // Vert (Payé)
            if (currentTab === 'EN_COURS') {
                montantStyle += " border: 2px solid #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); text-align: center;";
                displayMontant = "✅ SOLDÉ"; // Remplace le '0 CFA' par une alerte sécurisée visuelle
            }
        } else {
            montantStyle += " background-color: #ffedd5; color: #9a3412; font-weight: bold;"; // Orange (Dette)
        }
        
        // --- NOUVEAU : ALERTE FRAIS MAGASINAGE ---
        let magasinageBadge = '';
        if (d.containerStatus === 'EN_COURS' && d.status !== 'LIVRE' && d.status !== 'ABANDONNE' && d.dateAjout) {
            const diffTime = new Date() - new Date(d.dateAjout);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 7) {
                const qte = d.quantiteRestante !== undefined ? parseInt(d.quantiteRestante) : (parseInt(d.quantite) || 1);
                let fee = 0;
                let badgeColor = '';
                let borderColor = '';
                let bgMontant = '';
                let textMontant = '';

                if (diffDays <= 14) {
                    fee = 10000 * qte;
                    badgeColor = '#f97316'; // Orange
                    borderColor = '#f97316';
                    bgMontant = '#ffedd5';
                    textMontant = '#9a3412';
                } else {
                    const extraDays = diffDays - 14;
                    fee = (10000 + (extraDays * 1000)) * qte;
                    badgeColor = '#dc2626'; // Rouge foncé
                    borderColor = '#dc2626';
                    bgMontant = '#fee2e2';
                    textMontant = '#991b1b';
                }
                const formattedFee = new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(fee);
                magasinageBadge = `<div style="margin-top:6px; text-align:center;"><span style="background-color:${badgeColor}; color:white; padding:3px 5px; border-radius:4px; font-size:10px; font-weight:bold; white-space:nowrap; box-shadow: 0 0 6px ${badgeColor};" title="En entrepôt depuis ${diffDays} jours">⚠️ + ${formattedFee} MAGASINAGE</span></div>`;
                // Force l'alerte sur la couleur du montant même si le solde est 0
                montantStyle = `width: 100%; background-color: ${bgMontant}; color: ${textMontant}; font-weight: bold; border: 2px solid ${borderColor};`;
            }
        }

        // FONCTIONS D'AFFICHAGE (Input vs Texte pour Spectateur)
        const renderInput = (val, type, onchange, style = "") => {
            if (isViewer) return `<span style="${style}; display:block; padding:5px;">${val}</span>`;
            return `<input type="${type}" class="editable-cell" value="${val}" onchange="${onchange}" style="${style}">`;
        };
        // --- NOUVEAU : VERROUILLAGE SÉCURITÉ ---
        // Si le colis est dans "En Cours", le champ devient "readonly" (Lecture seule).
        // Le livreur ne peut pas modifier le montant avec son clavier !
        const readonlyAttr = currentTab === 'EN_COURS' ? 'readonly title="Montant sécurisé. Modifiable uniquement à la Caisse."' : '';

        if (currentTab === 'PARIS') {
            return `
                <tr class="${rowClass}">
                    <td class="col-checkbox">${!isViewer ? `<input type="checkbox" onchange="toggleSelection('${d.id}')" ${selectedIds.has(d.id) ? 'checked' : ''}>` : ''}</td>
                    <td>${d.dateAjout ? new Date(d.dateAjout).toLocaleDateString('fr-FR') : '-'}</td>
                    <td>${d.conteneur || '-'}</td>
                    <td class="ref"><a href="#" onclick="event.preventDefault(); showScanHistory('${d.id}');" style="color: #2563eb; text-decoration: underline; font-weight: bold;">${d.ref}</a></td>
                    <td style="text-align:center;">${renderInput(d.quantite || 1, "number", `updateDeliveryQuantity('${d.id}', this.value)`, "width: 50px; text-align:center; font-weight:bold;")}</td>
                    <td class="montant">${renderInput(displayMontant, "text", `updateDeliveryAmount('${d.id}', this.value)`, montantStyle)}</td>
                    <td>${d.expediteur}</td>
                    <td>${renderInput((d.lieuLivraison || '').replace(/"/g, '&quot;'), "text", `updateDeliveryLocation('${d.id}', this.value)`, "")}</td>
                    <td>${renderInput(displayDestinataire.replace(/"/g, '&quot;'), "text", `updateDeliveryRecipient('${d.id}', this.value)`, "")}</td>
                    <td>${renderInput(displayPhone, "text", `updateDeliveryPhone('${d.id}', this.value)`, "font-weight:bold; color:#0d47a1; width:100%;")}</td>
                    <td>${d.description || '-'}</td>
                    <td><div class="actions">${actionButtons}</div></td>
                </tr>
            `;
        }

        return `
            <tr class="${rowClass}">
                <td class="col-checkbox">${!isViewer ? `<input type="checkbox" onchange="toggleSelection('${d.id}')" ${selectedIds.has(d.id) ? 'checked' : ''}>` : ''}</td>
                <td>${d.conteneur || '-'}</td>
                <td class="ref">${transitIndicator}<a href="#" onclick="event.preventDefault(); showScanHistory('${d.id}');" style="color: #2563eb; text-decoration: underline; font-weight: bold;">${d.ref}</a></td>
                <td style="text-align:center;">
                    ${renderInput(d.quantite || 1, "number", `updateDeliveryQuantity('${d.id}', this.value)`, "width: 50px; text-align:center; font-weight:bold;")}
                    ${partielBadge}
                    ${d.historiquePartiel && d.historiquePartiel.length > 0 ? 
                        `<span style="cursor:help; font-size:1.2em; margin-left:5px;" title="Historique partiel:\n${d.historiquePartiel.map(h => `- ${new Date(h.date).toLocaleDateString()} : ${h.quantiteLivree} livré(s) par ${h.livreur}`).join('\n')}">📦</span>` 
                    : ''}
                </td>
                <td class="montant">
                    ${renderInput(displayMontant, "text", `updateDeliveryAmount('${d.id}', this.value)`, montantStyle)}
                    ${magasinageBadge}
                </td>
                <td>${d.expediteur}</td>
                <td>${renderInput((d.lieuLivraison || '').replace(/"/g, '&quot;'), "text", `updateDeliveryLocation('${d.id}', this.value)`, "")}</td>
                <td>${renderInput(displayDestinataire.replace(/"/g, '&quot;'), "text", `updateDeliveryRecipient('${d.id}', this.value)`, "")}</td>
                <td>${renderInput(displayPhone, "text", `updateDeliveryPhone('${d.id}', this.value)`, "font-weight:bold; color:#0d47a1; width:100%;")}</td>
                <td>${d.description || '-'}</td>
                <td>${renderInput((d.info || '').replace(/"/g, '&quot;'), "text", `updateDeliveryInfo('${d.id}', this.value)`, "")}</td>
                ${notifiedCell}
                <td>
                    <strong>${d.livreur || '-'}</strong><br>
            <small>${((d.status === 'LIVRE' || d.status === 'PARTIEL' || d.status === 'LIVRAISON_PARTIELLE') && d.dateLivraison) ? new Date(d.dateLivraison).toLocaleDateString('fr-FR') : (d.dateProgramme || '')}</small>
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
        items.sort((a, b) => {
            const oA = a.orderInRoute !== undefined ? a.orderInRoute : 9999;
            const oB = b.orderInRoute !== undefined ? b.orderInRoute : 9999;
            return oA - oB;
        });
    }
    
    document.getElementById('detailLivreur').textContent = livreur;
    document.getElementById('detailDate').textContent = date;
    
    // Configuration du bouton export PDF
    document.getElementById('btnExportPdf').onclick = function() { exportRoadmapPDF(date, livreur); };
    document.getElementById('btnOpenMap').onclick = function() { openBingMapsRoute(date, livreur); };
    
    // --- NOUVEAU : Configuration du bouton export WhatsApp ---
    let btnWhatsApp = document.getElementById('btnExportWhatsApp');
    if (!btnWhatsApp) {
        // Injection automatique du bouton s'il n'est pas dans le HTML
        const btnPdf = document.getElementById('btnExportPdf');
        if (btnPdf && btnPdf.parentNode) {
            btnWhatsApp = document.createElement('button');
            btnWhatsApp.id = 'btnExportWhatsApp';
            btnWhatsApp.className = 'btn btn-success';
            btnWhatsApp.innerHTML = '📱 WhatsApp';
            btnWhatsApp.style.marginLeft = '10px';
            btnPdf.parentNode.insertBefore(btnWhatsApp, btnPdf.nextSibling);
        }
    }
    if (btnWhatsApp) {
        btnWhatsApp.onclick = function() { exportRoadmapWhatsApp(date, livreur); };
    }

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
        } else if (d.status === 'LIVRAISON_PARTIELLE' || d.status === 'PARTIEL') {
            statusClass = 'status-attente';
            statusText = `PARTIEL (${d.quantiteLivree || 0}/${d.quantite || 1})`;
                } else if (d.status === 'EN_COURS') {
                    statusClass = 'status-en-cours';
                    statusText = 'EN COURS';
                }
                

                return `
                <tr class="${d.status === 'LIVRE' ? 'delivered' : ''}" data-id="${d.id}">
                    <td style="display:flex; align-items:center; gap:5px;">
                        <span class="drag-handle" style="cursor:grab; color:#94a3b8; font-size:18px; margin-right:2px;" title="Glisser pour réorganiser">☰</span>
                        <input type="number" class="editable-cell" style="width: 45px; text-align: center; font-weight:bold; margin:0;" value="${d.orderInRoute !== undefined ? d.orderInRoute : ''}" placeholder="${index + 1}" onchange="updateDeliveryOrder('${d.id}', this.value, '${date}', '${livreur}')">
                    </td>
                    <td class="ref">${d.ref}</td>
                    <td class="montant">${d.montant}</td>
                    <td>${d.expediteur}</td>
                    <td style="display: flex; align-items: center; gap: 5px;">
                        <input type="text" class="editable-cell" value="${(d.lieuLivraison || '').replace(/"/g, '&quot;')}" list="sharedLocationsList" onchange="updateDeliveryLocation('${d.id}', this.value)">
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((d.lieuLivraison || '') + ' ' + d.commune + ' Abidjan')}" target="_blank" title="Voir sur la carte" style="text-decoration: none; font-size: 1.2em;">
                            📍
                        </a>
                        <button class="btn-small" onclick="captureGPSLocation('${d.id}')" title="📍 Je suis ici (Enregistrer ma position GPS)" style="padding: 2px 5px; background: #e0f2fe; border: 1px solid #bae6fd; cursor: pointer;">
                            🎯
                        </button>
                    </td>
                    <td><input type="text" class="editable-cell" value="${(d.destinataire || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryRecipient('${d.id}', this.value)"></td>
                    <td>${d.description || ''}</td>
                    <td><input type="text" class="editable-cell" value="${(d.info || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryInfo('${d.id}', this.value)"></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="actions">
                        ${d.status !== 'LIVRE' ? 
                            `<button class="btn btn-success btn-small" onclick="markAsDelivered('${d.id}'); viewProgramDetails('${date}', '${livreur}')">✅</button>` : 
                            `<button class="btn btn-warning btn-small" onclick="markAsPending('${d.id}'); viewProgramDetails('${date}', '${livreur}')">⏳</button>`
                        }
                        <button class="btn btn-danger btn-small" onclick="removeFromProgram('${d.id}'); viewProgramDetails('${date}', '${livreur}')" title="Retirer du programme">❌</button>
                        </div>
                    </td>
                </tr>
            `}).join('')}
        </tbody>
    `;
    
    document.getElementById('programDetailsModal').classList.add('active');

    // Initialisation de SortableJS pour le Drag & Drop
    const tbody = document.querySelector('#programDetailsTable tbody');
    if (tbody && typeof Sortable !== 'undefined') {
        new Sortable(tbody, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: function (evt) {
                const rows = tbody.querySelectorAll('tr');
                const batch = writeBatch(db);
                let hasChanges = false;
                rows.forEach((row, index) => {
                    const id = row.dataset.id;
                    if (id) {
                        const item = deliveries.find(d => d.id === id);
                        if (item && item.orderInRoute !== index) {
                            item.orderInRoute = index;
                            batch.update(doc(db, CONSTANTS.COLLECTION, id), { orderInRoute: index });
                            hasChanges = true;
                            const input = row.querySelector('input[type="number"]');
                            if(input) input.value = index;
                        }
                    }
                });
                if (hasChanges) batch.commit().then(() => showToast('Ordre de tournée mis à jour !', 'success'));
            }
        });
    }
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

// --- NOUVEAU : Fonction d'export WhatsApp pour la feuille de route ---
function exportRoadmapWhatsApp(date, livreur) {
    // Récupérer les items dans l'ordre actuel
    let items = deliveries.filter(d => d.dateProgramme === date && d.livreur === livreur);
    items.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));

    if (items.length === 0) {
        showToast('Aucun colis à envoyer', 'error');
        return;
    }

    let msg = `*🚚 FEUILLE DE ROUTE - ${livreur}*\n`;
    msg += `📅 Date : ${date}\n`;
    msg += `📦 Total Colis : ${items.length}\n\n`;

    items.forEach((d, index) => {
        const num = d.numero || 'Non renseigné';
        const montant = d.montant || '0 CFA';
        const queryMap = encodeURIComponent(`${d.lieuLivraison || ''} ${d.commune || ''} Abidjan`.trim());
        
        msg += `*${index + 1}. Réf : ${d.ref}*\n`;
        msg += `👤 Client : ${d.destinataire || 'Inconnu'}\n`;
        msg += `📞 Tél : ${num}\n`;
        msg += `💰 À encaisser : ${montant}\n`;
        msg += `📍 GPS : https://www.google.com/maps/search/?api=1&query=${queryMap}\n\n`;
    });

    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
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

// --- NOUVELLES FONCTIONS : ORDRE & GPS ---

window.updateDeliveryOrder = function(id, val, date, livreur) {
    const order = parseInt(val);
    if (!isNaN(order)) {
        updateDoc(doc(db, CONSTANTS.COLLECTION, id), { orderInRoute: order })
            .then(() => {
                // Mise à jour locale immédiate pour fluidité
                const item = deliveries.find(d => d.id === id);
                if(item) item.orderInRoute = order;
                // Rafraîchir la vue pour appliquer le tri
                viewProgramDetails(date, livreur);
            });
    }
};

window.captureGPSLocation = function(id) {
    if (!navigator.geolocation) {
        showToast("Géolocalisation non supportée par ce navigateur.", "error");
        return;
    }
    
    const btn = document.activeElement; // Le bouton cliqué
    if(btn) { btn.disabled = true; btn.textContent = "⏳"; }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);
            let gpsCoords = `${lat}, ${lng}`;
            
            // --- CONVERSION INTELLIGENTE EN ADRESSE (Reverse Geocoding) ---
            try {
                // Appel à l'API OpenStreetMap (Gratuit, pas de clé requise)
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
                    headers: { 'Accept-Language': 'fr' } // On demande les résultats en français
                });
                const data = await response.json();
                
                if (data && data.address) {
                    const addr = data.address;
                    const parts = [];
                    
                    // Construction de l'adresse du plus précis au plus général
                    if (addr.road) parts.push(addr.road);
                    else if (addr.public_building) parts.push(addr.public_building);
                    
                    if (addr.suburb) parts.push(addr.suburb); // Quartier
                    else if (addr.neighbourhood) parts.push(addr.neighbourhood);
                    
                    if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);

                    if (parts.length > 0) {
                        // Format hybride : Adresse Lisible + [Coordonnées] pour la précision GPS
                        gpsCoords = `${parts.join(', ')} [${lat}, ${lng}]`;
                    }
                }
            } catch (e) {
                console.warn("Impossible de convertir les coordonnées en adresse :", e);
                // En cas d'erreur (pas d'internet), on garde les coordonnées brutes par défaut
            }
            
            // Mise à jour DB
            updateDeliveryLocation(id, gpsCoords);
            
            // Mise à jour visuelle du champ input
            if(btn) {
                const row = btn.closest('tr');
                if(row) {
                    const input = row.querySelector('input[list="sharedLocationsList"]');
                    if(input) input.value = gpsCoords;
                }
                btn.disabled = false; btn.textContent = "🎯";
            }
            showToast("📍 Position GPS enregistrée !", "success");
        },
        (error) => {
            console.error(error);
            showToast("Erreur GPS : " + error.message, "error");
            if(btn) { btn.disabled = false; btn.textContent = "🎯"; }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
};

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

    saveDeliveries([itemA, itemB]);
    viewProgramDetails(date, livreur);
}

async function removeFromProgram(id) {
    if (await AppModal.confirm('Retirer ce colis du programme ? Il repassera "En attente".', "Retirer du programme", true)) {
        updateDoc(doc(db, CONSTANTS.COLLECTION, id), {
            status: 'EN_ATTENTE',
            livreur: deleteField(),
            dateProgramme: deleteField(),
            dateLivraison: deleteField(),
            orderInRoute: deleteField()
        }).then(() => {
            showToast('Colis retiré du programme', 'success');
        });
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

// --- AIDE ---
function openHelpModal() {
    document.getElementById('helpModal').classList.add('active');
}
// (La fermeture est gérée par le onclick dans le HTML ou générique)

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

    const batch = writeBatch(db);
    selectedIds.forEach(id => {
        batch.update(doc(db, CONSTANTS.COLLECTION, id), {
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

async function confirmAssignContainer() {
    const newConteneur = document.getElementById('assignConteneurInput').value;
    const newStatus = document.getElementById('assignContainerStatus').value;

    const becomingEnCours = [];
    if (newStatus === 'EN_COURS') {
        selectedIds.forEach(id => {
            const item = deliveries.find(d => d.id === id);
            if (item && item.containerStatus !== 'EN_COURS') becomingEnCours.push(item);
        });
    }

    const batch = writeBatch(db);
    selectedIds.forEach(id => {
        const item = deliveries.find(d => d.id === id);
        const updates = { conteneur: newConteneur };
        if (newStatus) {
            updates.containerStatus = newStatus;
            if (item && item.containerStatus !== newStatus) {
                updates.dateAjout = new Date().toISOString(); // Préserve la date d'arrivée si le statut ne change pas
            }
        }
        batch.update(doc(db, CONSTANTS.COLLECTION, id), updates);
    });

    // Création des transactions si on assigne manuellement vers EN_COURS
    for (const item of becomingEnCours) {
        const check = await getDocs(query(collection(db, 'transactions'), where('reference', '==', item.ref), limit(1)));
        if (check.empty) {
            const price = parseFloat((item.prixOriginal || item.montant || '0').replace(/[^\d]/g, '')) || 0;
            let restant = parseFloat((item.montant || '0').replace(/[^\d]/g, '')) || 0;
            let mParis = price > restant ? price - restant : 0;
            if (price === 0 && restant > 0) { mParis = 0; }
            
            const transRef = doc(collection(db, 'transactions'));
            batch.set(transRef, {
                date: new Date().toISOString().split('T')[0],
                reference: item.ref,
                nom: item.destinataire || item.expediteur || 'Client',
                conteneur: newConteneur || item.conteneur || '',
                prix: price > 0 ? price : restant,
                montantParis: mParis,
                montantAbidjan: 0,
                reste: -restant,
                isDeleted: false,
                description: item.description || '',
                adresseDestinataire: item.lieuLivraison || '',
                nomDestinataire: item.destinataire || '',
                numero: item.numero || '',
                saisiPar: sessionStorage.getItem('userName') || 'Attribution Manuelle',
                quantite: item.quantite || 1,
                paymentHistory: mParis > 0 ? [{
                    date: new Date().toISOString().split('T')[0],
                    montantParis: mParis,
                    montantAbidjan: 0,
                    modePaiement: 'Espèce',
                    agent: '',
                    saisiPar: sessionStorage.getItem('userName') || 'Attribution Manuelle'
                }] : []
            });
        }
    }

    await batch.commit().then(() => {
        closeAssignContainerModal();
        selectedIds.clear();
        showToast('Attribution terminée !', 'success');
    }).catch(e => showToast('Erreur: ' + e.message, 'error'));
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
    getDocs(query(collection(db, 'transactions'), where('reference', '==', ref)))
        .then(snapshot => {
            const batch = writeBatch(db);
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
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
        const updates = { status: newStatus };
        if (newStatus === 'EN_ATTENTE') {
            updates.livreur = deleteField();
            updates.dateProgramme = deleteField();
            updates.dateLivraison = deleteField();
            updates.orderInRoute = deleteField();
        }
        batch.update(doc(db, CONSTANTS.COLLECTION, id), updates);
    });
    batch.commit().then(() => {
        closeBulkStatusModal();
        selectedIds.clear();
        showToast('Statuts mis à jour !', 'success');
    });
}

// --- FONCTION DE SYNCHRONISATION FORCÉE (Réparation) ---
async function forceSyncTransactions() {
    if (!await AppModal.confirm("Voulez-vous forcer la synchronisation des transactions ?\n\nCela va copier les Noms, Adresses, Numéros ET MONTANTS corrects de l'onglet 'En Cours' vers la Caisse (Saisie) pour corriger les erreurs.", "Synchronisation", true)) return;

    const loadingToast = document.createElement('div');
    loadingToast.className = 'toast';
    loadingToast.textContent = "Synchronisation en cours...";
    loadingToast.style.background = "#3b82f6";
    document.body.appendChild(loadingToast);

    try {
        const enCoursItems = deliveries.filter(d => d.containerStatus === 'EN_COURS' && d.ref);
        let updatedCount = 0;

        const chunks = [];
        for (let i = 0; i < enCoursItems.length; i += 10) {
            chunks.push(enCoursItems.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const refs = chunk.map(item => item.ref);
            if (refs.length === 0) continue;
            const q = await getDocs(query(collection(db, 'transactions'), where('reference', 'in', refs)));
            
            if (!q.empty) {
                const batch = writeBatch(db);
                q.forEach(docSnap => {
                    const t = docSnap.data();
                    const item = chunk.find(c => c.ref === t.reference);
                    if (!item) return;

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
                        batch.update(docSnap.ref, updates);
                        updatedCount++;
                    }
                });
                await batch.commit();
            }
        }
        loadingToast.remove();
    AppModal.success(`✅ Synchronisation terminée !\n${updatedCount} fiches corrigées dans la Caisse.`);
} catch (e) { console.error(e); loadingToast.remove(); AppModal.error("Erreur : " + e.message); }
}

// --- GESTION DES ARCHIVES ---

async function archiveCompletedDeliveries() {
    const completed = deliveries.filter(d => d.status === 'LIVRE');
    
    if (completed.length === 0) {
        showToast('Aucun colis livré à archiver', 'error');
        return;
    }

    if (await AppModal.confirm(`Voulez-vous archiver ${completed.length} colis livrés ?\nIls seront retirés de la liste principale mais resteront consultables dans les archives.`, "Archivage")) {
        const now = new Date().toISOString();
        
        const chunks = [];
        for (let i = 0; i < completed.length; i += 250) {
            chunks.push(completed.slice(i, i + 250));
        }
        
        try {
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(d => {
                    const archiveRef = doc(db, CONSTANTS.ARCHIVE_COLLECTION, d.id);
                    batch.set(archiveRef, { ...d, dateArchivage: now });
                    const activeRef = doc(db, CONSTANTS.COLLECTION, d.id);
                    batch.delete(activeRef);
                });
                await batch.commit();
            }
            showToast('Archivage terminé !', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erreur lors de l\'archivage', 'error');
        }
    }
}

function openArchivesModal() {
    document.getElementById('archivesModal').classList.add('active');
    document.getElementById('archivesBody').innerHTML = '<tr><td colspan="7">Chargement...</td></tr>';
    
    getDocs(query(collection(db, CONSTANTS.ARCHIVE_COLLECTION), orderBy('dateArchivage', 'desc')))
        .then(snapshot => {
            archivedDeliveries = [];
            snapshot.forEach(docSnap => archivedDeliveries.push({ id: docSnap.id, ...docSnap.data() }));
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

async function restoreFromArchive(id) {
    if (await AppModal.confirm('Êtes-vous sûr de vouloir restaurer ce colis vers la liste principale ?', "Restauration")) {
        getDoc(doc(db, CONSTANTS.ARCHIVE_COLLECTION, id)).then(docSnap => {
            if(docSnap.exists()) {
                const data = docSnap.data();
                delete data.dateArchivage;
                const batch = writeBatch(db);
                batch.set(doc(db, CONSTANTS.COLLECTION, id), data);
                batch.delete(doc(db, CONSTANTS.ARCHIVE_COLLECTION, id));
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

    // Récupération des paiements
    const paymentCheckboxes = document.querySelectorAll('#paymentDropdownList input[type="checkbox"]:checked');
    const selectedPayments = Array.from(paymentCheckboxes).map(cb => cb.value);
    
    const payBtn = document.getElementById('paymentFilterBtn');
    if (payBtn) {
        if (selectedPayments.length === 0) payBtn.textContent = '💰 Paiement';
        else if (selectedPayments.length === 1) payBtn.textContent = selectedPayments[0] === 'SOLDE' ? '✅ Soldé' : '⚠️ Impayé';
        else payBtn.textContent = `💰 ${selectedPayments.length} filtres`;
    }

    // Récupération des statuts sélectionnés (Multi-select)
    const statusCheckboxes = document.querySelectorAll('#statusDropdownList input[type="checkbox"]:checked');
    const selectedStatuses = Array.from(statusCheckboxes).map(cb => cb.value);

    // Mise à jour du texte du bouton Statuts
    const statusBtn = document.getElementById('statusFilterBtn');
    if (selectedStatuses.length === 0) {
        statusBtn.textContent = '📊 Tous les statuts';
    } else if (selectedStatuses.length === 1) {
        const map = { 'EN_ATTENTE': '⏳ En Attente', 'EN_COURS': '🚚 En Cours', 'LIVRE': '✅ Livré', 'ABANDONNE': '⚫ Abandonné', 'MAGASINAGE': '⚠️ Magasinage' };
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
        
        let matchPayment = true;
        if (selectedPayments.length > 0) {
            const montantVal = parseFloat((d.montant || '0').replace(/[^\d]/g, '')) || 0;
            if (selectedPayments.includes('SOLDE') && selectedPayments.includes('IMPAYE')) {
                matchPayment = true;
            } else if (selectedPayments.includes('SOLDE')) {
                matchPayment = montantVal === 0;
            } else if (selectedPayments.includes('IMPAYE')) {
                matchPayment = montantVal > 0;
            }
        }

        let matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(d.status);
        // NOUVEAU : Filtre Magasinage
        if (selectedStatuses.length > 0 && !matchStatus && selectedStatuses.includes('MAGASINAGE')) {
            if (d.containerStatus === 'EN_COURS' && d.status !== 'LIVRE' && d.status !== 'ABANDONNE' && d.dateAjout) {
                const diffTime = new Date() - new Date(d.dateAjout);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > 7) matchStatus = true;
            }
        }

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
        if (['EN_COURS', 'A_VENIR'].includes(currentTab) && isContainerFilterActive) {
            if (currentContainerName && currentContainerName !== 'Aucun' && currentContainerName !== 'SANS_CONTENEUR') {
                // Filtre classique sur un vrai conteneur
                matchContainer = (d.conteneur && d.conteneur.trim() === currentContainerName);
            } else if (currentContainerName === 'SANS_CONTENEUR') {
                // NOUVEAU : Filtre pour retrouver les colis sans conteneur
                matchContainer = (!d.conteneur || d.conteneur.trim() === '');
            }
            // Si c'est 'Aucun', matchContainer reste à true (affiche tout)
        }
        
        return matchCommune && matchStatus && matchSearch && matchTab && matchLocation && matchContainer && matchPayment;
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
    
    window.filteredDeliveries = filteredDeliveries;
    
    // Calcul Total Valeur pour PARIS
    if (currentTab === 'PARIS') {
        const totalVal = filteredDeliveries.reduce((sum, d) => {
            return sum + (parseFloat(String(d.prixOriginal || d.montant || '0').replace(/[^\d]/g, '')) || 0);
        }, 0);
        const parisTotEl = document.getElementById('parisTotalValue');
        if (parisTotEl) parisTotEl.textContent = formatCFA(totalVal);
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
    newLocation = cleanString(newLocation);
    const detected = detectCommune(newLocation);
    const updates = { lieuLivraison: newLocation };
    if (detected !== 'AUTRE') updates.commune = detected;
    
    updateDoc(doc(db, CONSTANTS.COLLECTION, id), updates);

    // PROPAGATION : Mettre à jour tous les colis du même destinataire (tous onglets confondus)
    const currentItem = deliveries.find(d => d.id === id);
    if (currentItem && currentItem.destinataire && currentItem.destinataire.trim() !== "") {
        const recipientName = currentItem.destinataire.trim();
        
        // REQUÊTE FIRESTORE pour toucher TOUS les onglets (même ceux non chargés localement)
        getDocs(query(collection(db, CONSTANTS.COLLECTION), where('destinataire', '==', recipientName)))
            .then(snapshot => {
                const batch = writeBatch(db);
                let count = 0;
                
                snapshot.forEach(docSnap => {
                    // On ne met à jour que si l'ID est différent ET que le lieu est différent (pour économiser des écritures)
                    if (docSnap.id !== id && docSnap.data().lieuLivraison !== newLocation) {
                        batch.update(docSnap.ref, updates);
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
    updateDoc(doc(db, CONSTANTS.COLLECTION, id), { destinataire: cleanString(newRecipient) });
}

// Mise à jour du numéro en direct
function updateDeliveryPhone(id, newPhone) {
    updateDoc(doc(db, CONSTANTS.COLLECTION, id), { numero: cleanString(newPhone) });
}

// Mise à jour du montant en direct
function updateDeliveryAmount(id, newAmount) {
    updateDoc(doc(db, CONSTANTS.COLLECTION, id), { montant: cleanString(newAmount) });
}

// Mise à jour de la quantité en direct
function updateDeliveryQuantity(id, newQty) {
    updateDoc(doc(db, CONSTANTS.COLLECTION, id), { quantite: parseInt(newQty) || 1 });
}

// Mise à jour de l'info manuelle en direct
function updateDeliveryInfo(id, newInfo) {
    updateDoc(doc(db, CONSTANTS.COLLECTION, id), { info: cleanString(newInfo) });
}

// Mise à jour du statut "Client Notifié" (Onglet À Venir)
function toggleClientNotified(id, isChecked) {
    updateDoc(doc(db, CONSTANTS.COLLECTION, id), { clientNotified: isChecked });
}

// Actions
async function markAsDelivered(id) {
    const d = deliveries.find(item => item.id === id);
    if (!d) return;

    const quantiteTotal = parseInt(d.quantite) || 1;
    const quantiteDejaLivree = parseInt(d.quantiteLivree) || 0;
    const quantiteRestante = d.quantiteRestante !== undefined ? parseInt(d.quantiteRestante) : quantiteTotal;

    if (quantiteRestante > 1) {
        const rep = await AppModal.prompt(`Combien de colis ont été livrés aujourd'hui ? (Reste à livrer: ${quantiteRestante})`, quantiteRestante.toString(), "Confirmation de Livraison");
        if (rep === null) return;
        
        const qteLivree = parseInt(rep);
        if (isNaN(qteLivree) || qteLivree <= 0 || qteLivree > quantiteRestante) {
            return AppModal.error("Quantité saisie invalide.");
        }

        const newRestante = quantiteRestante - qteLivree;
        const newQuantiteLivree = quantiteDejaLivree + qteLivree;
        const isPartial = newRestante > 0;

        const updates = {
            status: isPartial ? 'LIVRAISON_PARTIELLE' : 'LIVRE',
            quantiteLivree: newQuantiteLivree,
            quantiteRestante: newRestante,
            dateLivraison: new Date().toISOString()
        };

        const newHistoryItem = {
            date: new Date().toISOString(),
            quantiteLivree: qteLivree,
            livreur: d.livreur || sessionStorage.getItem('userName') || 'Inconnu'
        };
        updates.historiquePartiel = arrayUnion(newHistoryItem);

        updateDoc(doc(db, CONSTANTS.COLLECTION, id), updates).then(() => {
            showToast(isPartial ? 'Livraison partielle enregistrée' : 'Marqué comme LIVRÉ', 'success');
        });
    } else {
        updateDoc(doc(db, CONSTANTS.COLLECTION, id), {
            status: 'LIVRE',
            quantiteLivree: quantiteTotal,
            quantiteRestante: 0,
            dateLivraison: new Date().toISOString()
        }).then(() => showToast('Marqué comme LIVRÉ', 'success'));
    }
}

function markAsPending(id) {
    updateDoc(doc(db, CONSTANTS.COLLECTION, id), { 
        status: 'EN_ATTENTE',
        livreur: deleteField(),
        dateProgramme: deleteField(),
        dateLivraison: deleteField(),
        orderInRoute: deleteField()
    }).then(() => showToast('Repassé en attente et désassigné', 'success'));
}

// Actions d'amélioration rapides
function openEmbarquerModal() {
    if (selectedIds.size === 0) {
        showToast('Veuillez sélectionner au moins un colis à expédier.', 'error');
        return;
    }
    document.getElementById('assignSelectedCount').textContent = selectedIds.size;
    document.getElementById('assignContainerStatus').value = 'A_VENIR';
    document.getElementById('assignContainerModal').classList.add('active');
}

function notifierMasseAVenir() {
    let itemsToNotify = filteredDeliveries.filter(d => d.containerStatus === 'A_VENIR');
    if (selectedIds.size > 0) itemsToNotify = itemsToNotify.filter(d => selectedIds.has(d.id));

    if (itemsToNotify.length === 0) return showToast("Aucun colis à notifier dans cette vue.", "error");

    const listEl = document.getElementById('massNotificationList');
    listEl.innerHTML = '';

    itemsToNotify.forEach(d => {
        let phone = d.numero || d.destinataire?.match(/(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/)?.[0] || '';
        phone = phone.replace(/[^\d]/g, '');
        if (phone.length === 10 && phone.startsWith('0')) phone = '225' + phone.substring(1);
        else if (phone.length === 10) phone = '225' + phone;

        const msg = encodeURIComponent(`Bonjour ${d.destinataire || 'Client'},\n\n🚢 Votre colis Réf: *${d.ref}* (Conteneur ${d.conteneur || 'en transit'}) est en route vers Abidjan.\n\nMerci de nous confirmer votre lieu de livraison :\n${d.lieuLivraison || '(à préciser)'}\n\n— L'équipe AMT TRANS'IT`);

        let btnHtml = '';
        if (phone) {
            btnHtml = `<a href="https://wa.me/${phone}?text=${msg}" target="_blank" onclick="toggleClientNotified('${d.id}', true); this.style.backgroundColor='#94a3b8'; this.textContent='✅ Message Envoyé';" style="display:inline-block; padding:6px 12px; background:#10b981; color:white; text-decoration:none; border-radius:6px; font-size:12px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">💬 Notifier sur WhatsApp</a>`;
        } else {
            btnHtml = `<span style="color:#ef4444; font-size:12px; font-weight:bold;">Numéro Invalide</span>`;
        }

        listEl.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #e2e8f0; background:white; margin-bottom:5px; border-radius:6px;">
                <div>
                    <div style="font-weight:bold; color:#1e293b; font-size:14px;">${d.ref}</div>
                    <div style="font-size:12px; color:#64748b;">${d.destinataire || 'Inconnu'}</div>
                </div>
                <div>${btnHtml}</div>
            </div>
        `;
    });
    document.getElementById('massNotificationModal').classList.add('active');
}

function saveContainerETA(dateVal) {
    const container = document.getElementById('quickContainerSelect2').value;
    if (!container) return showToast("Sélectionnez d'abord un conteneur", "error");
    localStorage.setItem(`eta_${container}`, dateVal);
    showToast("Date d'arrivée estimée sauvegardée", "success");
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

// --- GESTION DES ABANDONS DE COLIS ---
function openAbandonModal(id) {
    const item = deliveries.find(d => d.id === id);
    if (!item) return;
    document.getElementById('abandonDeliveryId').value = id;
    document.getElementById('abandonRefDisplay').textContent = item.ref;
    document.getElementById('abandonTypeSelect').value = 'DELAI'; // Par défaut
    document.getElementById('abandonModal').classList.add('active');
}

function closeAbandonModal() {
    document.getElementById('abandonModal').classList.remove('active');
    document.getElementById('abandonDeliveryId').value = '';
}

async function confirmAbandonment() {
    const id = document.getElementById('abandonDeliveryId').value;
    const typeAbandon = document.getElementById('abandonTypeSelect').value;
    if (!id) return;
    await processAbandonment(id, typeAbandon);
}

async function processAbandonment(id, typeAbandon) {
    const item = deliveries.find(d => d.id === id);
    if (!item) return;

    const btn = document.querySelector('#abandonModal .btn-danger');
    const originalText = btn ? btn.textContent : "Valider";
    if (btn) {
        btn.textContent = "Traitement...";
        btn.disabled = true;
    }

    try {
        // --- CORRECTION : Récupération de la vraie date d'arrivée depuis la Caisse ---
        // Si le colis a été mis à jour récemment, sa dateAjout a pu être écrasée (affichant 0 jours de magasinage).
        // On va chercher la date de création de sa transaction dans la caisse pour réparer cela.
        if (item.ref) {
            const transQ = await getDocs(query(collection(db, 'transactions'), where('reference', '==', item.ref), limit(1)));
            if (!transQ.empty) {
                const tData = transQ.docs[0].data();
                if (tData.date) {
                    const tDate = new Date(tData.date);
                    const iDate = item.dateAjout ? new Date(item.dateAjout) : new Date();
                    // Si la date en caisse est plus ancienne que la date en logistique, on restaure l'ancienne
                    if (tDate < iDate) {
                        item.dateAjout = tDate.toISOString();
                    }
                }
            }
        }

        // 1. Mise à jour de la base de données Firestore
        await updateDoc(doc(db, CONSTANTS.COLLECTION, id), {
            status: 'ABANDONNE',
            abandonType: typeAbandon,
            dateAbandon: new Date().toISOString(),
            dateAjout: item.dateAjout, // Sauvegarde de la date d'arrivée corrigée
            livreur: deleteField(), // Retire d'une éventuelle tournée
            dateProgramme: deleteField()
        });

        // 2. Génération du PDF
        generateAbandonmentPDF(item, typeAbandon);

        showToast("Le colis a été marqué comme ABANDONNÉ", "success");
        closeAbandonModal();
    } catch (error) {
        console.error("Erreur lors de l'abandon:", error);
        showToast("Erreur: " + error.message, "error");
    } finally {
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
}

function generateAbandonmentPDFFromId(id) {
    const item = deliveries.find(d => d.id === id);
    if (item) generateAbandonmentPDF(item, item.abandonType || 'DELAI');
}

function generateAbandonmentPDF(data, typeAbandon) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 0;

    // Helper pour formater les montants en remplaçant l'espace insécable invisible (\u202F) par un espace standard
    const formatMontant = (num) => new Intl.NumberFormat('fr-CI').format(num).replace(/[\u202F\u00A0]/g, ' ');

    // --- EN-TÊTE GRAPHIQUE (Premium) ---
    // Fond Bleu Foncé Ardoise
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 35, 'F');
    // Accent Ligne Orange/Rouge
    doc.setFillColor(234, 88, 12);
    doc.rect(0, 35, pageWidth, 2, 'F');

    // Tentative d'insertion automatique du Logo (depuis la page web)
    try {
        const logoElement = document.querySelector('.app-logo');
        if (logoElement && logoElement.complete && logoElement.naturalWidth > 0) {
            const ratio = logoElement.naturalWidth / logoElement.naturalHeight;
            let imgW = 20 * ratio;
            if (imgW > 50) imgW = 50; // Limite de largeur
            doc.addImage(logoElement, 'PNG', 15, 7, imgW, 20);
        } else {
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.text("AMT TRANS'IT", 15, 22);
        }
    } catch(e) {
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text("AMT TRANS'IT", 15, 22);
    }

    // Textes de l'en-tête (Droite)
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("ACTE D'ABANDON", pageWidth - 15, 16, { align: 'right' });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184); // Gris clair
    doc.text("DÉCISION DE MISE AU REBUT DU COLIS", pageWidth - 15, 22, { align: 'right' });

    // --- BLOC META INFORMATIONS ---
    y = 42;
    doc.setDrawColor(226, 232, 240); // Bordure douce
    doc.setFillColor(248, 250, 252); // Fond gris très clair
    doc.roundedRect(15, y, pageWidth - 30, 18, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("Émis le :", 20, y + 7);
    doc.text("N° Référence Tracking :", pageWidth / 2, y + 7);

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(new Date().toLocaleDateString('fr-FR'), 20, y + 13);
    
    doc.setTextColor(220, 38, 38); // Rouge vif pour la Ref
    doc.text(data.ref || 'NON SPÉCIFIÉE', pageWidth / 2, y + 13);
    y += 24;

    // Fonction utilitaire pour les titres de section stylisés
    function drawSectionTitle(title, posY) {
        doc.setFillColor(241, 245, 249);
        doc.rect(15, posY, pageWidth - 30, 8, 'F');
        doc.setDrawColor(59, 130, 246); // Ligne accentuée bleue
        doc.setLineWidth(1.2);
        doc.line(15, posY, 15, posY + 8);
        doc.setLineWidth(0.1); // Reset
        
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
        doc.text(title, 20, posY + 6.5);
        return posY + 12;
    }

    // --- 1. IDENTIFICATION DU COLIS ---
    y = drawSectionTitle("1. IDENTIFICATION DES PARTIES ET DU COLIS", y);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    
    const dateArrivee = data.dateAjout ? new Date(data.dateAjout).toLocaleDateString('fr-FR') : '___ / ___ / 202__';

    // Colonne Gauche
    doc.setTextColor(100, 116, 139);
    doc.text("Destinataire :", 15, y);
    doc.text("Contact (Tél) :", 15, y + 6);
    doc.text("Expéditeur :", 15, y + 12);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(`${data.destinataire || 'Non spécifié'}`, 45, y);
    doc.text(`${data.numero || 'Non spécifié'}`, 45, y + 6);
    doc.text(`${data.expediteur || 'Non spécifié'}`, 45, y + 12);

    // Colonne Droite
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Date d'arrivée :", 110, y);
    doc.text("Conteneur :", 110, y + 6);
    doc.text("Contenu :", 110, y + 12);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(`${dateArrivee}`, 140, y);
    doc.text(`${data.conteneur || 'Non spécifié'}`, 140, y + 6);
    
    doc.setFont("helvetica", "normal");
    const descText = doc.splitTextToSize(data.description || 'Non spécifié', 55);
    doc.text(descText, 140, y + 12);

    y += 12 + (descText.length * 4) + 4;

    // --- 2. SITUATION FINANCIÈRE ---
    y = drawSectionTitle("2. SITUATION FINANCIÈRE ET MAGASINAGE", y);

    const resteStr = data.montant || '0 CFA';
    const resteVal = parseFloat(resteStr.replace(/[^\d]/g, '')) || 0;

    let fee = 0;
    let diffDays = 0;
    if (data.dateAjout) {
        const diffTime = new Date() - new Date(data.dateAjout);
        diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const qte = parseInt(data.quantite) || 1;
        if (diffDays > 7) {
            if (diffDays <= 14) fee = 10000 * qte;
            else fee = (10000 + (diffDays - 14) * 1000) * qte;
        }
    }
    const totalVal = resteVal + fee;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Délai de conservation écoulé :", 15, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 38, 38); // Rouge
    doc.text(`${diffDays} jours`, 80, y);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Fret et Douane impayés :", 15, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${resteStr}`, 80, y);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Pénalités de magasinage :", 15, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${formatMontant(fee)} CFA`, 80, y);
    
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("(Conditions : Franchise 7j, puis 10 000 CFA/semaine, puis 1 000 CFA/j/colis)", 100, y);

    y += 8;
    
    // Boîte Totale Sombre / Rouge
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(252, 165, 165);
    doc.roundedRect(15, y, pageWidth - 30, 14, 2, 2, 'FD');
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(153, 27, 27);
    doc.text("TOTAL DES CRÉANCES DUES A L'ENTREPRISE :", 20, y + 9);
    doc.setFontSize(12);
    doc.text(`${formatMontant(totalVal)} CFA`, pageWidth - 20, y + 9.5, { align: 'right' });

    y += 20;

    // --- 3. MOTIF D'ABANDON ---
    y = drawSectionTitle("3. MOTIF D'ABANDON DÉFINITIF", y);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);

    // Dessin de cases à cocher personnalisées
    doc.setDrawColor(148, 163, 184);
    doc.rect(20, y - 3, 3, 3);
    doc.text("Abandon volontaire et anticipé expressément formulé par le client.", 26, y - 0.5);
    
    y += 6;
    doc.rect(20, y - 3, 3, 3);
    doc.text("Expiration du délai légal et réglementaire de stockage (Non réclamé ou Injoignable).", 26, y - 0.5);

    // On coche la bonne case
    doc.setTextColor(220, 38, 38);
    doc.setFont("helvetica", "bold");
    if (typeAbandon === 'VOLONTAIRE') {
        doc.text("X", 20.7, y - 6.5); // Check première case (centré dans la box du haut)
    } else {
        doc.text("X", 20.7, y - 0.5); // Check deuxième case (centré dans la box du bas)
    }

    y += 10;

    // --- 4. CADRE LÉGAL ET DÉCISION ---
    y = drawSectionTitle("4. CADRE LÉGAL ET DÉCISION DE LA DIRECTION", y);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const clauseText = `Conformément à nos Conditions Générales de Vente et de Transport, tout colis dont les frais de logistique et de douane ne sont pas intégralement acquittés et qui n'est pas réclamé à l'expiration de son délai de conservation est formellement considéré comme ABANDONNÉ par l'expéditeur et le destinataire.\nEn conséquence, l'entreprise AMT TRANS'IT se décharge de toute obligation de conservation. Elle acquiert la pleine et entière disposition de la marchandise pour procéder à sa destruction, son don, ou sa mise en vente afin de recouvrer le préjudice financier (frais d'exploitation et de magasinage impayés). Aucune indemnité, poursuite ni remboursement ne pourra être exigé ultérieurement par le client.`;
    const splitClause = doc.splitTextToSize(clauseText, pageWidth - 30);
    doc.text(splitClause, 15, y);
    y += (splitClause.length * 3.5) + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("ACTION ORDONNÉE POUR CE COLIS :", 15, y);
    
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setDrawColor(203, 213, 225);
    doc.rect(20, y - 3, 4, 4); doc.text("Destruction / Rebus", 26, y);
    doc.rect(75, y - 3, 4, 4); doc.text("Mise en vente", 81, y);
    doc.rect(120, y - 3, 4, 4); doc.text("Don associatif", 126, y);

    y += 12;
    
    // --- SIGNATURES ---
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(15, y, pageWidth - 15, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Signature du Client", 35, y, { align: 'center' });
    doc.text("L'Agent Constatant", 105, y, { align: 'center' });
    doc.text("La Direction AMT TRANS'IT", pageWidth - 35, y, { align: 'center' });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`(Saisi par : ${sessionStorage.getItem('userName') || 'Système'})`, 105, y + 4, { align: 'center' });

    // Cadre de signature (Direction)
    doc.setDrawColor(59, 130, 246); // Ligne bleue
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(pageWidth - 65, y + 4, 60, 20);
    doc.setLineDashPattern([], 0);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(226, 232, 240);
    doc.text("CACHET & SIGNATURE", pageWidth - 35, y + 15, { align: 'center' });

    // --- PIED DE PAGE ---
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("CI FRET INTER/AMT TRANSIT", pageWidth / 2, pageHeight - 12, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text("81 AVENUE ARISTIDE BRIAND 93240 STAINS | Tel. 0186900380 | amt.transit@gmail.com | Siret: 929 865 103 R.C.S. Paris |", pageWidth / 2, pageHeight - 8, { align: 'center' });

    doc.save(`Acte_Abandon_${data.ref}.pdf`);
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

document.getElementById('deliveryForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const refInput = cleanString(document.getElementById('ref').value).toUpperCase();
    
    // 1. Vérification Doublon (Référence Unique)
    const existingItem = deliveries.find(d => d.ref === refInput);

    const newItem = {
        containerStatus: document.getElementById('newContainerStatus').value,
        conteneur: cleanString(document.getElementById('conteneur').value).toUpperCase(),
        quantite: parseInt(document.getElementById('quantite').value) || 1, // Récupération de la saisie
        ref: refInput,
        montant: cleanString(document.getElementById('montant').value),
        expediteur: cleanString(document.getElementById('expediteur').value),
        commune: document.getElementById('commune').value,
        numero: cleanString(document.getElementById('numero').value),
        lieuLivraison: cleanString(document.getElementById('lieuLivraison').value),
        destinataire: cleanString(document.getElementById('destinataire').value),
        description: cleanString(document.getElementById('description').value),
        status: 'EN_ATTENTE',
        dateAjout: new Date().toISOString()
    };
    
    if (existingItem) {
        if (!await AppModal.confirm(`La référence ${refInput} existe déjà.\nVoulez-vous fusionner les informations (garder les plus complètes) ?`, "Doublon détecté")) {
            return;
        }

        const docRef = doc(db, CONSTANTS.COLLECTION, existingItem.id);
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
        if (newItem.containerStatus !== existingItem.containerStatus) {
            updates.dateAjout = new Date().toISOString(); // Préserve la date d'arrivée si on met juste à jour les infos
        }

        updateDoc(docRef, updates).then(() => {
            showToast('Livraison fusionnée avec succès !', 'success');
            closeAddModal();
            if (newItem.containerStatus !== currentTab) switchTab(newItem.containerStatus);
        });

    } else {
        addDoc(collection(db, CONSTANTS.COLLECTION), newItem).then(() => {
            // --- SYNC TRANSACTION (Si En Cours) ---
            // Si on ajoute manuellement un colis "En Cours", on crée la transaction financière correspondante
            if (newItem.containerStatus === 'EN_COURS') {
                const price = parseFloat((newItem.montant || '0').replace(/[^\d]/g, '')) || 0;
                addDoc(collection(db, 'transactions'), {
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
        if (currentTab === 'PARIS' || currentTab === 'PROGRAMME') {
            titleEl.style.display = 'none';
        } else {
            titleEl.style.display = 'block';
            titleEl.textContent = `Conteneur en cours : ${currentContainerName}`;
        }
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

// Exposition globale pour l'interface HTML
Object.assign(window, {
    switchTab, setActiveContainer, importExcel, openProgramModal, openAssignContainerModal,
    openBulkStatusModal, forceSyncTransactions, deleteSelectedDeliveries, exportToExcel,
    showAddModal, archiveCompletedDeliveries, openArchivesModal, closeArchivesModal,
    searchArchives, restoreFromArchive, filterDeliveries, sortTable, updateDeliveryLocation,
    updateDeliveryRecipient, updateDeliveryPhone, updateDeliveryAmount, updateDeliveryQuantity,
    updateDeliveryInfo, toggleClientNotified, markAsDelivered, markAsPending, deleteDelivery,
    openAbandonModal, closeAbandonModal, confirmAbandonment, generateAbandonmentPDFFromId,
    closeAddModal, updateContainerTitle, updateAvailableContainersList, toggleCommuneDropdown,
    toggleLocationDropdown, toggleStatusDropdown, togglePaymentDropdown, filterLocationOptions, toggleAllLocations,
    showPreviewModal, closePreviewModal, confirmImport, updateStats, loadMoreItems,
    removeDuplicatesFromDatabase, openDeleteChoiceModal, closeDeleteChoiceModal,
    confirmDeleteAction, checkAuditForDeliveries, toggleSelection, toggleSelectAll,
    closeProgramModal, openHelpModal, fillProgramFields, confirmProgram, closeAssignContainerModal,
    confirmAssignContainer, closeBulkStatusModal, confirmBulkStatusChange, viewProgramDetails,
    sortProgramDetails, openBingMapsRoute, exportRoadmapPDF, exportRoadmapWhatsApp, printDeliverySlip, 
    updateDeliveryOrder,
    captureGPSLocation, removeFromProgram, closeProgramDetailsModal, renderTable, debouncedFilterDeliveries, openEmbarquerModal, notifierMasseAVenir, saveContainerETA,
    showScanHistory
});

// --- GESTION HISTORIQUE DES SCANS ---
function initScanHistoryModal() {
    const scanModalHTML = `
    <div id="scanHistoryModal" class="modal">
        <div class="modal-content" style="max-width: 500px; border-radius: 12px; padding: 20px;">
            <span class="close-modal" id="closeScanHistoryModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
            <h2 style="margin-top:0; color:#1e293b;">Détail des Scans</h2>
            <p id="scanHistorySubtitle" style="color:#64748b; font-size:14px; margin-bottom:15px;"></p>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table class="table" style="margin: 0; width: 100%;">
                    <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 1;">
                        <tr>
                            <th style="text-align: left; padding: 8px;">Code Barre (Scan)</th>
                            <th style="text-align: right; padding: 8px;">Date & Heure</th>
                        </tr>
                    </thead>
                    <tbody id="scanHistoryBody">
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', scanModalHTML);

    document.getElementById('closeScanHistoryModal').addEventListener('click', () => {
        document.getElementById('scanHistoryModal').classList.remove('active');
    });
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('scanHistoryModal');
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function showScanHistory(id) {
    const item = deliveries.find(d => d.id === id);
    if (!item) return;

    document.getElementById('scanHistorySubtitle').textContent = `Lot / Référence : ${item.ref} (${item.quantite || 1} colis au total)`;
    
    const tbody = document.getElementById('scanHistoryBody');
    if (!item.scanHistory || item.scanHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#94a3b8;">Aucun historique de scan disponible pour ce lot.</td></tr>';
    } else {
        // Trier du plus récent au plus ancien
        const sortedScans = [...item.scanHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
        tbody.innerHTML = sortedScans.map((scan, index) => `
            <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #334155;">${scan.scanRef}</td>
                <td style="text-align: right; padding: 10px 8px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">${new Date(scan.date).toLocaleString('fr-FR')}</td>
            </tr>
        `).join('');
    }
    
    document.getElementById('scanHistoryModal').classList.add('active');
}

// Stats
function updateStats() {
    document.getElementById('totalDeliveries').textContent = filteredDeliveries.length;
    document.getElementById('pendingDeliveries').textContent = 
        filteredDeliveries.filter(d => d.status === 'EN_ATTENTE' || d.status === 'EN_COURS' || d.status === 'PARTIEL').length;
    document.getElementById('completedDeliveries').textContent = 
        filteredDeliveries.filter(d => d.status === 'LIVRE').length;
}

// Sauvegarde
function saveDeliveries(itemsToUpdate = null) {
    if (!itemsToUpdate || !Array.isArray(itemsToUpdate)) return;
    const batch = writeBatch(db);
    let count = 0;
    itemsToUpdate.forEach(item => {
        batch.update(doc(db, CONSTANTS.COLLECTION, item.id), { orderInRoute: item.orderInRoute });
        count++;
    });
    if (count > 0) batch.commit().catch(e => console.error("Save deliveries error:", e));
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

        // Utilisation de la fonction centralisée (Locale + Archives + Majuscules)
        const foundAddr = await findAddressForRecipient(val);
        
        if (foundAddr) {
            lieuInput.value = foundAddr;
            showToast(`📍 Adresse trouvée : ${foundAddr}`, 'success');
            
            // Auto-détection commune si le champ existe
            const communeInput = document.getElementById('commune');
            if (communeInput && typeof detectCommune === 'function') {
                const detected = detectCommune(foundAddr);
                if (detected !== 'AUTRE') communeInput.value = detected;
            }
        }
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
    if (!await AppModal.confirm("⚠️ MAINTENANCE BASE DE DONNÉES ⚠️\n\nVoulez-vous rechercher et nettoyer les doublons existants ?\n\nCette action va :\n1. Supprimer les colis 'fantômes' qui figurent DÉJÀ dans vos archives.\n2. Regrouper les colis restants par Référence\n3. Fusionner les informations (garder les plus complètes)\n4. Supprimer les doublons superflus\n\nCette action est irréversible.", "Maintenance", true)) return;

    const loadingToast = document.createElement('div');
    loadingToast.className = 'toast';
    loadingToast.textContent = "Analyse et nettoyage en cours...";
    loadingToast.style.background = "#3b82f6";
    document.body.appendChild(loadingToast);

    try {
        let batch = writeBatch(db);
        let opCount = 0;
        let deletedCount = 0;
        let updatedCount = 0;
        let archivedDeletedCount = 0;

        // --- 1. IDENTIFICATION DES COLIS DÉJÀ ARCHIVÉS ---
        const activeRefs = [...new Set(deliveries.map(d => d.ref).filter(r => r))];
        const archivedRefsSet = new Set();

        if (activeRefs.length > 0) {
            const chunks = [];
            for (let i = 0; i < activeRefs.length; i += 10) chunks.push(activeRefs.slice(i, i + 10));
            
            const archivePromises = chunks.map(chunk => getDocs(query(collection(db, CONSTANTS.ARCHIVE_COLLECTION), where('ref', 'in', chunk))));
            const archiveSnapshots = await Promise.all(archivePromises);
            archiveSnapshots.forEach(snap => snap.forEach(doc => archivedRefsSet.add(doc.data().ref.toUpperCase())));
        }

        const groups = {};
        
        // 2. Traitement des colis
        for (const d of deliveries) {
            if (!d.ref) continue;
            const key = d.ref.toUpperCase().trim();
            
            if (archivedRefsSet.has(key)) {
                // Supprimer le colis actif car il est déjà dans les archives
                batch.delete(doc(db, CONSTANTS.COLLECTION, d.id));
                opCount++;
                archivedDeletedCount++;
            } else {
                if (!groups[key]) groups[key] = [];
                groups[key].push(d);
            }
            
            if (opCount >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                opCount = 0;
            }
        }

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
                    batch.delete(doc(db, CONSTANTS.COLLECTION, dup.id));
                    opCount++; deletedCount++;
                });

                if (hasUpdates) {
                    batch.update(doc(db, CONSTANTS.COLLECTION, master.id), updates);
                    opCount++; updatedCount++;
                }

                if (opCount >= 400) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
            }
        }
        if (opCount > 0) await batch.commit();
        loadingToast.remove();
        
        let resultMsg = "👍 Base de données saine : Aucun doublon actif ou fantôme trouvé.";
        if (archivedDeletedCount > 0 || deletedCount > 0) {
            resultMsg = "✅ Nettoyage terminé avec succès !\n\n";
            if (archivedDeletedCount > 0) resultMsg += `🗄️ ${archivedDeletedCount} colis fantômes (déjà archivés) ont été supprimés de la vue active.\n`;
            if (deletedCount > 0) resultMsg += `🗑️ ${deletedCount} doublons actifs supprimés.\n`;
            if (updatedCount > 0) resultMsg += `💾 ${updatedCount} fiches actives fusionnées avec leurs doublons.`;
        }
        AppModal.success(resultMsg, "Nettoyage Terminé");
    } catch (error) { console.error(error); loadingToast.remove(); AppModal.error("Erreur : " + error.message); }
}

// --- GESTION DU MODAL DE CHOIX DE SUPPRESSION ---

function openDeleteChoiceModal(context) {
    pendingDeleteContext = context;
    document.getElementById('deleteChoiceModal').classList.add('active');
}

function closeDeleteChoiceModal() {
    document.getElementById('deleteChoiceModal').classList.remove('active');
    pendingDeleteContext = null;
}

function confirmDeleteAction(action) {
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

// --- NOUVEAU : BOUTON SYNCHRO AUDIT ---
function initAuditSyncButton() {
    const toolbars = document.querySelectorAll('.toolbar');
    toolbars.forEach(toolbar => {
        if (toolbar.querySelector('.btn-audit-sync')) return;

        const btn = document.createElement('button');
        btn.className = "btn btn-audit-sync";
        btn.innerHTML = "🔍 Vérif. Audit";
        btn.style.backgroundColor = "#6f42c1"; // Violet
        btn.style.color = "white";
        btn.title = "Vérifier les paiements dans l'Audit et mettre à jour les statuts";
        btn.onclick = checkAuditForDeliveries;
        
        // Insérer avant la barre de recherche
        const search = toolbar.querySelector('.search-box') || toolbar.querySelector('input[type="text"]');
        if (search) {
            // Remonter jusqu'à l'enfant direct de la toolbar pour éviter l'erreur insertBefore
            let target = search;
            while (target && target.parentNode !== toolbar) {
                target = target.parentNode;
            }
            if (target) toolbar.insertBefore(btn, target);
            else toolbar.appendChild(btn);
        } else {
            toolbar.appendChild(btn);
        }
    });
}

async function checkAuditForDeliveries() {
    if (!await AppModal.confirm("Lancer la vérification des statuts via l'Audit ?\n\nCela va :\n1. Chercher les colis payés/validés dans l'Audit.\n2. Mettre à jour leur statut en 'LIVRÉ'.\n3. Vous proposer de déplacer ceux qui sont encore à Paris/À Venir.", "Vérification Audit")) return;

    const loadingToast = document.createElement('div');
    loadingToast.className = 'toast';
    loadingToast.textContent = "Analyse Audit & Transactions...";
    loadingToast.style.background = "#6f42c1";
    document.body.appendChild(loadingToast);

    try {
        // 1. Récupérer les sessions validées
        const sessionsSnap = await getDocs(query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("status", "==", "VALIDATED")));
        
        const validatedSessionIds = new Set(sessionsSnap.docs.map(d => d.id));

        // 2. Identifier les colis non livrés
        const pendingDeliveries = deliveries.filter(d => d.status !== 'LIVRE');
        if (pendingDeliveries.length === 0) {
            loadingToast.remove();
            return AppModal.alert("Tous les colis sont déjà livrés.", "Vérification");
        }

        // 3. Vérifier le statut financier
        const refsToCheck = [...new Set(pendingDeliveries.map(d => d.ref).filter(r => r))];
        const validatedRefs = new Set();

        // Découpage en lots de 10 pour Firestore 'in' query
        const chunks = [];
        for (let i = 0; i < refsToCheck.length; i += 10) chunks.push(refsToCheck.slice(i, i + 10));

        for (const chunk of chunks) {
            const q = await getDocs(query(collection(db, "transactions"), where("reference", "in", chunk)));
            q.forEach(docSnap => {
                const t = docSnap.data();
                // Est validé si lié à une session validée
                if (t.paymentHistory && t.paymentHistory.some(p => p.sessionId && validatedSessionIds.has(p.sessionId))) {
                    validatedRefs.add(t.reference);
                }
            });
        }

        // 4. Identifier les candidats
        const moveCandidates = [];
        const updateCandidates = [];

        for (const item of pendingDeliveries) {
            if (validatedRefs.has(item.ref)) {
                if (['PARIS', 'A_VENIR'].includes(item.containerStatus)) {
                    moveCandidates.push(item);
                } else {
                    updateCandidates.push(item);
                }
            }
        }

        let batch = writeBatch(db);
        let opCount = 0;
        let movedCount = 0;
        let updatedCount = 0;

        // Traitement des déplacements (Confirmation groupée)
        if (moveCandidates.length > 0) {
            if (await AppModal.confirm(`${moveCandidates.length} colis validés sont encore dans 'Paris' ou 'À Venir'.\n\nTout déplacer vers 'EN COURS' et marquer 'LIVRÉ' ?`, "Déplacement", true)) {
                moveCandidates.forEach(item => {
                    batch.update(doc(db, CONSTANTS.COLLECTION, item.id), {
                        containerStatus: 'EN_COURS', status: 'LIVRE', dateLivraison: new Date().toISOString(), importedFromTransit: true
                    });
                    movedCount++; opCount++;
                });
            }
        }

        // Traitement des mises à jour simples
        updateCandidates.forEach(item => {
            batch.update(doc(db, CONSTANTS.COLLECTION, item.id), { status: 'LIVRE', dateLivraison: new Date().toISOString() });
            updatedCount++; opCount++;
        });

        if (opCount > 0) await batch.commit();

        loadingToast.remove();
        AppModal.success(`✅ Terminé !\n\n📦 ${updatedCount + movedCount} colis marqués LIVRÉ\n🚚 Dont ${movedCount} déplacés vers EN COURS.`);

    } catch (e) { console.error(e); loadingToast.remove(); AppModal.error("Erreur : " + e.message); }
}

// Fonctions utilitaires de suppression/déplacement
function moveSelectedToAVenir() {
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
        batch.update(doc(db, CONSTANTS.COLLECTION, id), {
            containerStatus: 'A_VENIR',
            status: 'EN_ATTENTE',
            livreur: deleteField(),
            dateProgramme: deleteField(),
            importedFromTransit: deleteField(),
            directFromParis: deleteField(),
                dateAjout: new Date().toISOString() // Fait remonter en haut de la liste
        });
        const item = deliveries.find(d => d.id === id);
        if (item && item.ref) deleteTransactionByRef(item.ref);
    });
    batch.commit().then(() => {
        selectedIds.clear();
        showToast('Colis renvoyés vers À VENIR', 'success');
    });
}

async function permanentlyDeleteSelected(skipConfirm = false) {
    if (!skipConfirm && !await AppModal.confirm(`Voulez-vous vraiment supprimer ces ${selectedIds.size} livraisons ?`, "Suppression Multiple", true)) return;

    const batch = writeBatch(db);
    selectedIds.forEach(id => {
        batch.delete(doc(db, CONSTANTS.COLLECTION, id));
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

