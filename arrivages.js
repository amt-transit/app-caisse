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

            const query = await parisManifestCollection.where("reference", "==", refValue).get();
            
            if (!query.empty) {
                const manifestData = query.docs[0].data();
                arrivalNom.value = manifestData.nomClient;
                arrivalNom.style.backgroundColor = "#e0f7fa"; 
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
                isDeleted: false, agent: '', agentMobileMoney: '', commune: ''
            };

            if (!data.date || !data.reference || !data.nom || !data.conteneur || data.prix <= 0) {
                return alert("Champs manquants.");
            }
            
            const check = await transactionsCollection.where("reference", "==", data.reference).get();
            if (!check.empty) return alert("Référence déjà existante.");

            transactionsCollection.add(data).then(() => {
                alert("Colis ajouté !");
                removeFromParisManifest(data.reference); // Nettoyage du manifeste
                
                arrivalRef.value = ''; arrivalNom.value = ''; arrivalPrix.value = '';
                arrivalMontantParis.value = ''; arrivalMontantAbidjan.value = '';
                arrivalNom.style.backgroundColor = ""; arrivalRef.focus();
            }).catch(err => console.error(err));
        });
    }

    // 3. Ajout en masse CSV (5 colonnes + Nom intelligent)
    if (uploadCsvBtn) {
        uploadCsvBtn.addEventListener('click', () => {
            const commonDate = arrivalDate.value;
            const commonConteneur = arrivalConteneur.value.trim().toUpperCase();
            
            if (!commonDate || !commonConteneur) {
                return alert("Veuillez d'abord remplir les champs 'Date' et 'Conteneur' en haut de la page.");
            }
            if (!csvFile.files.length) return alert("Sélectionnez un fichier.");
            
            uploadLog.style.display = 'block'; uploadLog.textContent = 'Lecture...';

            Papa.parse(csvFile.files[0], {
                header: true, skipEmptyLines: true,
                complete: async (results) => {
                    const rows = results.data;
                    uploadLog.textContent += `\n${rows.length} lignes trouvées... Traitement...`;

                    const batch = db.batch();
                    let count = 0;
                    let skippedEntriesLog = "";
                    
                    const refsToRemoveFromParis = []; // Liste pour nettoyage

                    for (const row of rows) {
                        const ref = row.reference ? row.reference.trim() : '';
                        let nom = row.nom ? row.nom.trim() : ''; 
                        const prix = parseFloat(row.prix) || 0;
                        const mParis = parseFloat(row.montantParis)||0; 
                        const mAbidjan = parseFloat(row.montantAbidjan)||0;

                        // Validation minimale (REF et PRIX obligatoires)
                        if (!ref || prix <= 0) {
                            skippedEntriesLog += `\nIgnoré (Données): ${ref} (Prix invalide ou Réf manquante)`;
                            continue;
                        }

                        // RECHERCHE NOM INTELLIGENTE
                        // Si le nom est vide dans le CSV, on le cherche dans Paris
                        if (!nom) {
                            const manifestQuery = await parisManifestCollection.where("reference", "==", ref).get();
                            if (!manifestQuery.empty) {
                                nom = manifestQuery.docs[0].data().nomClient; // Trouvé !
                            }
                            // Si toujours vide, on continue quand même (nom = "")
                        }

                        // Doublon
                        const check = await transactionsCollection.where("reference", "==", ref).get();
                        if (!check.empty) {
                            skippedEntriesLog += `\nIgnoré (Existe déjà): ${ref}`;
                            continue;
                        }

                        // Ajout
                        const docRef = transactionsCollection.doc();
                        batch.set(docRef, {
                            date: commonDate, reference: ref, nom: nom, conteneur: commonConteneur,
                            prix: prix, montantParis: mParis, montantAbidjan: mAbidjan,
                            reste: (mParis + mAbidjan) - prix, isDeleted: false, agent: '', agentMobileMoney: '', commune: ''
                        });
                        
                        refsToRemoveFromParis.push(ref);
                        count++;
                    }

                    if (count > 0) {
                        await batch.commit();
                        // Nettoyage après succès
                        refsToRemoveFromParis.forEach(ref => removeFromParisManifest(ref));
                        uploadLog.textContent += `\n🎉 SUCCÈS : ${count} colis ajoutés !`;
                    } else {
                        uploadLog.textContent += `\nRésultat : Aucun nouveau colis à ajouter.`;
                    }
                    
                    if (skippedEntriesLog) uploadLog.textContent += `\n--- Journal ---${skippedEntriesLog}`;
                    
                    csvFile.value = '';
                }
            });
        });
    }
    
    // 4. SYNCHRONISATION MANUELLE (Version Débogage)
    if (syncParisBtn) {
        syncParisBtn.addEventListener('click', async () => {
            if (!confirm("Lancer la synchronisation ?")) return;
            
            const originalText = syncParisBtn.textContent;
            syncParisBtn.disabled = true; 
            syncParisBtn.textContent = "Récupération du manifeste...";
            
            try {
                // 1. Récupérer tout le manifeste Paris
                const parisSnap = await parisManifestCollection.get();
                
                if (parisSnap.empty) {
                    alert("Le manifeste 'Départ Paris' est VIDE. Rien à synchroniser.");
                    return;
                }

                console.log(`Manifeste Paris : ${parisSnap.size} colis trouvés.`);
                syncParisBtn.textContent = `Analyse de ${parisSnap.size} colis...`;

                const batch = db.batch();
                let updatedCount = 0;
                let cleanedCount = 0;
                let batchCount = 0;

                // 2. Parcourir chaque colis de Paris
                for (const docParis of parisSnap.docs) {
                    const pData = docParis.data();
                    const refParis = pData.reference;
                    const nomParis = pData.nomClient;

                    // Nettoyage pour comparaison
                    const cleanRef = refParis.trim();

                    // 3. Chercher si ce colis existe dans les Transactions (Reçus)
                    const transSnap = await transactionsCollection.where("reference", "==", cleanRef).get();

                    if (!transSnap.empty) {
                        // LE COLIS EST DÉJÀ REÇU !
                        const docTrans = transSnap.docs[0];
                        const tData = docTrans.data();

                        console.log(`Trouvé : ${cleanRef} (Reçu). Vérification du nom...`);

                        // A. Mise à jour du nom si manquant
                        if (!tData.nom || tData.nom.trim() === "") {
                            console.log(` -> Nom manquant. Ajout de : ${nomParis}`);
                            batch.update(docTrans.ref, { nom: nomParis });
                            updatedCount++;
                            batchCount++;
                        }

                        // B. Suppression du manifeste Paris
                        console.log(` -> Suppression du manifeste Paris.`);
                        batch.delete(docParis.ref);
                        cleanedCount++;
                        batchCount++;

                        // Gestion limite batch
                        if (batchCount >= 400) {
                            await batch.commit();
                            batchCount = 0;
                            // Note : idéalement recréer batch, ici on simplifie pour le debug
                        }
                    }
                }

                // 4. Valider les changements restants
                if (batchCount > 0) {
                    await batch.commit();
                }

                alert(`Synchronisation terminée !\n\n- Colis analysés : ${parisSnap.size}\n- Noms mis à jour : ${updatedCount}\n- Colis nettoyés du manifeste : ${cleanedCount}`);

            } catch (err) {
                console.error("Erreur sync :", err);
                alert(`Une erreur est survenue : ${err.message}`);
            } finally {
                syncParisBtn.disabled = false;
                syncParisBtn.textContent = originalText;
            }
        });
    }

    // 5. AFFICHAGE ABIDJAN
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

        if (abidjanCountEl) abidjanCountEl.textContent = filtered.length;
        const toShow = term ? filtered : filtered.slice(0, 20);

        arrivalsTableBody.innerHTML = '';
        if (toShow.length === 0) {
            arrivalsTableBody.innerHTML = '<tr><td colspan="6">Aucun résultat.</td></tr>';
            return;
        }
        toShow.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.date}</td><td>${item.reference}</td><td>${item.nom}</td>
                <td>${item.conteneur}</td><td>${formatCFA(item.prix)}</td>
                <td class="${(item.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(item.reste)}</td>
            `;
            arrivalsTableBody.appendChild(row);
        });
    }
    if(abidjanSearchInput) abidjanSearchInput.addEventListener('input', renderAbidjanTable);


    // ====================================================
    // PANNEAU 2 : LOGIQUE DÉPART PARIS
    // ====================================================

    // Ajout manuel Paris
    if (addParisBtn) {
        addParisBtn.addEventListener('click', async () => {
            const data = {
                dateParis: parisDate.value, reference: parisRef.value.trim(), nomClient: parisNom.value.trim(),
                status: "pending", dateArrivee: "", conteneurArrivee: ""
            };
            if (!data.dateParis || !data.reference || !data.nomClient) return alert("Champs manquants.");
            
            const check = await parisManifestCollection.where("reference", "==", data.reference).get();
            if (!check.empty) return alert("Déjà dans le manifeste.");
            
            parisManifestCollection.add(data).then(() => {
                parisRef.value = ''; parisNom.value = ''; parisRef.focus();
            });
        });
    }

    // Import CSV Paris
    if (uploadParisCsvBtn) {
        uploadParisCsvBtn.addEventListener('click', () => {
            if (!parisCsvFile.files.length) return alert("Sélectionnez un fichier.");
            parisUploadLog.style.display = 'block'; parisUploadLog.textContent = 'Lecture...';

            Papa.parse(parisCsvFile.files[0], {
                header: true, skipEmptyLines: true,
                complete: async (results) => {
                    const batch = db.batch();
                    let count = 0; let log = "";
                    for (const row of results.data) {
                        const date = row.date?.trim(); const ref = row.reference?.trim(); const nom = row.nom?.trim();
                        if (!date || !ref || !nom) { log += `\nIgnoré: ${ref}`; continue; }

                        const check = await parisManifestCollection.where("reference", "==", ref).get();
                        if (!check.empty) { log += `\nDoublon: ${ref}`; continue; }

                        const docRef = parisManifestCollection.doc();
                        batch.set(docRef, {
                            dateParis: date, reference: ref, nomClient: nom,
                            status: "pending", dateArrivee: "", conteneurArrivee: ""
                        });
                        count++;
                    }
                    if (count > 0) await batch.commit();
                    parisUploadLog.textContent = `Ajoutés: ${count}\n${log}`; parisCsvFile.value = '';
                }
            });
        });
    }

    // Affichage Paris
    parisManifestCollection.where("status", "==", "pending").orderBy("dateParis", "desc").onSnapshot(snap => {
        allParisManifest = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderParisTable();
    });

    function renderParisTable() {
        const term = parisSearchInput ? parisSearchInput.value.toLowerCase().trim() : "";
        const filtered = allParisManifest.filter(item => {
            if (!term) return true;
            return (item.reference || "").toLowerCase().includes(term) ||
                   (item.nomClient || "").toLowerCase().includes(term);
        });

        if (parisCountEl) parisCountEl.textContent = filtered.length;
        parisTableBody.innerHTML = '';
        if (filtered.length === 0) {
            parisTableBody.innerHTML = '<tr><td colspan="5">Aucun colis en attente.</td></tr>'; return;
        }
        filtered.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.dateParis}</td><td>${item.reference}</td><td>${item.nomClient}</td>
                <td><span class="tag" style="background:#ffc107;color:#333">En attente</span></td>
                <td><button class="deleteBtn" data-id="${item.id}">Annuler</button></td>
            `;
            parisTableBody.appendChild(row);
        });
    }
    if(parisSearchInput) parisSearchInput.addEventListener('input', renderParisTable);

    // Suppression Paris
    if (parisTableBody) {
        parisTableBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('deleteBtn')) {
                if(confirm("Supprimer du manifeste ?")) parisManifestCollection.doc(e.target.dataset.id).delete();
            }
        });
    }

    // Utilitaire
    async function removeFromParisManifest(reference) {
        try {
            const query = await parisManifestCollection.where("reference", "==", reference).get();
            if (!query.empty) {
                await query.docs[0].ref.delete();
                console.log(`Colis ${reference} retiré du manifeste.`);
            }
        } catch (err) { console.error(err); }
    }

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});