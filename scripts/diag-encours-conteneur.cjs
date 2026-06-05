/** DIAGNOSTIC (lecture seule) — colis EN_COURS par conteneur, et SANS conteneur. */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'caisse-amt-perso' });
const db = admin.firestore();
const PAGE = 500;
(async () => {
  let last = null, total = 0, sansConteneur = 0;
  const parConteneur = {};
  const recentsSansConteneur = [];
  const recentsTous = [];
  while (true) {
    let q = db.collection('livraisons').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() || {};
      if ((x.containerStatus || '') !== 'EN_COURS') continue;
      total++;
      const c = (x.conteneur || '').trim();
      parConteneur[c || '(VIDE)'] = (parConteneur[c || '(VIDE)'] || 0) + 1;
      const dt = (x.dateAjout || '').slice(0, 16);
      if (!c) { sansConteneur++; if (recentsSansConteneur.length < 12) recentsSansConteneur.push({ ref: x.ref, qte: x.quantite, scans: Array.isArray(x.scanHistory) ? x.scanHistory.length : 0, dt }); }
      recentsTous.push({ ref: x.ref, c: c || '(VIDE)', dt });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  console.log('\n=== Colis EN_COURS ===');
  console.log(`total = ${total} | SANS conteneur = ${sansConteneur}\n`);
  console.log('Par conteneur :');
  Object.entries(parConteneur).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   "${k}" : ${v}`));
  if (recentsSansConteneur.length) {
    console.log('\nExemples SANS conteneur :');
    recentsSansConteneur.forEach(r => console.log(`   ${r.ref} qté=${r.qte} scans=${r.scans} (${r.dt})`));
  }
  console.log('\n10 colis EN_COURS les plus récents (par date) :');
  recentsTous.sort((a, b) => String(b.dt).localeCompare(String(a.dt))).slice(0, 10).forEach(r => console.log(`   ${r.ref} conteneur="${r.c}" (${r.dt})`));
  console.log('');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
