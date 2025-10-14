document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    // --- CONFIGURATION ET SÉLECTIONS DU DOM ---
    const transactionsCollection = db.collection("transactions");
    let referenceDB = {};
    try {
        referenceDB = await fetch('references.json').then(res => res.json());
    } catch (error) {
        console.error("Erreur critique: Impossible de charger le fichier references.json.", error);
        alert("Attention : le fichier des références n'a pas pu être chargé.");
    }

    const addEntryBtn = document.getElementById('addEntryBtn');
    const saveDayBtn = document.getElementById('saveDayBtn');
    const dailyTableBody = document.getElementById('dailyTableBody');
    const formContainer = document.getElementById('caisseForm');
    const prixInput = document.getElementById('prix');
    const montantParisInput = document.getElementById('montantParis');
    const montantAbidjanInput = document.getElementById('montantAbidjan');
    const resteInput = document.getElementById('reste');
    const referenceInput = document.getElementById('reference');
    const referenceList = document.getElementById('referenceList');
    
    const dailyTotalPrixEl = document.getElementById('dailyTotalPrix');
    const dailyTotalPercuEl = document.getElementById('dailyTotalPercu');
    const dailyTotalResteEl = document.getElementById('dailyTotalReste');

    let dailyTransactions = JSON.parse(localStorage.getItem('dailyTransactions')) || [];

    // --- FONCTIONS ---
    function saveDailyToLocalStorage() {
        localStorage.setItem('dailyTransactions', JSON.stringify(dailyTransactions));
    }

    function updateDailySummary() {
        const totalPrix = dailyTransactions.reduce((sum, t) => sum + t.prix, 0);
        const totalParis = dailyTransactions.reduce((sum, t) => sum + t.montantParis, 0);
        const totalAbidjan = dailyTransactions.reduce((sum, t) => sum + t.montantAbidjan, 0);
        const totalPercu = totalParis + totalAbidjan;
        const totalReste = dailyTransactions.reduce((sum, t) => sum + t.reste, 0);

        dailyTotalPrixEl.textContent = formatCFA(totalPrix);
        dailyTotalPercuEl.textContent = formatCFA(totalPercu);
        dailyTotalResteEl.textContent = formatCFA(totalReste);

        dailyTotalResteEl.className = totalReste < 0 ? 'reste-negatif' : 'reste-positif';
    }

    function renderDailyTable() {
        dailyTableBody.innerHTML = '';
        dailyTransactions.forEach((data, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Référence / Client">${data.reference}</td>
                <td data-label="Prix">${formatCFA(data.prix)}</td>
                <td data-label="Reste" class="${data.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.reste)}</td>
                <td data-label="Action"><button class="deleteBtn" data-index="${index}">X</button></td>
            `;
            dailyTableBody.appendChild(row);
        });

        document.getElementById('dailyCount').textContent = dailyTransactions.length;
        updateDailySummary();
    }

    // --- ÉVÉNEMENTS ---
    addEntryBtn.addEventListener('click', () => {
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

        dailyTransactions.push(newData);
        saveDailyToLocalStorage();
        renderDailyTable();
        
        formContainer.querySelectorAll('input, select').forEach(el => {
            if(el.type !== 'date') el.value = '';
        });
        resteInput.className = '';
        referenceInput.focus();
    });

    saveDayBtn.addEventListener('click', () => {
        if (dailyTransactions.length === 0) {
            alert("Aucune opération à enregistrer.");
            return;
        }
        if (!confirm(`Voulez-vous vraiment enregistrer les ${dailyTransactions.length} opérations de la journée ? Cette action est irréversible.`)) {
            return;
        }

        const batch = db.batch();
        dailyTransactions.forEach(transac => {
            const docRef = transactionsCollection.doc();
            batch.set(docRef, transac);
        });

        batch.commit().then(() => {
            alert(`${dailyTransactions.length} opérations ont été enregistrées avec succès dans l'historique !`);
            dailyTransactions = [];
            saveDailyToLocalStorage();
            renderDailyTable();
        }).catch(err => {
            console.error("Erreur lors de l'enregistrement en batch : ", err);
            alert("Une erreur est survenue. Veuillez vérifier votre connexion et réessayer.");
        });
    });

    dailyTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            dailyTransactions.splice(index, 1);
            saveDailyToLocalStorage();
            renderDailyTable();
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

    // --- FONCTIONS UTILITAIRES ---
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
    renderDailyTable();
    populateDatalist();
});