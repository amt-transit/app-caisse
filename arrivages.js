document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const livraisonsCollection = db.collection("livraisons"); // Connexion directe à Livraison

    // Récupération du nom de l'utilisateur connecté
    const currentUserName = sessionStorage.getItem('userName') || 'Utilisateur';
    const userRole = sessionStorage.getItem('userRole');
    const isViewer = userRole === 'spectateur';

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

    // --- CRÉATION DATALIST POUR AUTOCOMPLÉTION (Paris -> Abidjan) ---
    const parisRefList = document.createElement('datalist');
    parisRefList.id = 'parisRefList';
    document.body.appendChild(parisRefList);
    if(arrivalRef) arrivalRef.setAttribute('list', 'parisRefList');

    // ====================================================
    // PANNEAU 1 : LOGIQUE DE RÉCEPTION ABIDJAN
    // ====================================================

    // 1. Auto-remplissage du Nom
    if (arrivalRef) {
        arrivalRef.addEventListener('change', async () => { 
            const refValue = arrivalRef.value.trim().toUpperCase();
            if (!refValue) return;

            const checkTrans = await transactionsCollection.where("reference", "==", refValue).get();
            if (!checkTrans.empty) {
                alert("Attention : Cette référence existe DÉJÀ dans l'historique.");
                arrivalNom.value = checkTrans.docs[0].data().nom;
                return;
            }

            // Recherche dans le cache local de Paris (plus rapide)
            const manifestData = allParisManifest.find(p => p.ref === refValue);
            
            if (manifestData) {
                arrivalNom.value = manifestData.destinataire || manifestData.expediteur;
                arrivalNom.style.backgroundColor = "#e0f7fa"; 
                
                // Tentative de récupération du montant (si c'est un reste à payer)
                if (manifestData.montant) {
                    // On ne remplit pas forcément le prix car "montant" dans livraison est souvent le reste
                    // Mais on peut l'utiliser comme indication
                }
                
                // On stocke la date de départ cachée pour le calcul du délai
                if (manifestData.dateAjout) {
                    arrivalRef.dataset.dateParis = manifestData.dateAjout.split('T')[0];
                }
            }
        });
    }

    // 2. Ajout manuel
    if (addArrivalBtn && !isViewer) {
        addArrivalBtn.addEventListener('click', async () => {
            const prix = parseFloat(arrivalPrix.value) || 0;
            const montantParis = parseFloat(arrivalMontantParis.value) || 0;
            const montantAbidjan = parseFloat(arrivalMontantAbidjan.value) || 0;
            const reste = (montantParis + montantAbidjan) - prix;

            const data = {
                date: arrivalDate.value, reference: arrivalRef.value.trim().toUpperCase(), nom: arrivalNom.value.trim(),
                conteneur: arrivalConteneur.value.trim().toUpperCase(), prix: prix,
                montantParis: montantParis, montantAbidjan: montantAbidjan, reste: reste,
                isDeleted: false, agent: '', agentMobileMoney: '', commune: '',
                dateParis: arrivalRef.dataset.dateParis || "",
                lastPaymentDate: arrivalDate.value, // Initialisation pour qu'il apparaisse dans l'historique
                saisiPar: currentUserName, // Auteur de la création
                paymentHistory: [] // Initialisation
            };

            if (!data.date || !data.reference || !data.nom || !data.conteneur || data.prix <= 0) {
                return alert("Veuillez remplir Date, Conteneur, Référence, Nom et Prix.");
            }
            
            const check = await transactionsCollection.where("reference", "==", data.reference).limit(1).get();
            if (!check.empty) {
                const existing = check.docs[0].data();
                
                // --- GESTION DES PRÉ-PAIEMENTS ---
                if (confirm(`⚠️ Cette référence existe DÉJÀ (Client: ${existing.nom}, Conteneur: ${existing.conteneur}).\n\nS'agit-il d'un colis PRÉ-PAYÉ qui vient d'arriver ?\n\n✅ OK : Valider l'arrivée (Mise à jour Conteneur + Statut Logistique)\n❌ Annuler : Ne rien faire`)) {
                    
                    // 1. Mise à jour de la transaction (Conteneur)
                    await check.docs[0].ref.update({
                        conteneur: data.conteneur
                    });

                    // 2. Mise à jour Logistique (Livraisons -> En Cours)
                    await removeFromParisManifest(data.reference, data.conteneur);

                    alert("✅ Arrivée validée ! Le colis est maintenant 'En Cours'.");
                    
                    // Reset du formulaire
                    arrivalRef.value = ''; arrivalNom.value = ''; arrivalPrix.value = '';
                    arrivalRef.dataset.dateParis = '';
                    arrivalMontantParis.value = ''; arrivalMontantAbidjan.value = '';
                    arrivalNom.style.backgroundColor = ""; arrivalPrix.style.backgroundColor = ""; arrivalMontantParis.style.backgroundColor = "";
                    arrivalRef.focus();
                    return;
                }
                return;
            }

            // --- AJOUT : Création de l'historique de paiement initial ---
            if (montantParis > 0 || montantAbidjan > 0) {
                data.paymentHistory.push({
                    date: arrivalDate.value,
                    montantParis: montantParis,
                    montantAbidjan: montantAbidjan,
                    modePaiement: 'Espèce', // Par défaut
                    agent: '',
                    saisiPar: currentUserName
                });
            }

            transactionsCollection.add(data).then(() => {
                alert("Colis ajouté !");
                // Mise à jour de la livraison avec le reste à payer (Dette)
                removeFromParisManifest(data.reference, data.conteneur, Math.abs(data.reste)); 
                arrivalRef.value = ''; arrivalNom.value = ''; arrivalPrix.value = '';
                arrivalRef.dataset.dateParis = ''; // Reset
                arrivalMontantParis.value = ''; arrivalMontantAbidjan.value = '';
                arrivalNom.style.backgroundColor = ""; arrivalPrix.style.backgroundColor = ""; arrivalMontantParis.style.backgroundColor = "";
                arrivalRef.focus();
            }).catch(err => {
                console.error(err);
                if (err.code === 'resource-exhausted') alert("⚠️ QUOTA ATTEINT : Impossible d'ajouter ce colis aujourd'hui.");
                else alert("Erreur : " + err.message);
            });
        });
    } else if (addArrivalBtn) {
        addArrivalBtn.style.display = 'none';
        const form = addArrivalBtn.closest('.form-grid');
        if(form) {
            form.querySelectorAll('input, select').forEach(el => el.disabled = true);
        }
    }

    // 3. Ajout en masse CSV (Abidjan - 5 colonnes)
    if (uploadCsvBtn && !isViewer) {
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
                    const processedRefs = new Set(); // Pour éviter les doublons dans le fichier lui-même

                    for (const row of rows) {
                        // NOUVELLE LOGIQUE CSV ABIDJAN : reference, restant, expéditeur, adresse, destinataire, description
                        const ref = (row.reference || row.Reference || '').trim().toUpperCase();
                        const restant = parseFloat(row.restant || row.Restant || 0);
                        let sender = (row['expéditeur'] || row['Expéditeur'] || row.nom || '').trim();
                        const addr = (row.adresse || row.Adresse || row.adresseDestinataire || '').trim();
                        const dest = (row.destinataire || row.Destinataire || '').trim();
                        const desc = (row.description || row.Description || '').trim();

                        if (!ref) {
                            log += `\nIgnoré (Données): ${ref}`; continue;
                        }

                        if (processedRefs.has(ref)) {
                            log += `\nDoublon interne (ignoré): ${ref}`; continue;
                        }

                        let prix = parseFloat(row.prix || 0);

                        // RECUPERATION DONNEES PARIS (Si Nom manquant OU Prix manquant pour un colis soldé)
                        let manifestData = null;
                        if (!sender || (restant === 0 && prix === 0)) {
                            const q = await livraisonsCollection.where("ref", "==", ref).where("containerStatus", "==", "PARIS").limit(1).get();
                            if (!q.empty) manifestData = q.docs[0].data();
                        }

                        if (manifestData) {
                            if (!sender) sender = manifestData.expediteur;
                            // Si payé (restant 0) et prix inconnu, on récupère le prix de Paris
                            if (restant === 0 && prix === 0 && manifestData.montant) {
                                // prix = manifestData.montant; // Attention, montant est souvent le reste
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

                        const check = await transactionsCollection.where("reference", "==", ref).limit(1).get();
                        if (!check.empty) { log += `\nDoublon (Base): ${ref}`; continue; }

                        // MODIFICATION : Le Destinataire est le client principal (nom)
                        const mainClientName = sender || dest;

                        // --- AJOUT : Historique Paiement ---
                        const paymentHistory = [];
                        if (mParis > 0) {
                            paymentHistory.push({
                                date: commonDate,
                                montantParis: mParis,
                                montantAbidjan: 0,
                                modePaiement: 'Espèce',
                                agent: '',
                                saisiPar: currentUserName
                            });
                        }

                        const docRef = transactionsCollection.doc();
                        batch.set(docRef, {
                            date: commonDate, reference: ref, nom: mainClientName || "", conteneur: commonConteneur,
                            prix: prix, montantParis: mParis, montantAbidjan: 0, 
                            reste: mParis - prix, isDeleted: false, agent: '', agentMobileMoney: '', commune: '',
                            description: desc, adresseDestinataire: addr, nomDestinataire: dest,
                            lastPaymentDate: commonDate, // Initialisation
                            saisiPar: currentUserName, // Auteur de l'import
                            paymentHistory: paymentHistory
                        });
                        // On stocke la référence ET la dette pour la mise à jour
                        refsToRemove.push({ ref: ref, debt: prix - mParis });
                        processedRefs.add(ref);
                        count++;
                    }
                    if (count > 0) {
                        try {
                            await batch.commit();
                            refsToRemove.forEach(item => removeFromParisManifest(item.ref, commonConteneur, item.debt));
                            uploadLog.textContent = `Succès: ${count} ajoutés.\n${log}`;
                        } catch (err) {
                            console.error(err);
                            if (err.code === 'resource-exhausted') {
                                alert("⚠️ QUOTA ATTEINT : Import bloqué par Firebase (Limite journalière).");
                                uploadLog.textContent = "Erreur Quota.";
                            } else {
                                alert("Erreur import : " + err.message);
                            }
                        }
                    } else {
                        uploadLog.textContent = `Aucun ajout.\n${log}`;
                    }
                    csvFile.value = '';
                }
            });
        });
    } else if (uploadCsvBtn) {
        const form = uploadCsvBtn.closest('.upload-form');
        if (form) form.style.display = 'none';
    }
    
    // 4. Synchronisation
    if (syncParisBtn && !isViewer) {
        syncParisBtn.addEventListener('click', async () => {
            if (!confirm("Lancer la synchronisation ?")) return;
            const originalText = syncParisBtn.textContent;
            syncParisBtn.disabled = true; syncParisBtn.textContent = "Analyse...";
            
            try {
                const parisSnap = await livraisonsCollection.where("containerStatus", "==", "PARIS").limit(1000).get();
                if (parisSnap.empty) { alert("Manifeste vide."); return; }

                const batch = db.batch();
                let updated = 0, cleaned = 0, bCount = 0;

                for (const docP of parisSnap.docs) {
                    const pData = docP.data();
                    const ref = pData.ref.trim();
                    const transSnap = await transactionsCollection.where("reference", "==", ref).limit(1).get();

                    if (!transSnap.empty) {
                        const docT = transSnap.docs[0];
                        const tData = docT.data();
                        const updates = {};

                        // On complète les infos manquantes depuis Paris (Nom, Adresse, Description)
                        if (!tData.nom || tData.nom.trim() === "") updates.nom = pData.destinataire || pData.expediteur;
                        if (!tData.adresseDestinataire && pData.lieuLivraison) updates.adresseDestinataire = pData.lieuLivraison;
                        if ((!tData.description && !tData.article) && pData.description) updates.description = pData.description;
                        if (!tData.dateParis && pData.dateAjout) updates.dateParis = pData.dateAjout.split('T')[0];

                        if (Object.keys(updates).length > 0) { batch.update(docT.ref, updates); updated++; bCount++; }
                        
                        // Au lieu de supprimer, on passe en EN_COURS (car reçu en transaction)
                        batch.update(docP.ref, { containerStatus: 'EN_COURS' });
                        cleaned++; bCount++;
                        if (bCount >= 400) { await batch.commit(); bCount = 0; }
                    }
                }
                if (bCount > 0) await batch.commit();
                alert(`Terminé !\nNoms mis à jour: ${updated}\nColis nettoyés: ${cleaned}`);
            } catch (e) { console.error(e); alert("Erreur sync."); } 
            finally { syncParisBtn.disabled = false; syncParisBtn.textContent = originalText; }
        });
    } else if (syncParisBtn) {
        syncParisBtn.style.display = 'none';
    }

    // --- AFFICHAGE ABIDJAN ---
    // MODIFICATION : On écoute désormais la collection 'livraisons' (En Cours) au lieu de 'transactions'
    // pour refléter fidèlement l'onglet Livraison > En Cours.
    livraisonsCollection.where("containerStatus", "==", "EN_COURS").orderBy("dateAjout", "desc").limit(100).onSnapshot(snapshot => {
        allArrivals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAbidjanTable();
    }, error => console.error(error));

    function renderAbidjanTable() {
        const term = abidjanSearchInput ? abidjanSearchInput.value.toLowerCase().trim() : "";
        
        const filtered = allArrivals.filter(item => {
            if (!term) return true;
            // Adaptation des champs pour la recherche (livraisons vs transactions)
            return (item.ref || "").toLowerCase().includes(term) ||
                   (item.destinataire || item.expediteur || "").toLowerCase().includes(term) ||
                   (item.conteneur || "").toLowerCase().includes(term);
        });

        // Mise à jour du compteur (Affiche le nombre total trouvé)
        if (abidjanCountEl) abidjanCountEl.textContent = filtered.length;

        // TRI : Conteneur DÉCROISSANT, Référence CROISSANTE
        filtered.sort((a, b) => {
            const getNum = (str) => {
                const matches = (str || "").match(/\d+/); // On prend le premier nombre trouvé (ex: 001 dans AB-001)
                return matches ? parseInt(matches[0], 10) : 0;
            };

            const cA = getNum(a.conteneur);
            const cB = getNum(b.conteneur);
            if (cB !== cA) return cB - cA; // Tri décroissant Conteneur

            const rA = getNum(a.ref);
            const rB = getNum(b.ref);
            return rA - rB; // Tri CROISSANT Référence
        });

        // === OPTIMISATION : On ne prend que les 50 premiers pour l'affichage ===
        const toShow = filtered.slice(0, 50);

        arrivalsTableBody.innerHTML = '';
        if (toShow.length === 0) {
            arrivalsTableBody.innerHTML = '<tr><td colspan="9">Aucun résultat.</td></tr>';
            return;
        }
        toShow.forEach(item => {
            const row = document.createElement('tr');
            
            // Adaptation des champs pour l'affichage (livraisons)
            const date = item.dateAjout ? new Date(item.dateAjout).toLocaleDateString('fr-FR') : '-';
            const description = item.description || '';
            const adresse = item.lieuLivraison || item.commune || '';
            const destinataire = item.destinataire || '';
            const expediteur = item.expediteur || '';
            
            // Gestion du montant (Restant)
            // Dans livraisons, 'montant' est une chaine qui peut contenir "CFA"
            const montantStr = item.montant || '0';
            const montantVal = parseFloat(montantStr.replace(/[^\d]/g, '')) || 0;
            
            // Si montantVal > 0, c'est un reste à payer (Rouge). Sinon c'est payé (Vert).
            const isPaid = montantVal === 0;
            const colorStyle = isPaid ? 'color:#28a745; font-weight:bold;' : 'color:#dc3545; font-weight:bold;';

            // Logique WhatsApp (Relance Dette)
            let waBtn = '';
            if (!isPaid && item.numero) {
                let phone = item.numero.replace(/[^\d]/g, '');
                if (phone.length === 10) phone = '225' + phone;
                const message = `Bonjour ${destinataire || 'Client'}, votre colis ${item.ref} est arrivé. Reste à payer : ${montantStr}. Merci.`;
                const waLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
                waBtn = ` <a href="${waLink}" target="_blank" style="text-decoration:none; font-size:16px; margin-left:5px;" title="Relancer sur WhatsApp">📱</a>`;
            }

            row.innerHTML = `
                <td>${date}</td>
                <td>${item.conteneur || '-'}</td>
                <td>${item.ref}</td>
                <td style="${colorStyle}">${montantStr}</td>
                <td>${expediteur}</td>
                <td>${destinataire}${waBtn}</td>
                <td>${item.numero || ''}</td>
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
    if (addParisBtn && !isViewer) {
        addParisBtn.addEventListener('click', async () => {
            const data = {
                dateAjout: new Date(parisDate.value).toISOString(),
                ref: parisRef.value.trim(),
                expediteur: parisNom.value.trim(),
                containerStatus: 'PARIS',
                status: 'EN_ATTENTE',
                // Champs vides pour compatibilité
                montant: '', destinataire: '', lieuLivraison: '', description: '', conteneur: ''
            };
            
            if (!parisDate.value || !data.ref || !data.expediteur) return alert("Champs manquants.");
            
            const check = await livraisonsCollection.where("ref", "==", data.ref).limit(1).get();
            if (!check.empty) return alert("Déjà dans le manifeste.");
            livraisonsCollection.add(data).then(() => { parisRef.value = ''; parisNom.value = ''; parisRef.focus(); })
            .catch(err => {
                if (err.code === 'resource-exhausted') alert("⚠️ QUOTA ATTEINT.");
                else console.error(err);
            });
        });
    } else if (addParisBtn) {
        addParisBtn.style.display = 'none';
        const form = addParisBtn.closest('.form-grid');
        if(form) {
            form.querySelectorAll('input, select').forEach(el => el.disabled = true);
        }
    }

    
    // 2. Import CSV Paris (Fichier Complet)
    if (uploadParisCsvBtn && !isViewer) {
        uploadParisCsvBtn.addEventListener('click', () => {
            if (!parisCsvFile.files.length) return alert("Sélectionnez un fichier.");
            parisUploadLog.style.display = 'block'; parisUploadLog.textContent = 'Lecture...';

            Papa.parse(parisCsvFile.files[0], {
                header: true, skipEmptyLines: true, delimiter: ",", // Virgule
                complete: async (results) => {
                    const rows = results.data;
                    const batch = db.batch();
                    let count = 0, log = "";
                    const TAUX = 1;

                    for (const row of rows) {
                        // NOUVELLE LOGIQUE CSV PARIS : DATE DU TRANSFERT, REFERENCE, EXPEDITEUR, PRIX, DESTINATEUR
                        const date = row["DATE DU TRANSFERT"];
                        const ref = row["REFERENCE"]?.trim();
                        const exp = row["EXPEDITEUR"]?.trim();
                        if (!ref) { log += `\nIgnoré (Ref manquante)`; continue; }

                        const check = await parisManifestCollection.where("reference", "==", ref).limit(1).get();
                        if (!check.empty) { log += `\nIgnoré (Existe): ${ref}`; continue; }

                        const prixE = parseFloat((row["PRIX"]||"0").replace(',','.'));
                        const payeE = parseFloat((row["MONTANT PAYER"]||"0").replace(',','.'));
                        const resteE = parseFloat((row["RENSTANT A PAYER"]||row["RESTANT A PAYER"]||"0").replace(',','.'));
                        const dest = row["DESTINATEUR"]?.trim() || "";
                        const typeColis = row["TYPE COLIS"]?.trim() || "";
                        const adresse = row["ADRESSES"]?.trim() || "";
                        const qte = parseInt(row["QUANTITE"]) || 1;
                        
                        const docRef = livraisonsCollection.doc();
                        batch.set(docRef, {
                            dateAjout: new Date().toISOString(), // Date import
                            ref: ref,
                            expediteur: exp,
                            destinataire: dest,
                            lieuLivraison: adresse,
                            description: typeColis,
                            montant: resteE > 0 ? resteE : (prixE > 0 ? prixE : ''), // On stocke le montant pertinent
                            containerStatus: 'PARIS', status: 'EN_ATTENTE'
                        });
                        count++;
                    }
                    if (count > 0) {
                        try {
                            await batch.commit();
                            parisUploadLog.textContent = `Succès: ${count} ajoutés.\n${log}`;
                        } catch (err) {
                            if (err.code === 'resource-exhausted') alert("⚠️ QUOTA ATTEINT : Import bloqué.");
                            else alert("Erreur : " + err.message);
                        }
                    }
                    parisCsvFile.value = '';
                }
            });
        });
    } else if (uploadParisCsvBtn) {
        const form = uploadParisCsvBtn.closest('.upload-form');
        if (form) form.style.display = 'none';
    }

    // 3. Affichage Paris
    livraisonsCollection.where("containerStatus", "==", "PARIS").orderBy("dateAjout", "desc").onSnapshot(snap => {
        allParisManifest = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderParisTable();
        updateParisDatalist();
    });

    function renderParisTable() {
        const term = parisSearchInput ? parisSearchInput.value.toLowerCase().trim() : "";
        const filtered = allParisManifest.filter(i => {
            if (!term) return true;
            return (i.ref||"").toLowerCase().includes(term) || (i.expediteur||"").toLowerCase().includes(term);
        });

        if (parisCountEl) parisCountEl.textContent = filtered.length;
        
        // === OPTIMISATION : On ne prend que les 50 premiers ===
        const toShow = filtered.slice(0, 50);
        
        parisTableBody.innerHTML = '';
        if (toShow.length === 0) { parisTableBody.innerHTML = '<tr><td colspan="5">Aucun colis.</td></tr>'; return; }
        
        toShow.forEach(i => {
            let actionsHtml = '';
            if (!isViewer) {
                actionsHtml = `
                    <button class="receiveBtn" data-ref="${i.ref}" style="background:#10b981; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">Réceptionner</button>
                    <button class="deleteBtn" data-id="${i.id}">Annuler</button>
                `;
            }
            // NOUVELLE LOGIQUE COLONNES : Date, Ref, Expéditeur, Prix, Destinateur
            parisTableBody.innerHTML += `<tr>
                <td>${i.dateAjout ? new Date(i.dateAjout).toLocaleDateString() : '-'}</td>
                <td>${i.ref}</td>
                <td>${i.expediteur}</td>
                <td>${i.montant || '-'}</td>
                <td>${i.destinataire || '-'}</td>
                <td>${actionsHtml}</td>
            </tr>`;
        });
    }
    if(parisSearchInput) parisSearchInput.addEventListener('input', renderParisTable);

    // Mise à jour de la liste d'autocomplétion
    function updateParisDatalist() {
        parisRefList.innerHTML = '';
        allParisManifest.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.ref;
            opt.label = `${item.expediteur} > ${item.destinataire || '?'}`;
            parisRefList.appendChild(opt);
        });
    }

    // Actions Paris (Réceptionner / Supprimer)
    if (parisTableBody) {
        parisTableBody.addEventListener('click', (e) => {
            if (isViewer) return;
            if (e.target.classList.contains('deleteBtn')) {
                if(confirm("Supprimer du manifeste ?")) livraisonsCollection.doc(e.target.dataset.id).delete();
            }
            if (e.target.classList.contains('receiveBtn')) {
                // Basculer vers l'onglet Abidjan et remplir
                const ref = e.target.dataset.ref;
                const tabAbidjan = document.querySelector('.sub-nav a[href="#panel-abidjan"]');
                if(tabAbidjan) tabAbidjan.click();
                
                arrivalRef.value = ref;
                arrivalRef.dispatchEvent(new Event('change')); // Déclenche l'auto-remplissage
                arrivalConteneur.focus(); // Focus sur le champ manquant
            }
        });
    }

    async function removeFromParisManifest(ref, conteneur, newRestant = null) {
        // MODIFICATION : Recherche élargie pour inclure A_VENIR
        const q = await livraisonsCollection.where("ref", "==", ref).limit(5).get();
        if (!q.empty) {
            // On cible en priorité les colis qui sont à PARIS ou A_VENIR
            const targetDoc = q.docs.find(d => ['PARIS', 'A_VENIR'].includes(d.data().containerStatus));
            
            if (targetDoc) {
                const currentData = targetDoc.data();
                const updates = { containerStatus: 'EN_COURS', conteneur: conteneur || currentData.conteneur || '' };
                
                if (newRestant !== null) {
                    updates.montant = newRestant + " CFA";
                    // Sauvegarde du prix original si non existant (pour compatibilité avec Livraison.js)
                    if (currentData.montant && !currentData.prixOriginal) {
                        updates.prixOriginal = currentData.montant;
                    }
                }
                await targetDoc.ref.update(updates);
            }
        }
    }

    initBackToTopButton();
});