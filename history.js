document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    const transactionsCollection = db.collection("transactions");
    const tableBody = document.getElementById('tableBody');

    transactionsCollection.orderBy("date", "desc").onSnapshot(snapshot => {
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable(transactions);
    }, error => {
        console.error("Erreur de l'écouteur Firestore: ", error);
    });

    tableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression définitive de cette entrée de l'historique ?")) {
                transactionsCollection.doc(docId).delete();
            }
        }
    });

    function renderTable(transactions) {
        tableBody.innerHTML = '';
        if (transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10">Aucun historique trouvé.</td></tr>';
            return;
        }

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

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number);
    }

    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }
});