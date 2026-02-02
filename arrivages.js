document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const parisManifestCollection = db.collection("paris_manifest");

    // --- LOGIQUE DES ONGLETS ---
    const tabs = document.querySelectorAll('.sub-nav a');
    const panels = document.querySelectorAll('.tab-panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = tab.getAttribute('href');
            const targetPanel = document.querySelector(targetId);
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    // --- ÉLÉMENTS ABIDJAN ---
    const addArrivalBtn = document.getElementById('addArrivalBtn');
    const arrivalDate = document.getElementById('arrivalDate');
    const arrivalRef = document.getElementById('arrivalRef');
    const arrivalNom = document.getElementById('arrivalNom');
    const arrivalConteneur = document.getElementById('arrivalConteneur');
    const arrivalPrix = document.getElementById('arrivalPrix');
    const arrivalMontantParis = document.getElementById('arrivalMontantParis');
    const arrivalMontantAbidjan = document.getElementById('arrivalMontantAbidjan');
    
    const uploadCsvBtn = document.getElementById('uploadCsvBtn');
    const csvFile = document.getElementById('csvFile');
    const uploadLog = document.getElementById('uploadLog');
    const syncParisBtn = document.getElementById('syncParisBtn');
    
    const arrivalsTableBody = document.getElementById('arrivalsTableBody');
    const abidjanSearchInput = document.getElementById('abidjanSearch');
    const abidjanCountEl = document.getElementById('abidjanCount'); 

    // --- ÉLÉMENTS PARIS ---
    const addParisBtn = document.getElementById('addParisBtn');
    const parisDate = document.getElementById('parisDate');
    const parisRef = document.getElementById('parisRef');
    const parisNom = document.getElementById('parisNom');
    
    const parisTableBody = document.getElementById('parisTableBody');
    const uploadParisCsvBtn = document.getElementById('uploadParisCsvBtn');
    const parisCsvFile = document.getElementById('parisCsvFile');
    const parisUploadLog = document.getElementById('parisUploadLog');
    const parisCountEl = document.getElementById('parisCount'); 
    const parisSearchInput = document.getElementById('parisSearch');

    let allArrivals = [];
    let allParisManifest = [];

    // ====================================================
    // PANNEAU 1 : LOGIQUE DE RÉCEPTION ABIDJAN
    // ====================================================

    // 1. Auto-remplissage du Nom
    if (arrivalRef) {
        arrivalRef.addEventListener('blur', async () => { 
            const refValue = arrivalRef.value.trim();
            if (!refValue) return;

            const checkTrans = await transactionsCollection.where("reference", "==", refValue).get();
            if (!checkTrans.empty) {
                alert("Attention : Cette référence existe DÉJÀ dans l'historique.");
                arrivalNom.value = checkTrans.docs[0].data().nom;
                return;
            }

            const query = await parisManifestCollection
                                    .where("reference", "==", refValue)
                                    .where("status", "==", "pending")
                                    .get();
            
            if (!query.empty) {
                const manifestData = query.docs[0].data();
                arrivalNom.value = manifestData.nomClient;
                arrivalNom.style.backgroundColor = "#e0f7fa"; 
                
                if (manifestData.prixCFA) {
                    arrivalPrix.value = manifestData.prixCFA;
                    arrivalPrix.style.backgroundColor = "#e0f7fa";
                }
                if (manifestData.montantParisCFA) {
                    arrivalMontantParis.value = manifestData.montantParisCFA;
                    arrivalMontantParis.style.backgroundColor = "#e0f7fa";
                }
                // On stocke la date de départ cachée pour le calcul du délai
                arrivalRef.dataset.dateParis = manifestData.dateParis || "";
            }
        });
    }

    // 2. Ajout manuel
    if (addArrivalBtn) {
        addArrivalBtn.addEventListener('click', async () => {
            const prix = parseFloat(arrivalPrix.value) || 0;
            const montantParis = parseFloat(arrivalMontantParis.value) || 0;
            const montantAbidjan = parseFloat(arrivalMontantAbidjan.value) || 0;
            const reste = (montantParis + montantAbidjan) - prix;

            const data = {
                date: arrivalDate.value, reference: arrivalRef.value.trim(), nom: arrivalNom.value.trim(),
                conteneur: arrivalConteneur.value.trim().toUpperCase(), prix: prix,
                montantParis: montantParis, montantAbidjan: montantAbidjan, reste: reste,
                isDeleted: false, agent: '', agentMobileMoney: '', commune: '',
                dateParis: arrivalRef.dataset.dateParis || "" // Ajout de la date de départ
            };

            if (!data.date || !data.reference || !data.nom || !data.conteneur || data.prix <= 0) {
                return alert("Veuillez remplir Date, Conteneur, Référence, Nom et Prix.");
            }
            
            const check = await transactionsCollection.where("reference", "==", data.reference).get();
            if (!check.empty) return alert("Référence déjà existante.");

            transactionsCollection.add(data).then(() => {
                alert("Colis ajouté !");
                removeFromParisManifest(data.reference); 
                arrivalRef.value = ''; arrivalNom.value = ''; arrivalPrix.value = '';
                arrivalRef.dataset.dateParis = ''; // Reset
                arrivalMontantParis.value = ''; arrivalMontantAbidjan.value = '';
                arrivalNom.style.backgroundColor = ""; arrivalPrix.style.backgroundColor = ""; arrivalMontantParis.style.backgroundColor = "";
                arrivalRef.focus();
            }).catch(err => console.error(err));
        });
    }

    // 3. Ajout en masse CSV (Abidjan - 5 colonnes)
    if (uploadCsvBtn) {
        uploadCsvBtn.addEventListener('click', () => {
            const commonDate = arrivalDate.value;
            const commonConteneur = arrivalConteneur.value.trim().toUpperCase();
            
            if (!commonDate || !commonConteneur) return alert("Remplissez Date et Conteneur en haut.");
            if (!csvFile.files.length) return alert("Sélectionnez un fichier.");
            
            uploadLog.style.display = 'block'; uploadLog.textContent = 'Lecture...';

            Papa.parse(csvFile.files[0], {
                header: true, skipEmptyLines: true, delimiter: ",",
                complete: async (results) => {
                    const rows = results.data;
                    const batch = db.batch();
                    let count = 0; let log = "";
                    const refsToRemove = [];

                    for (const row of rows) {
                        // NOUVELLE LOGIQUE CSV ABIDJAN : reference, restant, expéditeur, adresse, destinataire, description
                        const ref = (row.reference || row.Reference || '').trim();
                        const restant = parseFloat(row.restant || row.Restant || 0);
                        let nom = (row['expéditeur'] || row['Expéditeur'] || row.nom || '').trim();
                        const addr = (row.adresse || row.Adresse || row.adresseDestinataire || '').trim();
                        const dest = (row.destinataire || row.Destinataire || '').trim();
                        const desc = (row.description || row.Description || '').trim();

                        if (!ref) {
                            log += `\nIgnoré (Données): ${ref}`; continue;
                        }

                        let prix = parseFloat(row.prix || 0);

                        // RECUPERATION DONNEES PARIS (Si Nom manquant OU Prix manquant pour un colis soldé)
                        let manifestData = null;
                        if (!nom || (restant === 0 && prix === 0)) {
                            const q = await parisManifestCollection.where("reference", "==", ref).get();
                            if (!q.empty) manifestData = q.docs[0].data();
                        }

                        if (manifestData) {
                            if (!nom) nom = manifestData.nomClient;
                            // Si payé (restant 0) et prix inconnu, on récupère le prix de Paris
                            if (restant === 0 && prix === 0 && manifestData.prixCFA) {
                                prix = manifestData.prixCFA;
                            }
                        }

                        // Logique Prix/Reste :
                        if (prix === 0 && restant > 0) prix = restant; 
                        
                        // LOGIQUE FINANCIÈRE :
                        // Si Restant = 0, on considère que c'est payé à Paris (Pré-payé)
                        let mParis = 0;
                        if (restant === 0 && prix > 0) {
                            mParis = prix;
                        } else if (prix > restant) {
                            // Si le prix est supérieur au reste, la différence a été payée (Paris)
                            mParis = prix - restant;
                        }

                        const check = await transactionsCollection.where("reference", "==", ref).get();
                        if (!check.empty) { log += `\nDoublon: ${ref}`; continue; }

                        const docRef = transactionsCollection.doc();
                        batch.set(docRef, {
                            date: commonDate, reference: ref, nom: nom || "", conteneur: commonConteneur,
                            prix: prix, montantParis: mParis, montantAbidjan: 0, 
                            reste: mParis - prix, isDeleted: false, agent: '', agentMobileMoney: '', commune: '',
                            description: desc, adresseDestinataire: addr, nomDestinataire: dest
                        });
                        refsToRemove.push(ref);
                        count++;
                    }
                    if (count > 0) {
                        await batch.commit();
                        refsToRemove.forEach(r => removeFromParisManifest(r));
                        uploadLog.textContent = `Succès: ${count} ajoutés.\n${log}`;
                    } else {
                        uploadLog.textContent = `Aucun ajout.\n${log}`;
                    }
                    csvFile.value = '';
                }
            });
        });
    }
    
    // 4. Synchronisation
    if (syncParisBtn) {
        syncParisBtn.addEventListener('click', async () => {
            if (!confirm("Lancer la synchronisation ?")) return;
            const originalText = syncParisBtn.textContent;
            syncParisBtn.disabled = true; syncParisBtn.textContent = "Analyse...";
            
            try {
                const parisSnap = await parisManifestCollection.get();
                if (parisSnap.empty) { alert("Manifeste vide."); return; }

                const batch = db.batch();
                let updated = 0, cleaned = 0, bCount = 0;

                for (const docP of parisSnap.docs) {
                    const pData = docP.data();
                    const ref = pData.reference.trim();
                    const transSnap = await transactionsCollection.where("reference", "==", ref).get();

                    if (!transSnap.empty) {
                        const docT = transSnap.docs[0];
                        const tData = docT.data();
                        const updates = {};

                        // On complète les infos manquantes depuis Paris (Nom, Adresse, Description)
                        if (!tData.nom || tData.nom.trim() === "") updates.nom = pData.nomClient;
                        if (!tData.adresseDestinataire && pData.adresseDestinataire) updates.adresseDestinataire = pData.adresseDestinataire;
                        if ((!tData.description && !tData.article) && pData.typeColis) updates.description = pData.typeColis;
                        if (!tData.dateParis && pData.dateParis) updates.dateParis = pData.dateParis; // Récupération date départ

                        if (Object.keys(updates).length > 0) { batch.update(docT.ref, updates); updated++; bCount++; }
                        
                        batch.delete(docP.ref);
                        cleaned++; bCount++;
                        if (bCount >= 400) { await batch.commit(); bCount = 0; }
                    }
                }
                if (bCount > 0) await batch.commit();
                alert(`Terminé !\nNoms mis à jour: ${updated}\nColis nettoyés: ${cleaned}`);
            } catch (e) { console.error(e); alert("Erreur sync."); } 
            finally { syncParisBtn.disabled = false; syncParisBtn.textContent = originalText; }
        });
    }

    // --- AFFICHAGE ABIDJAN ---
    // On récupère tout (pour avoir le total)
    transactionsCollection.orderBy("date", "desc").onSnapshot(snapshot => {
        allArrivals = snapshot.docs.map(doc => doc.data());
        renderAbidjanTable();
    }, error => console.error(error));

    function renderAbidjanTable() {
        const term = abidjanSearchInput ? abidjanSearchInput.value.toLowerCase().trim() : "";
        
        const filtered = allArrivals.filter(item => {
            if (!term) return true;
            return (item.reference || "").toLowerCase().includes(term) ||
                   (item.nom || "").toLowerCase().includes(term) ||
                   (item.conteneur || "").toLowerCase().includes(term);
        });

        // Mise à jour du compteur (Affiche le nombre total trouvé)
        if (abidjanCountEl) abidjanCountEl.textContent = filtered.length;

        // === OPTIMISATION : On ne prend que les 50 premiers pour l'affichage ===
        const toShow = filtered.slice(0, 50);

        arrivalsTableBody.innerHTML = '';
        if (toShow.length === 0) {
            arrivalsTableBody.innerHTML = '<tr><td colspan="6">Aucun résultat.</td></tr>';
            return;
        }
        toShow.forEach(item => {
            const row = document.createElement('tr');
            // NOUVELLE LOGIQUE COLONNES : Reference, Restant, Expéditeur, Destinataire, Adresse, Description
            // Si Restant == 0, c'est probablement payé à Paris (Vert)
            const description = item.description || item.article || item.typeColis || item.conteneur || '';
            const adresse = item.adresseDestinataire || item.commune || '';
            const destinataire = item.nomDestinataire || '';
            const isPaid = (item.reste || 0) === 0; // Si 0 pile, c'est payé (vert). Si négatif, c'est une dette (rouge).

            row.innerHTML = `
                <td>${item.date}</td>
                <td>${item.conteneur}</td>
                <td>${item.reference}</td>
                <td style="font-weight:bold; color:${isPaid ? '#28a745' : ((item.reste||0) < 0 ? '#dc3545' : '#28a745')}">${formatCFA(item.reste)}</td>
                <td>${item.nom}</td>
                <td>${destinataire}</td>
                <td>${adresse}</td>
                <td>${description}</td>
            `;
            arrivalsTableBody.appendChild(row);
        });
    }
    if(abidjanSearchInput) abidjanSearchInput.addEventListener('input', renderAbidjanTable);


    // ====================================================
    // PANNEAU 2 : LOGIQUE DÉPART PARIS
    // ====================================================

    // 1. Ajout manuel Paris
    if (addParisBtn) {
        addParisBtn.addEventListener('click', async () => {
            const data = {
                dateParis: parisDate.value, reference: parisRef.value.trim(), nomClient: parisNom.value.trim(),
                status: "pending", dateArrivee: "", conteneurArrivee: ""
            };
            if (!data.dateParis || !data.reference || !data.nomClient) return alert("Champs manquants.");
            const check = await parisManifestCollection.where("reference", "==", data.reference).get();
            if (!check.empty) return alert("Déjà dans le manifeste.");
            parisManifestCollection.add(data).then(() => { parisRef.value = ''; parisNom.value = ''; parisRef.focus(); });
        });
    }

    
    // 2. Import CSV Paris (Fichier Complet)
    if (uploadParisCsvBtn) {
        uploadParisCsvBtn.addEventListener('click', () => {
            if (!parisCsvFile.files.length) return alert("Sélectionnez un fichier.");
            parisUploadLog.style.display = 'block'; parisUploadLog.textContent = 'Lecture...';

            Papa.parse(parisCsvFile.files[0], {
                header: true, skipEmptyLines: true, delimiter: ",", // Virgule
                complete: async (results) => {
                    const rows = results.data;
                    const batch = db.batch();
                    let count = 0, log = "";
                    const TAUX = 655.957;

                    for (const row of rows) {
                        // NOUVELLE LOGIQUE CSV PARIS : DATE DU TRANSFERT, REFERENCE, EXPEDITEUR, PRIX, DESTINATEUR
                        const date = row["DATE DU TRANSFERT"];
                        const ref = row["REFERENCE"]?.trim();
                        const exp = row["EXPEDITEUR"]?.trim();
                        if (!ref) { log += `\nIgnoré (Ref manquante)`; continue; }

                        const check = await parisManifestCollection.where("reference", "==", ref).get();
                        if (!check.empty) { log += `\nIgnoré (Existe): ${ref}`; continue; }

                        const prixE = parseFloat((row["PRIX"]||"0").replace(',','.'));
                        const payeE = parseFloat((row["MONTANT PAYER"]||"0").replace(',','.'));
                        const resteE = parseFloat((row["RENSTANT A PAYER"]||row["RESTANT A PAYER"]||"0").replace(',','.'));
                        const dest = row["DESTINATEUR"]?.trim() || "";
                        const typeColis = row["TYPE COLIS"]?.trim() || "";
                        const adresse = row["ADRESSES"]?.trim() || "";
                        const qte = parseInt(row["QUANTITE"]) || 1;
                        
                        const docRef = parisManifestCollection.doc();
                        batch.set(docRef, {
                            dateParis: date, reference: ref, nomClient: exp,
                            nomDestinataire: dest, adresseDestinataire: adresse, typeColis: typeColis, quantite: qte,
                            prixOriginalEuro: prixE, prixCFA: Math.round(prixE * TAUX), montantParisCFA: Math.round(payeE * TAUX), resteOriginalEuro: resteE,
                            status: "pending", dateArrivee: "", conteneurArrivee: ""
                        });
                        count++;
                    }
                    if (count > 0) await batch.commit();
                    parisUploadLog.textContent = `Succès: ${count} ajoutés.\n${log}`;
                    parisCsvFile.value = '';
                }
            });
        });
    }

    // 3. Affichage Paris
    parisManifestCollection.where("status", "==", "pending").orderBy("dateParis", "desc").onSnapshot(snap => {
        allParisManifest = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderParisTable();
    });

    function renderParisTable() {
        const term = parisSearchInput ? parisSearchInput.value.toLowerCase().trim() : "";
        const filtered = allParisManifest.filter(i => {
            if (!term) return true;
            return (i.reference||"").toLowerCase().includes(term) || (i.nomClient||"").toLowerCase().includes(term);
        });

        if (parisCountEl) parisCountEl.textContent = filtered.length;
        
        // === OPTIMISATION : On ne prend que les 50 premiers ===
        const toShow = filtered.slice(0, 50);
        
        parisTableBody.innerHTML = '';
        if (toShow.length === 0) { parisTableBody.innerHTML = '<tr><td colspan="5">Aucun colis.</td></tr>'; return; }
        
        toShow.forEach(i => {
            // NOUVELLE LOGIQUE COLONNES : Date, Ref, Expéditeur, Prix, Destinateur
            parisTableBody.innerHTML += `<tr>
                <td>${i.dateParis}</td>
                <td>${i.reference}</td>
                <td>${i.nomClient}</td>
                <td>${formatCFA(i.prixCFA)}</td>
                <td>${i.nomDestinataire || '-'}</td>
                <td><button class="deleteBtn" data-id="${i.id}">Annuler</button></td>
            </tr>`;
        });
    }
    if(parisSearchInput) parisSearchInput.addEventListener('input', renderParisTable);

    // Suppression
    if (parisTableBody) {
        parisTableBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('deleteBtn')) {
                if(confirm("Supprimer du manifeste ?")) parisManifestCollection.doc(e.target.dataset.id).delete();
            }
        });
    }

    async function removeFromParisManifest(ref) {
        const q = await parisManifestCollection.where("reference", "==", ref).get();
        if (!q.empty) await q.docs[0].ref.delete();
    }

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});