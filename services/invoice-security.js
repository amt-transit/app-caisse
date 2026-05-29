// Sécurité visuelle + vérifiable des factures PDF.
//
// Objectif : décourager la falsification manuelle d'une facture téléchargée
// (ex : un colis affiché « payé » sur le papier alors qu'il est impayé sur
// le site). On appose :
//   1) un TAMPON de statut bien visible (PAYÉ / PARTIEL / IMPAYÉ) ;
//   2) un FILIGRANE « RESTE À PAYER : X » en diagonale si non soldé ;
//   3) un QR code renvoyant vers la page publique de vérification qui
//      affiche le VRAI statut en direct depuis le site.
//
// La vraie protection est le QR : même si quelqu'un retouche les chiffres
// imprimés, le destinataire scanne et voit le statut réel.

import { makeQrDataUrl } from './qr-common.js';

// Statut de paiement normalisé d'une transaction.
export function computeInvoiceStatus(trans) {
    const total = parseFloat(trans && trans.prix) || 0;
    const paid = (parseFloat(trans && trans.montantParis) || 0) + (parseFloat(trans && trans.montantAbidjan) || 0);
    let remaining = total - paid;
    if (Math.abs(remaining) < 1) remaining = 0; // tolérance d'arrondi
    let status = 'IMPAYE', color = [229, 31, 33], label = 'IMPAYÉ';
    if (total > 0 && remaining <= 0) { status = 'PAYE'; color = [22, 163, 74]; label = 'PAYÉ'; }
    else if (paid > 0) { status = 'PARTIEL'; color = [242, 163, 18]; label = 'PARTIEL'; }
    return { status, label, color, total, paid, remaining };
}

// URL publique de vérification (origine courante : localhost en test, domaine
// Vercel en prod). c = nom de la collection (route-aware), id = doc id.
export function buildVerifyUrl(collectionName, docId) {
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
    return `${origin}/verify.html?c=${encodeURIComponent(collectionName)}&id=${encodeURIComponent(docId)}`;
}

// Appose tampon + filigrane + QR sur un document jsPDF déjà rempli.
// opts : { trans, collectionName, docId, formatMoney }
// formatMoney : fonction (montant)->string pour le filigrane (devise route).
export async function applyInvoiceSecurity(doc2, opts = {}) {
    const { trans, collectionName, docId, formatMoney } = opts;
    if (!doc2 || !trans) return;

    const pageW = doc2.internal.pageSize.getWidth();
    const pageH = doc2.internal.pageSize.getHeight();
    const st = computeInvoiceStatus(trans);

    // --- 1) FILIGRANE diagonal centré (tous statuts) ---
    // Grand mot de statut en diagonale, semi-transparent : ne masque pas le
    // contenu mais rend toute retouche manuelle évidente. Le montant restant
    // dû s'affiche dessous quand la facture n'est pas soldée.
    try {
        if (doc2.GState) doc2.setGState(new doc2.GState({ opacity: 0.11 }));
        doc2.setTextColor(...st.color);
        doc2.setFont('helvetica', 'bold');
        doc2.setFontSize(74);
        doc2.text(st.label, pageW / 2, pageH / 2, { align: 'center', angle: 30 });
        if (st.status !== 'PAYE') {
            const sub = 'RESTE : ' + (formatMoney ? formatMoney(st.remaining) : String(Math.round(st.remaining)));
            doc2.setFontSize(24);
            doc2.text(sub, pageW / 2, pageH / 2 + 24, { align: 'center', angle: 30 });
        }
        if (doc2.GState) doc2.setGState(new doc2.GState({ opacity: 1 }));
    } catch (e) { /* filigrane non bloquant */ }

    // --- 2) QR code de vérification (bas de page, à gauche) ---
    try {
        if (collectionName && docId) {
            const url = buildVerifyUrl(collectionName, docId);
            const qr = await makeQrDataUrl(url, { width: 240 });
            if (qr) {
                const qrSize = 26, qx = 14, qy = pageH - qrSize - 14;
                doc2.addImage(qr, 'PNG', qx, qy, qrSize, qrSize);
                doc2.setTextColor(90, 90, 90);
                doc2.setFont('helvetica', 'normal');
                doc2.setFontSize(7);
                doc2.text('Scannez pour vérifier', qx + qrSize + 3, qy + 9);
                doc2.text("l'authenticité et le", qx + qrSize + 3, qy + 13);
                doc2.text('statut réel de la facture', qx + qrSize + 3, qy + 17);
            }
        }
    } catch (e) { /* QR non bloquant */ }

    // Réinitialise une couleur de texte neutre pour la suite éventuelle.
    doc2.setTextColor(0, 0, 0);
}
