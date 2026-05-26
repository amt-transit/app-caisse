// Modèles de documents PARTAGÉS (départ + arrivée, toutes routes) :
//   - Bon de livraison
//   - Facture
//   - Acte d'abandon
//
// Source unique pour que les deux agences d'une route aient le MÊME modèle.
// Usine : on capture une fois showToast + calculateMagasinageFee (propres à
// chaque agence) ; le module importe lui-même Firestore / db /
// getCollectionName. jsPDF est global (window.jspdf, chargé par CDN par la
// page appelante). La config (logo/couleur/CGV/pied) est lue depuis
// settings/invoice_config_<agence> et settings/company_<agence>.

import { db } from '../firebase-config.js';
import { getDoc, getDocs, doc, collection, query, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName, getConfigSourceAgency } from '../agencies-config.js';
import { DEFAULT_CGV, DEFAULT_COMPANY_FOOTER } from '../constants.js';
import { stripPhoneFromName } from './phone.js';

export function createDocumentTemplates({ showToast, calculateMagasinageFee }) {

    // Charge la config "Choix Facture" du MODE actif : en AÉRIEN, le document
    // utilise le thème dédié `invoice_config_<src>_aerien` (couleur, logo, nom,
    // pied, CGV) ; repli sur le doc de base s'il n'existe pas encore.
    async function loadInvoiceConfig(src) {
        const mode = sessionStorage.getItem('shippingMode') || 'maritime';
        try {
            const baseSnap = await getDoc(doc(db, "settings", `invoice_config_${src}`));
            const base = baseSnap.exists() ? baseSnap.data() : {};
            if (mode === 'aerien') {
                const aSnap = await getDoc(doc(db, "settings", `invoice_config_${src}_aerien`));
                // Le thème aérien SURCHARGE le maritime ; les champs non définis
                // en aérien héritent du maritime (couleur de bande, logo, CGV...).
                if (aSnap.exists()) return { ...base, ...aSnap.data() };
            }
            return base;
        } catch (e) { return null; }
    }

    // Couleur de la bande d'en-tête (réglée dans Choix Facture). Défaut bleu nuit.
    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [30, 41, 59];
    }

    // --- Bon de livraison ---
    async function printDeliverySlip(d) {
        if (!d) return;

        showToast("Génération du Bon de Livraison...", "success");

        // 1. Récupération des données financières exactes depuis la Caisse
        let transData = null;
        try {
            const qTrans = await getDocs(query(collection(db, getCollectionName('transactions')), where('reference', '==', d.ref), limit(1)));
            if (!qTrans.empty) transData = qTrans.docs[0].data();
        } catch (e) {
            console.error("Erreur récupération transaction :", e);
        }

        let logoBase64 = null;
        let companyName = "AMT TRANS'IT";
        let invoiceConfig = null;
        try {
            const compSnap = await getDoc(doc(db, "settings", `company_${getConfigSourceAgency()}`));
            if (compSnap.exists()) {
                if (compSnap.data().logoBase64) logoBase64 = compSnap.data().logoBase64;
                if (compSnap.data().name) companyName = compSnap.data().name;
            }
            invoiceConfig = await loadInvoiceConfig(getConfigSourceAgency());
            if (invoiceConfig) {
                if (invoiceConfig.companyName) companyName = invoiceConfig.companyName;
                if (invoiceConfig.logoUrl) logoBase64 = invoiceConfig.logoUrl;
            }
        } catch(e) {}

        const { jsPDF } = window.jspdf;
        const doc2 = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc2.internal.pageSize.getWidth();

        // --- En-tête Graphique ---
        doc2.setFillColor(...(invoiceConfig?.headerColorHex ? hexToRgb(invoiceConfig.headerColorHex) : [30, 41, 59]));
        doc2.rect(0, 0, pageWidth, 35, 'F');

        let accentColor = invoiceConfig?.primaryColor ? JSON.parse(invoiceConfig.primaryColor) : [16, 185, 129];
        doc2.setFillColor(...accentColor);
        doc2.rect(0, 35, pageWidth, 2, 'F');

        let textX = 15;
        let textY = 22;
        if (logoBase64) {
            try {
                const props = doc2.getImageProperties(logoBase64);
                const ratio = props.width / props.height;
                let imgH = 16;
                let imgW = imgH * ratio;
                if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
                doc2.addImage(logoBase64, 'PNG', 15, 10, imgW, imgH);
                textX = 15 + imgH + 5;
                textY = 22;
            } catch(e) {}
        } else {
            try {
                const logoElement = document.querySelector('.app-logo');
                if (logoElement && logoElement.complete && logoElement.naturalWidth > 0) {
                    const ratio = logoElement.naturalWidth / logoElement.naturalHeight;
                    let imgH = 16;
                    let imgW = imgH * ratio;
                    if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
                    doc2.addImage(logoElement, 'PNG', 15, 5, imgW, imgH);
                    textX = 15 + imgH + 5;
                    textY = 22;
                }
            } catch(e) {}
        }

        doc2.setTextColor(255, 255, 255);
        doc2.setFont("helvetica", "bold");
        doc2.setFontSize(18);
        doc2.text(companyName, textX, textY);

        doc2.text("BON DE LIVRAISON", pageWidth - 15, 22, { align: 'right' });

        // --- Informations Colis & Client ---
        doc2.setTextColor(0, 0, 0);
        doc2.setFontSize(10);
        doc2.setFont("helvetica", "bold");
        doc2.text("DÉTAILS DE L'EXPÉDITION :", 15, 50);
        doc2.setFont("helvetica", "normal");
        doc2.text(`Référence : ${d.ref}`, 15, 57);
        doc2.text(`Date d'édition : ${new Date().toLocaleDateString('fr-FR')}`, 15, 64);
        doc2.text(`Conteneur : ${d.conteneur || '-'}`, 15, 71);
        doc2.text(`Expéditeur : ${d.expediteur || '-'}`, 15, 78);

        doc2.setFillColor(248, 250, 252);
        doc2.setDrawColor(226, 232, 240);
        doc2.roundedRect(115, 45, 80, 35, 2, 2, 'FD');
        doc2.setFont("helvetica", "bold");
        doc2.text("LIVRÉ À :", 120, 52);
        doc2.setFont("helvetica", "normal");

        let clientName = stripPhoneFromName(transData ? transData.nom : (d.destinataire || 'Client non spécifié'));
        doc2.text(`${clientName}`, 120, 59);
        doc2.text(`${d.numero || transData?.numero || ''}`, 120, 66);
        const addrStr = doc2.splitTextToSize(`${d.lieuLivraison || d.commune || transData?.adresseDestinataire || ''}`, 70);
        doc2.text(addrStr, 120, 73);

        // AÉRIEN : colonne Poids (par colis) + ligne poids total.
        const isAerienDoc = ((transData && transData.modeExpedition === 'aerien') || d.modeExpedition === 'aerien');
        // Colis « A la valeur » : poids masque sur le bordereau client.
        const _aBilledKg = (it) => { if (it.mode !== 'poids') return 0; const real = parseFloat(it.poids) || 0; const vol = ((parseFloat(it.lng)||0)*(parseFloat(it.lrg)||0)*(parseFloat(it.haut)||0))/5000; return Math.max(real, vol); };
        const tableColumn = isAerienDoc
            ? ["Description / Nature", "Qté", "Poids", "Statut", "Observations"]
            : ["Description / Nature du Colis", "Qté", "Statut", "Observations"];
        const tableRows = [];

        let statusTxt = 'À LIVRER';
        if (d.status === 'LIVRE') statusTxt = 'LIVRÉ';
        else if (d.status === 'PARTIEL' || d.status === 'LIVRAISON_PARTIELLE') statusTxt = 'PARTIEL';

        if (transData && transData.items && Array.isArray(transData.items)) {
            let _tk = 0;
            transData.items.forEach(item => {
                if (isAerienDoc) {
                    const kg = _aBilledKg(item); _tk += kg * (parseFloat(item.qty) || 0);
                    tableRows.push([ item.desc, item.qty.toString(), kg ? kg.toFixed(1) + ' kg' : '-', statusTxt, d.info || '-' ]);
                } else {
                    tableRows.push([ item.desc, item.qty.toString(), statusTxt, d.info || '-' ]);
                }
            });
            if (isAerienDoc) tableRows.push(['Poids total', '', _tk.toFixed(1) + ' kg', '', '']);
        } else {
            const descSource = d.description || transData?.description || 'Colis divers';
            const qtySource = d.quantite || transData?.quantite || 1;
            tableRows.push(isAerienDoc
                ? [descSource, qtySource.toString(), '-', statusTxt, d.info || '-']
                : [descSource, qtySource.toString(), statusTxt, d.info || '-']);
        }

        doc2.autoTable({
            startY: 90,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: accentColor },
            columnStyles: isAerienDoc
                ? { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'center' } }
                : { 1: { halign: 'center' }, 2: { halign: 'center' } }
        });

        const finalY = doc2.lastAutoTable.finalY + 15;

        // --- Zone de Signatures ---
        let sigY = finalY + 10;
        doc2.setFontSize(10);
        doc2.setFont("helvetica", "bold");
        doc2.text("Livreur / Agent AMT :", 25, sigY);
        doc2.text("Client (Destinataire) :", 125, sigY);

        doc2.setFont("helvetica", "normal");
        doc2.setFontSize(8);
        doc2.setTextColor(100, 116, 139);
        doc2.text("Nom et Signature", 25, sigY + 5);
        doc2.text("Précédé de la mention 'Lu et approuvé'", 125, sigY + 5);

        doc2.setDrawColor(203, 213, 225);
        doc2.rect(20, sigY + 8, 70, 25);
        doc2.rect(120, sigY + 8, 70, 25);

        // --- Pied de page ---
        doc2.setFont("helvetica", "normal");
        doc2.setFontSize(8);
        doc2.setTextColor(100, 116, 139);
        const footerText = invoiceConfig?.footer || DEFAULT_COMPANY_FOOTER;
        doc2.text(footerText, pageWidth / 2, doc2.internal.pageSize.getHeight() - 10, { align: 'center' });

        doc2.save(`BL_${d.ref}.pdf`);
    }

    // --- Facture complète ---
    async function printInvoice(d) {
        if (!d) return;

        showToast("Génération de la facture en cours...", "success");

        // 1. Récupération des données financières exactes depuis la Caisse
        let transData = null;
        try {
            const qTrans = await getDocs(query(collection(db, getCollectionName('transactions')), where('reference', '==', d.ref), limit(1)));
            if (!qTrans.empty) transData = qTrans.docs[0].data();
        } catch (e) {
            console.error("Erreur récupération transaction :", e);
        }

        let logoBase64 = null;
        let companyName = "AMT TRANS'IT";
        let invoiceConfig = null;
        try {
            const compSnap = await getDoc(doc(db, "settings", `company_${getConfigSourceAgency()}`));
            if (compSnap.exists()) {
                if (compSnap.data().logoBase64) logoBase64 = compSnap.data().logoBase64;
                if (compSnap.data().name) companyName = compSnap.data().name;
            }
            invoiceConfig = await loadInvoiceConfig(getConfigSourceAgency());
            if (invoiceConfig) {
                if (invoiceConfig.companyName) companyName = invoiceConfig.companyName;
                if (invoiceConfig.logoUrl) logoBase64 = invoiceConfig.logoUrl;
            }
        } catch(e) {}

        // 2. Initialisation du Document PDF
        const { jsPDF } = window.jspdf;
        const doc2 = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc2.internal.pageSize.getWidth();

        if (logoBase64 && (typeof logoBase64 === 'string' && logoBase64.startsWith('http'))) {
            try {
                const response = await fetch(logoBase64);
                const blob = await response.blob();
                logoBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch(e) { logoBase64 = null; }
        }

        // --- En-tête Graphique ---
        doc2.setFillColor(...(invoiceConfig?.headerColorHex ? hexToRgb(invoiceConfig.headerColorHex) : [30, 41, 59]));
        doc2.rect(0, 0, pageWidth, 35, 'F');

        let accentColor = invoiceConfig?.primaryColor ? JSON.parse(invoiceConfig.primaryColor) : [59, 130, 246];
        doc2.setFillColor(...accentColor);
        doc2.rect(0, 35, pageWidth, 2, 'F');

        let textX = 15;
        let textY = 22;
        if (logoBase64) {
            try {
                const props = doc2.getImageProperties(logoBase64);
                const ratio = props.width / props.height;
                let imgH = 16;
                let imgW = imgH * ratio;
                if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
                doc2.addImage(logoBase64, 'PNG', 15, 10, imgW, imgH);
                textX = 15 + imgW + 5;
                textY = 22;
            } catch(e) {}
        } else {
            try {
                const logoElement = document.querySelector('.app-logo');
                if (logoElement && logoElement.complete && logoElement.naturalWidth > 0) {
                    const ratio = logoElement.naturalWidth / logoElement.naturalHeight;
                    let imgH = 16;
                    let imgW = imgH * ratio;
                    if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
                    doc2.addImage(logoElement, 'PNG', 15, 10, imgW, imgH);
                    textX = 15 + imgW + 5;
                    textY = 22;
                }
            } catch(e) {}
        }

        doc2.setTextColor(255, 255, 255);
        doc2.setFont("helvetica", "bold");
        doc2.setFontSize(18);
        doc2.text(companyName, textX, textY);

        doc2.text("FACTURE", pageWidth - 15, 22, { align: 'right' });

        // --- Informations Colis & Client ---
        doc2.setTextColor(0, 0, 0);
        doc2.setFontSize(10);
        doc2.setFont("helvetica", "bold");
        doc2.text("DÉTAILS DE L'EXPÉDITION :", 15, 50);
        doc2.setFont("helvetica", "normal");
        doc2.text(`Référence : ${d.ref}`, 15, 57);
        doc2.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 15, 64);
        doc2.text(`Conteneur : ${d.conteneur || '-'}`, 15, 71);
        doc2.text(`Expéditeur : ${d.expediteur || '-'}`, 15, 78);

        doc2.setFillColor(248, 250, 252);
        doc2.setDrawColor(226, 232, 240);
        doc2.roundedRect(115, 45, 80, 35, 2, 2, 'FD');
        doc2.setFont("helvetica", "bold");
        doc2.text("FACTURÉ À :", 120, 52);
        doc2.setFont("helvetica", "normal");

        let clientName = stripPhoneFromName(transData ? transData.nom : (d.destinataire || 'Client'));
        doc2.text(`${clientName}`, 120, 59);
        doc2.text(`${d.numero || transData?.numero || ''}`, 120, 66);
        const addrStr = doc2.splitTextToSize(`${d.lieuLivraison || d.commune || transData?.adresseDestinataire || ''}`, 70);
        doc2.text(addrStr, 120, 73);

        // AÉRIEN : tableau articles dédié (mode par colis, poids/volume, parfum/alcool).
        const isAerienDoc = ((transData && transData.modeExpedition === 'aerien') || d.modeExpedition === 'aerien');
        const _eur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0).replace(/[  ]/g, ' ');
        // Colis « A la valeur » : poids masque sur la facture client.
        const _aBilledKg = (it) => { if (it.mode !== 'poids') return 0; const real = parseFloat(it.poids) || 0; const vol = ((parseFloat(it.lng)||0)*(parseFloat(it.lrg)||0)*(parseFloat(it.haut)||0))/5000; return Math.max(real, vol); };
        const _aLineEur = (it) => { const q = parseFloat(it.qty)||0; return (it.mode === 'poids') ? _aBilledKg(it)*q*(it.parfum?15:13) : (parseFloat(it.pu)||0)*q; };
        let aerienColumns = null, aerienRows = null;
        if (isAerienDoc && transData && transData.items && Array.isArray(transData.items)) {
            aerienColumns = ["Description / Nature", "Qté", "Mode", "Poids", "Tarif / P.U", "Total"];
            aerienRows = [];
            let _totalKg = 0;
            transData.items.forEach(item => {
                const isP = item.mode === 'poids';
                const kg = _aBilledKg(item);
                _totalKg += kg * (parseFloat(item.qty) || 0);
                aerienRows.push([
                    item.desc,
                    String(item.qty),
                    isP ? ('Poids' + (item.parfum ? ' (parfum/alcool)' : '')) : 'Valeur',
                    kg ? kg.toFixed(1) + ' kg' : '-',
                    isP ? ((item.parfum ? 15 : 13) + ' €/kg') : _eur(item.pu || 0),
                    _eur(_aLineEur(item))
                ]);
            });
            aerienRows.push(['Poids total facturé', '', '', _totalKg.toFixed(1) + ' kg', '', '']);
        }

        const tableColumn = ["Description / Nature du Colis", "Qté", "P.U", "Total"];
        const tableRows = [];
        if (transData && transData.items && Array.isArray(transData.items)) {
            transData.items.forEach(item => {
                tableRows.push([
                    item.desc,
                    item.qty.toString(),
                    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(item.pu || 0).replace(/[  ]/g, ' ').replace(/\s*\/\s*/g, ' '),
                    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(item.total || 0).replace(/[  ]/g, ' ').replace(/\s*\/\s*/g, ' ')
                ]);
            });
        } else {
            const descSource = d.description || transData?.description || 'Colis divers';
            const qtySource = d.quantite || transData?.quantite || 1;
            tableRows.push([descSource, qtySource.toString(), "-", "-"]);
        }

        doc2.autoTable({
            startY: 90,
            head: [(isAerienDoc && aerienColumns) ? aerienColumns : tableColumn],
            body: (isAerienDoc && aerienRows) ? aerienRows : tableRows,
            theme: 'grid',
            headStyles: { fillColor: accentColor },
            columnStyles: (isAerienDoc && aerienColumns)
                ? { 1: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
                : { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
        });

        // --- Bilan Financier ---
        let prixFret = 0, paye = 0, reste = 0, magasinageFee = 0, reduction = 0;

        if (transData) {
            prixFret = transData.prix || 0;
            paye = (transData.montantAbidjan || 0) + (transData.montantParis || 0);

            if (transData.adjustmentType === 'reduction' && transData.adjustmentVal > 0) {
                reduction = transData.adjustmentVal;
            } else if (transData.adjustmentType === 'augmentation' && transData.adjustmentVal > 0) {
                magasinageFee = transData.adjustmentVal;
            }

            // Calcul dynamique si non annulé, non livré et pas de frais manuel saisi
            if (magasinageFee === 0 && !transData.storageFeeWaived && d.dateAjout && d.status !== 'LIVRE' && d.status !== 'ABANDONNE') {
                magasinageFee = calculateMagasinageFee(d.dateAjout, d, transData).fee;
            }

            const totalAPayer = prixFret - reduction + magasinageFee;
            reste = totalAPayer - paye;
            if (reste < 0) reste = 0;
        } else {
            reste = parseFloat(String(d.montant || '0').replace(/[^\d]/g, '')) || 0;
            prixFret = parseFloat(String(d.prixOriginal || '0').replace(/[^\d]/g, '')) || reste;
            paye = prixFret > reste ? prixFret - reste : 0;

            if (d.dateAjout && d.status !== 'LIVRE' && d.status !== 'ABANDONNE') {
                magasinageFee = calculateMagasinageFee(d.dateAjout, d, null).fee;
                reste += magasinageFee;
            }
        }

        const formatMontant = (num) => new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(num).replace(/[  ]/g, ' ').replace(/\s*\/\s*/g, ' ');
        const finalY = doc2.lastAutoTable.finalY + 15;

        doc2.setFont("helvetica", "bold");
        doc2.text("RÉCAPITULATIF FINANCIER", 115, finalY);
        doc2.setFont("helvetica", "normal");

        let currentLineY = finalY + 8;
        doc2.text("Total Fret :", 115, currentLineY);
        doc2.text(`${formatMontant(prixFret)}`, 195, currentLineY, { align: 'right' });
        currentLineY += 6;

        if (reduction > 0) {
            doc2.text("Réduction :", 115, currentLineY);
            doc2.setTextColor(22, 163, 74);
            doc2.text(`- ${formatMontant(reduction)}`, 195, currentLineY, { align: 'right' });
            doc2.setTextColor(0, 0, 0);
            currentLineY += 6;
        }

        if (magasinageFee > 0) {
            doc2.text("Frais Magasinage :", 115, currentLineY);
            doc2.setTextColor(220, 38, 38);
            doc2.text(`+ ${formatMontant(magasinageFee)}`, 195, currentLineY, { align: 'right' });
            doc2.setTextColor(0, 0, 0);
            currentLineY += 6;
        }

        doc2.text("Montant Payé :", 115, currentLineY);
        doc2.text(`${formatMontant(paye)}`, 195, currentLineY, { align: 'right' });
        currentLineY += 6;

        // Boîte du Reste (Rouge si impayé, Vert si soldé)
        doc2.setFillColor(reste > 0 ? 254 : 240, reste > 0 ? 242 : 253, reste > 0 ? 242 : 244);
        doc2.rect(115, currentLineY + 2, 80, 10, 'F');
        doc2.setFont("helvetica", "bold");
        doc2.text("RESTE À PAYER :", 118, currentLineY + 9);
        doc2.setTextColor(reste > 0 ? 220 : 22, reste > 0 ? 38 : 163, reste > 0 ? 38 : 74);
        doc2.text(`${formatMontant(reste)}`, 192, currentLineY + 9, { align: 'right' });
        doc2.setTextColor(0, 0, 0);

        doc2.text("La Direction AMT TRANS'IT", 15, currentLineY + 9);

        // --- CONDITIONS GÉNÉRALES DE VENTE ---
        let cgvY = currentLineY + 20;
        if (cgvY + 50 > doc2.internal.pageSize.getHeight() - 15) {
            doc2.addPage();
            cgvY = 20;
        }

        doc2.setFont("helvetica", "bold");
        doc2.setFontSize(8);
        doc2.setTextColor(71, 85, 105);
        doc2.text("CONDITIONS GÉNÉRALES DE VENTE", 15, cgvY);
        cgvY += 4;
        doc2.text("A LIRE ATTENTIVEMENT:", 15, cgvY);
        cgvY += 4;

        doc2.setFont("helvetica", "normal");
        doc2.setFontSize(7);
        const cgvText = invoiceConfig?.cgv || DEFAULT_CGV;
        const cgvLines = cgvText.replace(/\\n/g, '\n').split('\n');

        cgvLines.forEach(line => {
            const splitLine = doc2.splitTextToSize(line, pageWidth - 30);
            doc2.text(splitLine, 15, cgvY);
            cgvY += (splitLine.length * 3.5);
        });

        // --- Pied de page ---
        doc2.setFont("helvetica", "normal");
        doc2.setFontSize(8);
        doc2.setTextColor(100, 116, 139);
        const footerText = invoiceConfig?.footer || DEFAULT_COMPANY_FOOTER;
        doc2.text(footerText, pageWidth / 2, doc2.internal.pageSize.getHeight() - 10, { align: 'center' });

        doc2.save(`Facture_${d.ref}.pdf`);
    }

    // --- Acte d'abandon ---
    function generateAbandonmentPDF(data, typeAbandon) {
        const { jsPDF } = window.jspdf;
        const doc2 = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc2.internal.pageSize.getWidth();
        let y = 0;

        const formatMontant = (num) => new Intl.NumberFormat('fr-CI').format(num).replace(/[  ]/g, ' ');

        // --- EN-TÊTE GRAPHIQUE (Premium) ---
        doc2.setFillColor(30, 41, 59);
        doc2.rect(0, 0, pageWidth, 35, 'F');
        doc2.setFillColor(234, 88, 12);
        doc2.rect(0, 35, pageWidth, 2, 'F');

        try {
            const logoElement = document.querySelector('.app-logo');
            if (logoElement && logoElement.complete && logoElement.naturalWidth > 0) {
                const ratio = logoElement.naturalWidth / logoElement.naturalHeight;
                let imgW = 20 * ratio;
                if (imgW > 50) imgW = 50;
                doc2.addImage(logoElement, 'PNG', 15, 7, imgW, 20);
            } else {
                doc2.setTextColor(255, 255, 255);
                doc2.setFont("helvetica", "bold");
                doc2.setFontSize(20);
                doc2.text("AMT TRANS'IT", 15, 22);
            }
        } catch(e) {
            doc2.setTextColor(255, 255, 255);
            doc2.setFontSize(20);
            doc2.text("AMT TRANS'IT", 15, 22);
        }

        doc2.setTextColor(255, 255, 255);
        doc2.setFont("helvetica", "bold");
        doc2.setFontSize(18);
        doc2.text("ACTE D'ABANDON", pageWidth - 15, 16, { align: 'right' });

        doc2.setFontSize(9);
        doc2.setFont("helvetica", "normal");
        doc2.setTextColor(148, 163, 184);
        doc2.text("DÉCISION DE MISE AU REBUT DU COLIS", pageWidth - 15, 22, { align: 'right' });

        // --- BLOC META INFORMATIONS ---
        y = 42;
        doc2.setDrawColor(226, 232, 240);
        doc2.setFillColor(248, 250, 252);
        doc2.roundedRect(15, y, pageWidth - 30, 18, 3, 3, 'FD');

        doc2.setFontSize(9);
        doc2.setTextColor(100, 116, 139);
        doc2.text("Émis le :", 20, y + 7);
        doc2.text("N° Référence Tracking :", pageWidth / 2, y + 7);

        doc2.setFontSize(12);
        doc2.setTextColor(15, 23, 42);
        doc2.setFont("helvetica", "bold");
        doc2.text(new Date().toLocaleDateString('fr-FR'), 20, y + 13);

        doc2.setTextColor(220, 38, 38);
        doc2.text(data.ref || 'NON SPÉCIFIÉE', pageWidth / 2, y + 13);
        y += 24;

        function drawSectionTitle(title, posY) {
            doc2.setFillColor(241, 245, 249);
            doc2.rect(15, posY, pageWidth - 30, 8, 'F');
            doc2.setDrawColor(59, 130, 246);
            doc2.setLineWidth(1.2);
            doc2.line(15, posY, 15, posY + 8);
            doc2.setLineWidth(0.1);

            doc2.setFontSize(10);
            doc2.setTextColor(15, 23, 42);
            doc2.setFont("helvetica", "bold");
            doc2.text(title, 20, posY + 6.5);
            return posY + 12;
        }

        // --- 1. IDENTIFICATION DU COLIS ---
        y = drawSectionTitle("1. IDENTIFICATION DES PARTIES ET DU COLIS", y);

        doc2.setFontSize(9);
        doc2.setFont("helvetica", "normal");

        const dateArrivee = data.dateAjout ? new Date(data.dateAjout).toLocaleDateString('fr-FR') : '___ / ___ / 202__';

        doc2.setTextColor(100, 116, 139);
        doc2.text("Destinataire :", 15, y);
        doc2.text("Contact (Tél) :", 15, y + 6);
        doc2.text("Expéditeur :", 15, y + 12);

        doc2.setTextColor(15, 23, 42);
        doc2.setFont("helvetica", "bold");

        let destClean = stripPhoneFromName(data.destinataire || 'Non spécifié');
        doc2.text(`${destClean}`, 45, y);
        doc2.text(`${data.numero || 'Non spécifié'}`, 45, y + 6);
        doc2.text(`${data.expediteur || 'Non spécifié'}`, 45, y + 12);

        doc2.setFont("helvetica", "normal");
        doc2.setTextColor(100, 116, 139);
        doc2.text("Date d'arrivée :", 110, y);
        doc2.text("Conteneur :", 110, y + 6);
        doc2.text("Contenu :", 110, y + 12);

        doc2.setTextColor(15, 23, 42);
        doc2.setFont("helvetica", "bold");
        doc2.text(`${dateArrivee}`, 140, y);
        doc2.text(`${data.conteneur || 'Non spécifié'}`, 140, y + 6);

        doc2.setFont("helvetica", "normal");
        const descText = doc2.splitTextToSize(data.description || 'Non spécifié', 55);
        doc2.text(descText, 140, y + 12);

        y += 12 + (descText.length * 4) + 4;

        // --- 2. SITUATION FINANCIÈRE ---
        y = drawSectionTitle("2. SITUATION FINANCIÈRE ET MAGASINAGE", y);

        const resteStr = data.montant || '0 CFA';
        const resteVal = parseFloat(resteStr.replace(/[^\d]/g, '')) || 0;

        let fee = 0;
        let diffDays = 0;
        if (data.dateAjout) {
            const computed = calculateMagasinageFee(data.dateAjout, data, null);
            diffDays = computed.days;
            fee = computed.fee;
        }
        const totalVal = resteVal + fee;

        doc2.setFont("helvetica", "normal");
        doc2.setTextColor(71, 85, 105);
        doc2.text("Délai de conservation écoulé :", 15, y);
        doc2.setFont("helvetica", "bold");
        doc2.setTextColor(220, 38, 38);
        doc2.text(`${diffDays} jours`, 80, y);

        y += 6;
        doc2.setFont("helvetica", "normal");
        doc2.setTextColor(71, 85, 105);
        doc2.text("Fret et Douane impayés :", 15, y);
        doc2.setFont("helvetica", "bold");
        doc2.setTextColor(15, 23, 42);
        doc2.text(`${resteStr}`, 80, y);

        y += 6;
        doc2.setFont("helvetica", "normal");
        doc2.setTextColor(71, 85, 105);
        doc2.text("Pénalités de magasinage :", 15, y);
        doc2.setFont("helvetica", "bold");
        doc2.setTextColor(15, 23, 42);
        doc2.text(`${formatMontant(fee)} CFA`, 80, y);

        doc2.setFont("helvetica", "italic");
        doc2.setFontSize(8);
        doc2.setTextColor(148, 163, 184);
        const _calcForText = calculateMagasinageFee(data.dateAjout, data, null);
        const tarifJourText = _calcForText.isPalette ? '3 000' : '1 000';
        doc2.text(`(Conditions : Franchise 7j, puis 10 000 CFA/semaine, puis ${tarifJourText} CFA/j/colis)`, 100, y);

        y += 8;

        // Boîte Totale Sombre / Rouge
        doc2.setFillColor(254, 242, 242);
        doc2.setDrawColor(252, 165, 165);
        doc2.roundedRect(15, y, pageWidth - 30, 14, 2, 2, 'FD');
        doc2.setFontSize(10);
        doc2.setFont("helvetica", "bold");
        doc2.setTextColor(153, 27, 27);
        doc2.text("TOTAL DES CRÉANCES DUES A L'ENTREPRISE :", 20, y + 9);
        doc2.setFontSize(12);
        doc2.text(`${formatMontant(totalVal)} CFA`, pageWidth - 20, y + 9.5, { align: 'right' });

        y += 20;

        // --- 3. MOTIF D'ABANDON ---
        y = drawSectionTitle("3. MOTIF D'ABANDON DÉFINITIF", y);

        doc2.setFontSize(9);
        doc2.setFont("helvetica", "normal");
        doc2.setTextColor(15, 23, 42);

        doc2.setDrawColor(148, 163, 184);
        doc2.rect(20, y - 3, 3, 3);
        doc2.text("Abandon volontaire et anticipé expressément formulé par le client.", 26, y - 0.5);

        y += 6;
        doc2.rect(20, y - 3, 3, 3);
        doc2.text("Expiration du délai légal et réglementaire de stockage (Non réclamé ou Injoignable).", 26, y - 0.5);

        doc2.setTextColor(220, 38, 38);
        doc2.setFont("helvetica", "bold");
        if (typeAbandon === 'VOLONTAIRE') {
            doc2.text("X", 20.7, y - 6.5);
        } else {
            doc2.text("X", 20.7, y - 0.5);
        }

        y += 10;

        // --- 4. CADRE LÉGAL ET DÉCISION ---
        y = drawSectionTitle("4. CADRE LÉGAL ET DÉCISION DE LA DIRECTION", y);

        doc2.setFont("helvetica", "italic");
        doc2.setFontSize(8);
        doc2.setTextColor(71, 85, 105);
        const clauseText = `Conformément à nos Conditions Générales de Vente et de Transport, tout colis dont les frais de logistique et de douane ne sont pas intégralement acquittés et qui n'est pas réclamé à l'expiration de son délai de conservation est formellement considéré comme ABANDONNÉ par l'expéditeur et le destinataire.\nEn conséquence, l'entreprise AMT TRANS'IT se décharge de toute obligation de conservation. Elle acquiert la pleine et entière disposition de la marchandise pour procéder à sa destruction, son don, ou sa mise en vente afin de recouvrer le préjudice financier (frais d'exploitation et de magasinage impayés). Aucune indemnité, poursuite ni remboursement ne pourra être exigé ultérieurement par le client.`;
        const splitClause = doc2.splitTextToSize(clauseText, pageWidth - 30);
        doc2.text(splitClause, 15, y);
        y += (splitClause.length * 3.5) + 4;

        doc2.setFont("helvetica", "bold");
        doc2.setFontSize(9);
        doc2.setTextColor(15, 23, 42);
        doc2.text("ACTION ORDONNÉE POUR CE COLIS :", 15, y);

        y += 6;
        doc2.setFont("helvetica", "normal");
        doc2.setDrawColor(203, 213, 225);
        doc2.rect(20, y - 3, 4, 4); doc2.text("Destruction / Rebus", 26, y);
        doc2.rect(75, y - 3, 4, 4); doc2.text("Mise en vente", 81, y);
        doc2.rect(120, y - 3, 4, 4); doc2.text("Don associatif", 126, y);

        y += 12;

        // --- SIGNATURES ---
        doc2.setDrawColor(226, 232, 240);
        doc2.setLineWidth(0.5);
        doc2.line(15, y, pageWidth - 15, y);
        y += 6;

        doc2.setFont("helvetica", "bold");
        doc2.setFontSize(9);
        doc2.setTextColor(15, 23, 42);
        doc2.text("Signature du Client", 35, y, { align: 'center' });
        doc2.text("L'Agent Constatant", 105, y, { align: 'center' });
        doc2.text("La Direction AMT TRANS'IT", pageWidth - 35, y, { align: 'center' });

        doc2.setFont("helvetica", "italic");
        doc2.setFontSize(8);
        doc2.setTextColor(148, 163, 184);
        doc2.text(`(Saisi par : ${sessionStorage.getItem('userName') || 'Système'})`, 105, y + 4, { align: 'center' });

        doc2.setDrawColor(59, 130, 246);
        doc2.setLineDashPattern([2, 2], 0);
        doc2.rect(pageWidth - 65, y + 4, 60, 20);
        doc2.setLineDashPattern([], 0);

        doc2.setFont("helvetica", "bold");
        doc2.setFontSize(10);
        doc2.setTextColor(226, 232, 240);
        doc2.text("CACHET & SIGNATURE", pageWidth - 35, y + 15, { align: 'center' });

        // --- PIED DE PAGE ---
        const pageHeight = doc2.internal.pageSize.getHeight();
        doc2.setFont("helvetica", "bold");
        doc2.setFontSize(8);
        doc2.setTextColor(100, 116, 139);
        doc2.text("CI FRET INTER/AMT TRANSIT", pageWidth / 2, pageHeight - 12, { align: 'center' });
        doc2.setFont("helvetica", "normal");
        doc2.text("81 AVENUE ARISTIDE BRIAND 93240 STAINS | Tel. 0186900380 | amt.transit@gmail.com | Siret: 929 865 103 R.C.S. Paris |", pageWidth / 2, pageHeight - 8, { align: 'center' });

        doc2.save(`Acte_Abandon_${data.ref}.pdf`);
    }

    return { printDeliverySlip, printInvoice, generateAbandonmentPDF };
}
