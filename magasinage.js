import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // SERVICE TRANSACTION (Injecté localement car non chargé via HTML)
    const transactionService = {
        getCleanTransactions(transactions, validatedSessions) {
            return transactions.reduce((acc, t) => {
                let effectivePrix = t.prix || 0;
                if (t.adjustmentType && String(t.adjustmentType).toLowerCase() === 'reduction') {
                    effectivePrix -= (t.adjustmentVal || 0);
                }

                if (!t.paymentHistory || !Array.isArray(t.paymentHistory) || t.paymentHistory.length === 0) {
                    acc.push({
                        ...t,
                        prix: effectivePrix,
                        reste: ((t.montantParis || 0) + (t.montantAbidjan || 0)) - effectivePrix
                    });
                    return acc;
                }
                const validPayments = t.paymentHistory.filter(p => !p.sessionId || validatedSessions.has(p.sessionId));
                const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                const tClean = {
                    ...t,
                    prix: effectivePrix,
                    paymentHistory: validPayments,
                    montantParis: newParis,
                    montantAbidjan: newAbidjan,
                    reste: (newParis + newAbidjan) - effectivePrix
                };
                acc.push(tClean);
                return acc;
            }, []);
        },
        async calculateAvailableBalance(db, unconfirmedSessions) {
            const transSnap = await getDocs(query(collection(db, "transactions"), where("isDeleted", "!=", true)));
            let totalVentes = 0;
            transSnap.forEach(doc => {
                const d = doc.data();
                if (d.paymentHistory && d.paymentHistory.length > 0) {
                    d.paymentHistory.forEach(pay => {
                        if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;
                        if (pay.modePaiement !== 'Chèque' && pay.modePaiement !== 'Virement') {
                            totalVentes += (pay.montantAbidjan || 0);
                        }
                    });
                } else {
                    if (d.modePaiement !== 'Chèque' && d.modePaiement !== 'Virement') {
                        totalVentes += (d.montantAbidjan || 0);
                    }
                }
            });
            const incSnap = await getDocs(query(collection(db, "other_income"), where("isDeleted", "!=", true)));
            let totalAutres = 0;
            incSnap.forEach(doc => {
                const d = doc.data();
                if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                    totalAutres += (d.montant || 0);
                }
            });
            const expSnap = await getDocs(query(collection(db, "expenses"), where("isDeleted", "!=", true)));
            let totalDepenses = 0;
            expSnap.forEach(doc => {
                const d = doc.data();
                if (d.sessionId && unconfirmedSessions.has(d.sessionId)) return;
                if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                    totalDepenses += (d.montant || 0);
                }
            });
            const bankSnap = await getDocs(query(collection(db, "bank_movements"), where("isDeleted", "!=", true)));
            let totalRetraits = 0;
            let totalDepots = 0;
            bankSnap.forEach(doc => {
                const d = doc.data();
                if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
                if (d.type === 'Depot' && d.source !== 'Remise Chèques' && d.source !== 'Solde Initial') totalDepots += (d.montant || 0);
            });
            return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
        },
        calculateStorageFee(dateString, quantityOrItem = 1, compareDate = new Date()) {
            if (!dateString) return { days: 0, fee: 0 };
            let qte = 1;
            if (typeof quantityOrItem === 'object' && quantityOrItem !== null) {
                qte = quantityOrItem.quantiteRestante !== undefined ? parseInt(quantityOrItem.quantiteRestante) : (parseInt(quantityOrItem.quantite) || 1);
            } else {
                qte = parseInt(quantityOrItem) || 1;
            }
            const arrivalDate = new Date(dateString);
            const diffTime = compareDate - arrivalDate;
            if (diffTime < 0) return { days: 0, fee: 0 };
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) return { days: diffDays, fee: 0 };
            else if (diffDays <= 14) return { days: diffDays, fee: 10000 };
            else {
                const extraDays = diffDays - 14;
                const unitFee = 10000 + (extraDays * 1000);
                return { days: diffDays, fee: unitFee * qte };
            }
        }
    };

    const tableBody = document.getElementById('magasinageTableBody');
    const searchInput = document.getElementById('magasinageSearch');
    const totalFeesEl = document.getElementById('totalMagasinageFees');

    // --- MISE À JOUR DYNAMIQUE EN-TÊTE (Ajout colonne Qté) ---
    if (tableBody) {
        const magTable = tableBody.closest('table');
        if (magTable) {
            const theadRow = magTable.querySelector('thead tr');
            if (theadRow) {
                theadRow.innerHTML = `
                    <th>Date</th>
                    <th>Référence</th>
                    <th style="width:50px; text-align:center;">Qté</th>
                    <th>Client</th>
                    <th>Conteneur</th>
                    <th>Durée</th>
                    <th>Frais</th>
                    <th>Actions</th>
                `;
            }
        }
    }

    let allTransactions = [];
    let currentFiltered = [];
    let deliveryStatusMap = new Map(); // Pour stocker l'état logistique des colis
    const exportPdfBtn = document.getElementById('exportPdfBtn');

    // 1. Chargement des données
    const qTrans = query(collection(db, "transactions"), where("isDeleted", "!=", true), orderBy("isDeleted"), orderBy("date", "desc"));
    onSnapshot(qTrans, snapshot => {
        allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
    }, error => console.error(error));

    // 2. Chargement des statuts de Livraison Actifs
    onSnapshot(collection(db, "livraisons"), snapshot => {
        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.ref) deliveryStatusMap.set(d.ref.toUpperCase().trim(), {
                status: d.status,
                containerStatus: d.containerStatus,
                quantite: d.quantite,
                quantiteRestante: d.quantiteRestante
            });
        });
        renderTable();
    }, error => console.error("Erreur chargement livraisons:", error));

    // 3. Chargement des statuts de Livraison Archivés (Une seule fois au démarrage)
    getDocs(collection(db, "livraisons_archives")).then(snapshot => {
        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.ref) deliveryStatusMap.set(d.ref.toUpperCase().trim(), { status: 'ARCHIVE' });
        });
        renderTable();
    }).catch(error => console.error("Erreur chargement archives:", error));

    // 3. Affichage du tableau
    function renderTable() {
        const term = searchInput ? searchInput.value.toLowerCase().trim() : "";
        
        // On filtre d'abord
        const filtered = allTransactions.filter(t => {
            const logData = t.reference ? deliveryStatusMap.get(t.reference.toUpperCase().trim()) : null;
            const logStatus = logData ? logData.status : null;
            const containerStatus = logData ? logData.containerStatus : null;

            // --- NOUVEAU : Synchronisation de la quantité ---
            if (logData) {
                if (logData.quantite !== undefined) t.quantite = logData.quantite;
                if (logData.quantiteRestante !== undefined) t.quantiteRestante = logData.quantiteRestante;
            }

            // 1. RÈGLE ABSOLUE : S'il est physiquement livré, abandonné ou archivé, on l'exclut.
            // (Peu importe qu'il soit payé, impayé, etc.)
            if (logStatus === 'LIVRE' || logStatus === 'ABANDONNE' || logStatus === 'ARCHIVE') return false;

            // 2. RÈGLE ABSOLUE : S'il n'est pas encore arrivé à Abidjan (Paris ou À Venir), pas de magasinage !
            if (containerStatus === 'PARIS' || containerStatus === 'A_VENIR') return false;

            // 2. Si les frais de magasinage ont été annulés manuellement (ex: offerts)
            if (t.storageFeeWaived === true) return false;

            // 3. On ne montre que ceux qui ont des frais (période gratuite dépassée)
            const { fee } = transactionService.calculateStorageFee(t.date, t);
            if (fee <= 0) return false;

            if (!term) return true; 
            return (t.reference || "").toLowerCase().includes(term) ||
                   (t.nom || "").toLowerCase().includes(term) ||
                   (t.conteneur || "").toLowerCase().includes(term);
        });

        // Tri décroissant par durée (les plus anciens colis s'affichent en premier)
        filtered.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : new Date().getTime();
            const dateB = b.date ? new Date(b.date).getTime() : new Date().getTime();
            return dateA - dateB; 
        });

        currentFiltered = filtered;

        tableBody.innerHTML = '';
        let totalPotentialFees = 0;

        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6">Aucun colis trouvé.</td></tr>';
            if(totalFeesEl) totalFeesEl.textContent = formatCFA(0);
            return;
        }

        const toShow = filtered;

        toShow.forEach(t => {
            const { days, fee } = transactionService.calculateStorageFee(t.date, t);
            
            if (fee > 0) totalPotentialFees += fee;

            const row = document.createElement('tr');
            
            // Style pour les frais élevés
            const feeClass = fee > 0 ? 'fee-warning' : 'fee-ok';
            // Rouge si > 20000, Orange si > 0, Vert sinon
            let feeStyle = fee > 20000 ? 'font-weight:bold; color:#dc3545;' : (fee > 0 ? 'color:#d97706;' : 'color:#10b981;');
            let feeText = formatCFA(fee);

            // Règle REBUS : > 90 jours (3 mois)
            if (days > 90) {
                feeStyle = 'font-weight:bold; color:#dc3545;';
                feeText = `${formatCFA(fee)} <br><span style="background-color:#ef4444; color:#fff; padding: 2px 4px; border-radius: 4px; font-size: 0.8em; margin-top: 4px; display:inline-block;">⚠️ REBUS (Abandonné)</span>`;
                row.style.backgroundColor = "#fff1f2"; 
            }

            // Logique WhatsApp (Relance Magasinage)
            let phoneCandidate = t.numero;
            if (!phoneCandidate) {
                const phoneRegex = /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/;
                const match = (t.nomDestinataire || t.nom || '').match(phoneRegex) || (t.description || '').match(phoneRegex);
                if (match) phoneCandidate = match[0];
            }

            // Calcul des jours restants avant mise au rebut (90 jours max)
            const daysLeft = 90 - days;
            let message = '';
            if (daysLeft > 0) {
                message = `Bonjour ${t.nom || 'Client(e)'},\n\nCeci est une relance d'AMT TRANSIT concernant votre colis Réf: *${t.reference}* (Conteneur ${t.conteneur}).\n\nLe délai de stockage gratuit étant expiré, vos frais de magasinage s'élèvent actuellement à *${formatCFA(fee)}*.\n\n⚠️ *ATTENTION* : Conformément à nos conditions, il vous reste *${daysLeft} jour(s)* avant la mise au rebut (abandon) définitive de votre colis.\n\nMerci de nous contacter urgemment pour régulariser votre situation et récupérer votre colis.`;
            } else {
                message = `🚨 *DERNIER AVERTISSEMENT - MISE AU REBUS* 🚨\n\nBonjour ${t.nom || 'Client(e)'},\n\nVotre colis Réf: *${t.reference}* (Conteneur ${t.conteneur}) est dans nos entrepôts depuis plus de 3 mois (${days} jours).\n\nConformément à nos conditions, il a dépassé le délai de stockage et va être *mis au rebut (abandonné)*.\n\nVos frais de magasinage impayés s'élèvent à *${formatCFA(fee)}*.\n\nCeci est votre dernière chance. Veuillez nous contacter *IMMÉDIATEMENT* avant la destruction ou revente de votre colis.`;
            }
            
            let waLink = '';
            if (phoneCandidate) {
                let phone = phoneCandidate.replace(/[^\d]/g, '');
                if (phone.length === 10 && phone.startsWith('0')) phone = '225' + phone.substring(1);
                else if (phone.length === 10) phone = '225' + phone;
                waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
            } else {
                waLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
            }

            let waBtn = `<a href="${waLink}" target="_blank" class="btn btn-success btn-small" style="background-color:#25D366; border:none; padding:4px 8px; border-radius:4px; color:white; text-decoration:none; display:inline-block;" title="Envoyer un rappel WhatsApp">📱 Relancer</a>`;

            row.innerHTML = `
                <td>${t.date}</td>
                <td>${t.reference}</td>
                <td style="font-weight:bold; text-align:center;">${t.quantite || 1}</td>
                <td>${t.nom}</td>
                <td>${t.conteneur}</td>
                <td><span class="tag" style="background:#e2e8f0; color:#334155;">${days} jours</span></td>
                <td style="${feeStyle}">${feeText}</td>
                <td>${waBtn}</td>
            `;
            tableBody.appendChild(row);
        });

        if(totalFeesEl) totalFeesEl.textContent = formatCFA(totalPotentialFees);
    }

    if(searchInput) searchInput.addEventListener('input', renderTable);

    // 4. Export PDF
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            if (currentFiltered.length === 0) {
                AppModal.alert("Aucune donnée à exporter.", "Export PDF");
                return;
            }
            
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: "landscape" });
            
            doc.setFontSize(18);
            doc.text("État des Frais de Magasinage", 14, 22);
            
            const tableColumn = ["Date", "Référence", "Qté", "Client", "Conteneur", "Durée", "Fret", "Magasinage"];
            const tableRows = [];
            
            currentFiltered.forEach(t => {
                const { days, fee } = transactionService.calculateStorageFee(t.date, t);
                tableRows.push([
                    t.date || '',
                    t.reference || '',
                    t.quantite || 1,
                    t.nom || '',
                    t.conteneur || '',
                    `${days} jours`,
                    formatCFA(t.prix || 0).replace(/\u202F/g, ' '), // Coût du fret
                    formatCFA(fee).replace(/\u202F/g, ' ') // Frais de magasinage
                ]);
            });
            
            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [217, 119, 6] } // Couleur Orange
            });
            
            doc.save(`Magasinage_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`);
        });
    }

    initBackToTopButton();
});