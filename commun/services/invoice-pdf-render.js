// Rendu PUR du PDF « Facture officielle » — AUCUN accès Firebase/Firestore.
// Toutes les données sont fournies par l'appelant, donc ce module est partagé
// SANS risque entre l'app staff (document-templates.js) et l'app client
// (clients/, qui n'a pas accès à Firestore). jsPDF = window.jspdf (CDN).
//
// payload attendu :
//   d              : objet "livraison-like" (ref, conteneur, expediteur, numero,
//                    lieuLivraison, commune, description, quantite, montant,
//                    prixOriginal, dateAjout, status, modeExpedition)
//   transData      : la transaction (items, prix, montantParis/Abidjan, nom,
//                    nomDestinataire, numero, adresseDestinataire, modeExpedition…)
//   transDocId     : id du doc transaction (pour le QR de vérification)
//   transCollection: nom de la collection (pour le QR)
//   companyName    : nom société (défaut AMT TRANS'IT)
//   logoBase64     : logo (dataURL/base64) ou null
//   invoiceConfig  : { headerColorHex, primaryColor, cgv, footer, companyName, logoUrl }
//   magasinageFee  : frais magasinage déjà calculés (FCFA)
//   reduction      : réduction éventuelle (FCFA)
//   securityIsEur  : true => filigrane/QR en EUR, sinon FCFA
import { DEFAULT_CGV, DEFAULT_COMPANY_FOOTER, CONSTANTS } from '../../constants.js';
import { stripPhoneFromName } from './phone.js';
import { applyInvoiceSecurity } from './invoice-security.js';

function hexToRgb(hex) {
  return hex.replace('#', '').match(/.{1,2}/g).map(x => parseInt(x, 16));
}

// Formatage monétaire SÛR pour jsPDF : on n'utilise PAS Intl (qui insère des
// espaces insécables U+202F/U+00A0 que jsPDF dessine comme « / »). On groupe
// les milliers avec une espace normale.
function groupThousands(n) {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + s;
}
const fcfa = (v) => groupThousands(v || 0) + ' FCFA';
const eur = (v) => {
  const neg = (v || 0) < 0;
  const a = Math.abs(v || 0);
  const s = a.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d,))/g, ' ');
  return (neg ? '-' : '') + s + ' €';
};

// Dessine la facture sur `doc2` (jsPDF). NE sauvegarde PAS (l'appelant fait .save()).
export async function renderOfficialInvoice(doc2, payload = {}) {
  const {
    d = {}, transData = null, transDocId = null, transCollection = 'transactions',
    companyName: companyNameIn, logoBase64: logoIn = null, invoiceConfig = null,
    magasinageFee = 0, reduction = 0, securityIsEur = false
  } = payload;

  let companyName = companyNameIn || "AMT TRANS'IT";
  let logoBase64 = logoIn;
  if (invoiceConfig) {
    if (invoiceConfig.companyName) companyName = invoiceConfig.companyName;
    if (invoiceConfig.logoUrl) logoBase64 = invoiceConfig.logoUrl;
  }

  const pageWidth = doc2.internal.pageSize.getWidth();

  // Logo distant (URL) -> dataURL
  if (logoBase64 && typeof logoBase64 === 'string' && logoBase64.startsWith('http')) {
    try {
      const response = await fetch(logoBase64);
      const blob = await response.blob();
      logoBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) { logoBase64 = null; }
  }

  // --- En-tête graphique ---
  doc2.setFillColor(...(invoiceConfig?.headerColorHex ? hexToRgb(invoiceConfig.headerColorHex) : [30, 41, 59]));
  doc2.rect(0, 0, pageWidth, 35, 'F');
  const accentColor = invoiceConfig?.primaryColor ? JSON.parse(invoiceConfig.primaryColor) : [59, 130, 246];
  doc2.setFillColor(...accentColor);
  doc2.rect(0, 35, pageWidth, 2, 'F');

  let textX = 15, textY = 22;
  if (logoBase64) {
    try {
      const props = doc2.getImageProperties(logoBase64);
      const ratio = props.width / props.height;
      let imgH = 16, imgW = imgH * ratio;
      if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
      doc2.addImage(logoBase64, 'PNG', 15, 10, imgW, imgH);
      textX = 15 + imgW + 5; textY = 22;
    } catch (e) {}
  } else {
    try {
      const logoElement = document.querySelector('.app-logo');
      if (logoElement && logoElement.complete && logoElement.naturalWidth > 0) {
        const ratio = logoElement.naturalWidth / logoElement.naturalHeight;
        let imgH = 16, imgW = imgH * ratio;
        if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
        doc2.addImage(logoElement, 'PNG', 15, 10, imgW, imgH);
        textX = 15 + imgW + 5; textY = 22;
      }
    } catch (e) {}
  }

  doc2.setTextColor(255, 255, 255);
  doc2.setFont("helvetica", "bold");
  doc2.setFontSize(18);
  doc2.text(companyName, textX, textY);
  doc2.text("FACTURE", pageWidth - 15, 22, { align: 'right' });

  // --- Détails expédition + FACTURÉ À ---
  doc2.setTextColor(0, 0, 0);
  doc2.setFontSize(10);
  doc2.setFont("helvetica", "bold");
  doc2.text("DÉTAILS DE L'EXPÉDITION :", 15, 50);
  doc2.setFont("helvetica", "normal");
  doc2.text(`Référence : ${d.ref || ''}`, 15, 57);
  doc2.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 15, 64);
  doc2.text(`Conteneur : ${d.conteneur || '-'}`, 15, 71);
  doc2.text(`Expéditeur : ${d.expediteur || (transData ? transData.nom : '') || '-'}`, 15, 78);

  doc2.setFillColor(248, 250, 252);
  doc2.setDrawColor(226, 232, 240);
  doc2.roundedRect(115, 45, 80, 35, 2, 2, 'FD');
  doc2.setFont("helvetica", "bold");
  doc2.text("FACTURÉ À :", 120, 52);
  doc2.setFont("helvetica", "normal");
  const clientName = stripPhoneFromName(transData ? (transData.nomDestinataire || transData.nom) : (d.destinataire || 'Client'));
  doc2.text(`${clientName}`, 120, 59);
  doc2.text(`${d.numero || transData?.numero || ''}`, 120, 66);
  const addrStr = doc2.splitTextToSize(`${d.lieuLivraison || d.commune || transData?.adresseDestinataire || ''}`, 70);
  doc2.text(addrStr, 120, 73);

  // --- Tableau articles (maritime ou aérien) ---
  const isAerienDoc = ((transData && transData.modeExpedition === 'aerien') || d.modeExpedition === 'aerien');
  const _eur = (v) => eur(v);
  const _aBilledKg = (it) => { if (it.mode !== 'poids') return 0; const real = parseFloat(it.poids) || 0; const vol = ((parseFloat(it.lng) || 0) * (parseFloat(it.lrg) || 0) * (parseFloat(it.haut) || 0)) / 5000; return Math.max(real, vol); };
  const _aLineEur = (it) => { const q = parseFloat(it.qty) || 0; return (it.mode === 'poids') ? _aBilledKg(it) * q * (it.parfum ? 15 : 13) : (parseFloat(it.pu) || 0) * q; };

  let aerienColumns = null, aerienRows = null;
  if (isAerienDoc && transData && Array.isArray(transData.items)) {
    aerienColumns = ["Description / Nature", "Qté", "Mode", "Poids", "Tarif / P.U", "Total"];
    aerienRows = [];
    let _totalKg = 0;
    transData.items.forEach(item => {
      const isP = item.mode === 'poids';
      const kg = _aBilledKg(item);
      _totalKg += kg * (parseFloat(item.qty) || 0);
      aerienRows.push([
        item.desc, String(item.qty),
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
  if (transData && Array.isArray(transData.items)) {
    transData.items.forEach(item => {
      tableRows.push([
        item.desc, String(item.qty), eur(item.pu || 0), eur(item.total || 0)
      ]);
    });
  } else {
    const descSource = d.description || transData?.description || 'Colis divers';
    const qtySource = d.quantite || transData?.quantite || 1;
    tableRows.push([descSource, String(qtySource), "-", "-"]);
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

  // --- Bilan financier (magasinage/réduction déjà calculés par l'appelant) ---
  let prixFret = 0, paye = 0, reste = 0;
  if (transData) {
    prixFret = transData.prix || 0;
    paye = (transData.montantAbidjan || 0) + (transData.montantParis || 0);
    const totalAPayer = prixFret - reduction + magasinageFee;
    reste = Math.max(0, totalAPayer - paye);
  } else {
    reste = parseFloat(String(d.montant || '0').replace(/[^\d]/g, '')) || 0;
    prixFret = parseFloat(String(d.prixOriginal || '0').replace(/[^\d]/g, '')) || reste;
    paye = prixFret > reste ? prixFret - reste : 0;
    reste += magasinageFee;
  }

  const formatMontant = (num) => fcfa(num);
  const finalY = doc2.lastAutoTable.finalY + 15;

  doc2.setFont("helvetica", "bold");
  doc2.text("RÉCAPITULATIF FINANCIER", 115, finalY);
  doc2.setFont("helvetica", "normal");

  let y = finalY + 8;
  doc2.text("Total Fret :", 115, y);
  doc2.text(`${formatMontant(prixFret)}`, 195, y, { align: 'right' });
  y += 6;
  if (reduction > 0) {
    doc2.text("Réduction :", 115, y);
    doc2.setTextColor(22, 163, 74);
    doc2.text(`- ${formatMontant(reduction)}`, 195, y, { align: 'right' });
    doc2.setTextColor(0, 0, 0);
    y += 6;
  }
  if (magasinageFee > 0) {
    doc2.text("Frais Magasinage :", 115, y);
    doc2.setTextColor(220, 38, 38);
    doc2.text(`+ ${formatMontant(magasinageFee)}`, 195, y, { align: 'right' });
    doc2.setTextColor(0, 0, 0);
    y += 6;
  }
  doc2.text("Montant Payé :", 115, y);
  doc2.text(`${formatMontant(paye)}`, 195, y, { align: 'right' });
  y += 6;

  doc2.setFillColor(reste > 0 ? 254 : 240, reste > 0 ? 242 : 253, reste > 0 ? 242 : 244);
  doc2.rect(115, y + 2, 80, 10, 'F');
  doc2.setFont("helvetica", "bold");
  doc2.text("RESTE À PAYER :", 118, y + 9);
  doc2.setTextColor(reste > 0 ? 220 : 22, reste > 0 ? 38 : 163, reste > 0 ? 38 : 74);
  doc2.text(`${formatMontant(reste)}`, 192, y + 9, { align: 'right' });
  doc2.setTextColor(0, 0, 0);
  doc2.text("La Direction AMT TRANS'IT", 15, y + 9);

  // --- CGV ---
  let cgvY = y + 20;
  if (cgvY + 50 > doc2.internal.pageSize.getHeight() - 15) { doc2.addPage(); cgvY = 20; }
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
  const cgvLines = String(cgvText).replace(/\\n/g, '\n').split('\n');
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

  // --- Sécurité : filigrane statut + QR de vérification ---
  if (transData && transDocId) {
    try {
      const TAUX = (CONSTANTS && CONSTANTS.TAUX_CONVERSION) || 655.957;
      await applyInvoiceSecurity(doc2, {
        trans: transData,
        collectionName: transCollection,
        docId: transDocId,
        formatMoney: (v) => securityIsEur ? eur((v || 0) / TAUX) : fcfa(v || 0)
      });
    } catch (e) { console.warn('Sécurité facture (module) :', e && e.message); }
  }

  return doc2;
}
