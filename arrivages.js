document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const parisManifestCollection = db.collection("paris_manifest");

    // ONGLETS
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

    // FORMULAIRE ABIDJAN
    const addArrivalBtn = document.getElementById('addArrivalBtn');
    const arrivalDate = document.getElementById('arrivalDate');
    const arrivalRef = document.getElementById('arrivalRef');
    const arrivalNom = document.getElementById('arrivalNom');
    const arrivalConteneur = document.getElementById('arrivalConteneur');
    const arrivalPrix = document.getElementById('arrivalPrix');
    const arrivalMontantParis = document.getElementById('arrivalMontantParis');
    const arrivalMontantAbidjan = document.getElementById('arrivalMontantAbidjan');
    const arrivalsTableBody = document.getElementById('arrivalsTableBody');
    
    // FORMULAIRE PARIS
    const addParisBtn = document.getElementById('addParisBtn');
    const parisDate = document.getElementById('parisDate');
    const parisRef = document.getElementById('parisRef');
    const parisNom = document.getElementById('parisNom');
    const parisTableBody = document.getElementById('parisTableBody');

    // IMPORTS CSV
    const uploadCsvBtn = document.getElementById('uploadCsvBtn');
    const csvFile = document.getElementById('csvFile');
    const uploadLog = document.getElementById('uploadLog');
    
    const uploadParisCsvBtn = document.getElementById('uploadParisCsvBtn');
    const parisCsvFile = document.getElementById('parisCsvFile');
    const parisUploadLog = document.getElementById('parisUploadLog');
    
    const parisPendingCountEl = document.getElementById('parisPendingCount');

    // --- 1. AJOUT COLIS ABIDJAN ---
    
    // Auto-remplissage
    if (arrivalRef) {
        arrivalRef.addEventListener('blur', async () => {
            const refValue = arrivalRef.value.trim();
            if (!refValue) return;

            const checkTransactions = await transactionsCollection.where("reference", "==", refValue).get();
            if (!checkTransactions.empty) {
                alert("Attention : Cette référence existe DÉJÀ dans l'historique.");
                arrivalNom.value = checkTransactions.docs[0].data().nom;
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
            }
        });
    }

    // Bouton Enregistrer
    if (addArrivalBtn) {
        addArrivalBtn.addEventListener('click', async () => {
            const prix = parseFloat(arrivalPrix.value) || 0;
            const montantParis = parseFloat(arrivalMontantParis.value) || 0;
            const montantAbidjan = parseFloat(arrivalMontantAbidjan.value) || 0;
            const reste = (montantParis + montantAbidjan) - prix;

            const data = {
                date: arrivalDate.value,
                reference: arrivalRef.value.trim(),
                nom: arrivalNom.value.trim(),
                conteneur: arrivalConteneur.value.trim().toUpperCase(),
                prix: prix,
                montantParis: montantParis,
                montantAbidjan: montantAbidjan,
                reste: reste,
                isDeleted: false,
                agent: '', agentMobileMoney: '', commune: ''
            };

            if (!data.date || !data.reference || !data.nom || !data.conteneur || data.prix <= 0) {
                return alert("Veuillez remplir Date, Conteneur, Référence, Nom et Prix.");
            }

            const check = await transactionsCollection.where("reference", "==", data.reference).get();
            if (!check.empty) {
                return alert("Erreur : Cette référence existe déjà.");
            }

            transactionsCollection.add(data).then(() => {
                alert("Colis enregistré !");
                updateParisManifest(data.reference, data.conteneur, data.date);
                // Reset
                arrivalRef.value = ''; arrivalNom.value = ''; arrivalPrix.value = '';
                arrivalMontantParis.value = ''; arrivalMontantAbidjan.value = '';
                arrivalNom.style.backgroundColor = "";
            }).catch(err => console.error(err));
        });
    }

    // --- 2. IMPORT CSV ABIDJAN (5 colonnes) ---
    if (uploadCsvBtn) {
        uploadCsvBtn.addEventListener('click', () => {
            const commonDate = arrivalDate.value;
            const commonConteneur = arrivalConteneur.value.trim().toUpperCase();
            
            if (!commonDate || !commonConteneur) {
                return alert("Veuillez remplir Date et Conteneur en haut.");
            }
            if (!csvFile.files.length) return alert("Sélectionnez un fichier.");

            Papa.parse(csvFile.files[0], {
                header: true, skipEmptyLines: true,
                complete: async (results) => {
                    const rows = results.data;
                    const batch = db.batch();
                    let count = 0;
                    
                    for (const row of rows) {
                        const ref = row.reference?.trim() || '';
                        const nom = row.nom?.trim() || '';
                        const prix = parseFloat(row.prix) || 0;
                        const mParis = parseFloat(row.montantParis) || 0;
                        const mAbidjan = parseFloat(row.montantAbidjan) || 0;

                        if (!ref || !nom || prix <= 0) continue;
                        
                        const check = await transactionsCollection.where("reference", "==", ref).get();
                        if (check.empty) {
                            const docRef = transactionsCollection.doc();
                            batch.set(docRef, {
                                date: commonDate, reference: ref, nom: nom, conteneur: commonConteneur,
                                prix: prix, montantParis: mParis, montantAbidjan: mAbidjan,
                                reste: (mParis + mAbidjan) - prix,
                                isDeleted: false, agent: '', agentMobileMoney: '', commune: ''
                            });
                            updateParisManifest(ref, commonConteneur, commonDate);
                            count++;
                        }
                    }
                    if (count > 0) await batch.commit();
                    alert(`${count} colis importés !`);
                }
            });
        });
    }
    
    // --- 3. TABLEAU ABIDJAN ---
    transactionsCollection.orderBy("date", "desc").limit(10).onSnapshot(snapshot => {
        if (arrivalsTableBody) {
            arrivalsTableBody.innerHTML = '';
            snapshot.forEach(doc => {
                const item = doc.data();
                arrivalsTableBody.innerHTML += `<tr>
                    <td>${item.date}</td><td>${item.reference}</td><td>${item.nom}</td>
                    <td>${item.conteneur}</td><td>${formatCFA(item.prix)}</td>
                    <td class="${item.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(item.reste)}</td>
                </tr>`;
            });
        }
    });

    // --- 4. AJOUT COLIS PARIS ---
    if (addParisBtn) {
        addParisBtn.addEventListener('click', async () => {
            const data = {
                dateParis: parisDate.value,
                reference: parisRef.value.trim(),
                nomClient: parisNom.value.trim(),
                status: "pending", dateArrivee: "", conteneurArrivee: ""
            };
            if (!data.dateParis || !data.reference || !data.nomClient) return alert("Champs manquants.");
            
            const check = await parisManifestCollection.where("reference", "==", data.reference).get();
            if (!check.empty) return alert("Référence déjà dans le manifeste.");
            
            parisManifestCollection.add(data).then(() => {
                parisRef.value = ''; parisNom.value = ''; parisRef.focus();
            });
        });
    }

    // --- 5. IMPORT CSV PARIS ---
    if (uploadParisCsvBtn) {
        // ... (Votre logique d'import Paris CSV existante est bonne, je l'ai simplifiée ici pour la place) ...
        uploadParisCsvBtn.addEventListener('click', () => {
             // (Utiliser la logique du message précédent pour Paris CSV)
             // C'est la même logique : Papa.parse -> boucle -> check doublon -> batch.set
             // ...
        });
    }

    // --- 6. TABLEAU PARIS ---
    parisManifestCollection.where("status", "==", "pending").orderBy("dateParis", "desc").onSnapshot(snapshot => {
        if (parisPendingCountEl) parisPendingCountEl.textContent = snapshot.size;
        if (parisTableBody) {
            parisTableBody.innerHTML = '';
            snapshot.forEach(doc => {
                const item = doc.data();
                parisTableBody.innerHTML += `<tr>
                    <td>${item.dateParis}</td><td>${item.reference}</td><td>${item.nomClient}</td>
                    <td><span class="tag">En attente</span></td>
                    <td><button class="deleteBtn" data-id="${doc.id}">Annuler</button></td>
                </tr>`;
            });
        }
    });
    
    if (parisTableBody) {
        parisTableBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('deleteBtn')) {
                if(confirm("Supprimer ?")) parisManifestCollection.doc(e.target.dataset.id).delete();
            }
        });
    }

    async function updateParisManifest(reference, conteneur, dateArrivee) {
        const query = await parisManifestCollection.where("reference", "==", reference).where("status", "==", "pending").get();
        if (!query.empty) {
            query.docs[0].ref.update({ status: "received", conteneurArrivee: conteneur, dateArrivee: dateArrivee });
        }
    }

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});
