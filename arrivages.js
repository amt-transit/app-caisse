document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    
    // --- ÉLÉMENTS FORMULAIRE SIMPLE ---
    const addArrivalBtn = document.getElementById('addArrivalBtn');
    const arrivalDate = document.getElementById('arrivalDate');
    const arrivalRef = document.getElementById('arrivalRef');
    const arrivalNom = document.getElementById('arrivalNom');
    const arrivalConteneur = document.getElementById('arrivalConteneur');
    const arrivalPrix = document.getElementById('arrivalPrix');
    
    // --- ÉLÉMENTS IMPORTATION MASSE ---
    const uploadCsvBtn = document.getElementById('uploadCsvBtn');
    const csvFile = document.getElementById('csvFile');
    const uploadLog = document.getElementById('uploadLog');

    // --- TABLEAU ---
    const arrivalsTableBody = document.getElementById('arrivalsTableBody');

    // ===========================================
    // LOGIQUE 1 : AJOUT D'UN SEUL COLIS
    // ===========================================
    addArrivalBtn.addEventListener('click', async () => {
        const prix = parseFloat(arrivalPrix.value) || 0;
        const data = {
            date: arrivalDate.value,
            reference: arrivalRef.value.trim(),
            nom: arrivalNom.value.trim(),
            conteneur: arrivalConteneur.value.trim().toUpperCase(),
            prix: prix,
            montantParis: 0,
            montantAbidjan: 0,
            reste: -prix,
            isDeleted: false,
            agent: '', agentMobileMoney: '', commune: ''
        };

        if (!data.date || !data.reference || !data.nom || !data.conteneur || data.prix <= 0) {
            return alert("Veuillez remplir tous les champs (Date, Conteneur, Référence, Nom, Prix) avec un prix valide.");
        }
        
        const check = await transactionsCollection.where("reference", "==", data.reference).get();
        if (!check.empty) {
            return alert("Erreur : Cette référence existe déjà dans la base de données.");
        }

        transactionsCollection.add(data).then(() => {
            alert(`Colis ${data.reference} ajouté avec succès !`);
            arrivalRef.value = '';
            arrivalNom.value = '';
            arrivalPrix.value = '';
            arrivalRef.focus();
        }).catch(err => console.error(err));
    });

    // ===========================================
    // LOGIQUE 2 : IMPORTATION EN MASSE (CSV)
    // (Version corrigée selon votre demande)
    // ===========================================
    uploadCsvBtn.addEventListener('click', () => {
        
        // ==== CORRECTION ====
        // 1. On lit la Date et le Conteneur DEPUIS LE FORMULAIRE HTML
        const commonDate = arrivalDate.value;
        const commonConteneur = arrivalConteneur.value.trim().toUpperCase();
        
        // 2. On vérifie que ces champs sont remplis
        if (!commonDate || !commonConteneur) {
            return alert("Veuillez d'abord remplir les champs 'Date' et 'Conteneur' en haut de la page.");
        }
        // ====================
        
        if (!csvFile.files || csvFile.files.length === 0) {
            return alert("Veuillez sélectionner un fichier CSV à importer.");
        }
        
        const file = csvFile.files[0];
        
        uploadLog.style.display = 'block';
        uploadLog.textContent = 'Lecture du fichier...';

        // 3. Utiliser PapaParse pour lire le fichier
        Papa.parse(file, {
            header: true, // Lit la première ligne comme en-tête (reference, nom, prix)
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data;
                uploadLog.textContent += `\n${rows.length} lignes trouvées dans le CSV.`;
                uploadLog.textContent += `\nVérification des doublons et préparation de l'envoi...`;

                const batch = db.batch();
                let newEntriesCount = 0;
                let skippedEntriesLog = "";

                // 4. Boucler sur chaque ligne du CSV
                for (const row of rows) {
                    
                    // ==== CORRECTION ====
                    // On lit uniquement les 3 colonnes du CSV
                    const ref = row.reference ? row.reference.trim() : '';
                    const prix = parseFloat(row.prix) || 0;
                    const nom = row.nom ? row.nom.trim() : '';
                    // ====================

                    if (!ref || !nom || prix <= 0) {
                        skippedEntriesLog += `\nLIGNE IGNORÉE : Données invalides (ref: ${ref}, nom: ${nom}, prix: ${prix})`;
                        continue;
                    }

                    // 5. VÉRIFIER LES DOUBLONS
                    const check = await transactionsCollection.where("reference", "==", ref).get();
                    if (check.empty) {
                        // Ce colis est nouveau, on le prépare pour le batch
                        const data = {
                            date: commonDate, // Donnée du formulaire
                            reference: ref, // Donnée du CSV
                            nom: nom, // Donnée du CSV
                            conteneur: commonConteneur, // Donnée du formulaire
                            prix: prix, // Donnée du CSV
                            montantParis: 0,
                            montantAbidjan: 0,
                            reste: -prix,
                            isDeleted: false,
                            agent: '', agentMobileMoney: '', commune: ''
                        };
                        
                        const docRef = transactionsCollection.doc(); 
                        batch.set(docRef, data);
                        newEntriesCount++;
                    } else {
                        // Ce colis existe déjà
                        skippedEntriesLog += `\nLIGNE IGNORÉE : La référence ${ref} existe déjà.`;
                    }
                }

                // 6. Envoyer le lot (Batch)
                if (newEntriesCount > 0) {
                    uploadLog.textContent += `\nEnvoi de ${newEntriesCount} nouveaux colis vers la base de données...`;
                    await batch.commit();
                    uploadLog.textContent += `\n🎉 SUCCÈS : ${newEntriesCount} colis ont été ajoutés !`;
                } else {
                    uploadLog.textContent += `\nRésultat : Aucun nouveau colis à ajouter.`;
                }
                
                if (skippedEntriesLog) {
                    uploadLog.textContent += `\n--- Journal des lignes ignorées ---${skippedEntriesLog}`;
                }
                
                csvFile.value = '';

            },
            error: (err) => {
                uploadLog.textContent = `Erreur lors de la lecture du fichier : ${err.message}`;
            }
        });
    });

    // ===========================================
    // LOGIQUE 3 : AFFICHAGE DU TABLEAU
    // ===========================================
    transactionsCollection
        .orderBy("date", "desc")
        .limit(10)
        .onSnapshot(snapshot => {
            arrivalsTableBody.innerHTML = ''; 
            if (snapshot.empty) {
                arrivalsTableBody.innerHTML = '<tr><td colspan="6">Aucun colis récemment ajouté.</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const item = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.date}</td>
                    <td>${item.reference}</td>
                    <td>${item.nom}</td>
                    <td>${item.conteneur}</td>
                    <td>${formatCFA(item.prix)}</td>
                    <td class="${(item.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(item.reste)}</td>
                `;
                arrivalsTableBody.appendChild(row);
            });
        }, error => console.error(error));

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
});