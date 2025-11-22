document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const parisManifestCollection = db.collection("paris_manifest");

    const clientSearchInput = document.getElementById('clientSearch');
    const clientsList = document.getElementById('clientsList');
    const clientProfile = document.getElementById('clientProfile');

    // Éléments du profil
    const profileName = document.getElementById('profileName');
    const profileTotalSpent = document.getElementById('profileTotalSpent');
    const profileShipmentCount = document.getElementById('profileShipmentCount');
    const profileLastDate = document.getElementById('profileLastDate');
    const recipientsTableBody = document.getElementById('recipientsTableBody');
    const shipmentsTableBody = document.getElementById('shipmentsTableBody');

    let allClientNames = new Set();

    // 1. CHARGEMENT DES NOMS POUR LA RECHERCHE
    // On récupère les noms depuis Paris Manifest (plus fiable pour les expéditeurs)
    // et Transactions pour compléter.
    async function loadClientNames() {
        // Depuis Paris (Source principale)
        const parisSnap = await parisManifestCollection.limit(1000).get(); // Limite pour perf
        parisSnap.forEach(doc => {
            const name = doc.data().nomClient;
            if (name) allClientNames.add(name.trim());
        });

        // Depuis Abidjan
        const abidjanSnap = await transactionsCollection.limit(1000).get();
        abidjanSnap.forEach(doc => {
            const name = doc.data().nom;
            if (name) allClientNames.add(name.trim());
        });

        // Remplir le datalist
        const sortedNames = Array.from(allClientNames).sort();
        clientsList.innerHTML = '';
        sortedNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            clientsList.appendChild(option);
        });
    }

    loadClientNames();

    // 2. DÉTECTION DE LA SÉLECTION DU CLIENT
    clientSearchInput.addEventListener('change', async () => {
        const selectedClient = clientSearchInput.value.trim();
        if (!selectedClient) {
            clientProfile.style.display = 'none';
            return;
        }

        await generateClientReport(selectedClient);
    });

    // 3. GÉNÉRATION DU RAPPORT
    async function generateClientReport(clientName) {
        clientProfile.style.display = 'block';
        profileName.textContent = "Chargement...";

        // A. Récupérer les données de Paris (Contient Destinataire et Adresse !)
        const parisQuery = await parisManifestCollection.where("nomClient", "==", clientName).get();
        const parisData = parisQuery.docs.map(doc => doc.data());

        // B. Récupérer les données d'Abidjan (Contient Paiements)
        const abidjanQuery = await transactionsCollection.where("nom", "==", clientName).get();
        const abidjanData = abidjanQuery.docs.map(doc => doc.data());

        // C. Calculs
        let totalSpent = 0;
        let shipments = [];
        let recipientsMap = {}; // Pour compter les fréquences

        // Traitement des données Paris (Source riche)
        parisData.forEach(item => {
            totalSpent += (item.prixCFA || 0);
            
            // Analyse des Destinataires
            const dest = item.nomDestinataire || "Non spécifié";
            const addr = item.adresseDestinataire || "";
            
            if (!recipientsMap[dest]) {
                recipientsMap[dest] = { count: 0, address: addr };
            }
            recipientsMap[dest].count++;
            // On met à jour l'adresse si on en trouve une plus récente/remplie
            if (addr && !recipientsMap[dest].address) recipientsMap[dest].address = addr;

            shipments.push({
                date: item.dateParis,
                ref: item.reference,
                type: item.typeColis || "Colis",
                dest: dest,
                source: "Paris"
            });
        });

        // Traitement des données Abidjan (Complément)
        abidjanData.forEach(item => {
            // On évite les doublons si la réf est déjà venue de Paris
            if (!shipments.find(s => s.ref === item.reference)) {
                totalSpent += (item.prix || 0);
                shipments.push({
                    date: item.date,
                    ref: item.reference,
                    type: "Colis",
                    dest: "-", // Souvent pas de destinataire dans la saisie Abidjan
                    source: "Abidjan"
                });
            }
        });

        // Trier les envois par date décroissante
        shipments.sort((a, b) => new Date(b.date) - new Date(a.date));

        // D. Affichage des Infos Générales
        profileName.textContent = clientName;
        profileTotalSpent.textContent = formatCFA(totalSpent);
        profileShipmentCount.textContent = shipments.length;
        profileLastDate.textContent = shipments.length > 0 ? shipments[0].date : "-";

        // E. Affichage des Destinataires Fréquents
        // Convertir map en tableau et trier
        const sortedRecipients = Object.entries(recipientsMap)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.count - a.count);

        recipientsTableBody.innerHTML = '';
        if (sortedRecipients.length === 0) {
            recipientsTableBody.innerHTML = '<tr><td colspan="3">Aucun destinataire trouvé.</td></tr>';
        }
        sortedRecipients.forEach(r => {
            // On ignore les "Non spécifié" s'ils sont seuls
            if (r.name === "Non spécifié" && sortedRecipients.length > 1) return;

            recipientsTableBody.innerHTML += `
                <tr>
                    <td><b>${r.name}</b></td>
                    <td style="font-size:0.9em; color:#666;">${r.address || '-'}</td>
                    <td><span class="tag" style="background:#28a745;">${r.count} fois</span></td>
                </tr>
            `;
        });

        // F. Affichage de l'Historique
        shipmentsTableBody.innerHTML = '';
        shipments.forEach(s => {
            shipmentsTableBody.innerHTML += `
                <tr>
                    <td>${s.date}</td>
                    <td>${s.ref}</td>
                    <td>${s.type}</td>
                    <td>${s.dest}</td>
                </tr>
            `;
        });
    }

    function formatCFA(n) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0);
    }
});