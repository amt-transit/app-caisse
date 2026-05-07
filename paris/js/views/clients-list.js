import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, orderBy, limit, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ClientsListView = {
    unsubClients: null,
    unsubLivraisons: null,
    clients: [],
    filteredClients: [],
    rawClients: null,
    rawLivraisons: null,

    // Correcteur automatique pour les accents cassés (ex: Ã‰LISE -> ÉLISE)
    fixEncoding(str) {
        if (!str) return '';
        return str
            .replace(/Ã©/g, 'é').replace(/ã©/g, 'é')
            .replace(/Ã¨/g, 'è').replace(/ã¨/g, 'è')
            .replace(/Ã /g, 'à').replace(/ã /g, 'à')
            .replace(/Ã¢/g, 'â').replace(/ã¢/g, 'â')
            .replace(/Ãª/g, 'ê').replace(/ãª/g, 'ê')
            .replace(/Ã®/g, 'î').replace(/ã®/g, 'î')
            .replace(/Ã´/g, 'ô').replace(/ã´/g, 'ô')
            .replace(/Ã»/g, 'û').replace(/ã»/g, 'û')
            .replace(/Ã§/g, 'ç').replace(/ã§/g, 'ç')
            .replace(/Ã¯/g, 'ï').replace(/ã¯/g, 'ï')
            .replace(/Ã«/g, 'ë').replace(/ã«/g, 'ë')
            .replace(/Ã‰/g, 'É')
            .replace(/Ãˆ/g, 'È')
            .replace(/Ã€/g, 'À');
    },

    render(app) {
        this.app = app;
        // Exposer globalement pour les événements onclick
        if (!window.app.views) window.app.views = {};
        window.app.views.clientsList = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        // --- SQUELETTE DE LA PAGE (Ne se recharge plus, préserve les événements) ---
        document.getElementById('contentContainer').innerHTML = `
            <style>
                .cd-header { display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; flex-wrap: wrap; gap: 15px;}
                .cd-header__icon { font-size: 32px; background: #f8fafc; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 12px; margin-right: 15px; }
                .cd-header__content { display: flex; align-items: center; }
                .cd-header__title { font-size: 24px; font-weight: 800; margin: 0; color: #0f172a; }
                .cd-header__subtitle { color: #64748b; margin: 5px 0 0 0; font-size: 13px; }
                .cd-pills { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;}
                .cd-pill { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                .cd-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
                .cd-kpi { display: flex; align-items: center; gap: 15px; padding: 20px; border-radius: 12px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .cd-kpi__icon { font-size: 24px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .cd-kpi__label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }
                .cd-kpi__value { font-size: 20px; font-weight: 800; color: #0f172a; margin: 4px 0; }
                .cd-kpi__hint { font-size: 11px; color: #94a3b8; }
                .cd-tables-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                @media(max-width: 768px){ .cd-tables-row { grid-template-columns: 1fr; } }
                .cd-table-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02); padding: 20px; overflow: hidden;}
                .cd-profile-grid { display: grid; grid-template-columns: 1fr; gap: 15px; background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
                tr.clickable-row { transition: background 0.2s; cursor: pointer; }
                tr.clickable-row:hover { background: #f1f5f9 !important; }
            </style>

            <!-- VUE LISTE -->
            <div id="clientsListView" style="max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;"><i class="fas fa-users"></i></div>
                        <div><h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800;">Clients</h2><p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Gestion de la base clients et analyse</p></div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <input type="file" id="importClientInput" accept=".csv, .xlsx, .xls" style="display: none;">
                        <button class="btn btn-outline" onclick="document.getElementById('importClientInput').click()" style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-file-import"></i> Importer clients</button>
                    </div>
                </div>

                <div class="stats-grid" style="margin-bottom: 25px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 32px; background: #f8fafc; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">👥</div>
                        <div><div style="color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Total clients</div><div id="kpiTotal" style="font-size: 24px; font-weight: 800; color: #0f172a;">-</div></div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 32px; background: #f8fafc; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px;"></div>
                        <div><div style="color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Actifs</div><div id="kpiActifs" style="font-size: 24px; font-weight: 800; color: #0f172a;">-</div></div>
                    </div>
                </div>

                <div class="form-card" style="margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div class="form-grid" style="grid-template-columns: 2fr 1fr 1fr 1fr auto; align-items: end; margin: 0;">
                        <div class="form-group" style="margin: 0;"><label>🔍 Recherche</label><input type="text" id="clSearchInput" placeholder="Nom, prénom, téléphone..."></div>
                        <div class="form-group" style="margin: 0;"><label>⚠️ Risque</label><select id="clRiskFilter"><option value="">Tous</option><option value="low">🟢 Low</option><option value="medium">🟡 Medium</option><option value="high">🔴 High</option></select></div>
                        <div class="form-group" style="margin: 0;"><label>📊 Segment</label><select id="clSegmentFilter"><option value="">Tous</option><option value="dormant">😴 Dormant</option><option value="habituel">👤 Habituel</option><option value="regulier">⭐ Régulier</option></select></div>
                        <div class="form-group" style="margin: 0;"><button class="btn btn-outline" style="height: 36px; display: flex; align-items: center; gap: 8px;"><i class="fas fa-file-excel"></i> Exporter</button></div>
                    </div>
                </div>

                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02); padding: 0; overflow: hidden;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                        <h3 style="margin: 0; font-size: 16px; color: #1e293b;">📋 Top 100 des Meilleurs Clients</h3>
                        <span class="badge" id="clListCount" style="background: #e2e8f0; color: #475569;">Chargement...</span>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="data-table" style="width: 100%; margin: 0;">
                            <thead style="background: white;">
                                <tr><th style="padding: 15px;">👤 Client</th><th>📞 Tél</th><th>📅 Dernière exp.</th><th>⚠️ Risque</th><th>📊 Segment</th><th style="text-align: right;">💰 CA 12M</th><th style="text-align: right;">📄 Expéditions</th><th style="text-align: center;">⚙️ Détail</th></tr>
                            </thead>
                            <tbody id="clTableBody">
                                <tr><td colspan="8" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Chargement des données...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- VUE DÉTAIL CLIENT (Masquée par défaut) -->
            <div id="clientDetailView" style="display: none; max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;"></div>

            <!-- MODAL ÉDITION CLIENT -->
            <div id="editClientModal" class="modal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
                <div class="modal-content" style="background:#fff; padding:20px; width:90%; max-width:500px; border-radius:12px;">
                    <span class="close-modal" onclick="document.getElementById('editClientModal').style.display='none'" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                    <h2 style="margin-top:0;">Modifier Client</h2>
                    <input type="hidden" id="editClientId">
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Nom complet</label>
                        <input type="text" id="editClientNom" style="width:100%; padding:8px; box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Téléphone</label>
                        <input type="text" id="editClientTel" style="width:100%; padding:8px; box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Adresse complète</label>
                        <input type="text" id="editClientAdresse" style="width:100%; padding:8px; box-sizing:border-box;">
                    </div>
                    <div style="text-align:right; margin-top:20px;">
                        <button class="btn" onclick="document.getElementById('editClientModal').style.display='none'" style="background: #6c757d; color:white; margin-right:10px; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Annuler</button>
                        <button class="btn btn-success" onclick="window.app.views.clientsList.saveClientEdit()" style="background: #10b981; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Enregistrer</button>
                    </div>
                </div>
            </div>
        `;

        // --- RÉINITIALISATION DES ÉCOUTEURS ---
        if (this.unsubClients) this.unsubClients();
        if (this.unsubLivraisons) this.unsubLivraisons();
        this.rawClients = null;
        this.rawLivraisons = null;

        // --- ATTACHEMENT DES ÉVÉNEMENTS ---
        const searchInput = document.getElementById('clSearchInput');
        const riskFilter = document.getElementById('clRiskFilter');
        const segFilter = document.getElementById('clSegmentFilter');
        
        if (searchInput) searchInput.addEventListener('input', () => this.applyFilters());
        if (riskFilter) riskFilter.addEventListener('change', () => this.applyFilters());
        if (segFilter) segFilter.addEventListener('change', () => this.applyFilters());

        // Écouteur pour le bouton d'importation
        const importInput = document.getElementById('importClientInput');
        if (importInput) {
            importInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    this.app.showToast(`Lecture du fichier ${file.name}...`, 'success');

                    const isCSV = file.name.toLowerCase().endsWith('.csv');
                    const reader = new FileReader();
                    
                    // ANIMATION DE CHARGEMENT SUR LE BOUTON
                    const importBtn = document.querySelector(`button[onclick="document.getElementById('importClientInput').click()"]`);
                    const originalBtnHtml = importBtn ? importBtn.innerHTML : '';
                    if (importBtn) {
                        importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyse...';
                        importBtn.disabled = true;
                    }

                    reader.onload = async (event) => {
                        try {
                            let jsonData = [];
                            
                            if (isCSV) {
                                // Parseur CSV Natif (Gère parfaitement UTF-8, accents, et séparateurs , ou ;)
                                const text = event.target.result;
                                const lines = text.split(/\r?\n/);
                                
                                if (lines.length > 0) {
                                    const separator = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
                                    const headers = lines[0].split(separator).map(h => h.trim().replace(/^"|"$/g, '').toUpperCase());

                                    for (let i = 1; i < lines.length; i++) {
                                        const line = lines[i].trim();
                                        if (!line) continue;
                                        
                                        // Regex intelligente : sépare sans casser le texte entre guillemets
                                        const regex = new RegExp(`\\s*${separator}\\s*(?=(?:[^"]*"[^"]*")*[^"]*$)`);
                                        const values = line.split(regex).map(v => v.replace(/^"|"$/g, '').trim());

                                        let rowData = {};
                                        headers.forEach((header, index) => {
                                            rowData[header] = values[index] || '';
                                        });
                                        jsonData.push(rowData);
                                    }
                                }
                            } else {
                                // Parseur Excel (.XLSX)
                                if (typeof window.XLSX === 'undefined') {
                                    throw new Error("La bibliothèque Excel (XLSX) n'est pas chargée. Vérifiez votre connexion internet ou utilisez un fichier .csv");
                                }
                                const data = new Uint8Array(event.target.result);
                                const workbook = window.XLSX.read(data, { type: 'array' });
                                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                                jsonData = window.XLSX.utils.sheet_to_json(firstSheet);
                            }

                            if (jsonData.length === 0) throw new Error("Le fichier est vide ou mal formaté.");

                            // ÉTAPE 1 : Dédoublonnage en mémoire du fichier CSV (On garde la dernière ligne de chaque client)
                            const uniqueClientsFromCSV = new Map();

                            for (const row of jsonData) {
                                const nom = (row.NOM || row.Nom || '').trim();
                                const prenom = (row.PRENOM || row.Prenom || '').trim();
                                const fullName = this.fixEncoding(`${nom} ${prenom}`.trim());
                                
                                if (!fullName) continue;

                                let phone = (row.TELEPHONE || row.Telephone || row.TEL || '').toString().trim();
                                
                                // FIX EXCEL : Gestion de la notation scientifique (Ex: 2.25071E+12)
                                if (phone.toUpperCase().includes('E')) {
                                    const num = Number(phone);
                                    if (!isNaN(num)) phone = num.toLocaleString('fullwide', {useGrouping:false});
                                }

                                const cleanPhone = phone.replace(/[\s.-]/g, '');
                                if (cleanPhone.length === 9 && /^[1-9]/.test(cleanPhone)) {
                                    phone = '0' + cleanPhone; // Restaure le zéro
                                }
                                // Si après nettoyage le tel est juste "0" (Cellule vide sur Excel)
                                if (cleanPhone === "0" || phone === "0") phone = "";
                                
                                const rawAddress = (row.ADRESSES || row.ADRESSE || row.Adresses || row.Adresse || '');
                                let finalAddress = this.fixEncoding((rawAddress || '').toString().trim().replace(/\s+/g, ' '));
                                if (finalAddress) {
                                    finalAddress = finalAddress.toLowerCase().replace(/(?:^|\s|-|')\S/g, c => c.toUpperCase());
                                    finalAddress = finalAddress.replace(/(\d{5})([a-zA-Z])/g, '$1 $2');
                                }

                                // On écrase s'il existe déjà dans le CSV pour ne garder que la donnée la plus pertinente
                                uniqueClientsFromCSV.set(fullName.toLowerCase(), { fullName, phone, finalAddress });
                            }

                            // ÉTAPE 2 : Application des changements à la base de données avec nettoyage des doublons existants
                            let batch = writeBatch(db);
                            let opCount = 0;
                            let count = 0;
                            let updatedCount = 0;
                            let deletedDuplicatesCount = 0;

                            this.app.showToast("Mise à jour et nettoyage des doublons...", "success");

                            let processedCount = 0;
                            for (const [lowerName, clientData] of uniqueClientsFromCSV.entries()) {
                                processedCount++;
                                if (importBtn && processedCount % 50 === 0) {
                                    importBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Nettoyage (${processedCount}/${uniqueClientsFromCSV.size})...`;
                                    await new Promise(r => setTimeout(r, 0));
                                }

                                const { fullName, phone, finalAddress } = clientData;

                                // On cherche TOUS les doublons existants dans la base de données pour ce nom
                                const existingDuplicates = this.clients.filter(c => c.nom.toLowerCase() === lowerName);

                                if (existingDuplicates.length > 0) {
                                    // 1. On met à jour le TOUT PREMIER trouvé
                                    const mainClient = existingDuplicates[0];
                                    batch.update(doc(db, "clients", mainClient.id), { tel: phone, adresse: finalAddress });
                                    updatedCount++;
                                    opCount++;

                                    // 2. On SUPPRIME impitoyablement TOUS LES AUTRES doublons avec le même nom !
                                    for (let i = 1; i < existingDuplicates.length; i++) {
                                        batch.delete(doc(db, "clients", existingDuplicates[i].id));
                                        deletedDuplicatesCount++;
                                        opCount++;
                                    }
                                } else {
                                    // 3. CRÉATION
                                    const newClientRef = doc(collection(db, "clients"));
                                    batch.set(newClientRef, {
                                        nom: fullName, tel: phone, adresse: finalAddress,
                                        dateAjout: new Date().toISOString(), agency: activeAgency,
                                        risque: 'low', segment: 'nouveau', taille: 'petit', ca: 0, factures: 0
                                    });
                                    count++;
                                    opCount++;
                                }

                                // Sécurité : On envoie les requêtes par paquets de 400 pour ne pas surcharger Firebase
                                if (opCount >= 400) {
                                    await batch.commit();
                                    batch = writeBatch(db);
                                    opCount = 0;
                                }
                            }

                            if (opCount > 0) await batch.commit();

                            if (count > 0 || updatedCount > 0 || deletedDuplicatesCount > 0) {
                                let msg = `${count} créés, ${updatedCount} mis à jour`;
                                if (deletedDuplicatesCount > 0) msg += ` et ${deletedDuplicatesCount} doublons supprimés`;
                                this.app.showToast(msg + ' !', 'success');
                            } else {
                                this.app.showToast("Aucune donnée valide trouvée dans le fichier.", "error");
                            }
                        } catch (error) {
                            console.error("Erreur d'importation :", error);
                            this.app.showToast("Erreur d'importation : " + error.message, "error");
                        } finally {
                            e.target.value = ''; // Réinitialiser l'input pour permettre un nouvel import
                            
                            // RESTAURATION DU BOUTON
                            if (importBtn) {
                                importBtn.innerHTML = originalBtnHtml;
                                importBtn.disabled = false;
                            }
                        }
                    };
                    
                    if (isCSV) {
                        reader.readAsText(file, 'UTF-8'); // Indispensable pour préserver les accents français !
                    } else {
                        reader.readAsArrayBuffer(file);
                    }
                }
            });
        }

        // --- 1. CHARGEMENT DES CLIENTS ---
        const qClients = query(collection(db, "clients"), where("agency", "==", activeAgency));
        this.unsubClients = onSnapshot(qClients, (snapshot) => {
            this.rawClients = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            this.computeClientStats();
        }, (error) => {
            console.error("Erreur Firestore :", error);
            this.app.showToast("Erreur lors du chargement des clients.", "error");
        });

        // --- 2. CHARGEMENT DES LIVRAISONS (POUR LE CALCUL DYNAMIQUE DU CA) ---
        this.unsubLivraisons = onSnapshot(collection(db, "livraisons"), (snapshot) => {
            this.rawLivraisons = snapshot.docs.map(d => d.data());
            this.computeClientStats();
        }, (error) => {
            console.error("Erreur Firestore (Livraisons) :", error);
        });
    },

    computeClientStats() {
        if (!this.rawClients || !this.rawLivraisons) return; // Attend que les deux requêtes soient terminées
        
        // 1. Agréger les statistiques par expéditeur
        const statsMap = new Map();
        this.rawLivraisons.forEach(liv => {
            if (liv.expediteur && liv.expediteur.trim() !== '') {
                const nom = this.fixEncoding(liv.expediteur.trim()).toUpperCase();
                if (!statsMap.has(nom)) statsMap.set(nom, { ca: 0, factures: 0 });
                const st = statsMap.get(nom);
                st.factures += 1;
                
                // CONVERSION : La base est en CFA. Paris affiche en Euros. (1 € = 656 CFA)
                let amountCFA = parseFloat(String(liv.prixOriginal || liv.montant || '0').replace(/[^\d]/g, '')) || 0;
                let amountEUR = amountCFA / 656;
                st.ca += amountEUR;
            }
        });

        // 2. Fusionner avec la liste des clients
        const clientsList = this.rawClients.map(data => {
            const nom = this.fixEncoding(data.nom || 'Inconnu');
            const stats = statsMap.get(nom.toUpperCase()) || { ca: 0, factures: 0 };
            
            let tel = data.tel || '-';
            let cleanTel = tel.replace(/[\s.-]/g, '');
            if (cleanTel.length === 9 && /^[1-9]/.test(cleanTel)) tel = '0' + cleanTel;

            // Attribution intelligente du segment basée sur l'activité réelle
            let segment = 'dormant';
            if (stats.factures >= 10) segment = 'regulier';
            else if (stats.factures >= 3) segment = 'habituel';
            else if (stats.factures > 0) segment = 'nouveau';
            else segment = data.segment || 'dormant';
            
            return { 
                id: data.id, nom: nom, tel: tel, adresse: this.fixEncoding(data.adresse || '-'),
                date: data.dateAjout ? new Date(data.dateAjout).toLocaleDateString('fr-FR') : '-', 
                risque: data.risque || 'low', segment: segment, ca: stats.ca, factures: stats.factures 
            };
        });
        
        clientsList.sort((a, b) => b.ca - a.ca);
        this.clients = clientsList;
        this.applyFilters();
    },

    applyFilters() {
        const term = (document.getElementById('clSearchInput')?.value || '').toLowerCase().trim();
        const risk = document.getElementById('clRiskFilter')?.value || '';
        const segment = document.getElementById('clSegmentFilter')?.value || '';

        this.filteredClients = this.clients.filter(c => {
            if (term && !c.nom.toLowerCase().includes(term) && !c.tel.includes(term)) return false;
            if (risk && c.risque !== risk) return false;
            if (segment && c.segment !== segment) return false;
            return true;
        });

        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('clTableBody');
        if (!tbody) return;

        // MAJ KPIs List View
        const kpiTotal = document.getElementById('kpiTotal');
        const kpiActifs = document.getElementById('kpiActifs');
        const listCount = document.getElementById('clListCount');
        
        if (kpiTotal) kpiTotal.textContent = this.clients.length;
        if (kpiActifs) kpiActifs.textContent = this.clients.filter(c => c.ca > 0).length;
        
        const top100 = this.filteredClients.slice(0, 100);
        if (listCount) listCount.textContent = `${top100.length} affichés sur ${this.filteredClients.length}`;

        if (top100.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">Aucun client ne correspond à votre recherche.</td></tr>';
            return;
        }

        tbody.innerHTML = top100.map(c => `
            <tr class="clickable-row" onclick="window.app.views.clientsList.showDetail('${c.id}')">
                <td style="padding: 15px; font-weight: 700; color: #0f172a;">${c.nom}</td>
                <td style="color: #64748b;">${c.tel}</td>
                <td style="color: #64748b;">${c.date}</td>
                <td><span class="badge" style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 12px; font-weight: 600;">${c.risque}</span></td>
                <td><span class="badge" style="background: ${c.segment === 'regulier' ? '#e0f2fe' : '#f3e8ff'}; color: ${c.segment === 'regulier' ? '#0369a1' : '#7e22ce'}; padding: 4px 10px; border-radius: 12px; font-weight: 600;">${c.segment}</span></td>
                <td style="text-align: right; font-weight: 700; font-family: monospace; font-size: 14px;">${this.app.formatMoney(c.ca)}</td>
                <td style="text-align: right; font-weight: 600; color: #475569;">${c.factures}</td>
                <td style="text-align: center;"><button class="btn-small" style="background: transparent; border: none; font-size: 16px; cursor: pointer;">👉</button></td>
            </tr>
        `).join('');
    },

    async showDetail(clientId) {
        const client = this.clients.find(c => c.id === clientId);
        if (!client) return;

        document.getElementById('clientsListView').style.display = 'none';
        const detailView = document.getElementById('clientDetailView');
        detailView.style.display = 'block';
        detailView.innerHTML = '<div style="text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-2x"></i> Collecte des données...</div>';

        // Récupération des transactions récentes
        const qTrans = query(collection(db, "transactions"), where("nom", "==", client.nom), orderBy("date", "desc"), limit(5));
        const transSnap = await getDocs(qTrans);
        const factures = transSnap.docs.map(d => d.data());

        // LOGIQUE ABIDJAN -> PARIS : On récupère TOUT l'historique pour extraire les destinataires
        const qLiv = query(collection(db, "livraisons"), where("expediteur", "==", client.nom), orderBy("dateAjout", "desc"));
        const livSnap = await getDocs(qLiv);
        const colisTous = livSnap.docs.map(d => d.data());
        
        const colis = colisTous.slice(0, 5); // On garde les 5 derniers pour le petit tableau

        // Extraction dynamique du "Carnet d'adresses" (Destinataires uniques) sans doublons
        const destinatairesMap = new Map();
        colisTous.forEach(c => {
            if (c.destinataire && c.destinataire.trim() !== '') {
                const nomDest = this.fixEncoding(c.destinataire.trim());
                if (!destinatairesMap.has(nomDest)) destinatairesMap.set(nomDest, 0);
                destinatairesMap.set(nomDest, destinatairesMap.get(nomDest) + 1);
            }
        });
        const carnetAdresses = Array.from(destinatairesMap.entries()).sort((a, b) => b[1] - a[1]); // Trié par fréquence

        const panierMoyen = client.factures > 0 ? (client.ca / client.factures) : 0;

        const html = `
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                <button onclick="document.getElementById('clientDetailView').style.display='none'; document.getElementById('clientsListView').style.display='block';" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Retour à la liste</button>
                <h1 style="margin:0; font-size:24px;">Détail client</h1>
            </div>
            
            <div class="cd-header">
                <div class="cd-header__content">
                    <div class="cd-header__icon">👤</div>
                    <div>
                        <h1 class="cd-header__title">${client.nom}</h1>
                        <p class="cd-header__subtitle">${client.tel} — ${client.adresse}</p>
                    </div>
                </div>
                <button class="btn btn-outline" onclick="window.app.views.clientsList.openEditClientModal('${client.id}')">
                    <i class="fas fa-edit"></i> Modifier
                </button>
            </div>

            <div class="cd-pills">
                <div class="cd-pill cd-pill--success" style="background:#dcfce7; color:#166534;">Segment : ${client.segment.toUpperCase()}</div>
                <div class="cd-pill cd-pill--success" style="background:#dcfce7; color:#166534;">Risque : ${client.risque.toUpperCase()}</div>
            </div>

            <div class="cd-kpi-grid">
                <div class="cd-kpi cd-kpi--blue"><div class="cd-kpi__icon" style="background:#eff6ff; color:#3b82f6;">💰</div><div><div class="cd-kpi__label">CA Global</div><div class="cd-kpi__value">${this.app.formatMoney(client.ca)}</div><div class="cd-kpi__hint">Total généré</div></div></div>
                <div class="cd-kpi cd-kpi--purple"><div class="cd-kpi__icon" style="background:#f5f3ff; color:#8b5cf6;">📄</div><div><div class="cd-kpi__label">Expéditions</div><div class="cd-kpi__value">${client.factures}</div><div class="cd-kpi__hint">Volume d'activité</div></div></div>
                <div class="cd-kpi cd-kpi--orange"><div class="cd-kpi__icon" style="background:#fff7ed; color:#f97316;">🧮</div><div><div class="cd-kpi__label">Panier moyen</div><div class="cd-kpi__value">${this.app.formatMoney(panierMoyen)}</div><div class="cd-kpi__hint">Moyenne par envoi</div></div></div>
                <div class="cd-kpi cd-kpi--slate"><div class="cd-kpi__icon" style="background:#f8fafc; color:#64748b;">📅</div><div><div class="cd-kpi__label">Dernière activité</div><div class="cd-kpi__value">${client.date}</div><div class="cd-kpi__hint">Date d'ajout / modif</div></div></div>
            </div>

            <div class="cd-tables-row">
                <div class="cd-table-card">
                    <h2 class="cd-table-card__title">🧾 Dernières Factures (Caisse)</h2>
                    <table class="data-table" style="width:100%;">
                        <thead><tr><th>Réf</th><th>Date</th><th style="text-align:right;">Montant</th></tr></thead>
                        <tbody>${factures.length === 0 ? '<tr><td colspan="3">Aucune facture</td></tr>' : factures.map(f => `<tr><td><b>${f.reference}</b></td><td>${f.date}</td><td style="text-align:right; font-weight:bold;">${this.app.formatMoney((f.prix || 0) / 656)}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
                <div class="cd-table-card">
                    <h2 class="cd-table-card__title">📦 Derniers Colis (Départ)</h2>
                    <table class="data-table" style="width:100%;">
                        <thead><tr><th>Réf</th><th>Date</th><th>Statut</th></tr></thead>
                        <tbody>${colis.length === 0 ? '<tr><td colspan="3">Aucun colis</td></tr>' : colis.map(c => `<tr><td><b>${c.ref}</b></td><td>${c.dateAjout ? new Date(c.dateAjout).toLocaleDateString('fr-FR') : '-'}</td><td><span class="badge" style="background:#f1f5f9; color:#475569;">${c.containerStatus}</span></td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>

            <!-- NOUVEAU : CARNET D'ADRESSES (DESTINATAIRES ABIDJAN) -->
            <div class="cd-table-card" style="margin-top: 20px;">
                <h2 class="cd-table-card__title" style="margin-bottom: 15px;"><i class="fas fa-address-book" style="color: #f59e0b;"></i> Carnet d'adresses (Destinataires Abidjan)</h2>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    ${carnetAdresses.length === 0 ? '<p style="color:#64748b; font-style: italic;">Aucun destinataire enregistré pour le moment.</p>' : carnetAdresses.map(([nom, count]) => `
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 15px; border-radius: 12px; display: flex; align-items: center; gap: 12px; min-width: 200px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                            <div style="background: #ffedd5; color: #ea580c; width: 36px; height: 36px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: 800; font-size: 16px;">
                                ${nom.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${nom}</div>
                                <div style="font-size: 11px; color: #64748b; font-weight: 600;">${count} colis envoyé(s)</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        detailView.innerHTML = html;
    },

    openEditClientModal(clientId) {
        const client = this.clients.find(c => c.id === clientId);
        if (!client) return;
        document.getElementById('editClientId').value = client.id;
        document.getElementById('editClientNom').value = client.nom;
        document.getElementById('editClientTel').value = client.tel;
        document.getElementById('editClientAdresse').value = client.adresse;
        document.getElementById('editClientModal').style.display = 'flex';
    },

    async saveClientEdit() {
        const id = document.getElementById('editClientId').value;
        const newNom = document.getElementById('editClientNom').value.trim();
        const newTel = document.getElementById('editClientTel').value.trim();
        const newAdresse = document.getElementById('editClientAdresse').value.trim();

        if (!id || !newNom) {
            this.app.showToast("Le nom est obligatoire.", "error");
            return;
        }

        try {
            const client = this.clients.find(c => c.id === id);
            const oldNom = client ? client.nom : '';

            // 1. Mise à jour de la fiche client
            await updateDoc(doc(db, "clients", id), { nom: newNom, tel: newTel, adresse: newAdresse });

            // 2. PROPAGATION : Si le nom change, on met à jour tous ses anciens colis et factures !
            if (oldNom && oldNom.toLowerCase() !== newNom.toLowerCase()) {
                const batch = writeBatch(db);
                let hasUpdates = false;

                // A. Livraisons
                const snapLiv = await getDocs(query(collection(db, "livraisons"), where("expediteur", "==", oldNom)));
                snapLiv.forEach(d => { batch.update(d.ref, { expediteur: newNom }); hasUpdates = true; });

                // B. Transactions (Caisse)
                const snapTrans = await getDocs(query(collection(db, "transactions"), where("nom", "==", oldNom)));
                snapTrans.forEach(d => { batch.update(d.ref, { nom: newNom }); hasUpdates = true; });

                if (hasUpdates) await batch.commit();
            }

            document.getElementById('editClientModal').style.display = 'none';
            this.app.showToast("Client mis à jour avec succès !", "success");
            
            // Rafraîchir instantanément la fiche client
            if (client) { client.nom = newNom; client.tel = newTel; client.adresse = newAdresse; }
            this.showDetail(id);

        } catch (error) {
            console.error(error);
            this.app.showToast("Erreur lors de la modification : " + error.message, "error");
        }
    }
};