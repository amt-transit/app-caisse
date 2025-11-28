document.addEventListener('DOMContentLoaded', async () => {
    const usersList = document.getElementById('usersList');
    const createUserBtn = document.getElementById('createUserBtn');
    const newUsername = document.getElementById('newUsername'); // ID Modifié
    const newPassword = document.getElementById('newPassword');
    const newRole = document.getElementById('newRole');

    const DOMAIN_SUFFIX = "@amt.local"; // Le même que dans login.js

    // --- GESTION UTILISATEURS ---
    db.collection('users').onSnapshot(snapshot => {
        usersList.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'user-card';
            
            // NETTOYAGE DU NOM POUR L'AFFICHAGE
            // On prend l'email stocké et on enlève "@amt.local"
            let displayUser = data.email || "Inconnu";
            displayUser = displayUser.replace(DOMAIN_SUFFIX, ""); 
            
            div.innerHTML = `
                <div style="flex-grow: 1;">
                    <span style="font-size: 14px; font-weight: bold; color: #333;">${displayUser}</span>
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

    // 2. Créer un utilisateur (VERSION NOM D'UTILISATEUR)
    createUserBtn.addEventListener('click', () => {
        // On récupère le NOM, pas l'email
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value.trim();
        const role = newRole.value;

        if (!username || !password) return alert("Nom d'utilisateur et mot de passe requis.");

        // ON CRÉE L'EMAIL TECHNIQUE AUTOMATIQUEMENT
        // On enlève les espaces et met en minuscule pour l'email
        const cleanUsername = username.toLowerCase().replace(/\s+/g, '');
        const emailTechnique = `${cleanUsername}@amt.local`;

        // ASTUCE : Initialiser une 2ème app Firebase temporaire
        const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");

        secondaryApp.auth().createUserWithEmailAndPassword(emailTechnique, password)
            .then((userCred) => {
                // On stocke le "Vrai Nom" (username) dans la base pour l'affichage
                return db.collection('users').doc(userCred.user.uid).set({
                    role: role,
                    email: emailTechnique, // On garde l'email technique
                    displayName: username  // On garde le joli nom "Salif"
                });
            })
            .then(() => {
                alert(`Utilisateur "${username}" créé avec succès !\nLogin : ${username}\nMot de passe : ${password}`);
                secondaryApp.auth().signOut(); 
                secondaryApp.delete(); 
                document.getElementById('newUsername').value = ''; 
                document.getElementById('newPassword').value = '';
            })
            .catch((error) => {
                console.error(error);
                alert("Erreur : " + error.message);
                secondaryApp.delete();
            });
    });

    // ... (Affichage de la liste - Mise à jour) ...
    db.collection('users').onSnapshot(snapshot => {
        usersList.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            // On affiche le "displayName" s'il existe, sinon on nettoie l'email
            let nomAffichable = data.displayName;
            if (!nomAffichable && data.email) {
                nomAffichable = data.email.replace('@amt.local', '');
            }
            
            const div = document.createElement('div');
            div.className = 'user-card';
            div.innerHTML = `
                <div style="flex-grow: 1;">
                    <span style="font-size: 14px; font-weight: bold; color: #333;">${nomAffichable || 'Inconnu'}</span>
                    <br>
                    <small style="color: #888; font-size: 10px;">Rôle: ${data.role}</small>
                </div>
                `;
            usersList.appendChild(div);
        });
    });

    window.deleteUser = (uid) => {
        if(confirm("Supprimer cet utilisateur ? (Il faudra le recréer)")) {
            db.collection('users').doc(uid).delete();
        }
    };

    // --- GESTION IMPORTS CENTRALISÉS ---
    const importType = document.getElementById('importType');
    const csvInstructions = document.getElementById('csvInstructions'); // NOUVEAU
    const dynamicInputs = document.getElementById('dynamicInputs');
    const csvFile = document.getElementById('csvFile');
    const startImportBtn = document.getElementById('startImportBtn');
    const importLog = document.getElementById('importLog');

    // Afficher les instructions et champs selon le type
    importType.addEventListener('change', () => {
        const type = importType.value;
        dynamicInputs.innerHTML = ''; 
        csvInstructions.innerHTML = ''; 
        csvInstructions.style.display = 'none';
        csvFile.style.display = 'none';
        startImportBtn.style.display = 'none';
        importLog.style.display = 'none';

        if (!type) return;

        // --- DÉFINITION DES INSTRUCTIONS ---
        let instructionsHTML = "";
        
        if (type === 'paris') {
            instructionsHTML = `
                <strong>Fichier COMPLET requis (Point-virgule ;)</strong><br>
                Colonnes obligatoires : <code>DATE DU TRANSFERT</code>, <code>REFERENCE</code>, <code>EXPEDITEUR</code>, <code>PRIX</code>, <code>MONTANT PAYER</code><br>
                Colonnes optionnelles (CRM) : <code>DESTINATEUR</code>, <code>ADRESSES</code>, <code>TYPE COLIS</code>, <code>QUANTITE</code>
            `;
        } else if (type === 'abidjan') {
            instructionsHTML = `
                <strong>Fichier Réception (Virgule ,)</strong><br>
                1. Sélectionnez la <strong>Date</strong> et le <strong>Conteneur</strong> ci-dessous.<br>
                2. Colonnes CSV : <code>reference</code>, <code>prix</code>, <code>nom</code> (optionnel), <code>montantParis</code> (opt), <code>montantAbidjan</code> (opt)
            `;
            // Inputs dynamiques pour Abidjan
            dynamicInputs.innerHTML = `
                <input type="date" id="impDate" placeholder="Date" required>
                <input type="text" id="impConteneur" placeholder="Conteneur (ex: D35)" required>
            `;
        } else if (type === 'expenses') {
            instructionsHTML = `
                <strong>Fichier Dépenses (Virgule ,)</strong><br>
                Colonnes : <code>date</code>, <code>description</code>, <code>montant</code>, <code>type</code> (Mensuelle/Conteneur), <code>conteneur</code>
            `;
        } else if (type === 'bank') {
            instructionsHTML = `
                <strong>Fichier Banque (Virgule ,)</strong><br>
                Colonnes : <code>date</code>, <code>description</code>, <code>type</code> (Depot/Retrait), <code>montant</code>
            `;
        } else if (type === 'income') {
            instructionsHTML = `
                <strong>Fichier Autres Entrées (Virgule ,)</strong><br>
                Colonnes : <code>date</code>, <code>description</code>, <code>montant</code>
            `;
        }

        // Affichage
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
            delimiter: (type === 'paris') ? ";" : ",", // Point-virgule pour Paris seulement
            complete: async (results) => {
                const rows = results.data;
                const batch = db.batch();
                let count = 0;

                // --- LOGIQUE PAR TYPE ---
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
                    for (const row of rows) {
                        const ref = row.reference?.trim();
                        if (!ref) continue;

                        const prix = parseFloat(row.prix);
                        const mP = parseFloat(row.montantParis)||0;
                        const mA = parseFloat(row.montantAbidjan)||0;
                        
                        let nom = row.nom?.trim();
                        if (!nom) {
                            const q = await db.collection("paris_manifest").where("reference", "==", ref).get();
                            if (!q.empty) nom = q.docs[0].data().nomClient;
                        }

                        const docRef = db.collection("transactions").doc();
                        batch.set(docRef, {
                            date: commonDate, reference: ref, nom: nom||"", conteneur: commonConteneur,
                            prix: prix, montantParis: mP, montantAbidjan: mA, reste: (mP+mA)-prix,
                            isDeleted: false, agent: '', agentMobileMoney: '', commune: ''
                        });
                        
                        const qM = await db.collection("paris_manifest").where("reference", "==", ref).get();
                        if (!qM.empty) batch.delete(qM.docs[0].ref);
                        
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