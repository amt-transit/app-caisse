document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const transactionsCollection = db.collection("transactions");
    
    const agentSelectElement = document.getElementById('agent');
    const agentChoices = new Choices(agentSelectElement, {
        removeItemButton: true, placeholder: true, searchPlaceholderValue: 'Rechercher un agent...',
    });

    const addEntryBtn = document.getElementById('addEntryBtn');
    const saveDayBtn = document.getElementById('saveDayBtn');
    const dailyTableBody = document.getElementById('dailyTableBody');
    const formContainer = document.getElementById('caisseForm');
    
    const referenceInput = document.getElementById('reference'); 
    const nomInput = document.getElementById('nom');
    const conteneurInput = document.getElementById('conteneur');
    const prixInput = document.getElementById('prix');
    const montantParisInput = document.getElementById('montantParis');
    const montantAbidjanInput = document.getElementById('montantAbidjan');
    const agentMobileMoneyInput = document.getElementById('agentMobileMoney');
    const modePaiementInput = document.getElementById('modePaiement'); // NOUVEAU
    const resteInput = document.getElementById('reste');
    const communeInput = document.getElementById('commune');
    const referenceList = document.getElementById('referenceList');
    
    const dailyTotalPrixEl = document.getElementById('dailyTotalPrix');
    const dailyTotalAbidjanEspecesEl = document.getElementById('dailyTotalAbidjanEspeces');
    const dailyTotalParisEl = document.getElementById('dailyTotalParis');
    const dailyTotalMobileMoneyEl = document.getElementById('dailyTotalMobileMoney');
    const dailyTotalResteEl = document.getElementById('dailyTotalReste');

    let dailyTransactions = JSON.parse(localStorage.getItem('dailyTransactions')) || [];

    function saveDailyToLocalStorage() { localStorage.setItem('dailyTransactions', JSON.stringify(dailyTransactions)); }
    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
    function textToClassName(t) { return t ? t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-') : ''; }
    
    function calculateAndStyleReste() {
        const prix = parseFloat(prixInput.value) || 0;
        const paris = parseFloat(montantParisInput.value) || 0;
        const abidjan = parseFloat(montantAbidjanInput.value) || 0;
        const reste = (paris + abidjan) - prix;
        resteInput.value = reste;
        resteInput.className = reste > 0 ? 'reste-positif' : 'reste-negatif';
    }

    function updateDailySummary() {
        let totalPrix = 0, totalAbidjanEspeces = 0, totalParis = 0, totalMobileMoney = 0;
        dailyTransactions.forEach(t => {
            totalPrix += (t.prix || 0);
            if (t.agentMobileMoney && t.agentMobileMoney !== '') {
                totalMobileMoney += (t.montantParis || 0) + (t.montantAbidjan || 0);
            } else {
                totalAbidjanEspeces += (t.montantAbidjan || 0);
                totalParis += (t.montantParis || 0);
            }
        });
        const totalPercu = totalAbidjanEspeces + totalParis + totalMobileMoney;
        const totalReste = totalPercu - totalPrix;
        dailyTotalPrixEl.textContent = formatCFA(totalPrix);
        dailyTotalAbidjanEspecesEl.textContent = formatCFA(totalAbidjanEspeces);
        dailyTotalParisEl.textContent = formatCFA(totalParis);
        dailyTotalMobileMoneyEl.textContent = formatCFA(totalMobileMoney);
        dailyTotalResteEl.textContent = formatCFA(totalReste);
        dailyTotalResteEl.className = totalReste < 0 ? 'reste-negatif' : 'reste-positif';
    }

    function renderDailyTable() {
        dailyTableBody.innerHTML = '';
        dailyTransactions.forEach((data, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${data.reference}</td>
                <td>${data.nom || '-'}</td>
                <td>${formatCFA(data.prix)}</td>
                <td>${data.modePaiement}</td> <td class="${data.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.reste)}</td>
                <td><button class="deleteBtn" data-index="${index}">X</button></td>
            `;
            dailyTableBody.appendChild(row);
        });
        document.getElementById('dailyCount').textContent = dailyTransactions.length;
        updateDailySummary();
    }
    
    function populateDatalist() {
        transactionsCollection.where("isDeleted", "!=", true).limit(500).get().then(snapshot => {
            const references = new Set(); 
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.reference) {
                    let opt = document.createElement('option');
                    opt.value = d.reference;
                    referenceList.appendChild(opt);
                }
                if (d.nom) {
                    let opt = document.createElement('option');
                    opt.value = d.nom;
                    referenceList.appendChild(opt);
                }
            });
        });
    }
    
    function clearDisplayFields() {
        prixInput.value = ''; conteneurInput.value = '';
        resteInput.value = ''; resteInput.className = '';
        montantParisInput.placeholder = 'Montant Paris';
        montantAbidjanInput.placeholder = 'Montant Abidjan';
    }

    function fillFormWithData(data) {
        prixInput.value = data.prix;
        if(!nomInput.value) nomInput.value = data.nom || '';
        if(!referenceInput.value) referenceInput.value = data.reference || '';
        conteneurInput.value = data.conteneur || '';
        if (data.reste < 0) {
            resteInput.value = data.reste;
            resteInput.className = 'reste-negatif';
            montantParisInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
            montantAbidjanInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
        } else {
            resteInput.value = 0;
            resteInput.className = 'reste-positif';
            montantParisInput.placeholder = "Soldé";
            montantAbidjanInput.placeholder = "Soldé";
        }
    }

    // --- AJOUTER ---
    addEntryBtn.addEventListener('click', () => {
        const selectedAgents = agentChoices.getValue(true); 
        const agentString = selectedAgents.join(', '); 

        const newData = {
            date: document.getElementById('date').value,
            reference: referenceInput.value.trim(),
            nom: nomInput.value.trim(),
            conteneur: conteneurInput.value.trim().toUpperCase(),
            prix: parseFloat(prixInput.value) || 0,
            montantParis: parseFloat(montantParisInput.value) || 0,
            montantAbidjan: parseFloat(montantAbidjanInput.value) || 0,
            agentMobileMoney: agentMobileMoneyInput.value,
            modePaiement: modePaiementInput.value, // NOUVEAU
            commune: communeInput.value, 
            agent: agentString,
            reste: 0
        };

        if (!newData.date || !newData.reference) return alert("Remplissez la date et la référence/nom.");
        if (newData.prix <= 0) return alert("Prix invalide.");

        const totalPaye = newData.montantParis + newData.montantAbidjan;
        if (totalPaye > newData.prix) return alert(`IMPOSSIBLE : Trop perçu.`);
        newData.reste = totalPaye - newData.prix;

        const existingIndex = dailyTransactions.findIndex(t => t.reference === newData.reference);
        if (existingIndex > -1) {
            const t = dailyTransactions[existingIndex];
            const nouveauTotal = t.montantParis + t.montantAbidjan + newData.montantParis + newData.montantAbidjan;
            if (nouveauTotal > t.prix) return alert("IMPOSSIBLE : Cumul trop élevé.");
            
            t.montantParis += newData.montantParis;
            t.montantAbidjan += newData.montantAbidjan;
            if (newData.agentMobileMoney) t.agentMobileMoney = newData.agentMobileMoney;
            t.modePaiement = newData.modePaiement; // Met à jour le dernier mode
            t.reste = (t.montantParis + t.montantAbidjan) - t.prix;
        } else {
            dailyTransactions.push(newData);
        }
        
        saveDailyToLocalStorage();
        renderDailyTable();
        
        formContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date' && el.id !== 'agent' && el.id !== 'commune') el.value = '';
            if (el.id === 'modePaiement') el.value = 'Espèce'; // Reset à Espèce
        });
        agentChoices.setValue([]); 
        resteInput.className = '';
        referenceInput.focus();
    });

    // --- ENREGISTRER ---
    saveDayBtn.addEventListener('click', async () => {
        if (dailyTransactions.length === 0) return alert("Rien à enregistrer.");
        if (!confirm(`Enregistrer les ${dailyTransactions.length} opérations ?`)) return;

        const batch = db.batch();
        
        for (const transac of dailyTransactions) {
            const query = await transactionsCollection.where("reference", "==", transac.reference).get();
            
            const paymentEntry = {
                date: transac.date,
                montantParis: transac.montantParis,
                montantAbidjan: transac.montantAbidjan,
                agent: transac.agent,
                modePaiement: transac.modePaiement, // NOUVEAU
                agentMobileMoney: transac.agentMobileMoney
            };

            if (!query.empty) {
                const docRef = query.docs[0].ref;
                const oldData = query.docs[0].data();
                const updatedData = {
                    montantParis: (oldData.montantParis || 0) + transac.montantParis,
                    montantAbidjan: (oldData.montantAbidjan || 0) + transac.montantAbidjan,
                    reste: (oldData.reste || 0) + transac.montantParis + transac.montantAbidjan,
                    date: transac.date || oldData.date,
                    agent: transac.agent || oldData.agent || '',
                    agentMobileMoney: transac.agentMobileMoney || oldData.agentMobileMoney || '',
                    modePaiement: transac.modePaiement, // Met à jour le dernier mode
                    commune: transac.commune || oldData.commune || '',
                    nom: oldData.nom || transac.nom || '', 
                    conteneur: oldData.conteneur || transac.conteneur || '',
                    paymentHistory: firebase.firestore.FieldValue.arrayUnion(paymentEntry)
                };
                batch.update(docRef, updatedData);
            } else {
                const docRef = transactionsCollection.doc();
                const newData = {
                    ...transac,
                    isDeleted: false,
                    paymentHistory: [paymentEntry]
                };
                batch.set(docRef, newData);
            }
        }
        
        batch.commit().then(() => {
            alert(`Succès !`);
            dailyTransactions = [];
            saveDailyToLocalStorage();
            renderDailyTable();
        }).catch(err => console.error("Erreur : ", err));
    });

    dailyTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            dailyTransactions.splice(index, 1);
            saveDailyToLocalStorage();
            renderDailyTable();
        }
    });

    referenceInput.addEventListener('input', async () => {
        const refValue = referenceInput.value.trim();
        if (!refValue) { clearDisplayFields(); nomInput.value = ''; return; }
        const query = await transactionsCollection.where("reference", "==", refValue).get();
        if (!query.empty) { fillFormWithData(query.docs[0].data()); } 
        else { clearDisplayFields(); }
    });

    nomInput.addEventListener('input', async () => {
        const nomValue = nomInput.value.trim();
        const refValue = referenceInput.value.trim();
        if (refValue) return; 
        if (!nomValue) { clearDisplayFields(); referenceInput.value=''; return; }
        const query = await transactionsCollection.where("nom", "==", nomValue).get();
        if (!query.empty) {
            const data = query.docs[0].data();
            referenceInput.value = data.reference;
            fillFormWithData(data);
        } else { clearDisplayFields(); }
    });

    prixInput.addEventListener('input', calculateAndStyleReste);
    montantParisInput.addEventListener('input', calculateAndStyleReste);
    montantAbidjanInput.addEventListener('input', calculateAndStyleReste);
    renderDailyTable();
    populateDatalist(); 
});