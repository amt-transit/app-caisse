/** DIAGNOSTIC (lecture seule) — colis « Stock Paris » : montants (€ vs FCFA),
 * dates, et champs du nouveau format (telExpediteur/adresseExpediteur). N'écrit RIEN. */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'caisse-amt-perso' });
const db = admin.firestore();
const PAGE = 500;
const num = (v) => parseFloat(String(v == null ? '' : v).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;

(async () => {
  let last = null;
  let total = 0, petits = 0, grands = 0, zero = 0, avecTelExp = 0, avecAdrExp = 0, avecDest = 0;
  const dateBuckets = {};
  const samples = [];
  while (true) {
    let q = db.collection('livraisons').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() || {};
      if ((x.containerStatus || '') !== 'PARIS') continue;
      total++;
      const m = num(x.montant);
      if (m === 0) zero++; else if (m < 5000) petits++; else grands++;
      if (x.telExpediteur && String(x.telExpediteur).trim()) avecTelExp++;
      if (x.adresseExpediteur && String(x.adresseExpediteur).trim()) avecAdrExp++;
      if (x.destinataire && String(x.destinataire).trim()) avecDest++;
      const jour = (x.dateAjout || '').slice(0, 10) || '(sans date)';
      dateBuckets[jour] = (dateBuckets[jour] || 0) + 1;
      if (samples.length < 12 && m > 0 && m < 5000) samples.push({
        ref: x.ref, montant: x.montant, prixOriginal: x.prixOriginal || '—',
        exp: x.expediteur, telExp: x.telExpediteur || '—', adrExp: x.adresseExpediteur || '—',
        dest: x.destinataire, num: x.numero || '—', date: (x.dateAjout || '').slice(0, 10), agency: x.agency
      });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  console.log('\n=== COLIS « Stock Paris » (containerStatus=PARIS) ===');
  console.log(`total = ${total}`);
  console.log(`  montant PETIT (<5000, probablement €)  = ${petits}`);
  console.log(`  montant GRAND (>=5000, probablement FCFA) = ${grands}`);
  console.log(`  montant ZÉRO/vide = ${zero}`);
  console.log(`  avec telExpediteur = ${avecTelExp} | avec adresseExpediteur = ${avecAdrExp} | avec destinataire = ${avecDest}`);
  console.log('\nRépartition par jour (dateAjout) :');
  Object.entries(dateBuckets).sort().forEach(([k, v]) => console.log(`   ${k} : ${v}`));
  console.log('\nExemples de lignes à MONTANT PETIT (€ ?) :');
  samples.forEach(s => console.log(`  ${s.ref} | montant="${s.montant}" prixOrig="${s.prixOriginal}" | exp="${s.exp}" telExp="${s.telExp}" adrExp="${s.adrExp}" | dest="${s.dest}" num="${s.num}" | ${s.date} | agency=${s.agency}`));
  console.log('');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
