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
    //          FONCTION RENDERTABLE ENTIÈREMENT RÉÉCRITE
    // =====================================================================
    function renderTable(transactions) {
        tableBody.innerHTML = '';
        if (transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10">Aucun historique trouvé.</td></tr>';
            return;
        }

        // 1. On regroupe toutes les transactions par date
        const groupedByDate = transactions.reduce((groups, item) => {
            const date = item.date;
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(item);
            return groups;
        }, {});

        // 2. Pour chaque groupe (chaque jour), on crée un <tbody> qui sera notre "carte"
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

        sortedDates.forEach(date => {
            const dailyTransactions = groupedByDate[date];
            
            // On crée un <tbody> pour le jour
            const dailyGroupBody = document.createElement('tbody');
            dailyGroupBody.className = 'daily-group'; // Classe pour le style de la carte

            // 3. On calcule les sous-totaux pour ce jour
            const subtotals = dailyTransactions.reduce((totals, t) => {
                totals.prix += t.prix;
                totals.montantParis += t.montantParis;
                totals.montantAbidjan += t.montantAbidjan;
                totals.reste += t.reste;
                return totals;
            }, { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 });

            // 4. On ajoute chaque ligne de transaction au <tbody>
            dailyTransactions.forEach(data => {
                const dataRow = document.createElement('tr');
                const reste_class = data.reste < 0 ? 'reste-negatif' : 'reste-positif';
                dataRow.innerHTML = `
                    <td data-label="Date">${data.date}</td>
                    <td data-label="Référence">${data.reference}</td>
                    <td data-label="Prix">${formatCFA(data.prix)}</td>
                    <td data-label="Montant Paris">${formatCFA(data.montantParis)}</td>
                    <td data-label="Montant Abidjan">${formatCFA(data.montantAbidjan)}</td>
                    <td data-label="Agent MM"><span class="tag ${textToClassName(data.agentMobileMoney)}">${data.agentMobileMoney || ''}</span></td>
                    <td data-label="Reste" class="${reste_class}">${formatCFA(data.reste)}</td>
                    <td data-label="Commune"><span class="tag ${textToClassName(data.commune)}">${data.commune || ''}</span></td>
                    <td data-label="Agent"><span class="tag ${textToClassName(data.agent)}">${data.agent || ''}</span></td>
                    <td data-label="Action"><button class="deleteBtn" data-id="${data.id}">Suppr.</button></td>`;
                dailyGroupBody.appendChild(dataRow);
            });

            // 5. On ajoute la ligne de sous-total À LA FIN du même <tbody>
            const subtotalRow = document.createElement('tr');
            subtotalRow.className = 'subtotal-row';
            subtotalRow.innerHTML = `
                <td data-label="Total du" colspan="2">TOTAL DU ${date}</td>
                <td data-label="Total Prix">${formatCFA(subtotals.prix)}</td>
                <td data-label="Total Paris">${formatCFA(subtotals.montantParis)}</td>
                <td data-label="Total Abidjan">${formatCFA(subtotals.montantAbidjan)}</td>
                <td></td>
                <td data-label="Total Reste">${formatCFA(subtotals.reste)}</td>
                <td colspan="3"></td>`;
            dailyGroupBody.appendChild(subtotalRow);

            // 6. On ajoute le groupe complet (le <tbody>) au tableau principal
            tableBody.appendChild(dailyGroupBody);
        });
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