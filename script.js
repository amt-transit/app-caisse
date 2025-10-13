document.addEventListener('DOMContentLoaded', async () => {
    // Vérification que Firebase est bien chargé et initialisé
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur critique: La connexion à la base de données a échoué. Vérifiez les balises script dans votre HTML et votre connexion internet.");
        return;
    }
    
    // --- SÉLECTIONS ET CONFIGURATION ---
    const transactionsCollection = db.collection("transactions");
    let referenceDB = {};
    try {
        referenceDB = await fetch('references.json').then(res => res.json());
    } catch (error) {
        console.error("Impossible de charger le fichier references.json", error);
    }

    const caisseForm = document.getElementById('caisseForm');
    const tableBody = document.getElementById('tableBody');
    const prixInput = document.getElementById('prix');
    const montantParisInput = document.getElementById('montantParis');
    const montantAbidjanInput = document.getElementById('montantAbidjan');
    const resteInput = document.getElementById('reste');
    const referenceInput = document.getElementById('reference');
    const referenceList = document.getElementById('referenceList');

    // --- ÉCOUTEUR EN TEMPS RÉEL ---
    transactionsCollection.orderBy("date", "desc").onSnapshot(snapshot => {
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable(transactions);
    }, error => {
        console.error("Erreur de l'écouteur Firestore: ", error);
    });

    // --- GESTION DES ÉVÉNEMENTS ---
    caisseForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const newData = {
            date: document.getElementById('date').value,
            reference: referenceInput.value,
            prix: parseFloat(prixInput.value) || 0,
            montantParis: parseFloat(montantParisInput.value) || 0,
            montantAbidjan: parseFloat(montantAbidjanInput.value) || 0,
            reste: parseFloat(resteInput.value) || 0,
            agentMobileMoney: document.getElementById('agentMobileMoney').value,
            commune: document.getElementById('commune').value,
            agent: document.getElementById('agent').value
        };

        if (!newData.date || !newData.reference) {
            alert("Veuillez remplir au moins la date et la référence.");
            return;
        }

        transactionsCollection.add(newData).then(() => {
            caisseForm.reset();
            resteInput.className = '';
            document.getElementById('date').focus();
        }).catch(err => console.error("Erreur lors de l'ajout des données: ", err));
    });

    tableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression de cette entrée ?")) {
                transactionsCollection.doc(docId).delete();
            }
        }
    });

    referenceInput.addEventListener('input', () => {
        const refValue = referenceInput.value;
        if (referenceDB[refValue]) {
            prixInput.value = referenceDB[refValue];
            calculateAndStyleReste();
        }
    });

    prixInput.addEventListener('input', calculateAndStyleReste);
    montantParisInput.addEventListener('input', calculateAndStyleReste);
    montantAbidjanInput.addEventListener('input', calculateAndStyleReste);

    // --- FONCTIONS D'AFFICHAGE ET UTILITAIRES ---
    
    function renderTable(transactions) {
        tableBody.innerHTML = '';
        if (transactions.length === 0) return;

        let currentSubtotals = { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 };
        let currentDate = transactions[0].date;

        transactions.forEach((data) => {
            if (data.date !== currentDate) {
                insertSubtotalRow(currentDate, currentSubtotals);
                currentDate = data.date;
                currentSubtotals = { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 };
            }
            currentSubtotals.prix += data.prix;
            currentSubtotals.montantParis += data.montantParis;
            currentSubtotals.montantAbidjan += data.montantAbidjan;
            currentSubtotals.reste += data.reste;
            insertDataRow(data);
        });
        insertSubtotalRow(currentDate, currentSubtotals);
    }
    
    function insertDataRow(data) {
        const newRow = document.createElement('tr');
        const reste_class = data.reste < 0 ? 'reste-negatif' : 'reste-positif';
        newRow.innerHTML = `
            <td data-label="Date">${data.date}</td>
            <td data-label="Référence / Client">${data.reference}</td>
            <td data-label="Prix">${formatCFA(data.prix)}</td>
            <td data-label="Montant Paris">${formatCFA(data.montantParis)}</td>
            <td data-label="Montant Abidjan">${formatCFA(data.montantAbidjan)}</td>
            <td data-label="Agent MM"><span class="tag ${textToClassName(data.agentMobileMoney)}">${data.agentMobileMoney || ''}</span></td>
            <td data-label="Reste" class="${reste_class}">${formatCFA(data.reste)}</td>
            <td data-label="Commune"><span class="tag ${textToClassName(data.commune)}">${data.commune || ''}</span></td>
            <td data-label="Agent"><span class="tag ${textToClassName(data.agent)}">${data.agent || ''}</span></td>
            <td data-label="Action"><button class="deleteBtn" data-id="${data.id}">Suppr.</button></td>`;
        tableBody.appendChild(newRow);
    }

    function insertSubtotalRow(date, totals) {
        const subtotalRow = document.createElement('tr');
        subtotalRow.className = 'subtotal-row';
        subtotalRow.innerHTML = `
            <td colspan="2">TOTAL DU ${date}</td>
            <td>${formatCFA(totals.prix)}</td>
            <td>${formatCFA(totals.montantParis)}</td>
            <td>${formatCFA(totals.montantAbidjan)}</td>
            <td></td>
            <td>${formatCFA(totals.reste)}</td>
            <td colspan="3"></td>`;
        tableBody.appendChild(subtotalRow);
    }

    function calculateAndStyleReste() {
        const prix = parseFloat(prixInput.value) || 0;
        const montantParis = parseFloat(montantParisInput.value) || 0;
        const montantAbidjan = parseFloat(montantAbidjanInput.value) || 0;
        const reste = (montantParis + montantAbidjan) - prix;
        resteInput.value = reste;
        resteInput.className = reste < 0 ? 'reste-negatif' : 'reste-positif';
    }

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number);
    }

    function textToClassName(text) {
        if (!text) return '';
        // LIGNE CORRIGÉE ICI : \u0300 au lieu de \u0e00
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }

    function populateDatalist() {
        for (const ref in referenceDB) {
            const option = document.createElement('option');
            option.value = ref;
            referenceList.appendChild(option);
        }
    }

    // --- INITIALISATION ---
    populateDatalist();
});