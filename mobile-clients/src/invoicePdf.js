// Génération du PDF de facture (HTML -> PDF via expo-print).
// Reprend le modèle officiel (en-tête, FACTURÉ À, articles, récap financier,
// CGV, pied de page). Données fournies par la Cloud Function getMyInvoiceDetail.
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import qrcode from 'qrcode-generator';

// Site public (origine des liens de vérification, comme côté staff).
const SITE_ORIGIN = 'https://app-caisse.vercel.app';

// QR code -> data URL GIF (pur JS, sans DOM ni canvas, OK en React Native).
function qrDataUrl(text) {
  try {
    const qr = qrcode(0, 'M'); // correction d'erreur niveau M
    qr.addData(String(text || ''));
    qr.make();
    return qr.createDataURL(4, 8); // cellSize, marge
  } catch (e) { return ''; }
}

const TAUX = 656;
// Formatage FCFA (les montants stockés sont en FCFA).
const fcfa = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} F CFA`;
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fdate = (v) => { try { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR'); } catch (e) { return ''; } };

const DEFAULT_CGV = [
  "1- Les temps et délais de transport sont donnés à titre indicatif. Les retards des navires et les délais de dédouanement ne sauraient être imputés à AMT TRANS'IT.",
  "2- Les enlèvements à domicile sont gratuits dans la limite géographique définie par AMT TRANS'IT.",
  "3- Les livraisons sont gratuites dans les communes d'Abidjan dans les 3 jours suivant l'arrivée du conteneur. Au-delà, elles sont payantes.",
  "4- Stockage gratuit 1 semaine après l'arrivée ; au-delà, forfait 10 000 FCFA puis 1 000 FCFA/jour/colis (3 000 pour une palette).",
  "5- Tous les colis doivent être intégralement payés avant remise au destinataire.",
  "6- Les dommages sont dédommagés dans la limite des coûts de transport, sauf assurance souscrite.",
  "7- Les marchandises doivent être correctement emballées ; un réemballage éventuel est à la charge du client.",
  "8- Colis non récupérés/non payés conservés 3 mois maximum, ensuite considérés comme abandonnés.",
];

// Construit le HTML de la facture à partir du détail renvoyé par le serveur.
export function buildInvoiceHtml(detail) {
  const t = detail.transaction || {};
  const company = detail.company || {};
  const cfg = detail.invoiceConfig || {};
  const companyName = cfg.companyName || company.name || "AMT TRANS'IT";
  const logo = cfg.logoUrl || company.logoBase64 || '';
  const headerColor = cfg.headerColorHex || '#1A3553';

  const prix = Number(t.prix) || 0;
  const paye = (Number(t.montantParis) || 0) + (Number(t.montantAbidjan) || 0);
  const mag = Number(detail.magasinageFee) || 0;
  const reduction = Number(detail.reduction) || 0;
  let reste = prix - reduction + mag - paye;
  if (reste < 0) reste = 0;
  const isPaid = reste <= 0;

  // Lignes d'articles.
  const items = Array.isArray(t.items) && t.items.length ? t.items : null;
  const rows = items
    ? items.map((it) => `<tr><td>${esc(it.desc || '')}</td><td style="text-align:center">${esc(it.qty || 1)}</td><td style="text-align:right">${it.pu ? fcfa(it.pu) : '-'}</td><td style="text-align:right">${it.total ? fcfa(it.total) : '-'}</td></tr>`).join('')
    : `<tr><td>${esc(t.description || 'Colis divers')}</td><td style="text-align:center">${esc(t.quantite || 1)}</td><td style="text-align:right">-</td><td style="text-align:right">-</td></tr>`;

  const cgvText = (cfg.cgv ? String(cfg.cgv).replace(/\\n/g, '\n').split('\n') : DEFAULT_CGV);
  const footer = cfg.footer || "81 AVENUE ARISTIDE BRIAND 93240 STAINS | Tel. 0186900380 | amt.transit@gmail.com";

  // QR de vérification (même URL publique que le PDF staff : statut réel en
  // direct). Nécessite la collection + l'id renvoyés par getMyInvoiceDetail.
  const verifyUrl = (detail.collection && detail.transDocId)
    ? `${SITE_ORIGIN}/verify.html?c=${encodeURIComponent(detail.collection)}&id=${encodeURIComponent(detail.transDocId)}`
    : '';
  const qrImg = verifyUrl ? qrDataUrl(verifyUrl) : '';
  const clientName = String(t.nomDestinataire || t.nom || 'Client').replace(/(\+?\d[\d\s.\-]{6,}\d)/g, '').trim();

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    * { font-family: Helvetica, Arial, sans-serif; box-sizing: border-box; }
    body { margin: 0; color: #1e293b; font-size: 12px; }
    .head { background: ${headerColor}; color: #fff; padding: 22px 28px; display: flex; justify-content: space-between; align-items: center; }
    .head .brand { display: flex; align-items: center; gap: 12px; }
    .head img { height: 42px; }
    .head .name { font-size: 20px; font-weight: bold; }
    .head .doc { font-size: 24px; font-weight: bold; letter-spacing: 1px; }
    .accent { height: 4px; background: #3b82f6; }
    .body { padding: 24px 28px; }
    .cols { display: flex; justify-content: space-between; gap: 20px; }
    .blk h4 { margin: 0 0 6px; font-size: 12px; }
    .blk p { margin: 2px 0; }
    .facture-a { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; min-width: 230px; }
    table { width: 100%; border-collapse: collapse; margin-top: 22px; }
    th { background: #3b82f6; color: #fff; padding: 9px; text-align: left; font-size: 11px; }
    td { padding: 9px; border-bottom: 1px solid #eef2f7; }
    .recap { margin-top: 22px; width: 50%; margin-left: auto; }
    .recap .r { display: flex; justify-content: space-between; padding: 4px 0; }
    .recap .reste { background: ${isPaid ? '#f0fdf4' : '#fef2f2'}; color: ${isPaid ? '#16a34a' : '#dc2626'}; font-weight: bold; padding: 8px 10px; border-radius: 4px; margin-top: 6px; }
    .stamp { color: ${isPaid ? '#16a34a' : '#dc2626'}; font-weight: bold; font-size: 16px; margin-top: 14px; }
    .cgv { margin-top: 28px; font-size: 8px; color: #475569; line-height: 1.5; }
    .cgv h5 { font-size: 9px; margin: 0 0 4px; }
    .foot { margin-top: 18px; text-align: center; font-size: 9px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  </style></head><body>
    <div class="head">
      <div class="brand">${logo ? `<img src="${logo}">` : ''}<span class="name">${esc(companyName)}</span></div>
      <div class="doc">FACTURE</div>
    </div>
    <div class="accent"></div>
    <div class="body">
      <div class="cols">
        <div class="blk">
          <h4>DÉTAILS DE L'EXPÉDITION :</h4>
          <p>Référence : <b>${esc(t.reference || '')}</b></p>
          <p>Date : ${fdate(t.date) || new Date().toLocaleDateString('fr-FR')}</p>
          <p>Conteneur : ${esc(t.conteneur || '-')}</p>
          <p>Expéditeur : ${esc(String(t.nom || '').replace(/(\+?\d[\d\s.\-]{6,}\d)/g, '').trim())}</p>
        </div>
        <div class="facture-a">
          <h4>FACTURÉ À :</h4>
          <p><b>${esc(clientName)}</b></p>
          <p>${esc(t.numero || '')}</p>
          <p>${esc(t.adresseDestinataire || '')}</p>
        </div>
      </div>
      <table>
        <thead><tr><th>Description / Nature du Colis</th><th style="text-align:center">Qté</th><th style="text-align:right">P.U</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="recap">
        <div class="r"><span>Total Fret :</span><span>${fcfa(prix)}</span></div>
        ${reduction > 0 ? `<div class="r"><span>Réduction :</span><span>- ${fcfa(reduction)}</span></div>` : ''}
        ${mag > 0 ? `<div class="r"><span>Frais magasinage :</span><span>${fcfa(mag)}</span></div>` : ''}
        <div class="r"><span>Montant Payé :</span><span>${fcfa(paye)}</span></div>
        <div class="reste"><div class="r" style="padding:0"><span>RESTE À PAYER :</span><span>${fcfa(reste)}</span></div></div>
      </div>
      <div class="stamp">${isPaid ? 'PAYÉ' : 'IMPAYÉ'}</div>
      ${qrImg ? `<div style="display:flex;align-items:center;gap:12px;margin-top:22px;border-top:1px solid #e2e8f0;padding-top:14px;">
        <img src="${qrImg}" style="width:92px;height:92px;">
        <div style="font-size:9px;color:#475569;line-height:1.5;">
          <b style="color:${headerColor};font-size:10px;">Facture vérifiable</b><br>
          Scannez ce QR code pour vérifier l'authenticité<br>et le statut réel (payé / impayé) de cette facture en ligne.
        </div>
      </div>` : ''}
      <div class="cgv">
        <h5>CONDITIONS GÉNÉRALES DE VENTE — À LIRE ATTENTIVEMENT :</h5>
        ${cgvText.map((l) => `<div>${esc(l)}</div>`).join('')}
      </div>
      <div class="foot">${esc(footer)}</div>
    </div>
  </body></html>`;
}

// Génère le PDF et ouvre le partage. Renvoie true si OK.
export async function shareInvoicePdf(detail) {
  const html = buildInvoiceHtml(detail);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Facture ${detail.reference || ''}` });
  }
  return true;
}

// VRAI enregistrement du PDF (pas la boîte d'impression). Sur Android : on
// demande à l'utilisateur de choisir un dossier (ex. « Téléchargements ») et on
// y écrit le fichier directement. Sur iOS : partage natif (inclut « Enregistrer
// dans Fichiers »). Renvoie { saved:true } ou { saved:false } si annulé.
export async function saveInvoicePdf(detail) {
  const html = buildInvoiceHtml(detail);
  const { uri } = await Print.printToFileAsync({ html });
  const name = `Facture_${String(detail.reference || 'AMT').replace(/[^\w.-]/g, '_')}`;

  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) return { saved: false }; // l'utilisateur a annulé le choix du dossier
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const dest = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, name, 'application/pdf');
    await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
    return { saved: true };
  }

  // iOS / repli : partage natif (avec « Enregistrer dans Fichiers »).
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Facture ${detail.reference || ''}` });
  }
  return { saved: true };
}
