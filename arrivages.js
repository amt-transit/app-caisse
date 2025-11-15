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

    // --- ÉLÉMENTS DU PANNEAU 1 (RÉCEPTION ABIDJAN) ---
    const addArrivalBtn = document.getElementById('addArrivalBtn');
    const arrivalDate = document.getElementById('arrivalDate');
    const arrivalRef = document.getElementById('arrivalRef');
    // ... (tous vos autres éléments du Panneau 1)
    const arrivalsTableBody = document.getElementById('arrivalsTableBody');

    // --- ÉLÉMENTS DU PANNEAU 2 (DÉPART PARIS) ---
    const addParisBtn = document.getElementById('addParisBtn');
    const parisDate = document.getElementById('parisDate');
    const parisRef = document.getElementById('parisRef');
    const parisNom = document.getElementById('parisNom');
    const parisTableBody = document.getElementById('parisTableBody');
    const uploadParisCsvBtn = document.getElementById('uploadParisCsvBtn');
    const parisCsvFile = document.getElementById('parisCsvFile');
    const parisUploadLog = document.getElementById('parisUploadLog');
    
    // ==== NOUVELLE VARIABLE ====
    const parisPendingCountEl = document.getElementById('parisPendingCount');

    // ====================================================
    // PANNEAU 1 : LOGIQUE DE RÉCEPTION ABIDJAN
    // (Cette section est inchangée)
    // ====================================================
    arrivalRef.addEventListener('blur', async () => { /* ... (inchangé) ... */ });
    addArrivalBtn.addEventListener('click', async () => { /* ... (inchangé) ... */ });
    uploadCsvBtn.addEventListener('click', () => { /* ... (inchangé) ... */ });
    transactionsCollection.orderBy("date", "desc").limit(10).onSnapshot(snapshot => { /* ... (inchangé) ... */ });


    // ====================================================
    // PANNEAU 2 : LOGIQUE DÉPART PARIS
    // ====================================================

    // A. Ajouter un colis au manifeste (Paris)
    addParisBtn.addEventListener('click', async () => { /* ... (inchangé) ... */ });
    
    // B. Importation en masse (Paris)
    uploadParisCsvBtn.addEventListener('click', () => { /* ... (inchangé) ... */ });

    // C. Afficher les colis en attente (Paris) - (MIS À JOUR)
    parisManifestCollection
        .where("status", "==", "pending") 
        .orderBy("dateParis", "desc")
        .onSnapshot(snapshot => {
            
            // ==== LIGNE AJOUTÉE : MISE À JOUR DU COMPTEUR ====
            parisPendingCountEl.textContent = snapshot.size; 
            
            parisTableBody.innerHTML = '';
            if (snapshot.empty) {
                parisTableBody.innerHTML = '<tr><td colspan="5">Aucun colis en attente de réception.</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const item = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.dateParis}</td>
                    <td>${item.reference}</td>
                    <td>${item.nomClient}</td>
                    <td><span class="tag" style="background-color: #ffc107; color: #333;">En attente</span></td>
                    <td><button class="deleteBtn" data-id="${doc.id}">Annuler</button></td>
                `;
                parisTableBody.appendChild(row);
            });
        }, error => console.error(error));

    // D. Annuler (supprimer) un colis du manifeste
    parisTableBody.addEventListener('click', (event) => { /* ... (inchangé) ... */ });

    // ====================================================
    // FONCTION UTILITAIRE (La "Magie")
    // ====================================================
    async function updateParisManifest(reference, conteneur, dateArrivee) { /* ... (inchangé) ... */ }

    // Fonction de formatage
    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
});