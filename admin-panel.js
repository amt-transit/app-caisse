document.addEventListener('DOMContentLoaded', async () => {
    const usersList = document.getElementById('usersList');
    const createUserBtn = document.getElementById('createUserBtn');
    const newUsername = document.getElementById('newUsername'); 
    const newPassword = document.getElementById('newPassword');
    const newRole = document.getElementById('newRole');

    const DOMAIN_SUFFIX = "@amt.local"; 

    // --- GESTION UTILISATEURS ---
    db.collection('users').onSnapshot(snapshot => {
        usersList.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            let nomAffichable = data.displayName;
            if (!nomAffichable && data.email) {
                nomAffichable = data.email.replace(DOMAIN_SUFFIX, '');
            }
            
            const div = document.createElement('div');
            div.className = 'user-card';
            div.innerHTML = `
                <div style="flex-grow: 1;">
                    <span style="font-size: 14px; font-weight: bold; color: #333;">${nomAffichable || 'Inconnu'}</span>
                    <br>
                    <small style="color: #888; font-size: 10px;">Rôle: ${data.role}</small>
                </div>
                <div style="display: flex; gap: 5px; align-items: center;">
                    <button onclick="deleteUser('${doc.id}')" style="font-size:11px; padding:4px 8px; background:red; color:white;">X</button>
                </div>
            `;
            usersList.appendChild(div);
        });
    });

    // Créer utilisateur
    createUserBtn.addEventListener('click', () => {
        const username = newUsername.value.trim();
        const password = newPassword.value.trim();
        const role = newRole.value;

        if (!username || !password) return alert("Nom d'utilisateur et mot de passe requis.");

        const cleanUsername = username.toLowerCase().replace(/\s+/g, '');
        const emailTechnique = `${cleanUsername}${DOMAIN_SUFFIX}`;

        const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");

        secondaryApp.auth().createUserWithEmailAndPassword(emailTechnique, password)
            .then((userCred) => {
                return db.collection('users').doc(userCred.user.uid).set({
                    role: role,
                    email: emailTechnique, 
                    displayName: username 
                });
            })
            .then(() => {
                alert(`Utilisateur "${username}" créé avec succès !`);
                secondaryApp.auth().signOut(); 
                secondaryApp.delete(); 
                newUsername.value = ''; newPassword.value = '';
            })
            .catch((error) => {
                console.error(error);
                alert("Erreur : " + error.message);
                secondaryApp.delete();
            });
    });

    window.deleteUser = (uid) => {
        if(confirm("Supprimer cet utilisateur ?")) {
            db.collection('users').doc(uid).delete();
        }
    };


    // --- GESTION IMPORTS CENTRALISÉS ---
    const importType = document.getElementById('importType');
    const csvInstructions = document.getElementById('csvInstructions'); 
    const dynamicInputs = document.getElementById('dynamicInputs');
    const csvFile = document.getElementById('csvFile');
    const startImportBtn = document.getElementById('startImportBtn');
    const importLog = document.getElementById('importLog');

    importType.addEventListener('change', () => {
        const type = importType.value;
        dynamicInputs.innerHTML = ''; 
        csvInstructions.innerHTML = ''; 
        csvInstructions.style.display = 'none';
        csvFile.style.display = 'none';
        startImportBtn.style.display = 'none';
        importLog.style.display = 'none';

        if (!type) return;

        let instructionsHTML = "";
        
        if (type === 'paris') {
            instructionsHTML = `
                <strong>Fichier COMPLET requis (Point-virgule ;)</strong><br>
                Colonnes : <code>DATE DU TRANSFERT</code>, <code>REFERENCE</code>, <code>EXPEDITEUR</code>, <code>PRIX</code>, <code>MONTANT PAYER</code>...
            `;
        } else if (type === 'abidjan') {
            instructionsHTML = `
                <strong>Fichier Réception (Virgule ,)</strong><br>
                Colonnes : <code>reference</code>, <code>prix</code>, <code>nom</code> (opt), <code>montantParis</code> (opt), <code>montantAbidjan</code> (opt)
            `;
            dynamicInputs.innerHTML = `
                <input type="date" id="impDate" placeholder="Date" required>
                <input type="text" id="impConteneur" placeholder="Conteneur (ex: D35)" required>
            `;
        } else if (type === 'expenses') {
            instructionsHTML = `Format : <code>date</code>, <code>description</code>, <code>montant</code>, <code>type</code>, <code>conteneur</code>`;
        } else if (type === 'bank') {
            instructionsHTML = `Format : <code>date</code>, <code>description</code>, <code>type</code>, <code>montant</code>`;
        } else if (type === 'income') {
            instructionsHTML = `Format : <code>date</code>, <code>description</code>, <code>montant</code>`;
        }

        csvInstructions.innerHTML = instructionsHTML;
        csvInstructions.style.display = 'block';
        csvFile.style.display = 'block';
        startImportBtn.style.display = 'block';
    });

    startImportBtn.addEventListener('click', () => {
        if (!csvFile.files.length) return alert("Fichier manquant.");
        
        const type = importType.value;
        const file = csvFile.files[0];
        
        let commonDate, commonConteneur;
        if (type === 'abidjan') {
            commonDate = document.getElementById('impDate').value;
            commonConteneur = document.getElementById('impConteneur').value.toUpperCase();
            if (!commonDate || !commonConteneur) return alert("Date et Conteneur requis.");
        }

        importLog.style.display = 'block';
        importLog.textContent = "Lecture...";

        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            delimiter: (type === 'paris') ? ";" : ",", 
            complete: async (results) => {
                const rows = results.data;
                const batch = db.batch();
                let count = 0;

                if (type === 'paris') {
                    const TAUX = 655.957;
                    for (const row of rows) {
                        const ref = row["REFERENCE"]?.trim();
                        if (!ref) continue;
                        
                        const docRef = db.collection("paris_manifest").doc();
                        const prixE = parseFloat((row["PRIX"]||"0").replace(',','.'));
                        const payeE = parseFloat((row["MONTANT PAYER"]||"0").replace(',','.'));
                        
                        batch.set(docRef, {
                            dateParis: row["DATE DU TRANSFERT"], 
                            reference: ref, 
                            nomClient: row["EXPEDITEUR"]?.trim(),
                            nomDestinataire: row["DESTINATEUR"]?.trim(),
                            adresseDestinataire: row["ADRESSES"]?.trim(),
                            typeColis: row["TYPE COLIS"]?.trim(),
                            quantite: parseInt(row["QUANTITE"])||1,
                            prixCFA: Math.round(prixE * TAUX),
                            montantParisCFA: Math.round(payeE * TAUX),
                            status: "pending", dateArrivee: "", conteneurArrivee: ""
                        });
                        count++;
                    }

                } else if (type === 'abidjan') {
                    // OPTIMISATION : On ne fait plus de requêtes ici pour aller plus vite
                    // Le nettoyage se fera via le bouton "Synchroniser" dans Arrivages
                    
                    for (const row of rows) {
                        const ref = row.reference?.trim();
                        if (!ref) continue;

                        const prix = parseFloat(row.prix);
                        const mP = parseFloat(row.montantParis)||0;
                        const mA = parseFloat(row.montantAbidjan)||0;
                        const nom = row.nom?.trim() || ""; // Si vide, tant pis, on synchronisera plus tard

                        const docRef = db.collection("transactions").doc();
                        batch.set(docRef, {
                            date: commonDate, reference: ref, nom: nom, conteneur: commonConteneur,
                            prix: prix, montantParis: mP, montantAbidjan: mA, reste: (mP+mA)-prix,
                            isDeleted: false, agent: '', agentMobileMoney: '', commune: ''
                        });
                        count++;
                    }

                } else if (type === 'expenses') {
                    rows.forEach(row => {
                        if (row.date && row.description) {
                            batch.set(db.collection("expenses").doc(), {
                                date: row.date, description: row.description, montant: parseFloat(row.montant),
                                type: row.type||'Mensuelle', conteneur: row.conteneur||'', action: 'Depense', isDeleted: false
                            });
                            count++;
                        }
                    });

                } else if (type === 'bank') {
                    rows.forEach(row => {
                        if (row.date && row.description) {
                            batch.set(db.collection("bank_movements").doc(), {
                                date: row.date, description: row.description, type: row.type, montant: parseFloat(row.montant), isDeleted: false
                            });
                            count++;
                        }
                    });

                } else if (type === 'income') {
                    rows.forEach(row => {
                        if (row.date && row.description) {
                            batch.set(db.collection("other_income").doc(), {
                                date: row.date, description: row.description, montant: parseFloat(row.montant), isDeleted: false
                            });
                            count++;
                        }
                    });
                }

                if (count > 0) {
                    await batch.commit();
                    importLog.textContent = `Terminé ! ${count} éléments importés avec succès.`;
                } else {
                    importLog.textContent = "Aucune donnée valide trouvée.";
                }
                csvFile.value = '';
            }
        });
    });
});