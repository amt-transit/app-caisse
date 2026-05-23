import { db } from '../../../firebase-config.js';
import { collection, getDocs, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';
import { calculateStorageFee } from '../../../services/storageFee.js';

export const MagasinageView = {
    render(app, container) {
        this.app = app;
        container.innerHTML = `
            <div class="dashboard-container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h2>📦 Calcul Frais de Magasinage</h2>
                    <div class="total-card" style="max-width: 250px; background: #fff7ed; border-color: #fdba74;">
                        <h3>Total Frais Latents</h3>
                        <p id="totalMagasinageFees" style="color: #c2410c;">0 CFA</p>
                    </div>
                </div>

                <div class="filter-container" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div class="filter-fields">
                        <label>Rechercher un colis :</label>
                        <input type="text" id="magasinageSearch" placeholder="Référence, Nom ou Conteneur...">
                    </div>
                    <button id="exportPdfBtn" class="btn" style="background-color: #d32f2f; color: white;">📄 Exporter PDF</button>
                </div>

                <div style="overflow-x: auto;">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Date Arrivée</th>
                                <th>Référence</th>
                                <th style="width:50px; text-align:center;">Qté</th>
                                <th>Client</th>
                                <th>Conteneur</th>
                                <th>Durée</th>
                                <th>Frais</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="magasinageTableBody">
                            <tr><td colspan="8" style="text-align:center;">Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        this.initLogic();
    },

    initLogic() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';

        // Calcul centralisé (source unique : services/storageFee.js).
        const transactionService = { calculateStorageFee };

        function formatCFA(n) {
            return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        }

        const tableBody = document.getElementById('magasinageTableBody');
        const searchInput = document.getElementById('magasinageSearch');
        const totalFeesEl = document.getElementById('totalMagasinageFees');
        const exportPdfBtn = document.getElementById('exportPdfBtn');

        let allTransactions = [];
        let currentFiltered = [];
        let deliveryStatusMap = new Map(); 

        // Nettoyage des anciens listeners pour le mode SPA
        if (window.unsubMagTrans) window.unsubMagTrans();
        if (window.unsubMagLiv) window.unsubMagLiv();

        const transCol = getCollectionName("transactions");
        const isRouteTrans = transCol !== "transactions";
        const transConstraints = [where("isDeleted", "!=", true), orderBy("isDeleted"), orderBy("date", "desc")];
        if (!isRouteTrans) transConstraints.unshift(where("agency", "==", activeAgency));
        const qTrans = query(collection(db, transCol), ...transConstraints);
        window.unsubMagTrans = onSnapshot(qTrans, snapshot => {
            allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderTable();
        }, error => console.error(error));

        const livCol = getCollectionName("livraisons");
        const isRouteLiv = livCol !== "livraisons";
        const qMagLiv = isRouteLiv ? query(collection(db, livCol)) : query(collection(db, livCol), where("agency", "==", activeAgency));
        window.unsubMagLiv = onSnapshot(qMagLiv, snapshot => {
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.ref) deliveryStatusMap.set(d.ref.toUpperCase().trim(), {
                    status: d.status,
                    containerStatus: d.containerStatus,
                    quantite: d.quantite,
                    quantiteRestante: d.quantiteRestante,
                    dateAjout: d.dateAjout
                });
            });
            renderTable();
        }, error => console.error("Erreur chargement livraisons:", error));

        const arcCol = getCollectionName("livraisons_archives");
        const qMagArc = arcCol === "livraisons_archives" ? query(collection(db, arcCol), where("agency", "==", activeAgency)) : query(collection(db, arcCol));
        getDocs(qMagArc).then(snapshot => {
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.ref) deliveryStatusMap.set(d.ref.toUpperCase().trim(), { status: 'ARCHIVE' });
            });
            renderTable();
        }).catch(error => console.error("Erreur chargement archives:", error));

        function renderTable() {
            const term = searchInput ? searchInput.value.toLowerCase().trim() : "";
            
            const filtered = allTransactions.filter(t => {
                const logData = t.reference ? deliveryStatusMap.get(t.reference.toUpperCase().trim()) : null;
                if (!logData) return false;

                if (logData.quantite !== undefined) t.quantite = logData.quantite;
                if (logData.quantiteRestante !== undefined) t.quantiteRestante = logData.quantiteRestante;
                // Date d'entrée en entrepôt (source du calcul magasinage) : on la
                // récupère de la livraison liée, comme Livraison/caisse/facture.
                if (logData.dateAjout) t.dateAjout = logData.dateAjout;

                if (logData.containerStatus !== 'EN_COURS') return false;
                if (logData.status === 'LIVRE' || logData.status === 'ABANDONNE' || logData.status === 'ARCHIVE') return false;
                if (t.storageFeeWaived === true) return false;

                const { fee } = transactionService.calculateStorageFee(t.dateAjout || t.date, t);
                if (fee <= 0) return false;

                if (!term) return true; 
                return (t.reference || "").toLowerCase().includes(term) ||
                       (t.nom || "").toLowerCase().includes(term) ||
                       (t.conteneur || "").toLowerCase().includes(term);
            });

            filtered.sort((a, b) => {
                const dateA = a.date ? new Date(a.date).getTime() : new Date().getTime();
                const dateB = b.date ? new Date(b.date).getTime() : new Date().getTime();
                return dateA - dateB; 
            });

            currentFiltered = filtered;
            if (!tableBody) return;
            
            tableBody.innerHTML = '';
            let totalPotentialFees = 0;

            if (filtered.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Aucun colis avec frais de magasinage trouvé.</td></tr>';
                if(totalFeesEl) totalFeesEl.textContent = formatCFA(0);
                return;
            }

            filtered.forEach(t => {
                const { days, fee } = transactionService.calculateStorageFee(t.dateAjout || t.date, t);
                if (fee > 0) totalPotentialFees += fee;

                const row = document.createElement('tr');
                let feeStyle = fee > 20000 ? 'font-weight:bold; color:#dc3545;' : (fee > 0 ? 'color:#d97706;' : 'color:#10b981;');
                let feeText = formatCFA(fee);

                if (days > 90) {
                    feeStyle = 'font-weight:bold; color:#dc3545;';
                    feeText = `${formatCFA(fee)} <br><span style="background-color:#ef4444; color:#fff; padding: 2px 4px; border-radius: 4px; font-size: 0.8em; margin-top: 4px; display:inline-block;">⚠️ REBUS (Abandonné)</span>`;
                    row.style.backgroundColor = "#fff1f2"; 
                }

                let phoneCandidate = t.numero;
                if (!phoneCandidate) {
                    const phoneRegex = /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/;
                    const match = (t.nomDestinataire || t.nom || '').match(phoneRegex) || (t.description || '').match(phoneRegex);
                    if (match) phoneCandidate = match[0];
                }

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

        if(searchInput) searchInput.addEventListener('input', () => renderTable());

        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                if (currentFiltered.length === 0) return alert("Aucune donnée à exporter.");
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: "landscape" });
                doc.setFontSize(18); doc.text("État des Frais de Magasinage", 14, 22);
                const tableRows = currentFiltered.map(t => [t.date || '', t.reference || '', t.quantite || 1, t.nom || '', t.conteneur || '', `${transactionService.calculateStorageFee(t.dateAjout || t.date, t).days} jours`, formatCFA(t.prix || 0).replace(/\u202F/g, ' '), formatCFA(transactionService.calculateStorageFee(t.dateAjout || t.date, t).fee).replace(/\u202F/g, ' ')]);
                doc.autoTable({ head: [["Date", "Référence", "Qté", "Client", "Conteneur", "Durée", "Fret", "Magasinage"]], body: tableRows, startY: 30, theme: 'grid', headStyles: { fillColor: [217, 119, 6] } });
                doc.save(`Magasinage_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`);
            });
        }
    }
};