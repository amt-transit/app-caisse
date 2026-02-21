
// --- CONFIGURATION & CONSTANTES (Refactorisation) ---
const CONSTANTS = {
    STORAGE_KEYS: {
        DELIVERIES: 'deliveries',
        ARCHIVED: 'archived_deliveries',
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

// --- STATE MANAGEMENT ---
let deliveries = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.DELIVERIES) || '[]');
let archivedDeliveries = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.ARCHIVED) || '[]');
let filteredDeliveries = [...deliveries];
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

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    updateStats();
    updateContainerTitle();
    initActiveContainerInput();
    renderTable();
    updateAutocomplete();
    updateLocationFilterOptions();
});

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

    selectedIds.clear(); // On vide la sélection quand on change d'onglet
    
    // Réinitialiser le tri
    currentSort.column = null;
    currentSort.direction = 'asc';

    updateLocationFilterOptions();
    filterDeliveries();
    updateStats(); // Met à jour les stats pour la vue actuelle
}

// Gestion du conteneur actif
function initActiveContainerInput() {
    const input = document.getElementById('activeContainerInput');
    if (input && currentContainerName !== 'Aucun') {
        input.value = currentContainerName;
    }
}

function setActiveContainer() {
    const input = document.getElementById('activeContainerInput');
    const newVal = input.value.trim();
    if (newVal) {
        currentContainerName = newVal;
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.CONTAINER_NAME, currentContainerName);
        updateContainerTitle();
        showToast(`Conteneur actif défini : ${newVal}`, 'success');
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
    const file = event.target.files[0];
    if (!file) return;
    
    showToast('Lecture du PDF en cours...', 'success');
    
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
        
        if (parsed.length > 0) {
            pendingImport = parsed;
            showPreviewModal(parsed);
        } else {
            showToast('Aucune livraison trouvée', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Erreur lors de la lecture du PDF', 'error');
    }
    
    event.target.value = '';
}

// Parser PDF
function parsePDFText(text) {
    const deliveries = [];
    const lines = text.split('\n');
    const refRegex = /^([A-Z]{2}-\d{3}-D\d{2})/;
    
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
                expediteur: expediteur,
                commune: detectCommune(lieu),
                lieuLivraison: lieu,
                destinataire: destinataire,
                description: description,
                status: 'EN_ATTENTE',
                dateAjout: new Date().toISOString()
            });
        }
    }
    
    return deliveries;
}

// Import Excel
function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            const imported = jsonData.map((row, i) => ({
                id: Date.now() + i,
                ref: row.REF || row.REFERENCE || '',
                montant: row.RESTANT || row.MONTANT || '',
                expediteur: row.EXPEDITEUR || '',
                commune: detectCommune(row.LIVRE || row.LIEU || ''),
                lieuLivraison: row.LIVRE || row.LIEU || '',
                destinataire: row.DESTINATAIRE || '',
                description: row.DESCRIPTION || '',
                status: 'EN_ATTENTE',
                dateAjout: new Date().toISOString()
            })).filter(d => d.ref);
            
            if (imported.length > 0) {
                pendingImport = imported;
                showPreviewModal(imported);
            }
        } catch (error) {
            showToast('Erreur lors de l\'import Excel', 'error');
        }
    };
    
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// Détecter commune
// Détection plus robuste des communes
function detectCommune(lieu) {
    if (!lieu) return 'AUTRE';
    const upper = lieu.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Supprime les accents

    for (const [key, keywords] of Object.entries(CONSTANTS.COMMUNES)) {
        if (keywords.some(kw => upper.includes(kw))) return key;
    }
    return 'AUTRE';
}

// Aperçu modal
function showPreviewModal(data) {
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
    document.getElementById('importBl').value = '';
    pendingImport = [];
}

function confirmImport() {
    const conteneur = document.getElementById('importConteneur').value;
    const bl = document.getElementById('importBl').value;
    const containerStatus = document.getElementById('importContainerStatus').value;

    let newItems = [];
    let updatedCount = 0;

    pendingImport.forEach(importItem => {
        // Vérifier si la référence existe déjà dans la base de données
        const existingItem = deliveries.find(d => d.ref === importItem.ref);

        if (existingItem) {
            // CAS 1 : La référence existe -> On déplace le colis existant (on garde ses infos)
            // Marquer comme venant de "À VENIR" si c'est le cas
            if ((existingItem.containerStatus === 'A_VENIR' || existingItem.containerStatus === 'PARIS') && containerStatus === 'EN_COURS') {
                existingItem.importedFromTransit = true;
            } else if (containerStatus !== 'EN_COURS') {
                delete existingItem.importedFromTransit;
            }
            existingItem.containerStatus = containerStatus; // Mise à jour du statut (ex: vers EN_COURS)
            if (conteneur) existingItem.conteneur = conteneur; // Mise à jour du conteneur
            if (bl) existingItem.bl = bl; // Mise à jour du BL
            updatedCount++;
        } else {
            // CAS 2 : La référence n'existe pas -> On crée un nouveau colis
            newItems.push({ 
                ...importItem, 
                conteneur: conteneur || importItem.conteneur, 
                bl: bl || importItem.bl, 
                containerStatus: containerStatus 
            });
        }
    });
    
    // On ajoute seulement les nouveaux items à la liste globale
    deliveries = [...deliveries, ...newItems];
    
    // Mise à jour du conteneur en cours si renseigné
    if (conteneur) {
        currentContainerName = conteneur;
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.CONTAINER_NAME, currentContainerName);
        updateContainerTitle();
        // Mettre à jour le champ dans la toolbar aussi
        const activeInput = document.getElementById('activeContainerInput');
        if (activeInput) activeInput.value = currentContainerName;
    }

    // Si on importe dans l'autre onglet, on bascule dessus pour voir le résultat
    if (containerStatus !== currentTab) {
        switchTab(containerStatus);
    }

    saveDeliveries();
    updateStats();
    renderTable();
    updateAutocomplete();
    updateLocationFilterOptions();
    closePreviewModal();
    showToast(`${newItems.length} ajoutés, ${updatedCount} mis à jour/déplacés !`, 'success');
}

// Export Excel
function exportToExcel() {
    if (deliveries.length === 0) {
        showToast('Aucune livraison à exporter', 'error');
        return;
    }
    
    const data = filteredDeliveries.map(d => ({ // Export uniquement ce qu'on voit (filtré)
        'CONTENEUR': d.conteneur || '',
        'BL': d.bl || '',
        'REF': d.ref,
        'RESTANT': d.montant,
        'EXPEDITEUR': d.expediteur,
        'LIVRE': d.lieuLivraison,
        'DESTINATAIRE': d.destinataire,
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
                <th style="width: 120px;">BL</th>
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
    theadRow.innerHTML = `
        <th class="col-checkbox"><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
        <th class="sortable" onclick="sortTable('conteneur')" style="width: 120px;">CONTENEUR ${getSortIcon('conteneur')}</th>
        <th class="sortable" onclick="sortTable('ref')" style="width: 100px;">REF ${getSortIcon('ref')}</th>
        <th class="sortable" onclick="sortTable('montant')" style="width: 100px;">MONTANT ${getSortIcon('montant')}</th>
        <th class="sortable" onclick="sortTable('expediteur')" style="width: 150px;">EXPEDITEUR ${getSortIcon('expediteur')}</th>
        <th class="sortable" onclick="sortTable('lieuLivraison')" style="width: 250px;">LIEU DE LIVRAISON ${getSortIcon('lieuLivraison')}</th>
        <th class="sortable" onclick="sortTable('destinataire')" style="width: 180px;">DESTINATAIRE ${getSortIcon('destinataire')}</th>
        <th style="width: 250px;">DESCRIPTION</th>
        <th style="width: 150px;">INFO</th>
        <th class="sortable" onclick="sortTable('livreur')" style="width: 150px;">LIVREUR (DATE) ${getSortIcon('livreur')}</th>
        <th style="width: 80px;">STATUT</th>
        <th style="width: 150px;">ACTIONS</th>
    `;

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
        }

        let transitIndicator = '';
        if (d.importedFromTransit && currentTab === 'EN_COURS') {
            transitIndicator = '<span title="Arrivé depuis À VENIR ou PARIS">🚢</span> ';
        }

        return `
            <tr class="${rowClass}">
                <td class="col-checkbox"><input type="checkbox" onchange="toggleSelection(${d.id})" ${selectedIds.has(d.id) ? 'checked' : ''}></td>
                <td>${d.conteneur || '-'}</td>
                <td class="ref">${transitIndicator}${d.ref}</td>
                <td class="montant">${d.montant || '-'}</td>
                <td>${d.expediteur}</td>
                <td><input type="text" class="editable-cell" value="${(d.lieuLivraison || '').replace(/"/g, '&quot;')}" list="sharedLocationsList" onchange="updateDeliveryLocation(${d.id}, this.value)"></td>
                <td><input type="text" class="editable-cell" value="${(d.destinataire || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryRecipient(${d.id}, this.value)"></td>
                <td>${d.description || '-'}</td>
                <td><input type="text" class="editable-cell" value="${(d.info || '').replace(/"/g, '&quot;')}" onchange="updateDeliveryInfo(${d.id}, this.value)"></td>
                <td>
                    <strong>${d.livreur || '-'}</strong><br>
                    <small>${d.dateProgramme || ''}</small>
                </td>
                <td class="status"><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="actions">
                        ${d.status !== 'LIVRE' ? 
                            `<button class="btn btn-success btn-small" onclick="markAsDelivered(${d.id})" title="Marquer comme livré">✅</button>` : 
                            `<button class="btn btn-warning btn-small" onclick="markAsPending(${d.id})" title="Marquer en attente">⏳</button>`
                        }
                        <button class="btn btn-danger btn-small" onclick="deleteDelivery(${d.id})" title="Supprimer">🗑️</button>
                    </div>
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

    deliveries = deliveries.map(d => {
        if (selectedIds.has(d.id)) {
            return { ...d, livreur: livreur, dateProgramme: dateProg, status: 'EN_COURS' };
        }
        return d;
    });

    saveDeliveries();
    filterDeliveries(); // Rafraîchir
    closeProgramModal();
    selectedIds.clear(); // Vider la sélection après action
    showToast('Programme enregistré avec succès !', 'success');
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

    deliveries = deliveries.map(d => {
        if (selectedIds.has(d.id)) {
            let updated = { ...d, conteneur: newConteneur };
            if (newStatus) {
                if ((d.containerStatus === 'A_VENIR' || d.containerStatus === 'PARIS') && newStatus === 'EN_COURS') {
                    updated.importedFromTransit = true;
                } else if (newStatus !== 'EN_COURS') {
                    delete updated.importedFromTransit;
                }
                updated.containerStatus = newStatus;
            }
            return updated;
        }
        return d;
    });

    saveDeliveries();
    filterDeliveries(); // Rafraîchir
    closeAssignContainerModal();
    selectedIds.clear(); // Vider la sélection après action
    showToast('Conteneur attribué avec succès !', 'success');
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
        const toArchive = completed.map(d => ({ ...d, dateArchivage: now }));
        
        // Ajouter aux archives
        archivedDeliveries = [...archivedDeliveries, ...toArchive];
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.ARCHIVED, JSON.stringify(archivedDeliveries));
        
        // Retirer de la liste principale
        deliveries = deliveries.filter(d => d.status !== 'LIVRE');
        saveDeliveries();
        
        // Rafraîchir l'interface
        filterDeliveries();
        updateStats();
        updateAutocomplete(); // Garder les lieux en mémoire même après archivage si besoin (déjà géré par la liste globale)
        updateLocationFilterOptions();
        
        showToast(`${completed.length} colis archivés avec succès !`, 'success');
    }
}

function openArchivesModal() {
    renderArchivesTable(archivedDeliveries);
    document.getElementById('archivesModal').classList.add('active');
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

function restoreFromArchive(ref) {
    if (confirm('Voulez-vous restaurer ce colis vers la liste principale ?')) {
        const index = archivedDeliveries.findIndex(d => d.ref === ref);
        if (index !== -1) {
            const item = archivedDeliveries[index];
            
            // Retirer la date d'archivage et remettre dans la liste principale
            delete item.dateArchivage;
            deliveries.push(item);
            
            // Retirer des archives
            archivedDeliveries.splice(index, 1);
            
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.ARCHIVED, JSON.stringify(archivedDeliveries));
            saveDeliveries();
            
            // Rafraîchir la vue actuelle (archives) et les stats globales
            searchArchives(); // Utilise searchArchives pour garder le filtre actuel si existant
            updateStats();
            showToast('Colis restauré avec succès !', 'success');
        }
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
                <button class="btn btn-warning btn-small" onclick="restoreFromArchive('${d.ref}')">♻️ Restaurer</button>
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
        
        return matchCommune && matchStatus && matchSearch && matchTab && matchLocation;
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
    const delivery = deliveries.find(d => d.id === id);
    if (delivery) {
        delivery.lieuLivraison = newLocation;
        
        // Détection automatique de la commune
        const detected = detectCommune(newLocation);
        if (detected !== 'AUTRE') {
            delivery.commune = detected;
        }

        saveDeliveries();
        updateAutocomplete();
        updateLocationFilterOptions();
        filterDeliveries(); // Rafraîchir pour mettre à jour le badge commune
    }
}

// Mise à jour du destinataire en direct
function updateDeliveryRecipient(id, newRecipient) {
    const delivery = deliveries.find(d => d.id === id);
    if (delivery) {
        delivery.destinataire = newRecipient;
        saveDeliveries();
    }
}

// Mise à jour de l'info manuelle en direct
function updateDeliveryInfo(id, newInfo) {
    const delivery = deliveries.find(d => d.id === id);
    if (delivery) {
        delivery.info = newInfo;
        saveDeliveries();
    }
}

// Actions
function markAsDelivered(id) {
    const delivery = deliveries.find(d => d.id === id);
    if (delivery) {
        delivery.status = 'LIVRE';
        saveDeliveries();
        filterDeliveries();
        updateStats();
        updateAutocomplete(); // Met à jour les suggestions car un nouveau lieu est validé
        updateLocationFilterOptions();
        showToast('Livraison marquée livrée !', 'success');
    }
}

function markAsPending(id) {
    const delivery = deliveries.find(d => d.id === id);
    if (delivery) {
        delivery.status = 'EN_ATTENTE';
        saveDeliveries();
        filterDeliveries();
        updateStats();
    }
}

function deleteDelivery(id) {
    if (confirm('Supprimer cette livraison ?')) {
        deliveries = deliveries.filter(d => d.id !== id);
        saveDeliveries();
        filterDeliveries();
        updateStats();
        updateAutocomplete();
        updateLocationFilterOptions();
        showToast('Livraison supprimée', 'success');
    }
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
    
    const delivery = {
        id: Date.now(),
        containerStatus: document.getElementById('newContainerStatus').value,
        conteneur: document.getElementById('conteneur').value,
        bl: '',
        ref: document.getElementById('ref').value,
        montant: document.getElementById('montant').value,
        expediteur: document.getElementById('expediteur').value,
        commune: document.getElementById('commune').value,
        lieuLivraison: document.getElementById('lieuLivraison').value,
        destinataire: document.getElementById('destinataire').value,
        description: document.getElementById('description').value,
        status: 'EN_ATTENTE',
        dateAjout: new Date().toISOString()
    };
    
    deliveries.push(delivery);
    
    // Basculer vers l'onglet correspondant si nécessaire
    if (delivery.containerStatus !== currentTab) {
        switchTab(delivery.containerStatus);
    }

    saveDeliveries();
    filterDeliveries();
    updateStats();
    updateLocationFilterOptions();
    closeAddModal();
    showToast('Livraison ajoutée !', 'success');
});

// Mise à jour du titre du conteneur
function updateContainerTitle() {
    const titleEl = document.getElementById('currentContainerTitle');
    if (titleEl) {
        titleEl.textContent = `Conteneur en cours : ${currentContainerName}`;
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
    localStorage.setItem(CONSTANTS.STORAGE_KEYS.DELIVERIES, JSON.stringify(deliveries));
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
