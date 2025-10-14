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
    }, error => console.error("Erreur Firestore: ", error));

    tableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression définitive de cette entrée ?")) {
                transactionsCollection.doc(docId).delete();
            }
        }
    });

    // =====================================================================
    //          FONCTION RENDERTABLE CORRIGÉE (LOGIQUE SIMPLIFIÉE)
    // =====================================================================
    function renderTable(transactions) {
        tableBody.innerHTML = ''; // On vide le tbody principal
        if (transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10">Aucun historique trouvé.</td></tr>';
            return;
        }

        let currentSubtotals = { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 };
        let currentDate = transactions[0].date;

        transactions.forEach((data) => {
            // Si la date change, on insère la ligne de total pour le jour précédent
            if (data.date !== currentDate) {
                insertSubtotalRow(currentDate, currentSubtotals);
                // On réinitialise pour le nouveau jour
                currentDate = data.date;
                currentSubtotals = { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 };
            }
            
            // On ajoute les montants de la transaction actuelle aux totaux du jour
            currentSubtotals.prix += data.prix;
            currentSubtotals.montantParis += data.montantParis;
            currentSubtotals.montantAbidjan += data.montantAbidjan;
            currentSubtotals.reste += data.reste;
            
            // On insère la ligne de données
            insertDataRow(data);
        });

        // À la fin de la boucle, on insère la ligne de total pour le tout dernier jour
        insertSubtotalRow(currentDate, currentSubtotals);
    }

    function insertDataRow(data) {
        const newRow = document.createElement('tr'); // Crée une ligne <tr>
        const reste_class = data.reste < 0 ? 'reste-negatif' : 'reste-positif';
        newRow.innerHTML = `
            <td>${data.date}</td>
            <td>${data.reference}</td>
            <td>${formatCFA(data.prix)}</td>
            <td>${formatCFA(data.montantParis)}</td>
            <td>${formatCFA(data.montantAbidjan)}</td>
            <td><span class="tag ${textToClassName(data.agentMobileMoney)}">${data.agentMobileMoney || ''}</span></td>
            <td class="${reste_class}">${formatCFA(data.reste)}</td>
            <td><span class="tag ${textToClassName(data.commune)}">${data.commune || ''}</span></td>
            <td><span class="tag ${textToClassName(data.agent)}">${data.agent || ''}</span></td>
            <td><button class="deleteBtn" data-id="${data.id}">Suppr.</button></td>`;
        tableBody.appendChild(newRow); // Ajoute la ligne <tr> au tbody principal
    }

    function insertSubtotalRow(date, totals) {
        const subtotalRow = document.createElement('tr'); // Crée une ligne de total <tr>
        subtotalRow.className = 'subtotal-row';
        subtotalRow.innerHTML = `
            <td colspan="2">TOTAL DU ${date}</td>
            <td>${formatCFA(totals.prix)}</td>
            <td>${formatCFA(totals.montantParis)}</td>
            <td>${formatCFA(totals.montantAbidjan)}</td>
            <td></td>
            <td>${formatCFA(totals.reste)}</td>
            <td colspan="3"></td>`;
        tableBody.appendChild(subtotalRow); // Ajoute la ligne de total <tr> au tbody principal
    }

    // Les fonctions utilitaires ne changent pas
    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number);
    }
    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }
});