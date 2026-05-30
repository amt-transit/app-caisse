// AMT Clients — PWA Phase 1 : connexion RÉELLE (Firebase Phone Auth + verrou PIN
// local) et VRAIES factures via la Cloud Function getMyInvoices (reliées au
// numéro vérifié par les 9 derniers chiffres, côté serveur).
import { auth, functions } from './firebase.js';
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";

const LS = {
  registered: 'amtc_registered',
  phone: 'amtc_phone',
  pin: 'amtc_pin',          // verrou LOCAL d'ouverture (la vraie sécurité = jeton Firebase)
  name: 'amtc_name'
};

// Obfuscation locale du PIN (verrou d'ouverture ; NON cryptographique).
const pinHash = (s) => btoa(unescape(encodeURIComponent('amtc:' + s)));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Données réelles, chargées après connexion via getMyInvoices.
let INVOICES = [];
let LOYALTY = { sentAsSender: 0, freeCartons: 0, toNext: 10 };
let invoicesLoaded = false;

const STATUS_LABEL = { PAYE: 'Payé', PARTIEL: 'Partiel', IMPAYE: 'Impayé' };

// Étapes de suivi d'un colis (du départ à la livraison).
const STAGES = [
  { l: 'Entrepôt', ic: '📥' },
  { l: 'Conteneur', ic: '📦' },
  { l: 'Arrivé', ic: '🛬' },
  { l: 'Livré', ic: '✅' }
];
// Suivi colis-par-colis : pas encore renvoyé par getMyInvoices -> branché plus tard.
let PARCELS = [];
let trackFilter = -1; // -1 = tous, sinon index d'étape
let selectedInvoiceRef = null;
let currentView = 'dashboard';
let detailCache = {};   // ref -> { colis:[{label,ref,desc,stage}], loaded:true }
let REQUESTS = [];      // demandes dépôt/récup du client
let requestsLoaded = false;
let requestsSubtab = 'tous'; // 'tous' | 'depot' | 'recup'
let requestFormType = 'depot'; // type en cours de saisie
// Le service Dépôt/Récupération ne concerne QUE les expéditeurs. On déduit le
// rôle des factures (rôle exp/both) + repli sur l'indicatif France (+33 = départ).
let isExpediteur = true;       // par défaut on n'masque rien tant qu'on ne sait pas
let clientSelfName = '';       // nom de l'expéditeur (préremplissage du formulaire)
let clientSelfAddress = '';    // adresse de l'expéditeur (préremplissage)

// Notifications réelles : Phase 3.
let NOTIFS = [];
let notifsLoaded = false;
function unreadCount() { return NOTIFS.filter(n => !n.read).length; }
function updateNotifBadge() {
  const b = $('#notifBadge'); if (!b) return;
  const n = unreadCount();
  b.textContent = n; b.hidden = (n === 0);
}
const TAUX = 655.957; // EUR -> FCFA
// Format selon la devise de la facture : 'EUR' (Paris) ou 'XOF'/FCFA (sinon).
const money = (v, currency = 'XOF') => {
  const c = currency === 'EUR' ? 'EUR' : 'XOF';
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c, maximumFractionDigits: c === 'XOF' ? 0 : 2 }).format(v || 0).replace(/[  ]/g, ' ');
  } catch (e) { return Math.round(v || 0) + (c === 'EUR' ? ' €' : ' FCFA'); }
};
// Convertit en FCFA pour additionner des factures de devises différentes.
const toFcfa = (v, currency) => (currency === 'EUR' ? (v || 0) * TAUX : (v || 0));
const fdate = (d) => { try { return new Date(d).toLocaleDateString('fr-FR'); } catch (e) { return d; } };

// ======================= CONNEXION (Firebase Phone Auth) =======================
const authEl = $('#auth');
const appEl = $('#appShell');
let confirmationResult = null;   // résultat de l'envoi SMS
let recaptchaVerifier = null;    // reCAPTCHA invisible (requis par Firebase)

function showStep(step) {
  $$('.auth__step').forEach(s => s.hidden = (s.dataset.step !== step));
  hideAuthError();
  const focusable = $(`.auth__step[data-step="${step}"] input`);
  if (focusable) setTimeout(() => focusable.focus(), 120);
}
function authError(msg) { const e = $('#authError'); e.textContent = msg; e.hidden = false; }
function hideAuthError() { $('#authError').hidden = true; }

function ensureRecaptcha() {
  if (!recaptchaVerifier) {
    // Firebase 9.22.0 : signature (container, params, auth) — l'ordre "auth en
    // premier" n'existe que dans les versions plus récentes du SDK.
    recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', { size: 'invisible' }, auth);
  }
  return recaptchaVerifier;
}
function resetRecaptcha() {
  try { recaptchaVerifier && recaptchaVerifier.clear(); } catch (_) {}
  recaptchaVerifier = null;
}

// Numéro saisi -> format international E.164 (+33… / +225…).
function buildE164() {
  const cc = $('#dialCode').value;                       // '+33' | '+225'
  let num = ($('#phoneInput').value || '').replace(/[^0-9]/g, '');
  if (cc === '+33' && num.startsWith('0')) num = num.slice(1); // France : on retire le 0
  return cc + num;
}
function smsError(e) {
  const code = (e && e.code) || '';
  if (code.includes('invalid-phone-number')) return 'Numéro invalide.';
  if (code.includes('too-many-requests')) return 'Trop de tentatives. Réessayez plus tard.';
  if (code.includes('quota')) return "Quota de SMS atteint pour aujourd'hui.";
  if (code.includes('captcha')) return 'Échec de la vérification anti-robot. Réessayez.';
  return "Envoi du SMS impossible. Vérifiez le numéro et réessayez.";
}

// Étape 1 -> envoi du vrai code SMS
$('#btnSendCode').addEventListener('click', async () => {
  const e164 = buildE164();
  if (e164.replace(/\D/g, '').length < 8) { authError('Numéro invalide.'); return; }
  const btn = $('#btnSendCode'); btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    confirmationResult = await signInWithPhoneNumber(auth, e164, ensureRecaptcha());
    localStorage.setItem(LS.phone, e164);
    $('#sentTo').textContent = 'Envoyé au ' + e164;
    showStep('code');
  } catch (e) {
    console.warn('SMS:', e && e.code, e && e.message);
    authError(smsError(e));
    resetRecaptcha();
  } finally { btn.disabled = false; btn.textContent = 'Recevoir le code par SMS'; }
});

// Retour modifier numéro
$$('.auth__back').forEach(b => b.addEventListener('click', () => showStep(b.dataset.goto)));

// Étape 2 -> vérifier le vrai code reçu
$('#btnVerifyCode').addEventListener('click', async () => {
  const code = ($('#codeInput').value || '').replace(/[^0-9]/g, '');
  if (code.length < 6) { authError('Entrez le code à 6 chiffres reçu par SMS.'); return; }
  if (!confirmationResult) { authError("Renvoyez d'abord un code."); showStep('phone'); return; }
  const btn = $('#btnVerifyCode'); btn.disabled = true; btn.textContent = 'Vérification…';
  try {
    await confirmationResult.confirm(code); // -> connecté (jeton avec phone_number)
    if (localStorage.getItem(LS.registered) === '1') enterApp();
    else showStep('setpin');
  } catch (e) {
    authError('Code incorrect. Réessayez.');
  } finally { btn.disabled = false; btn.textContent = 'Valider'; }
});

// Étape 3 -> enregistrer le PIN (verrou local des prochaines ouvertures)
$('#btnSavePin').addEventListener('click', () => {
  const p1 = ($('#pinSet1').value || '').replace(/[^0-9]/g, '');
  const p2 = ($('#pinSet2').value || '').replace(/[^0-9]/g, '');
  if (p1.length !== 4) { authError('Le code PIN doit faire 4 chiffres.'); return; }
  if (p1 !== p2) { authError('Les deux codes ne correspondent pas.'); return; }
  localStorage.setItem(LS.pin, pinHash(p1));
  localStorage.setItem(LS.registered, '1');
  enterApp();
});

// Étape 4 -> déverrouiller par PIN (la session Firebase persiste déjà)
$('#btnPin').addEventListener('click', () => {
  const p = ($('#pinInput').value || '').replace(/[^0-9]/g, '');
  if (pinHash(p) !== localStorage.getItem(LS.pin)) { authError('Code PIN incorrect.'); return; }
  if (!auth.currentUser) { authError('Session expirée — reconnexion par SMS.'); showStep('phone'); return; }
  enterApp();
});
$('#btnForgotPin').addEventListener('click', async () => {
  localStorage.removeItem(LS.registered);
  localStorage.removeItem(LS.pin);
  try { await signOut(auth); } catch (_) {}
  showStep('phone');
});

// Démarrage : on s'aligne sur la session Firebase + le PIN enregistré.
onAuthStateChanged(auth, (user) => {
  if (user && localStorage.getItem(LS.registered) === '1') {
    const ph = localStorage.getItem(LS.phone) || user.phoneNumber || '';
    $('#pinWelcome').textContent = ph ? `Bon retour 👋  (${ph})` : 'Bon retour 👋';
    showStep('pin');
  } else if (user) {
    showStep('setpin'); // connecté mais pas encore de PIN
  } else {
    showStep('phone');
  }
});

async function enterApp() {
  authEl.hidden = true;
  appEl.hidden = false;
  const ph = (auth.currentUser && auth.currentUser.phoneNumber) || localStorage.getItem(LS.phone) || '';
  const init = (localStorage.getItem(LS.name) || '').trim().slice(0, 2).toUpperCase() || ph.replace(/\D/g, '').slice(-2);
  $('#avatarInit').textContent = init || '👤';
  updateNotifBadge();
  renderView('dashboard');
  await loadInvoices();
  loadNotifications();
}

// Charge les VRAIES factures du client connecté (Cloud Function sécurisée).
async function loadInvoices() {
  invoicesLoaded = false;
  if (currentView === 'dashboard') renderView('dashboard');
  try {
    // S'assurer qu'on a bien une session Firebase AVEC numéro vérifié, et
    // rafraîchir le jeton (sinon la fonction répond "unauthenticated").
    const u = auth.currentUser;
    console.log('[AMTC] currentUser:', u ? u.phoneNumber : 'AUCUN');
    if (!u || !u.phoneNumber) {
      invoicesLoaded = true; INVOICES = [];
      window.__invoicesError = 'Session expirée. Reconnectez-vous par SMS.';
      renderView(currentView || 'dashboard');
      return;
    }
    try { await u.getIdToken(true); } catch (_) {}
    const res = await httpsCallable(functions, 'getMyInvoices')();
    const data = (res && res.data) || {};
    const roleLabel = { exp: 'Expéditeur', dest: 'Destinataire', both: 'Exp./Dest.' };
    INVOICES = (data.invoices || []).map(i => ({
      ref: i.reference, role: roleLabel[i.role] || '—', dest: i.counterpart || '—',
      date: i.date, total: i.total, paid: i.paid, status: i.status,
      // remaining inclut le magasinage (aligné sur le détail/PDF) ; fallback total-paid.
      remaining: (i.remaining !== undefined ? i.remaining : (i.total - i.paid)),
      magasinage: i.magasinage || 0,
      currency: i.currency || 'XOF', agency: i.agency || ''
    }));
    // Suivi colis (renvoyé par la fonction) : {ref, label, desc, stage, date}.
    PARCELS = (data.parcels || []).map(p => ({
      ref: p.ref, label: p.label, desc: p.desc || 'Colis',
      stage: (typeof p.stage === 'number' ? p.stage : 0), date: p.date || ''
    }));
    LOYALTY = data.loyalty || LOYALTY;
    // Rôle : expéditeur si au moins une facture en envoi, ou n° français (+33).
    const phoneDigits = ((auth.currentUser && auth.currentUser.phoneNumber) || '').replace(/\D/g, '');
    const hasSenderInvoice = INVOICES.some(i => i.role === 'Expéditeur' || i.role === 'Exp./Dest.');
    isExpediteur = hasSenderInvoice || phoneDigits.startsWith('33') || (LOYALTY.sentAsSender || 0) > 0;
    // Profil renvoyé par le serveur (nom/tél/adresse de l'expéditeur) : sert à
    // préremplir le formulaire Dépôt/Récup. Repli sur le nom mémorisé en local.
    const prof = data.profile || {};
    clientSelfName = (prof.name || localStorage.getItem(LS.name) || '').trim();
    clientSelfAddress = (prof.address || '').trim();
    if (clientSelfName) { try { localStorage.setItem(LS.name, clientSelfName); } catch (_) {} }
    invoicesLoaded = true;
    applyRoleVisibility();
  } catch (e) {
    console.warn('getMyInvoices:', e && e.code, e && e.message);
    invoicesLoaded = true;
    INVOICES = [];
    window.__invoicesError = (e && e.code === 'unauthenticated')
      ? 'Session expirée. Reconnectez-vous.' : "Impossible de charger vos factures pour le moment.";
  }
  renderView(currentView || 'dashboard');
}

// ======================= NAVIGATION =======================
const VIEW_TITLES = {
  dashboard: 'Tableau de bord', requests: 'Dépôt / Récupération', quotes: 'Devis',
  stats: 'Statistiques', chat: 'Messagerie', profile: 'Profil', tracking: 'Suivi des colis',
  notifications: 'Notifications', invoice: 'Détail de la facture',
  requestForm: 'Nouvelle demande'
};
// Vues présentes dans la barre du bas (les autres : profil, notifs, détail).
const TAB_VIEWS = ['dashboard', 'tracking', 'requests', 'quotes', 'stats', 'chat'];

function setActiveTab(view) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
}

// Masque l'onglet « Dépôt » (et les raccourcis dépôt/récup du tableau de bord)
// pour les clients destinataires : ce service ne concerne que les expéditeurs.
function applyRoleVisibility() {
  const reqTab = document.querySelector('.tab[data-view="requests"]');
  if (reqTab) reqTab.style.display = isExpediteur ? '' : 'none';
  document.querySelectorAll('[data-go="requests"]').forEach(el => {
    el.style.display = isExpediteur ? '' : 'none';
  });
  // Si un destinataire était sur la vue Dépôt, on le renvoie à l'accueil.
  if (!isExpediteur && currentView === 'requests') renderView('dashboard');
}

function renderView(view) {
  // Garde : un destinataire ne peut pas ouvrir le Dépôt/Récup (service expéditeur).
  if ((view === 'requests' || view === 'requestForm') && !isExpediteur) view = 'dashboard';
  currentView = view;
  const c = $('#content');
  $('#topTitle').textContent = VIEW_TITLES[view] || 'AMT Clients';
  if (TAB_VIEWS.includes(view)) setActiveTab(view);
  else $$('.tab').forEach(t => t.classList.remove('active'));
  c.scrollTop = 0;
  c.innerHTML = (VIEWS[view] || VIEWS.dashboard)();
  window.scrollTo(0, 0);
}

$$('.tab').forEach(t => t.addEventListener('click', () => renderView(t.dataset.view)));
$('#btnProfile').addEventListener('click', () => renderView('profile'));
$('#btnNotif').addEventListener('click', () => {
  renderView('notifications');
  markAllNotifsRead(); // ouvrir = tout marquer lu (serveur + local)
});

// Délégation : raccourcis (data-go) + filtre suivi (data-track)
// + ouverture facture (data-inv) + téléchargement PDF (data-pdf)
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { renderView(go.dataset.go); return; }
  const iv = e.target.closest('[data-inv]');
  if (iv) { selectedInvoiceRef = iv.dataset.inv; renderView('invoice'); loadInvoiceDetail(iv.dataset.inv); return; }
  const pf = e.target.closest('[data-pdf]');
  if (pf) { exportClientInvoicePDF(pf.dataset.pdf); return; }
  const tr = e.target.closest('[data-track]');
  if (tr) { trackFilter = parseInt(tr.dataset.track, 10); renderView('tracking'); return; }
  const rs = e.target.closest('[data-reqsub]');
  if (rs) { requestsSubtab = rs.dataset.reqsub; renderView('requests'); return; }
  const rn = e.target.closest('[data-reqnew]');
  if (rn) { openRequestForm(rn.dataset.reqnew); return; }
  const rsub = e.target.closest('[data-reqsubmit]');
  if (rsub) { submitRequest(); return; }
  const ra = e.target.closest('[data-reqaccept]');
  if (ra) { respondRequest(ra.dataset.reqaccept, 'accept'); return; }
  const rr = e.target.closest('[data-reqrefuse]');
  if (rr) { respondRequest(rr.dataset.reqrefuse, 'refuse'); return; }
});

// --- Demandes dépôt / récupération ---
async function loadRequests() {
  if (requestsLoaded) return;
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    const res = await httpsCallable(functions, 'getMyRequests')();
    REQUESTS = ((res && res.data && res.data.requests) || []);
  } catch (e) {
    console.warn('getMyRequests:', e && e.code, e && e.message);
    REQUESTS = [];
  }
  requestsLoaded = true;
  if (currentView === 'requests') renderView('requests');
}

function openRequestForm(type) {
  requestFormType = (type === 'recup') ? 'recup' : 'depot';
  renderView('requestForm');
}

async function submitRequest() {
  const err = (m) => { const e = $('#reqError'); if (e) { e.textContent = m; e.hidden = false; } };
  const payload = {
    type: requestFormType,
    fullName: ($('#reqName')?.value || '').trim(),
    commune: ($('#reqCommune')?.value || '').trim(),
    address: ($('#reqAddress')?.value || '').trim(),
    date: ($('#reqDate')?.value || '').trim(),
    description: ($('#reqDesc')?.value || '').trim(),
  };
  if (!payload.commune && !payload.address) { err('Indiquez au moins une commune ou une adresse.'); return; }
  // Mémorise le nom de l'expéditeur pour préremplir les prochaines demandes.
  if (payload.fullName) { try { localStorage.setItem(LS.name, payload.fullName); clientSelfName = payload.fullName; } catch (_) {} }
  const btn = $('[data-reqsubmit]'); if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    await httpsCallable(functions, 'createClientRequest')(payload);
    requestsLoaded = false;          // forcer le rechargement de la liste
    requestsSubtab = payload.type;   // afficher l'onglet correspondant
    renderView('requests');
  } catch (e) {
    console.warn('createClientRequest:', e && e.code, e && e.message);
    err(e && e.code === 'unauthenticated' ? 'Session expirée, reconnectez-vous.' : "Envoi impossible. Réessayez.");
    if (btn) { btn.disabled = false; btn.textContent = 'Envoyer la demande'; }
  }
}

// Charge les notifications du client (cloche 🔔) + met à jour le badge.
async function loadNotifications() {
  try {
    const u = auth.currentUser;
    if (!u || !u.phoneNumber) return;
    try { await u.getIdToken(true); } catch (_) {}
    const res = await httpsCallable(functions, 'getMyNotifications')();
    NOTIFS = ((res && res.data && res.data.notifications) || []).map(n => ({
      id: n.id, ic: n.icon || '🔔', title: n.title || '', txt: n.body || n.title || '',
      date: n.createdAt || '', read: !!n.read
    }));
    notifsLoaded = true;
    updateNotifBadge();
    if (currentView === 'notifications') renderView('notifications');
  } catch (e) {
    console.warn('getMyNotifications:', e && e.code, e && e.message);
    notifsLoaded = true;
  }
}

// Marque toutes les notifs lues (serveur + local).
async function markAllNotifsRead() {
  const unread = NOTIFS.filter(n => !n.read);
  if (!unread.length) return;
  NOTIFS.forEach(n => n.read = true);
  updateNotifBadge();
  try { await httpsCallable(functions, 'markNotificationsRead')({}); } catch (_) {}
}

// Réponse du client à une proposition de l'agence (date modifiée) : accept/refuse.
async function respondRequest(id, action) {
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    await httpsCallable(functions, 'respondClientRequest')({ id, action });
    requestsLoaded = false; // recharge la liste avec le nouveau statut
    renderView('requests');
    setTimeout(loadNotifications, 1500); // le RDV confirmé peut générer une notif
  } catch (e) {
    console.warn('respondClientRequest:', e && e.code, e && e.message);
    alert("Action impossible pour le moment. Réessayez.");
  }
}

// Génère le PDF OFFICIEL (identique au staff) : la fonction Cloud renvoie
// config + transaction + colis + magasinage de SA facture, puis on dessine
// avec le renderer partagé services/invoice-pdf-render.js.
async function exportClientInvoicePDF(ref) {
  try {
    const detail = (await httpsCallable(functions, 'getMyInvoiceDetail')({ reference: ref })).data;
    if (!detail || !detail.transaction) { alert("Facture introuvable."); return; }
    const { loadJsPdf } = await import('../../services/pdf-common.js');
    const { renderOfficialInvoice } = await import('../../services/invoice-pdf-render.js');
    const { jsPDF } = await loadJsPdf();
    const doc = new jsPDF('p', 'mm', 'a4');
    const t = detail.transaction;
    const d = detail.livraison || {
      ref: t.reference, conteneur: t.conteneur, expediteur: t.nom, numero: t.numero,
      lieuLivraison: t.adresseDestinataire, description: t.description,
      quantite: t.quantite, dateAjout: t.date, modeExpedition: t.modeExpedition
    };
    await renderOfficialInvoice(doc, {
      d, transData: t, transDocId: detail.transDocId, transCollection: detail.collection,
      companyName: detail.company && detail.company.name,
      logoBase64: detail.company && detail.company.logoBase64,
      invoiceConfig: detail.invoiceConfig,
      magasinageFee: detail.magasinageFee || 0,
      reduction: detail.reduction || 0,
      securityIsEur: (t.agency === 'paris')
    });
    doc.save(`Facture_${ref}.pdf`);
  } catch (e) {
    console.warn('PDF client :', e && e.code, e && e.message);
    alert(e && e.code === 'permission-denied' ? "Facture non autorisée." : "Génération du PDF impossible pour le moment.");
  }
}

// Étape d'un colis (0..3) déduite du statut logistique de sa livraison.
function stageOf(liv) {
  if (!liv) return 0;
  if (liv.status === 'LIVRE') return 3;
  if (liv.containerStatus === 'EN_COURS') return 2;   // arrivé à destination
  if (liv.containerStatus === 'A_VENIR') return 1;    // en conteneur / transit
  return 0;                                            // entrepôt (Paris)
}

// Charge le détail (colis + étapes) d'UNE facture via la fonction Cloud, puis
// ré-affiche la vue détail si elle est ouverte.
async function loadInvoiceDetail(ref) {
  if (detailCache[ref]) { if (currentView === 'invoice') renderView('invoice'); return; }
  try {
    const detail = (await httpsCallable(functions, 'getMyInvoiceDetail')({ reference: ref })).data || {};
    const colis = [];
    (detail.livraisons || []).forEach(liv => {
      const stage = stageOf(liv);
      const labels = (liv.labels && liv.labels.length) ? liv.labels : [liv.ref || ref];
      labels.forEach(lbl => colis.push({ label: lbl, ref: liv.ref || ref, desc: liv.description || '', stage }));
    });
    detailCache[ref] = { colis, loaded: true };
  } catch (e) {
    console.warn('détail facture :', e && e.code, e && e.message);
    detailCache[ref] = { colis: [], loaded: true, error: true };
  }
  if (currentView === 'invoice') renderView('invoice');
}

// ======================= VUES =======================
function invRow(i) {
  const cls = i.status === 'PAYE' ? 'paye' : i.status === 'PARTIEL' ? 'partiel' : 'impaye';
  return `<div class="inv" data-inv="${i.ref}" style="cursor:pointer">
    <div class="inv__main">
      <div class="inv__ref">${i.ref} <span class="tagp tagp--${cls}">${STATUS_LABEL[i.status]}</span></div>
      <div class="inv__sub">${i.role === 'Destinataire' ? 'Expéditeur' : (i.role === 'Expéditeur' ? 'Destinataire' : 'Autre partie')} : ${i.dest} · ${fdate(i.date)}</div>
    </div>
    <div class="inv__amt">${money(i.total, i.currency)} <span style="color:#c2cedd;font-weight:700;">›</span></div>
  </div>`;
}

// Récap par étape (nombre de colis à chaque étape). clickable=true -> filtre.
function pipeSummary(clickable) {
  return `<div class="pipe">` + STAGES.map((s, idx) => {
    const n = PARCELS.filter(p => p.stage === idx).length;
    const act = (!clickable && trackFilter === idx) ? ' active' : '';
    const attr = clickable ? `data-go="tracking"` : `data-track="${idx}"`;
    return `<button class="p${act}" ${attr}>
      <div class="p__ic">${s.ic}</div><div class="p__v">${n}</div><div class="p__l">${s.l}</div>
    </button>`;
  }).join('') + `</div>`;
}

// Barre d'étapes d'un colis (0..3).
function stepper(stage) {
  return `<div class="stepper">` + STAGES.map((s, idx) => {
    const cls = idx < stage ? 'done' : (idx === stage ? 'current' : '');
    return `<div class="step ${cls}">
      <div class="step__bar"></div>
      <div class="step__dot">${idx <= stage ? s.ic : (idx + 1)}</div>
      <div class="step__lb">${s.l}</div>
    </div>`;
  }).join('') + `</div>`;
}

const VIEWS = {
  dashboard() {
    if (!invoicesLoaded) {
      return `<div class="card"><div class="placeholder"><span class="ph-ic">⏳</span>Chargement de vos factures…</div></div>`;
    }
    const errMsg = window.__invoicesError;
    const last5 = INVOICES.slice(0, 5).map(invRow).join('') ||
      `<div class="placeholder" style="padding:10px;">${errMsg || "Aucune facture reliée à votre numéro pour le moment."}</div>`;
    // Reste à payer (magasinage inclus) : devises mixtes -> converti en FCFA.
    const totalDuFcfa = INVOICES.reduce((s, i) => s + toFcfa(i.remaining, i.currency), 0);
    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi__v">${INVOICES.length}</div><div class="kpi__l">Mes factures</div></div>
        <div class="kpi"><div class="kpi__v">${money(totalDuFcfa, 'XOF')}</div><div class="kpi__l">Reste à payer</div></div>
      </div>

      <div class="shortcuts">
        <button class="shortcut" data-go="tracking"><span class="shortcut__ic">🚚</span><span class="shortcut__tx">Suivre mes colis</span></button>
        <button class="shortcut" data-go="requests"><span class="shortcut__ic">📦</span><span class="shortcut__tx">Demander un dépôt</span></button>
        <button class="shortcut" data-go="requests"><span class="shortcut__ic">🔄</span><span class="shortcut__tx">Faire récupérer</span></button>
        <button class="shortcut" data-go="quotes"><span class="shortcut__ic">🧾</span><span class="shortcut__tx">Faire un devis</span></button>
        <button class="shortcut" data-go="notifications"><span class="shortcut__ic">🔔</span><span class="shortcut__tx">Notifications</span></button>
        <button class="shortcut" data-go="dashboard"><span class="shortcut__ic">🚢</span><span class="shortcut__tx">Prochains départs</span></button>
      </div>

      <div class="card">
        <div class="section-title">5 dernières factures <span class="link" data-go="dashboard">Tout voir →</span></div>
        ${last5}
      </div>
      <p class="placeholder" style="padding:6px;">Le suivi colis par colis (entrepôt, conteneur, arrivée, livraison) sera relié prochainement.</p>
    `;
  },

  requests() {
    const sub = (k, lbl) => `<button class="subtab${requestsSubtab === k ? ' active' : ''}" data-reqsub="${k}">${lbl}</button>`;
    let body;
    if (!requestsLoaded) {
      body = `<div class="card"><div class="placeholder"><span class="ph-ic">⏳</span>Chargement de vos demandes…</div></div>`;
      loadRequests();
    } else {
      const filtered = REQUESTS.filter(r => requestsSubtab === 'tous' || r.type === requestsSubtab);
      const statusMap = {
        en_attente: { l: 'En attente', c: '#b45309', bg: '#fef3c7' },
        modifiee:   { l: 'À confirmer', c: '#1e40af', bg: '#dbeafe' },
        confirmee:  { l: 'Confirmée',  c: '#166534', bg: '#dcfce7' },
        refusee:    { l: 'Refusée',    c: '#991b1b', bg: '#fee2e2' },
        traitee:    { l: 'RDV fixé',   c: '#166534', bg: '#dcfce7' },
      };
      body = filtered.length ? filtered.map(r => {
        const st = statusMap[r.status] || statusMap.en_attente;
        const typeLbl = r.type === 'recup' ? '🔄 Récupération' : '📦 Dépôt';
        const where = [r.commune, r.address].filter(Boolean).join(' · ');
        // Proposition du staff à confirmer par le client.
        const proposal = (r.status === 'modifiee') ? `
          <div style="margin-top:10px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
            <div style="font-weight:700;color:#1e40af;margin-bottom:4px;">📅 Proposition de l'agence</div>
            <div class="inv__sub">Date : <b>${fdate(r.staffDate)}</b>${r.staffTime ? ' · ' + r.staffTime : ''}</div>
            ${r.staffNote ? `<div class="inv__sub">💬 ${r.staffNote}</div>` : ''}
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="btn btn--primary" style="flex:1;" data-reqaccept="${r.id}">✅ Accepter</button>
              <button class="btn btn--ghost" style="flex:1;" data-reqrefuse="${r.id}">✕ Refuser</button>
            </div>
          </div>` : '';
        return `<div class="card" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong>${typeLbl}</strong>
            <span style="background:${st.bg};color:${st.c};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">${st.l}</span>
          </div>
          ${where ? `<div class="inv__sub" style="margin-top:6px;">📍 ${where}</div>` : ''}
          ${r.wantedDate ? `<div class="inv__sub">🗓️ Souhaité : ${fdate(r.wantedDate)}</div>` : ''}
          ${(r.status === 'confirmee' || r.status === 'traitee') && r.staffDate ? `<div class="inv__sub">✅ Date retenue : <b>${fdate(r.staffDate)}</b>${r.staffTime ? ' · ' + r.staffTime : ''}</div>` : ''}
          ${r.description ? `<div class="inv__sub">📝 ${r.description}</div>` : ''}
          <div class="inv__sub" style="color:#94a3b8;">Demandé le ${fdate(r.createdAt)}</div>
          ${proposal}
        </div>`;
      }).join('') : `<div class="card"><div class="placeholder"><span class="ph-ic">📦</span>Aucune demande pour le moment.</div></div>`;
    }
    return `
      <div class="subtabs">${sub('tous', 'Tous')}${sub('depot', 'Dépôts')}${sub('recup', 'Récups')}</div>
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <button class="btn btn--primary" style="flex:1;" data-reqnew="depot">📦 Demander un dépôt</button>
        <button class="btn btn--primary" style="flex:1;" data-reqnew="recup">🔄 Faire récupérer</button>
      </div>
      ${body}
    `;
  },

  // Formulaire de nouvelle demande (dépôt ou récup). Vue dédiée 'requestForm'.
  requestForm() {
    const isRecup = requestFormType === 'recup';
    const title = isRecup ? 'Demande de récupération' : 'Demande de dépôt';
    const hint = isRecup
      ? "Indiquez où récupérer/livrer le colis et quand."
      : "Indiquez où enlever votre colis (adresse de départ) et quand.";
    const myPhone = (auth.currentUser && auth.currentUser.phoneNumber) || localStorage.getItem(LS.phone) || '';
    return `
      <button class="btn btn--ghost" data-go="requests" style="text-align:left;margin:0 0 8px;">← Retour</button>
      <div class="card">
        <div class="section-title">${title}</div>
        <p class="muted" style="margin:0 0 12px;font-size:13px;">${hint}</p>
        <div class="placeholder" style="padding:8px 10px;margin-bottom:12px;">👤 Expéditeur : <b>${clientSelfName || 'à compléter'}</b> · 📞 ${myPhone}</div>
        <label class="auth__label">Nom complet</label>
        <input id="reqName" class="filter-input" type="text" placeholder="Votre nom" value="${(clientSelfName || '').replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
        <label class="auth__label">Commune / Ville</label>
        <input id="reqCommune" class="filter-input" type="text" placeholder="Ex : Cocody, Paris…" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
        <label class="auth__label">Adresse précise</label>
        <input id="reqAddress" class="filter-input" type="text" placeholder="Quartier, rue, point de repère" value="${(clientSelfAddress || '').replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
        <label class="auth__label">Date souhaitée</label>
        <input id="reqDate" class="filter-input" type="date" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
        <label class="auth__label">Description du colis</label>
        <textarea id="reqDesc" class="filter-input" rows="3" placeholder="Ex : 2 cartons, 1 valise…" style="width:100%;box-sizing:border-box;margin-bottom:14px;"></textarea>
        <div id="reqError" class="auth__error" hidden style="margin-bottom:10px;"></div>
        <button class="btn btn--primary" style="width:100%;" data-reqsubmit="1">Envoyer la demande</button>
      </div>
    `;
  },

  quotes() {
    return `
      <button class="btn btn--primary" style="margin-bottom:14px;">+ Nouveau devis</button>
      <div class="card"><div class="placeholder"><span class="ph-ic">🧾</span>Créez et retrouvez vos devis ici. Vous pourrez les transformer en demande d'envoi.</div></div>
    `;
  },

  stats() {
    if (!invoicesLoaded) return `<div class="card"><div class="placeholder"><span class="ph-ic">⏳</span>Chargement…</div></div>`;
    const nb = INVOICES.length;
    // Montants agrégés en FCFA (factures de devises mixtes -> conversion).
    const paye = INVOICES.reduce((s, i) => s + toFcfa(i.paid, i.currency), 0);
    const total = INVOICES.reduce((s, i) => s + toFcfa(i.total, i.currency), 0);
    const impaye = Math.max(0, total - paye);
    const envois = LOYALTY.sentAsSender || 0;
    const paidPct = total > 0 ? Math.round(paye / total * 100) : 0;
    const unpaidPct = 100 - paidPct;

    // Donut SVG (circonférence = 100 -> r = 15.915). Le segment payé part du
    // haut (dashoffset 25), le segment impayé commence là où le payé finit.
    const donut = `
      <svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Répartition des paiements">
        <circle class="donut-ring" cx="21" cy="21" r="15.915"></circle>
        <circle class="donut-seg" cx="21" cy="21" r="15.915" stroke="var(--green)"
                stroke-dasharray="${paidPct} ${100 - paidPct}" stroke-dashoffset="25"></circle>
        <circle class="donut-seg" cx="21" cy="21" r="15.915" stroke="var(--amt-red)"
                stroke-dasharray="${unpaidPct} ${100 - unpaidPct}" stroke-dashoffset="${25 - paidPct}"></circle>
        <text x="21" y="20.5" class="donut-c1">${paidPct}%</text>
        <text x="21" y="26" class="donut-c2">PAYÉ</text>
      </svg>`;

    // Histogramme : nombre de factures par mois (6 derniers mois réels).
    const now = new Date();
    const months = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const l = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
      const v = INVOICES.filter(i => String(i.date || '').slice(0, 7) === ym).length;
      months.push({ l, v });
    }
    const maxV = Math.max(1, ...months.map(m => m.v));
    const bars = months.map(m => {
      const h = Math.round((m.v / maxV) * 100);
      const top = m.v === maxV ? ' is-top' : '';
      return `<div class="b">
        <div class="b__v">${m.v}</div>
        <div class="b__bar${top}" style="height:${h}%"></div>
        <div class="b__l">${m.l}</div>
      </div>`;
    }).join('');

    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi__v">${nb}</div><div class="kpi__l">Factures</div></div>
        <div class="kpi"><div class="kpi__v">${envois}</div><div class="kpi__l">Envois (expéditeur)</div></div>
        <div class="kpi"><div class="kpi__v" style="color:var(--green);">${money(paye)}</div><div class="kpi__l">Total payé</div></div>
        <div class="kpi"><div class="kpi__v" style="color:var(--amt-red);">${money(impaye)}</div><div class="kpi__l">Total impayé</div></div>
      </div>

      <div class="card">
        <div class="section-title">Répartition des paiements</div>
        <div class="donut-wrap">
          ${donut}
          <div class="donut-legend">
            <div><span class="dot" style="background:var(--green)"></span>Payé · <b>${money(paye)}</b></div>
            <div><span class="dot" style="background:var(--amt-red)"></span>Impayé · <b>${money(impaye)}</b></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">Activité — 6 derniers mois</div>
        <div class="bars6">${bars}</div>
      </div>

      <div class="card"><div class="section-title">Total facturé</div><div class="kpi__v" style="font-size:30px;">${money(total)}</div></div>

      <div class="card">
        <div class="section-title">Fidélité</div>
        <div class="placeholder" style="padding:6px;">🎁 ${envois} envoi(s) comme expéditeur · ${LOYALTY.freeCartons || 0} carton(s) offert(s) · plus que ${LOYALTY.toNext ?? 10} avant le prochain.</div>
      </div>
    `;
  },

  chat() {
    return `
      <div class="card"><div class="placeholder"><span class="ph-ic">💬</span>Échangez avec AMT Trans'it. Vos messages seront dirigés vers votre agence (départ ou arrivée) selon votre profil.</div></div>
    `;
  },

  notifications() {
    if (!notifsLoaded && !NOTIFS.length) {
      loadNotifications();
      return `<div class="card"><div class="placeholder"><span class="ph-ic">⏳</span>Chargement…</div></div>`;
    }
    if (!NOTIFS.length) {
      return `<div class="card"><div class="placeholder"><span class="ph-ic">🔔</span>Aucune notification pour le moment.</div></div>`;
    }
    const items = NOTIFS.map(n => `
      <div class="inv" style="${n.read ? '' : 'background:#eff6ff;'}">
        <div style="font-size:20px;margin-right:4px;">${n.ic}</div>
        <div class="inv__main">
          ${n.title ? `<div class="inv__ref" style="font-weight:700;color:var(--ink);font-size:13.5px;">${n.title}</div>` : ''}
          <div class="inv__sub" style="color:#475569;">${n.txt}</div>
          <div class="inv__sub" style="color:#94a3b8;">${fdate(n.date)}</div>
        </div>
        ${n.read ? '' : '<span style="width:9px;height:9px;border-radius:50%;background:#3b82f6;align-self:center;"></span>'}
      </div>`).join('');
    return `<div class="card"><div class="section-title">Mes notifications</div>${items}</div>`;
  },

  invoice() {
    const inv = INVOICES.find(i => i.ref === selectedInvoiceRef) || INVOICES[0];
    if (!inv) return `<button class="btn btn--ghost" data-go="dashboard">← Retour</button><div class="card"><div class="placeholder">Facture introuvable.</div></div>`;
    const cur = inv.currency || 'XOF';
    const reste = (inv.remaining !== undefined ? inv.remaining : (inv.total - inv.paid));
    const mag = inv.magasinage || 0;
    const cls = inv.status === 'PAYE' ? 'paye' : inv.status === 'PARTIEL' ? 'partiel' : 'impaye';
    const det = detailCache[inv.ref];
    const colis = det ? det.colis : [];
    const colisHtml = colis.length ? colis.map(p => `
      <div class="inv">
        <div class="inv__main">
          <div class="inv__ref" style="font-size:13.5px;">${p.label}</div>
          <div class="inv__sub">${p.desc}</div>
        </div>
        <div class="inv__amt" style="font-size:12px;color:var(--amt-blue);">${STAGES[p.stage].ic} ${STAGES[p.stage].l}</div>
      </div>`).join('') : `<div class="placeholder" style="padding:14px;">${det ? 'Aucun colis rattaché à cette facture.' : '⏳ Chargement du suivi…'}</div>`;

    return `
      <button class="btn btn--ghost" data-go="dashboard" style="text-align:left;margin:0 0 8px;">← Retour</button>
      <div class="card">
        <div class="section-title">${inv.ref} <span class="tagp tagp--${cls}">${STATUS_LABEL[inv.status]}</span></div>
        <div class="inv"><div class="inv__main"><div class="inv__sub">Votre rôle</div><div class="inv__ref">${inv.role}</div></div></div>
        <div class="inv"><div class="inv__main"><div class="inv__sub">${inv.role === 'Destinataire' ? 'Expéditeur' : (inv.role === 'Expéditeur' ? 'Destinataire' : 'Autre partie')}</div><div class="inv__ref">${inv.dest}</div></div></div>
        <div class="inv"><div class="inv__main"><div class="inv__sub">Date</div><div class="inv__ref">${fdate(inv.date)}</div></div></div>
      </div>

      <div class="card">
        <div class="section-title">Colis</div>
        ${colisHtml}
      </div>

      <div class="card">
        <div class="section-title">Montants</div>
        <div class="inv"><div class="inv__main"><div class="inv__ref">Total facturé</div></div><div class="inv__amt">${money(inv.total, cur)}</div></div>
        <div class="inv"><div class="inv__main"><div class="inv__ref">Déjà payé</div></div><div class="inv__amt" style="color:var(--green);">${money(inv.paid, cur)}</div></div>
        ${mag > 0 ? `<div class="inv"><div class="inv__main"><div class="inv__ref">Frais de magasinage</div></div><div class="inv__amt" style="color:#c2410c;">${money(mag, cur)}</div></div>` : ''}
        <div class="inv"><div class="inv__main"><div class="inv__ref">Reste à payer</div></div><div class="inv__amt" style="color:${reste > 0 ? 'var(--amt-red)' : 'var(--green)'};">${money(reste, cur)}</div></div>
      </div>

      <button class="btn btn--primary" data-pdf="${inv.ref}">📄 Télécharger le PDF</button>
      <p class="placeholder" style="padding:6px;">Le PDF inclut un QR de vérification du statut réel.</p>
    `;
  },

  tracking() {
    if (!invoicesLoaded) {
      return `<div class="card"><div class="placeholder"><span class="ph-ic">⏳</span>Chargement de vos colis…</div></div>`;
    }
    const list = PARCELS
      .filter(p => trackFilter < 0 || p.stage === trackFilter)
      .map(p => `
        <div class="track-item">
          <div class="track-head">
            <div>
              <div class="track-ref">${p.label}</div>
              <div class="track-desc">${p.ref} · ${p.desc}</div>
            </div>
            <div class="track-date">${p.date ? fdate(p.date) : ''}</div>
          </div>
          ${stepper(p.stage)}
        </div>`).join('');

    const empty = PARCELS.length === 0
      ? `<div class="card"><div class="placeholder"><span class="ph-ic">📦</span>Aucun colis rattaché à votre numéro pour le moment.</div></div>`
      : `<div class="card"><div class="placeholder"><span class="ph-ic">🔍</span>Aucun colis à cette étape.</div></div>`;
    const filterNote = trackFilter >= 0
      ? `<button class="btn btn--ghost" data-track="-1">↺ Voir tous les colis</button>` : '';

    return `
      ${pipeSummary(false)}
      ${filterNote}
      ${list || empty}
    `;
  },

  profile() {
    const ph = (auth.currentUser && auth.currentUser.phoneNumber) || localStorage.getItem(LS.phone) || '—';
    const need = 10;
    const sent = (LOYALTY.sentAsSender || 0) % need; // progression dans le cycle courant
    const pct = Math.min(100, Math.round(sent / need * 100));
    return `
      <div class="card">
        <div class="section-title">Informations</div>
        <div class="inv"><div class="inv__main"><div class="inv__sub">Téléphone</div><div class="inv__ref">${ph}</div></div></div>
        <div class="inv"><div class="inv__main"><div class="inv__sub">Nom</div><div class="inv__ref">Client AMT</div></div></div>
      </div>

      <div class="card">
        <div class="section-title">Points de fidélité 🎁</div>
        <p class="muted" style="margin:0 0 10px;font-size:13px;">À ${need} factures envoyées (en tant qu'expéditeur), 1 carton moyen vous est offert en fret.</p>
        <div style="height:12px;background:#eef2f7;border-radius:8px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:var(--amt-gold);"></div>
        </div>
        <div style="text-align:right;font-weight:700;color:var(--amt-blue);margin-top:6px;font-size:13px;">${sent} / ${need} factures</div>
      </div>

      <div class="card">
        <div class="section-title">Préférences</div>
        <div class="inv"><div class="inv__main"><div class="inv__ref">Langue</div></div><div class="inv__amt" style="font-weight:600;color:var(--muted);">Français</div></div>
        <div class="inv"><div class="inv__main"><div class="inv__ref">À propos</div></div><div class="inv__amt" style="font-weight:600;color:var(--muted);">AMT Trans'it</div></div>
      </div>

      <button class="btn btn--ghost" id="btnLogout">Se déconnecter</button>
    `;
  }
};

// Verrouillage (le bouton "btnLogout" verrouille l'app ; la session Firebase
// est conservée -> retour par PIN sans renvoyer de SMS).
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'btnLogout') {
    appEl.hidden = true; authEl.hidden = false;
    if (localStorage.getItem(LS.registered) === '1' && auth.currentUser) {
      const ph = localStorage.getItem(LS.phone) || (auth.currentUser.phoneNumber || '');
      $('#pinWelcome').textContent = ph ? `Bon retour 👋  (${ph})` : 'Bon retour 👋';
      showStep('pin');
    } else { showStep('phone'); }
  }
});

// ======================= PWA : service worker =======================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors-ligne non bloquant */ });
  });
}

// Démarrage : géré par onAuthStateChanged (selon la session Firebase + le PIN).
