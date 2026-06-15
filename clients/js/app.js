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
let requestFormSlot = 'Matin (10H-12H)'; // créneau souhaité par le client
let requestDraft = {};  // brouillon des champs (conservé quand on change type/créneau)
let depositCatalog = null;     // [{id,desc,price,dim}] contenants à déposer (chargé à la demande)
let depositCatalogLoaded = false;
let depositCatalogAgency = ''; // agence détectée par getDepositCatalog (diagnostic)
let depositAttached = '';      // rattachement agence:rôle (diagnostic)
let depositQty = {};           // id article -> quantité choisie (dépôt)
let calMonth = null;    // 1er du mois affiché par le calendrier
let calAvail = {};      // { 'YYYY-MM-DD': placesRestantes (-1 = jour off) }
let calSelected = '';   // date choisie 'YYYY-MM-DD'
let calCapacity = 80;
// --- Profil client ---
let clientProfile = { prenom: '', nom: '', photoUrl: '', lang: 'fr' };
let clientAbout = null;        // infos société agence de départ (À propos)
let profileLoaded = false;
let profilePhotoDraft = null;  // photo en attente d'enregistrement (dataURL)
// --- Devis (simulateur) ---
let quoteRoutes = null;        // [{id,name,flag,model,tarifs}] chargé une fois
let quoteRoute = '';           // route choisie
let quoteMode = 'maritime';    // 'maritime' | 'aerien'
let quoteAerienType = 'normal';// 'normal' | 'express' (aérien chine)
let quoteItems = [{ desc:'', qty:1, pu:'', vol:'', poids:'', lng:'', lrg:'', haut:'', mode:'poids', parfum:false }];
let quoteResult = null;        // dernier résultat de computeQuote
// --- Chat ---
let chatLoaded = false;
let chatConversations = [];    // [{agency,name,role,unread}]
let chatMessages = [];         // [{id,agency,text,sender,senderName,createdAt}]
let chatAgency = null;         // agence (conversation) ouverte
// Le service Dépôt/Récupération ne concerne QUE les expéditeurs. On déduit le
// rôle des factures (rôle exp/both) + repli sur l'indicatif France (+33 = départ).
let isExpediteur = true;       // par défaut on n'masque rien tant qu'on ne sait pas
let clientSelfName = '';       // nom de l'expéditeur (préremplissage du formulaire)
let clientSelfAddress = '';    // adresse de l'expéditeur (préremplissage)
let clientAgencies = [];       // [{agency,name,role}] agences rattachées au numéro

// Notifications réelles : Phase 3.
let NOTIFS = [];
let notifsLoaded = false;
function unreadCount() { return NOTIFS.filter(n => !n.read).length; }
function updateNotifBadge() {
  const b = $('#notifBadge'); if (!b) return;
  const n = unreadCount();
  b.textContent = n; b.hidden = (n === 0);
}
const TAUX = 656; // EUR -> FCFA
// Format selon la devise de la facture : 'EUR' (Paris) ou 'XOF'/FCFA (sinon).
const money = (v, currency = 'XOF') => {
  const c = currency === 'EUR' ? 'EUR' : 'XOF';
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c, maximumFractionDigits: c === 'XOF' ? 0 : 2 }).format(v || 0).replace(/[  ]/g, ' ');
  } catch (e) { return Math.round(v || 0) + (c === 'EUR' ? ' €' : ' FCFA'); }
};
// Convertit en FCFA pour additionner des factures de devises différentes.
const toFcfa = (v, currency) => (currency === 'EUR' ? (v || 0) * TAUX : (v || 0));
// Raccourcis d'affichage par devise (utilisés par le simulateur de devis).
const eur = (v) => money(v, 'EUR');
const fcfa = (v) => money(v, 'XOF');
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

// Exemple de numéro (placeholder) adapté à l'indicatif choisi — numéros fictifs.
const PHONE_SAMPLES = { '+33': '6 12 34 56 78', '+225': '07 12 34 56 78' };
(function initDialSample() {
  const sel = document.getElementById('dialCode');
  const inp = document.getElementById('phoneInput');
  if (!sel || !inp) return;
  const apply = () => { inp.placeholder = PHONE_SAMPLES[sel.value] || '6 12 34 56 78'; };
  sel.addEventListener('change', apply);
  apply();
})();
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
$('#btnPin').addEventListener('click', async () => {
  const p = ($('#pinInput').value || '').replace(/[^0-9]/g, '');
  if (pinHash(p) !== localStorage.getItem(LS.pin)) { authError('Code PIN incorrect.'); return; }
  // La session Firebase peut encore être en cours de restauration : on l'attend
  // (jusqu'à 5 s) avant de conclure qu'elle est perdue (sinon SMS à tort).
  if (!auth.currentUser) {
    await new Promise((resolve) => {
      let done = false;
      const end = () => { if (!done) { done = true; resolve(); } };
      const unsub = onAuthStateChanged(auth, (u) => { if (u) { unsub(); end(); } });
      setTimeout(() => { unsub(); end(); }, 5000);
    });
  }
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
  // On montre l'écran PIN dès qu'un PIN a été enregistré (reg='1' + pin), MÊME si
  // la session n'est pas encore restaurée. La validation du PIN (btnVerifyPin)
  // bascule proprement vers le SMS si la session est réellement absente (ligne ~197).
  if (localStorage.getItem(LS.registered) === '1' && localStorage.getItem(LS.pin)) {
    const ph = localStorage.getItem(LS.phone) || (user && user.phoneNumber) || '';
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
  loadProfile();
}

// Charge la fiche profil (nom/prénom/photo/langue) + infos « À propos ».
async function loadProfile() {
  try {
    const u = auth.currentUser;
    if (!u) return;
    try { await u.getIdToken(true); } catch (_) {}
    const res = await httpsCallable(functions, 'getMyProfile')();
    const d = (res && res.data) || {};
    clientProfile = Object.assign({ prenom: '', nom: '', photoUrl: '', lang: 'fr' }, d.profile || {});
    clientAbout = d.about || null;
    profileLoaded = true;
    // Nom complet pour préremplissages + avatar de l'en-tête.
    const full = `${clientProfile.prenom} ${clientProfile.nom}`.trim();
    if (full) { clientSelfName = full; try { localStorage.setItem(LS.name, full); } catch (_) {} }
    applyHeaderAvatar();
    if (currentView === 'profile') renderView('profile');
  } catch (e) { console.warn('getMyProfile:', e && e.code, e && e.message); profileLoaded = true; }
}

// Met l'avatar de l'en-tête : photo si dispo, sinon initiales.
function applyHeaderAvatar() {
  const av = $('#avatarInit');
  if (!av) return;
  if (clientProfile.photoUrl) {
    av.innerHTML = `<img src="${clientProfile.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    const full = `${clientProfile.prenom} ${clientProfile.nom}`.trim() || clientSelfName || '';
    av.textContent = full ? full.slice(0, 2).toUpperCase() : '👤';
  }
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
    clientAgencies = data.agencies || []; // [{agency,name,role}] rattachées au numéro
    if (clientSelfName) {
      try { localStorage.setItem(LS.name, clientSelfName); } catch (_) {}
      const av = $('#avatarInit'); if (av) av.textContent = clientSelfName.slice(0, 2).toUpperCase();
    }
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
  requestForm: 'Nouvelle demande', 'profile-edit': 'Mes informations', 'profile-pin': 'Changer mon code PIN', 'profile-about': 'À propos'
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
  // Hook post-rendu : le formulaire de demande monte son calendrier + l'adresse.
  if (view === 'requestForm') initRequestForm();
}

$$('.tab').forEach(t => t.addEventListener('click', () => {
  const v = t.dataset.view;
  // À chaque ouverture de l'onglet Chat, on recharge (nouveaux messages) et on
  // repart de la liste des conversations s'il y en a plusieurs.
  if (v === 'chat') { chatLoaded = false; chatAgency = null; }
  renderView(v);
}));
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
  const rtype = e.target.closest('[data-reqtype]');
  if (rtype) { keepFormDraft(); requestFormType = rtype.dataset.reqtype; renderView('requestForm'); return; }
  const rslot = e.target.closest('[data-reqslot]');
  if (rslot) { keepFormDraft(); requestFormSlot = rslot.dataset.reqslot; renderView('requestForm'); return; }
  const iplus = e.target.closest('[data-itemplus]');
  if (iplus) { keepFormDraft(); const id = iplus.dataset.itemplus; depositQty[id] = (depositQty[id] || 0) + 1; renderView('requestForm'); return; }
  const iminus = e.target.closest('[data-itemminus]');
  if (iminus) { keepFormDraft(); const id = iminus.dataset.itemminus; depositQty[id] = Math.max(0, (depositQty[id] || 0) - 1); renderView('requestForm'); return; }
  const cnav = e.target.closest('[data-calnav]');
  if (cnav) { calNav(parseInt(cnav.dataset.calnav, 10)); return; }
  const cpick = e.target.closest('[data-calpick]');
  if (cpick) { calPick(cpick.dataset.calpick); return; }
  // --- Devis ---
  const qmode = e.target.closest('[data-qmode]');
  if (qmode) { keepQuoteDraft(); quoteMode = qmode.dataset.qmode; quoteResult = null; renderView('quotes'); return; }
  const qaer = e.target.closest('[data-qaer]');
  if (qaer) { keepQuoteDraft(); quoteAerienType = qaer.dataset.qaer; renderView('quotes'); return; }
  const qimode = e.target.closest('[data-qimode]');
  if (qimode) { keepQuoteDraft(); const [i, m] = qimode.dataset.qimode.split('|'); if (quoteItems[i]) quoteItems[i].mode = m; renderView('quotes'); return; }
  const qadd = e.target.closest('[data-qadd]');
  if (qadd) { keepQuoteDraft(); quoteItems.push({ desc:'', qty:1, pu:'', vol:'', poids:'', lng:'', lrg:'', haut:'', mode:'poids', parfum:false }); renderView('quotes'); return; }
  const qdel = e.target.closest('[data-qdel]');
  if (qdel) { keepQuoteDraft(); quoteItems.splice(parseInt(qdel.dataset.qdel, 10), 1); renderView('quotes'); return; }
  const qcalc = e.target.closest('[data-qcalc]');
  if (qcalc) { computeQuoteNow(); return; }
  const rsub = e.target.closest('[data-reqsubmit]');
  if (rsub) { submitRequest(); return; }
  const ra = e.target.closest('[data-reqaccept]');
  if (ra) { respondRequest(ra.dataset.reqaccept, 'accept'); return; }
  const rr = e.target.closest('[data-reqrefuse]');
  if (rr) { respondRequest(rr.dataset.reqrefuse, 'refuse'); return; }
  const rcancel = e.target.closest('[data-reqcancel]');
  if (rcancel) { cancelRequest(rcancel.dataset.reqcancel); return; }
  // --- Chat ---
  const copen = e.target.closest('[data-chatopen]');
  if (copen) { openChatAgency(copen.dataset.chatopen); return; }
  const cback = e.target.closest('[data-chatback]');
  if (cback) { chatAgency = null; renderView('chat'); return; }
  const csend = e.target.closest('[data-chatsend]');
  if (csend) { sendChatMessage(); return; }
  const cphoto = e.target.closest('[data-chatphoto]');
  if (cphoto) { pickChatPhoto(); return; }
  const imgv = e.target.closest('[data-imgview]');
  if (imgv) { showImageViewer(imgv.dataset.imgview); return; }
});

// Changement de la route de départ (select) dans le simulateur de devis.
document.addEventListener('change', (e) => {
  const qr = e.target.closest('[data-qroute]');
  if (qr) { keepQuoteDraft(); quoteRoute = qr.value; quoteResult = null; renderView('quotes'); return; }
  // Un champ d'article (produit/qté/poids/dims) a changé : on garde le brouillon
  // pour ne pas perdre les saisies au prochain rendu.
  const qi = e.target.closest('[data-qi]');
  if (qi) { keepQuoteDraft(); }
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
  requestFormSlot = 'Matin (10H-12H)';
  requestDraft = {}; // nouveau formulaire : brouillon vierge
  depositQty = {};   // sélection d'articles vierge
  calSelected = '';
  calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  calAvail = {};
  if (requestFormType === 'depot') loadDepositCatalog();
  renderView('requestForm');
}

// Catalogue des contenants à déposer (produits stockés) via la fonction Cloud.
async function loadDepositCatalog() {
  if (depositCatalogLoaded) return;
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    const res = await httpsCallable(functions, 'getDepositCatalog')({});
    depositCatalog = ((res && res.data && res.data.items) || []);
    depositCatalogAgency = ((res && res.data && res.data.agency) || '');
    depositAttached = (((res && res.data && res.data.attached) || []).join(', ')) || '(aucun)';
  } catch (e) {
    console.warn('getDepositCatalog:', e && e.code, e && e.message);
    depositCatalog = [];
  }
  depositCatalogLoaded = true;
  if (currentView === 'requestForm') renderView('requestForm');
}

// Monté après le rendu du formulaire : calendrier des dispos + saisie adresse.
function initRequestForm() {
  if (!calMonth) calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  // Champ accès -> affiche/masque le code (sans perdre les autres champs).
  const acc = document.getElementById('reqAcces');
  if (acc) acc.addEventListener('change', () => {
    const need = acc.value === 'Interphone' || acc.value === 'Code';
    const w = document.getElementById('reqCodeWrap');
    if (w) w.style.display = need ? '' : 'none';
    requestDraft.acces = acc.value;
  });
  // Saisie intelligente d'adresse (API gouv) — chargée à la demande.
  import('../../depart/js/views/autocomplete.js').then(({ Autocomplete }) => {
    try { Autocomplete.initAddress('reqAddress', 'reqAddressSugg'); } catch (_) {}
  }).catch(() => {});
  loadAvailability();
}

// Charge les places disponibles du mois affiché via la fonction Cloud.
async function loadAvailability() {
  renderCalendar(); // affiche d'abord la grille (état chargement implicite)
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    const res = await httpsCallable(functions, 'getRdvAvailability')({
      year: calMonth.getFullYear(), month: calMonth.getMonth()
    });
    const d = (res && res.data) || {};
    calAvail = d.days || {};
    calCapacity = d.capacity || 80;
  } catch (e) {
    console.warn('getRdvAvailability:', e && e.code, e && e.message);
    calAvail = {};
  }
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonth');
  if (!grid || !calMonth) return;
  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  if (label) label.textContent = calMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().slice(0, 10);
  let firstDow = new Date(year, month, 1).getDay(); firstDow = firstDow === 0 ? 6 : firstDow - 1; // Lun en tête
  const nbDays = new Date(year, month + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div class="cal-day cal-day--empty"></div>';
  for (let day = 1; day <= nbDays; day++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dispo = calAvail[ds];          // -1 = off ; undefined = pas encore chargé
    const isPast = ds < todayStr;
    const isOff = dispo === -1;
    const isFull = typeof dispo === 'number' && dispo === 0;
    const cls = ['cal-day'];
    let attr = '';
    if (isPast || isOff || isFull) { cls.push(isPast ? 'cal-day--past' : 'cal-day--off'); }
    else { cls.push('cal-day--ok'); attr = `data-calpick="${ds}"`; }
    if (ds === calSelected && !isPast && !isOff && !isFull) cls.push('cal-day--sel');
    const meta = isOff ? '✕' : (typeof dispo === 'number' ? dispo : '…');
    html += `<div class="${cls.join(' ')}" ${attr}><div class="cal-day__n">${day}</div><div class="cal-day__p">${meta}</div></div>`;
  }
  grid.innerHTML = html;
  const foot = document.getElementById('calFoot');
  if (foot) {
    if (!calSelected) foot.innerHTML = '<span>Sélectionnez une date verte (chiffre = places restantes)</span>';
    else {
      const dispo = calAvail[calSelected];
      foot.innerHTML = `<span>📅 <b>${new Date(calSelected).toLocaleDateString('fr-FR')}</b></span><span>Places restantes : <b>${typeof dispo === 'number' ? dispo : '—'}</b></span>`;
    }
  }
}

function calNav(delta) {
  keepFormDraft();
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
  loadAvailability();
}
function calPick(ds) {
  calSelected = ds;
  renderCalendar();
}

// Mémorise les champs saisis avant un re-render (changement de type/créneau).
function keepFormDraft() {
  const g = (id, k) => (document.getElementById(id) ? document.getElementById(id).value : requestDraft[k]);
  requestDraft = {
    fullName: g('reqName', 'fullName'),
    commune: g('reqCommune', 'commune'),
    address: g('reqAddress', 'address'),
    etage: g('reqEtage', 'etage'),
    contactTel: g('reqTel', 'contactTel'),
    acces: g('reqAcces', 'acces'),
    codeAcces: g('reqCode', 'codeAcces'),
    description: g('reqDesc', 'description'),
  };
}

async function submitRequest() {
  const err = (m) => { const e = $('#reqError'); if (e) { e.textContent = m; e.hidden = false; } };
  const payload = {
    type: requestFormType,
    fullName: ($('#reqName')?.value || '').trim(),
    commune: ($('#reqCommune')?.value || '').trim(),
    address: ($('#reqAddress')?.value || '').trim(),
    date: calSelected,
    time: requestFormSlot,
    etage: ($('#reqEtage')?.value || '').trim(),
    acces: ($('#reqAcces')?.value || '').trim(),
    codeAcces: ($('#reqCode')?.value || '').trim(),
    contactTel: ($('#reqTel')?.value || '').trim(),
    description: ($('#reqDesc')?.value || '').trim(),
  };
  if (requestFormType === 'depot' && Array.isArray(depositCatalog)) {
    payload.items = depositCatalog
      .map((it) => ({ id: it.id, desc: it.desc, price: Number(it.price) || 0, qty: depositQty[it.id] || 0 }))
      .filter((it) => it.qty > 0);
  }
  if (!calSelected) { err('Choisissez une date disponible sur le calendrier.'); return; }
  if (!payload.fullName) { err('Indiquez votre nom.'); return; }
  if (!payload.contactTel) { err('Indiquez un téléphone de contact.'); return; }
  if (!payload.address) { err("Indiquez l'adresse."); return; }
  // Mémorise le nom de l'expéditeur pour préremplir les prochaines demandes.
  if (payload.fullName) { try { localStorage.setItem(LS.name, payload.fullName); clientSelfName = payload.fullName; } catch (_) {} }
  const btn = $('[data-reqsubmit]'); if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    await httpsCallable(functions, 'createClientRequest')(payload);
    requestDraft = {};               // brouillon consommé
    depositQty = {};                 // sélection d'articles consommée
    requestsLoaded = false;          // forcer le rechargement de la liste
    requestsSubtab = payload.type;   // afficher l'onglet correspondant
    renderView('requests');
  } catch (e) {
    console.warn('createClientRequest:', e && e.code, e && e.message);
    const msg = (e && e.code === 'unauthenticated') ? 'Session expirée, reconnectez-vous.'
      : (e && e.code === 'already-exists') ? (e.message || "Vous avez déjà une demande de ce type en cours.")
      : "Envoi impossible. Réessayez.";
    err(msg);
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

// --- Chat client ---
async function loadChat() {
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    const res = await httpsCallable(functions, 'getMyChat')();
    const d = (res && res.data) || {};
    chatConversations = d.conversations || [];
    chatMessages = d.messages || [];
  } catch (e) {
    console.warn('getMyChat:', e && e.code, e && e.message);
    chatConversations = []; chatMessages = [];
  }
  chatLoaded = true;
  if (currentView === 'chat') { renderView('chat'); scrollChatBottom(); }
}

function scrollChatBottom() {
  const el = document.getElementById('chatScroll');
  if (el) el.scrollTop = el.scrollHeight;
}

function openChatAgency(ag) {
  chatAgency = ag;
  renderView('chat');
  scrollChatBottom();
  // Marque lus les messages staff de cette agence (serveur + local).
  const had = chatMessages.some(m => m.agency === ag && m.sender === 'staff' && !m.readByClient);
  chatMessages.forEach(m => { if (m.agency === ag && m.sender === 'staff') m.readByClient = true; });
  const c = chatConversations.find(x => x.agency === ag); if (c) c.unread = 0;
  if (had) { httpsCallable(functions, 'markChatRead')({ agency: ag }).catch(() => {}); }
}

// Visionneuse plein écran d'une photo du chat (toucher l'image l'ouvre, toucher l'écran la ferme).
function showImageViewer(url) {
  if (!url) return;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:96%;max-height:92%;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.5);';
  ov.appendChild(img);
  ov.addEventListener('click', () => ov.remove());
  document.body.appendChild(ov);
}

async function sendChatMessage(imageUrl) {
  const ta = document.getElementById('chatText');
  const text = (ta?.value || '').trim();
  if ((!text && !imageUrl) || !chatAgency) return;
  // Affichage optimiste.
  const now = new Date().toISOString();
  chatMessages.push({ id: 'tmp_' + now, agency: chatAgency, text, imageUrl: imageUrl || '', sender: 'client', senderName: 'Vous', createdAt: now, readByClient: true });
  if (ta) ta.value = '';
  renderView('chat'); scrollChatBottom();
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    await httpsCallable(functions, 'sendClientMessage')({ text, imageUrl: imageUrl || '', agency: chatAgency, fromName: clientSelfName || '' });
    chatLoaded = false; await loadChat(); // recharge l'état réel
  } catch (e) {
    console.warn('sendClientMessage:', e && e.code, e && e.message);
    alert(e && e.code === 'invalid-argument' ? "Photo trop lourde, réessayez." : "Envoi impossible pour le moment.");
  }
}

// Compresse une image (JPEG max 800px, qualité 0.6) -> dataURL. Même réglage
// que le chat staff, pour rester sous la limite Firestore de 1 Mo.
function compressChatImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * (MAX / w)); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * (MAX / h)); h = MAX; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Compresse une photo de PROFIL : recadrage carré centré, max 256px, JPEG q0.8.
// Avatar léger (~quelques dizaines de Ko), bien sous la limite serveur (600 Ko).
function compressProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 256;
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Ouvre le sélecteur de photo puis envoie l'image compressée.
function pickChatPhoto() {
  const input = document.getElementById('chatImgInput');
  if (!input) return;
  input.onchange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressChatImage(file);
      await sendChatMessage(dataUrl);
    } catch (e) { alert("Image illisible."); }
  };
  input.click();
}

// --- Devis (simulateur) ---
async function loadQuoteConfig() {
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    const res = await httpsCallable(functions, 'getQuoteConfig')();
    quoteRoutes = (res && res.data && res.data.routes) || [];
  } catch (e) {
    console.warn('getQuoteConfig:', e && e.code, e && e.message);
    quoteRoutes = [];
  }
  if (currentView === 'quotes') renderView('quotes');
}

// Sauvegarde les valeurs des champs articles avant un re-render.
function keepQuoteDraft() {
  document.querySelectorAll('[data-qi]').forEach(el => {
    const i = parseInt(el.dataset.qi, 10); const f = el.dataset.qf;
    if (!quoteItems[i]) return;
    quoteItems[i][f] = (el.type === 'checkbox') ? el.checked : el.value;
  });
}

async function computeQuoteNow() {
  keepQuoteDraft();
  const btn = document.querySelector('[data-qcalc]');
  if (btn) { btn.disabled = true; btn.textContent = 'Calcul…'; }
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    const res = await httpsCallable(functions, 'computeQuote')({
      route: quoteRoute, mode: quoteMode, aerienType: quoteAerienType, items: quoteItems
    });
    quoteResult = res && res.data;
  } catch (e) {
    console.warn('computeQuote:', e && e.code, e && e.message);
    alert("Calcul impossible pour le moment.");
  }
  renderView('quotes');
}

// Annulation par le client de SA demande (tant qu'aucun RDV n'est fixé).
async function cancelRequest(id) {
  const ok = confirm("Annuler cette demande ?");
  if (!ok) return;
  try {
    const u = auth.currentUser;
    if (u) { try { await u.getIdToken(true); } catch (_) {} }
    await httpsCallable(functions, 'cancelClientRequest')({ id });
    requestsLoaded = false;
    renderView('requests');
  } catch (e) {
    console.warn('cancelClientRequest:', e && e.code, e && e.message);
    alert(e && e.code === 'failed-precondition' ? "Le rendez-vous est déjà fixé. Contactez l'agence." : "Annulation impossible pour le moment.");
  }
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
    const { loadJsPdf } = await import('../../commun/services/pdf-common.js');
    const { renderOfficialInvoice } = await import('../../commun/services/invoice-pdf-render.js');
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
        annulee:    { l: 'Annulée',    c: '#64748b', bg: '#f1f5f9' },
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
          ${['en_attente','modifiee','confirmee'].includes(r.status) ? `<div style="margin-top:10px;text-align:right;"><button class="btn btn--ghost" style="font-size:12px;padding:6px 12px;" data-reqcancel="${r.id}">🚫 Annuler ma demande</button></div>` : ''}
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

  // Formulaire de nouvelle demande (dépôt ou récup) avec calendrier de places.
  requestForm() {
    const isRecup = requestFormType === 'recup';
    const initials = (clientSelfName || '').trim().slice(0, 2).toUpperCase() || '👤';
    const myPhone = (auth.currentUser && auth.currentUser.phoneNumber) || localStorage.getItem(LS.phone) || '';
    const opt = (k, ic, lbl) => `<button type="button" class="rf-type__opt${requestFormType === k ? ' active' : ''}" data-reqtype="${k}">${ic} ${lbl}</button>`;
    const slot = (v, lbl) => `<button type="button" class="rf-slot${requestFormSlot === v ? ' active' : ''}" data-reqslot="${v}">${lbl}</button>`;
    const accOpt = (v, lbl) => `<option value="${v}"${requestDraft.acces === v ? ' selected' : ''}>${lbl}</option>`;
    const adrLabel = isRecup ? 'Adresse de livraison / récupération' : "Adresse d'enlèvement (départ)";
    const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');
    const vName = esc(requestDraft.fullName ?? clientSelfName);
    const vCommune = esc(requestDraft.commune ?? '');
    const vAddress = esc(requestDraft.address ?? clientSelfAddress);
    const vEtage = esc(requestDraft.etage ?? '');
    const vTel = esc(requestDraft.contactTel ?? myPhone);
    const vCode = esc(requestDraft.codeAcces ?? '');
    const vDesc = String(requestDraft.description ?? '').replace(/</g, '&lt;');
    const needCode = (requestDraft.acces === 'Interphone' || requestDraft.acces === 'Code');
    const fmtEuro = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' €';
    let pickerHtml = '';
    if (!isRecup) {
      if (!depositCatalogLoaded) {
        pickerHtml = `<div class="placeholder" style="padding:6px;">⏳ Chargement des contenants…</div>`;
      } else if (!depositCatalog || !depositCatalog.length) {
        pickerHtml = `<div class="inv__sub">Aucun contenant proposé pour le moment. Précisez-le dans le commentaire ci-dessous si besoin.</div>`;
      } else {
        let total = 0;
        const rows = depositCatalog.map((it) => {
          const q = depositQty[it.id] || 0;
          total += q * (Number(it.price) || 0);
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #eef2f7;">
              <div style="min-width:0;">
                <div style="font-weight:700;color:#1A3553;">${esc(it.desc)}</div>
                <div class="inv__sub">${esc(it.dim || '')}${it.dim ? ' · ' : ''}${fmtEuro(it.price)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;flex:none;">
                <button type="button" class="btn btn--ghost" style="width:36px;height:36px;padding:0;border-radius:8px;font-size:20px;line-height:1;" data-itemminus="${it.id}">−</button>
                <span style="min-width:22px;text-align:center;font-weight:800;">${q}</span>
                <button type="button" class="btn btn--primary" style="width:36px;height:36px;padding:0;border-radius:8px;font-size:20px;line-height:1;" data-itemplus="${it.id}">+</button>
              </div>
            </div>`;
        }).join('');
        pickerHtml = `${rows}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-weight:800;color:#1A3553;font-size:16px;">
            <span>Total contenants</span><span>${fmtEuro(total)}</span>
          </div>`;
      }
    }
    return `
      <button class="btn btn--ghost" data-go="requests" style="text-align:left;margin:0 0 6px;">← Retour</button>

      <div class="rf-card">
        <div class="rf-card__body">
          <div class="rf-field rf-field--full" style="margin-bottom:12px;">
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border:1.5px solid ${isRecup ? '#FDC615' : '#1A3553'};background:${isRecup ? '#fff7e6' : '#eef4fb'};border-radius:12px;font-weight:800;font-size:16px;color:${isRecup ? '#92600a' : '#1A3553'};">${isRecup ? '🔄 Récupération' : '📦 Dépôt'}</div>
          </div>
          <div class="rf-id">
            <div class="rf-id__av">${initials}</div>
            <div><div class="rf-id__name">${clientSelfName || 'Expéditeur'}</div><div class="rf-id__sub">📞 ${myPhone}</div></div>
          </div>
        </div>
      </div>

      <div class="rf-card">
        <div class="rf-card__head"><span class="rf-ic">📅</span> Choisissez une date</div>
        <div class="rf-card__body">
          <div class="cal-head">
            <button class="cal-nav" type="button" data-calnav="-1">‹</button>
            <div class="cal-month" id="calMonth">…</div>
            <button class="cal-nav" type="button" data-calnav="1">›</button>
          </div>
          <div class="cal-dow"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div>
          <div class="cal-grid" id="calGrid"><div style="grid-column:1/-1;text-align:center;padding:18px;color:var(--muted);">Chargement…</div></div>
          <div class="cal-foot" id="calFoot"><span>Sélectionnez une date verte</span></div>
        </div>
      </div>

      ${isRecup ? '' : `<div class="rf-card">
        <div class="rf-card__head"><span class="rf-ic">📦</span> Contenants à déposer <span style="font-weight:400;color:#94a3b8;font-size:13px;">(optionnel)</span></div>
        <div class="rf-card__body">${pickerHtml}</div>
      </div>`}

      <div class="rf-card">
        <div class="rf-card__head"><span class="rf-ic">📋</span> Détails</div>
        <div class="rf-card__body">
          <div class="rf-grid">
            <div class="rf-field rf-field--full">
              <span class="rf-label">Nom complet *</span>
              <input id="reqName" class="rf-input" type="text" placeholder="Votre nom" value="${vName}">
            </div>
            <div class="rf-field">
              <span class="rf-label">Étage / Bâtiment</span>
              <input id="reqEtage" class="rf-input" type="text" placeholder="Ex : 3e étage, Porte 12" value="${vEtage}">
            </div>
            <div class="rf-field">
              <span class="rf-label">Téléphone *</span>
              <input id="reqTel" class="rf-input" type="tel" placeholder="Contact sur place" value="${vTel}">
            </div>
            <div class="rf-field rf-field--full">
              <span class="rf-label">Créneau souhaité</span>
              <div class="rf-slots">${slot('Matin (10H-12H)', 'Matin (10H-12H)')}${slot('Après-midi (12H-18H)', 'Après-midi (12H-18H)')}</div>
            </div>
            <div class="rf-field">
              <span class="rf-label">Commune / Ville</span>
              <input id="reqCommune" class="rf-input" type="text" placeholder="Ex : Cocody, Paris…" value="${vCommune}">
            </div>
            <div class="rf-field">
              <span class="rf-label">Accès au bâtiment</span>
              <select id="reqAcces" class="rf-select" data-reqacces>
                <option value="">Sélectionner…</option>
                ${accOpt('Interphone', 'Interphone')}${accOpt('Code', 'Code / Digicode')}${accOpt('Aucun', 'Aucun / Accès libre')}
              </select>
            </div>
            <div class="rf-field rf-field--full">
              <span class="rf-label">${adrLabel} *</span>
              <div style="position:relative;">
                <input id="reqAddress" class="rf-input" type="text" placeholder="Quartier, rue, point de repère" autocomplete="off" value="${vAddress}">
                <ul id="reqAddressSugg" style="display:none;"></ul>
              </div>
            </div>
            <div class="rf-field rf-field--full" id="reqCodeWrap" style="${needCode ? '' : 'display:none;'}">
              <span class="rf-label">Code / Nom à l'interphone</span>
              <input id="reqCode" class="rf-input" type="text" placeholder="Ex : B1234 ou DUPONT" value="${vCode}">
            </div>
            <div class="rf-field rf-field--full">
              <span class="rf-label">Commentaire</span>
              <textarea id="reqDesc" class="rf-input" rows="3" placeholder="Ex : 2 cartons, 1 valise…">${vDesc}</textarea>
            </div>
          </div>
          <div id="reqError" class="auth__error" hidden style="margin:12px 0 0;"></div>
          <button class="btn btn--primary" style="width:100%;margin-top:14px;" data-reqsubmit="1">Envoyer la demande</button>
        </div>
      </div>
    `;
  },

  quotes() {
    if (quoteRoutes === null) { loadQuoteConfig(); return `<div class="card"><div class="placeholder"><span class="ph-ic">⏳</span>Chargement du simulateur…</div></div>`; }
    if (!quoteRoutes.length) return `<div class="card"><div class="placeholder"><span class="ph-ic">🧾</span>Tarification indisponible pour le moment.</div></div>`;
    if (!quoteRoute) quoteRoute = quoteRoutes[0].id;
    const route = quoteRoutes.find(r => r.id === quoteRoute) || quoteRoutes[0];
    const model = route.model; // 'paris' | 'chine'
    // Le détail des champs dépend de la combinaison route(model) + mode.
    const isChine = model === 'chine';
    const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');

    const routeOpt = (r) => `<option value="${r.id}"${r.id === quoteRoute ? ' selected' : ''}>${r.flag || ''} ${r.name}</option>`;
    const modeBtn = (k, lbl) => `<button type="button" class="rf-type__opt${quoteMode === k ? ' active' : ''}" data-qmode="${k}">${lbl}</button>`;

    // Catalogue de produits de la route + mode (prix/CBM déjà connus).
    const catalog = (quoteMode === 'aerien' ? route.productsAerien : route.productsMaritime) || [];
    const isAerien = quoteMode === 'aerien';

    // En-tête tarif (transparence) selon contexte.
    let tarifNote = '';
    if (!isAerien && isChine) tarifNote = `Maritime : ${route.tarifs.cbmChine.toLocaleString('fr-FR')} FCFA / m³`;
    else if (!isAerien) tarifNote = `Maritime : prix catalogue par article (€)`;
    else if (isChine) tarifNote = `Aérien : ${route.tarifs.kgAerienNormal.toLocaleString('fr-FR')} FCFA/kg (normal) · ${route.tarifs.kgAerienExpress.toLocaleString('fr-FR')} FCFA/kg (express)`;
    else tarifNote = `Aérien : ${route.tarifs.kgStdEur} €/kg · ${route.tarifs.kgParfumEur} €/kg (parfum/alcool)`;

    if (!isAerien && catalog.length === 0) {
      tarifNote += ` — aucun produit au catalogue de cette route pour ce mode.`;
    }

    // Lignes : on CHOISIT un produit du catalogue (prix/CBM connus). Le client
    // saisit la quantité ; en aérien, il saisit aussi poids + dimensions.
    const prodOptions = (sel) => `<option value="">— Choisir un produit —</option>` +
      catalog.map(p => {
        const tag = isAerien ? '' : (isChine ? (p.dim ? ` (${p.dim} m³)` : '') : (p.price ? ` (${p.price} €)` : ''));
        return `<option value="${esc(p.desc)}"${p.desc === sel ? ' selected' : ''}>${esc(p.desc)}${tag}</option>`;
      }).join('');

    const itemsHtml = quoteItems.map((it, i) => {
      // En maritime, le produit doit venir du catalogue (prix/CBM). En aérien,
      // le produit est optionnel (le tarif dépend du poids, pas du produit).
      const prodField = `<div class="rf-field rf-field--full"><span class="rf-label">Produit${isAerien ? ' (optionnel)' : ''}</span>
        <select class="rf-select" data-qi="${i}" data-qf="desc">${prodOptions(it.desc)}</select></div>`;
      let fields = `<div class="rf-field"><span class="rf-label">Quantité</span><input class="rf-input" type="number" min="1" data-qi="${i}" data-qf="qty" value="${esc(it.qty)}"></div>`;
      if (isAerien) {
        fields += `
          <div class="rf-field"><span class="rf-label">Poids réel (kg)</span><input class="rf-input" type="number" step="0.1" min="0" data-qi="${i}" data-qf="poids" value="${esc(it.poids)}"></div>
          <div class="rf-field"><span class="rf-label">Long. (cm)</span><input class="rf-input" type="number" min="0" data-qi="${i}" data-qf="lng" value="${esc(it.lng)}"></div>
          <div class="rf-field"><span class="rf-label">Larg. (cm)</span><input class="rf-input" type="number" min="0" data-qi="${i}" data-qf="lrg" value="${esc(it.lrg)}"></div>
          <div class="rf-field"><span class="rf-label">Haut. (cm)</span><input class="rf-input" type="number" min="0" data-qi="${i}" data-qf="haut" value="${esc(it.haut)}"></div>`;
      }
      const parfum = (isAerien && !isChine)
        ? `<label class="rf-field rf-field--full" style="flex-direction:row;align-items:center;gap:8px;"><input type="checkbox" data-qi="${i}" data-qf="parfum" ${it.parfum ? 'checked' : ''}> <span class="rf-label" style="margin:0;">Parfum / alcool (tarif majoré)</span></label>` : '';
      const delBtn = quoteItems.length > 1 ? `<button type="button" class="btn btn--ghost" style="font-size:12px;padding:4px 10px;" data-qdel="${i}">🗑 Retirer</button>` : '';
      return `<div class="rf-card" style="margin-bottom:10px;"><div class="rf-card__body">
        ${prodField}
        <div class="rf-grid">${fields}</div>
        ${parfum}
        <div style="text-align:right;margin-top:6px;">${delBtn}</div>
      </div></div>`;
    }).join('');

    // Résultat.
    let resultHtml = '';
    if (quoteResult) {
      const r = quoteResult;
      const main = r.currency === 'EUR'
        ? `${eur(r.totalEur)}  <span style="color:var(--muted);font-weight:600;font-size:13px;">(${fcfa(r.totalCfa)})</span>`
        : `${fcfa(r.totalCfa)}`;
      resultHtml = `
        <div class="rf-card">
          <div class="rf-card__head"><span class="rf-ic">💰</span> Estimation</div>
          <div class="rf-card__body">
            <div style="font-family:'Comfortaa',sans-serif;font-weight:700;font-size:24px;color:var(--amt-blue);">${main}</div>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
              ${r.lines.map(l => `<div class="inv__sub">• ${l.desc || 'Article'} — ${l.detail} = <b>${l.currency==='EUR'?eur(l.amount):fcfa(l.amount)}</b></div>`).join('')}
            </div>
            <p class="placeholder" style="padding:8px;">Estimation indicative, hors frais éventuels (magasinage, options). Tarifs identiques à la facturation.</p>
          </div>
        </div>`;
    }

    return `
      <div class="rf-card">
        <div class="rf-card__head"><span class="rf-ic">🧾</span> Simulateur de devis</div>
        <div class="rf-card__body">
          <div class="rf-grid">
            <div class="rf-field"><span class="rf-label">Pays / route de départ</span>
              <select class="rf-select" data-qroute>${quoteRoutes.map(routeOpt).join('')}</select>
            </div>
            <div class="rf-field"><span class="rf-label">Mode d'expédition</span>
              <div class="rf-type">${modeBtn('maritime', '🚢 Maritime')}${modeBtn('aerien', '✈️ Aérien')}</div>
            </div>
          </div>
          ${(quoteMode === 'aerien' && isChine) ? `<div class="rf-field rf-field--full" style="margin-top:10px;"><span class="rf-label">Type aérien</span><div class="rf-slots"><button type="button" class="rf-slot${quoteAerienType!=='express'?' active':''}" data-qaer="normal">Normal</button><button type="button" class="rf-slot${quoteAerienType==='express'?' active':''}" data-qaer="express">Express</button></div></div>` : ''}
          <p class="placeholder" style="padding:8px;">${tarifNote}</p>
        </div>
      </div>

      <div class="section-title">Articles</div>
      ${itemsHtml}
      <button type="button" class="btn btn--ghost" data-qadd="1" style="margin-bottom:12px;">+ Ajouter un article</button>
      <button type="button" class="btn btn--primary" data-qcalc="1">Calculer l'estimation</button>
      ${resultHtml}
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
    if (!chatLoaded) { loadChat(); return `<div class="card"><div class="placeholder"><span class="ph-ic">⏳</span>Chargement de votre messagerie…</div></div>`; }
    if (!chatConversations.length) {
      return `<div class="card"><div class="placeholder"><span class="ph-ic">💬</span>Aucune agence rattachée à votre numéro pour le moment. Vos conversations apparaîtront ici dès votre première facture.</div></div>`;
    }
    // Conversation à ouvrir : choisie, sinon l'unique, sinon liste.
    if (!chatAgency && chatConversations.length === 1) chatAgency = chatConversations[0].agency;

    // Vue LISTE des conversations (plusieurs agences, aucune ouverte).
    if (!chatAgency) {
      const items = chatConversations.map(c => {
        const roleLbl = c.role === 'exp' ? 'vos envois' : c.role === 'dest' ? 'vos réceptions' : 'expéditions & réceptions';
        return `<div class="inv" style="cursor:pointer;" data-chatopen="${c.agency}">
          <div class="inv__main"><div class="inv__ref">${c.name}</div><div class="inv__sub">${roleLbl}</div></div>
          <div class="inv__amt">${c.unread ? `<span class="badge" style="position:static;">${c.unread}</span>` : ''} ›</div>
        </div>`;
      }).join('');
      return `<div class="section-title">Vos conversations</div><div class="card">${items}</div>
        <p class="placeholder" style="padding:8px;">Choisissez l'agence à qui écrire.</p>`;
    }

    // Vue CONVERSATION ouverte — messagerie « façon WhatsApp ».
    const conv = chatConversations.find(c => c.agency === chatAgency) || { name: chatAgency };
    const msgs = chatMessages.filter(m => m.agency === chatAgency);
    const esc = (s) => String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const same = (a, b) => a.toDateString() === b.toDateString();
    const dayLabel = (d) => { try { const dt = new Date(d), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1); if (same(dt, t)) return "Aujourd'hui"; if (same(dt, y)) return 'Hier'; return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };
    const timeLabel = (d) => { try { return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    let lastDay = '';
    let lastSender = null;
    const bubbles = msgs.length ? msgs.map(m => {
      const dl = dayLabel(m.createdAt);
      let sep = '';
      if (dl && dl !== lastDay) { lastDay = dl; sep = `<div class="wa-day"><span>${dl}</span></div>`; lastSender = null; }
      const mine = m.sender === 'client';
      const tight = (m.sender === lastSender); // même expéditeur consécutif -> espace réduit
      lastSender = m.sender;
      const img = m.imageUrl ? `<img class="wa-img" src="${esc(m.imageUrl)}" data-imgview="${esc(m.imageUrl)}" alt="photo">` : '';
      const nameLine = mine ? '' : `<div class="wa-name">${esc(m.senderName || conv.name)}</div>`;
      return `${sep}<div class="wa-row${mine ? ' me' : ''}${tight ? ' tight' : ''}"><div class="wa-bubble${mine ? ' me' : ' them'}">${nameLine}${img}${m.text ? `<span class="wa-text">${esc(m.text)}</span>` : ''}<span class="wa-time">${timeLabel(m.createdAt)}</span></div></div>`;
    }).join('') : `<div class="wa-empty">Démarrez la conversation avec <b>${esc(conv.name)}</b> 👋</div>`;

    const initials = ((conv.name || '?').trim().slice(0, 2) || '?').toUpperCase();
    const backBtn = chatConversations.length > 1 ? `<button class="wa-back" data-chatback="1" title="Retour">←</button>` : '';

    return `
      <style>
        .wa-head{display:flex;align-items:center;gap:11px;background:var(--amt-blue,#1A3553);color:#fff;border-radius:14px 14px 0 0;padding:11px 14px;margin-bottom:0;}
        .wa-back{background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;flex:none;}
        .wa-avatar{width:40px;height:40px;border-radius:50%;background:var(--amt-gold,#FDC615);color:var(--amt-blue,#1A3553);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex:none;}
        .wa-headname{font-weight:800;font-size:15px;line-height:1.1;}
        .wa-headsub{font-size:11px;opacity:.8;}
        .wa-scroll{background:#EEF3F8 url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iMzYwIiB2aWV3Qm94PSIwIDAgMzYwIDM2MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iMzYwIiBmaWxsPSIjRUVGM0Y4Ii8+CjxnIHN0cm9rZT0iIzFBMzU1MyIgc3Ryb2tlLXdpZHRoPSIxLjciIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgb3BhY2l0eT0iMC4xMyI+CjxwYXRoIGQ9Ik0zMjguNCwxMjguNCBRMzkwLjMsMjQuMiAzNDYuMSw0My43IiBzdHJva2UtZGFzaGFycmF5PSIxLjUgNiIvPjxwYXRoIGQ9Ik0xNjUuNyw2MS41IFExNTMuNiw0Ny4yIDcxLjAsMTE3LjEiIHN0cm9rZS1kYXNoYXJyYXk9IjEuNSA2Ii8+PHBhdGggZD0iTTEwMy4yLDMwLjcgUTUxLjEsLTQ5LjMgMjQuNywtMTkuOSIgc3Ryb2tlLWRhc2hhcnJheT0iMS41IDYiLz48cGF0aCBkPSJNODkuMiwxMzAuNyBRMTI3LjAsMTAxLjggOTguOSwxNTMuMiIgc3Ryb2tlLWRhc2hhcnJheT0iMS41IDYiLz48cGF0aCBkPSJNMjY5LjYsMjA4LjkgUTI4My4yLDE2Ny4zIDM0Ny44LDIyNy43IiBzdHJva2UtZGFzaGFycmF5PSIxLjUgNiIvPjxwYXRoIGQ9Ik0xMjguOCwxNjYuNiBRMTgxLjEsOTIuNCAxMTcuNiwxMzEuNCIgc3Ryb2tlLWRhc2hhcnJheT0iMS41IDYiLz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzMwLjAsLTIwLjApIHJvdGF0ZSgyMi44KSBzY2FsZSgwLjk5NykiPjxjaXJjbGUgcj0iOC41Ii8+PHBhdGggZD0iTTAsLTUuNiBMMi44LDAgTDAsNS42IEwtMi44LDAgWiIvPjxjaXJjbGUgcj0iMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMzAuMCwzNDAuMCkgcm90YXRlKDIyLjgpIHNjYWxlKDAuOTk3KSI+PGNpcmNsZSByPSI4LjUiLz48cGF0aCBkPSJNMCwtNS42IEwyLjgsMCBMMCw1LjYgTC0yLjgsMCBaIi8+PGNpcmNsZSByPSIxIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE3LjgsLTE3LjIpIHJvdGF0ZSgtMjAuOCkgc2NhbGUoMC45MTApIj48cmVjdCB4PSItOS41IiB5PSItMyIgd2lkdGg9IjE5IiBoZWlnaHQ9IjMiLz48cGF0aCBkPSJNLTkuNSw2IEg5LjUgTS03LDMgVjYgTTAsMyBWNiBNNywzIFY2IE0tOS41LDMgVjAgTTkuNSwzIFYwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE3LjgsMzQyLjgpIHJvdGF0ZSgtMjAuOCkgc2NhbGUoMC45MTApIj48cmVjdCB4PSItOS41IiB5PSItMyIgd2lkdGg9IjE5IiBoZWlnaHQ9IjMiLz48cGF0aCBkPSJNLTkuNSw2IEg5LjUgTS03LDMgVjYgTTAsMyBWNiBNNywzIFY2IE0tOS41LDMgVjAgTTkuNSwzIFYwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM3Ny44LC0xNy4yKSByb3RhdGUoLTIwLjgpIHNjYWxlKDAuOTEwKSI+PHJlY3QgeD0iLTkuNSIgeT0iLTMiIHdpZHRoPSIxOSIgaGVpZ2h0PSIzIi8+PHBhdGggZD0iTS05LjUsNiBIOS41IE0tNywzIFY2IE0wLDMgVjYgTTcsMyBWNiBNLTkuNSwzIFYwIE05LjUsMyBWMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNzcuOCwzNDIuOCkgcm90YXRlKC0yMC44KSBzY2FsZSgwLjkxMCkiPjxyZWN0IHg9Ii05LjUiIHk9Ii0zIiB3aWR0aD0iMTkiIGhlaWdodD0iMyIvPjxwYXRoIGQ9Ik0tOS41LDYgSDkuNSBNLTcsMyBWNiBNMCwzIFY2IE03LDMgVjYgTS05LjUsMyBWMCBNOS41LDMgVjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNTYuMCwtMjQuMikgcm90YXRlKC0xNC42KSBzY2FsZSgwLjkzMykiPjxyZWN0IHg9Ii05LjUiIHk9Ii01IiB3aWR0aD0iMTkiIGhlaWdodD0iMTAiLz48cGF0aCBkPSJNLTUuNSwtNSBWNSBNLTEuNSwtNSBWNSBNMi41LC01IFY1IE02LjUsLTUgVjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNTYuMCwzMzUuOCkgcm90YXRlKC0xNC42KSBzY2FsZSgwLjkzMykiPjxyZWN0IHg9Ii05LjUiIHk9Ii01IiB3aWR0aD0iMTkiIGhlaWdodD0iMTAiLz48cGF0aCBkPSJNLTUuNSwtNSBWNSBNLTEuNSwtNSBWNSBNMi41LC01IFY1IE02LjUsLTUgVjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTAxLjYsLTEyLjcpIHJvdGF0ZSgtMC4xKSBzY2FsZSgwLjkwNSkiPjxjaXJjbGUgcj0iOC41Ii8+PGVsbGlwc2Ugcng9IjMuNiIgcnk9IjguNSIvPjxwYXRoIGQ9Ik0tOC41LDAgSDguNSBNLTcuNSwtNC4yIEg3LjUgTS03LjUsNC4yIEg3LjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTAxLjYsMzQ3LjMpIHJvdGF0ZSgtMC4xKSBzY2FsZSgwLjkwNSkiPjxjaXJjbGUgcj0iOC41Ii8+PGVsbGlwc2Ugcng9IjMuNiIgcnk9IjguNSIvPjxwYXRoIGQ9Ik0tOC41LDAgSDguNSBNLTcuNSwtNC4yIEg3LjUgTS03LjUsNC4yIEg3LjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTQwLjEsLTE1LjgpIHJvdGF0ZSgyMC4zKSBzY2FsZSgwLjc4NikiPjxjaXJjbGUgY3k9Ii03IiByPSIyLjIiLz48cGF0aCBkPSJNMCwtNC44IFY3LjYgTS00LC0zLjUgSDQgTS04LDIuNSBRLTgsOCAwLDggUTgsOCA4LDIuNSBNLTgsMi41IGwtMS44LC0xLjMgTS04LDIuNSBsMS44LC0xLjMgTTgsMi41IGwtMS44LC0xLjMgTTgsMi41IGwxLjgsLTEuMyIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNDAuMSwzNDQuMikgcm90YXRlKDIwLjMpIHNjYWxlKDAuNzg2KSI+PGNpcmNsZSBjeT0iLTciIHI9IjIuMiIvPjxwYXRoIGQ9Ik0wLC00LjggVjcuNiBNLTQsLTMuNSBINCBNLTgsMi41IFEtOCw4IDAsOCBROCw4IDgsMi41IE0tOCwyLjUgbC0xLjgsLTEuMyBNLTgsMi41IGwxLjgsLTEuMyBNOCwyLjUgbC0xLjgsLTEuMyBNOCwyLjUgbDEuOCwtMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE3My4yLDMzMS4zKSByb3RhdGUoLTIwLjkpIHNjYWxlKDAuODQ3KSI+PHBhdGggZD0iTTAsLTkgQy00LjgsLTkgLTguNSwtNS4zIC04LjUsLTAuNSBDLTguNSw2IDAsMTAgMCwxMCBDMCwxMCA4LjUsNiA4LjUsLTAuNSBDOC41LC01LjMgNC44LC05IDAsLTkgWiIvPjxjaXJjbGUgY3k9Ii0wLjUiIHI9IjMuMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMzEuMCwtMjAuNikgcm90YXRlKDUuOSkgc2NhbGUoMC44NzYpIj48Y2lyY2xlIHI9IjguNSIvPjxlbGxpcHNlIHJ4PSIzLjYiIHJ5PSI4LjUiLz48cGF0aCBkPSJNLTguNSwwIEg4LjUgTS03LjUsLTQuMiBINy41IE0tNy41LDQuMiBINy41Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzMS4wLDMzOS40KSByb3RhdGUoNS45KSBzY2FsZSgwLjg3NikiPjxjaXJjbGUgcj0iOC41Ii8+PGVsbGlwc2Ugcng9IjMuNiIgcnk9IjguNSIvPjxwYXRoIGQ9Ik0tOC41LDAgSDguNSBNLTcuNSwtNC4yIEg3LjUgTS03LjUsNC4yIEg3LjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjUwLjEsLTE1LjEpIHJvdGF0ZSgtMTAuMSkgc2NhbGUoMC45MzApIj48cGF0aCBkPSJNLTksMiBIOSBMNi41LDcuNSBILTYuNSBaIi8+PHJlY3QgeD0iLTUiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHJlY3QgeD0iMC42IiB5PSItNCIgd2lkdGg9IjQiIGhlaWdodD0iNiIvPjxwYXRoIGQ9Ik0yLC03IEg0LjQgVi00Ii8+PHBhdGggZD0iTS05LDkuNiBRLTYuNSwxMS4xIC00LDkuNiBUMSw5LjYgVDYsOS42IFQ5LDkuNiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNTAuMSwzNDQuOSkgcm90YXRlKC0xMC4xKSBzY2FsZSgwLjkzMCkiPjxwYXRoIGQ9Ik0tOSwyIEg5IEw2LjUsNy41IEgtNi41IFoiLz48cmVjdCB4PSItNSIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cmVjdCB4PSIwLjYiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHBhdGggZD0iTTIsLTcgSDQuNCBWLTQiLz48cGF0aCBkPSJNLTksOS42IFEtNi41LDExLjEgLTQsOS42IFQxLDkuNiBUNiw5LjYgVDksOS42Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMwMS43LDMyOS44KSByb3RhdGUoMTEuOCkgc2NhbGUoMC43NzYpIj48cmVjdCB4PSItOS41IiB5PSItNSIgd2lkdGg9IjE5IiBoZWlnaHQ9IjEwIi8+PHBhdGggZD0iTS01LjUsLTUgVjUgTS0xLjUsLTUgVjUgTTIuNSwtNSBWNSBNNi41LC01IFY1Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMy45LC0xMC44KSByb3RhdGUoLTE5LjIpIHNjYWxlKDAuNzYyKSI+PHBhdGggZD0iTS04LjUsMCBBOC41LDguNSAwIDAsMSA4LjUsMCBaIE0wLDAgVjcgUTAsOS4yIDIuNCw5LjIgTS04LjUsMCBRLTYuNCwtMi40IC00LjI1LDAgVDAsMCBUNC4yNSwwIFQ4LjUsMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjMuOSwzNDkuMikgcm90YXRlKC0xOS4yKSBzY2FsZSgwLjc2MikiPjxwYXRoIGQ9Ik0tOC41LDAgQTguNSw4LjUgMCAwLDEgOC41LDAgWiBNMCwwIFY3IFEwLDkuMiAyLjQsOS4yIE0tOC41LDAgUS02LjQsLTIuNCAtNC4yNSwwIFQwLDAgVDQuMjUsMCBUOC41LDAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzM2LjEsLTEwLjgpIHJvdGF0ZSgtMTkuMikgc2NhbGUoMC43NjIpIj48cGF0aCBkPSJNLTguNSwwIEE4LjUsOC41IDAgMCwxIDguNSwwIFogTTAsMCBWNyBRMCw5LjIgMi40LDkuMiBNLTguNSwwIFEtNi40LC0yLjQgLTQuMjUsMCBUMCwwIFQ0LjI1LDAgVDguNSwwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMzNi4xLDM0OS4yKSByb3RhdGUoLTE5LjIpIHNjYWxlKDAuNzYyKSI+PHBhdGggZD0iTS04LjUsMCBBOC41LDguNSAwIDAsMSA4LjUsMCBaIE0wLDAgVjcgUTAsOS4yIDIuNCw5LjIgTS04LjUsMCBRLTYuNCwtMi40IC00LjI1LDAgVDAsMCBUNC4yNSwwIFQ4LjUsMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNy4yLC0yNS41KSByb3RhdGUoLTE0LjYpIHNjYWxlKDAuNzYzKSI+PHBhdGggZD0iTS04LjUsMCBBOC41LDguNSAwIDAsMSA4LjUsMCBaIE0wLDAgVjcgUTAsOS4yIDIuNCw5LjIgTS04LjUsMCBRLTYuNCwtMi40IC00LjI1LDAgVDAsMCBUNC4yNSwwIFQ4LjUsMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNy4yLDMzNC41KSByb3RhdGUoLTE0LjYpIHNjYWxlKDAuNzYzKSI+PHBhdGggZD0iTS04LjUsMCBBOC41LDguNSAwIDAsMSA4LjUsMCBaIE0wLDAgVjcgUTAsOS4yIDIuNCw5LjIgTS04LjUsMCBRLTYuNCwtMi40IC00LjI1LDAgVDAsMCBUNC4yNSwwIFQ4LjUsMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNzcuMiwtMjUuNSkgcm90YXRlKC0xNC42KSBzY2FsZSgwLjc2MykiPjxwYXRoIGQ9Ik0tOC41LDAgQTguNSw4LjUgMCAwLDEgOC41LDAgWiBNMCwwIFY3IFEwLDkuMiAyLjQsOS4yIE0tOC41LDAgUS02LjQsLTIuNCAtNC4yNSwwIFQwLDAgVDQuMjUsMCBUOC41LDAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzc3LjIsMzM0LjUpIHJvdGF0ZSgtMTQuNikgc2NhbGUoMC43NjMpIj48cGF0aCBkPSJNLTguNSwwIEE4LjUsOC41IDAgMCwxIDguNSwwIFogTTAsMCBWNyBRMCw5LjIgMi40LDkuMiBNLTguNSwwIFEtNi40LC0yLjQgLTQuMjUsMCBUMCwwIFQ0LjI1LDAgVDguNSwwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yLjQsMjcuNCkgcm90YXRlKC02LjEpIHNjYWxlKDAuOTYzKSI+PGNpcmNsZSByPSI4LjUiLz48cGF0aCBkPSJNMCwtNS42IEwyLjgsMCBMMCw1LjYgTC0yLjgsMCBaIi8+PGNpcmNsZSByPSIxIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yLjQsMzg3LjQpIHJvdGF0ZSgtNi4xKSBzY2FsZSgwLjk2MykiPjxjaXJjbGUgcj0iOC41Ii8+PHBhdGggZD0iTTAsLTUuNiBMMi44LDAgTDAsNS42IEwtMi44LDAgWiIvPjxjaXJjbGUgcj0iMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNTcuNiwyNy40KSByb3RhdGUoLTYuMSkgc2NhbGUoMC45NjMpIj48Y2lyY2xlIHI9IjguNSIvPjxwYXRoIGQ9Ik0wLC01LjYgTDIuOCwwIEwwLDUuNiBMLTIuOCwwIFoiLz48Y2lyY2xlIHI9IjEiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzU3LjYsMzg3LjQpIHJvdGF0ZSgtNi4xKSBzY2FsZSgwLjk2MykiPjxjaXJjbGUgcj0iOC41Ii8+PHBhdGggZD0iTTAsLTUuNiBMMi44LDAgTDAsNS42IEwtMi44LDAgWiIvPjxjaXJjbGUgcj0iMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNy4zLDE3LjEpIHJvdGF0ZSgtMi42KSBzY2FsZSgwLjc2MykiPjxwYXRoIGQ9Ik0wLC0xMCBDMS4yLC0xMCAxLjgsLTguNSAxLjgsLTYgTDEuOCwtMiBMOSwyIEw5LDQgTDEuOCwyLjYgTDEuOCw2IEw0LjIsOC4yIEw0LjIsOS40IEwwLDguMSBMLTQuMiw5LjQgTC00LjIsOC4yIEwtMS44LDYgTC0xLjgsMi42IEwtOSw0IEwtOSwyIEwtMS44LC0yIEwtMS44LC02IEMtMS44LC04LjUgLTEuMiwtMTAgMCwtMTAgWiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNy4zLDM3Ny4xKSByb3RhdGUoLTIuNikgc2NhbGUoMC43NjMpIj48cGF0aCBkPSJNMCwtMTAgQzEuMiwtMTAgMS44LC04LjUgMS44LC02IEwxLjgsLTIgTDksMiBMOSw0IEwxLjgsMi42IEwxLjgsNiBMNC4yLDguMiBMNC4yLDkuNCBMMCw4LjEgTC00LjIsOS40IEwtNC4yLDguMiBMLTEuOCw2IEwtMS44LDIuNiBMLTksNCBMLTksMiBMLTEuOCwtMiBMLTEuOCwtNiBDLTEuOCwtOC41IC0xLjIsLTEwIDAsLTEwIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNzEuOSwyMS4yKSByb3RhdGUoLTkuNykgc2NhbGUoMC45NjkpIj48Y2lyY2xlIGN5PSItNyIgcj0iMi4yIi8+PHBhdGggZD0iTTAsLTQuOCBWNy42IE0tNCwtMy41IEg0IE0tOCwyLjUgUS04LDggMCw4IFE4LDggOCwyLjUgTS04LDIuNSBsLTEuOCwtMS4zIE0tOCwyLjUgbDEuOCwtMS4zIE04LDIuNSBsLTEuOCwtMS4zIE04LDIuNSBsMS44LC0xLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNzEuOSwzODEuMikgcm90YXRlKC05LjcpIHNjYWxlKDAuOTY5KSI+PGNpcmNsZSBjeT0iLTciIHI9IjIuMiIvPjxwYXRoIGQ9Ik0wLC00LjggVjcuNiBNLTQsLTMuNSBINCBNLTgsMi41IFEtOCw4IDAsOCBROCw4IDgsMi41IE0tOCwyLjUgbC0xLjgsLTEuMyBNLTgsMi41IGwxLjgsLTEuMyBNOCwyLjUgbC0xLjgsLTEuMyBNOCwyLjUgbDEuOCwtMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEyNy45LDMxLjUpIHJvdGF0ZSgxMS45KSBzY2FsZSgwLjgwMCkiPjxwYXRoIGQ9Ik0wLC0xMCBDMS4yLC0xMCAxLjgsLTguNSAxLjgsLTYgTDEuOCwtMiBMOSwyIEw5LDQgTDEuOCwyLjYgTDEuOCw2IEw0LjIsOC4yIEw0LjIsOS40IEwwLDguMSBMLTQuMiw5LjQgTC00LjIsOC4yIEwtMS44LDYgTC0xLjgsMi42IEwtOSw0IEwtOSwyIEwtMS44LC0yIEwtMS44LC02IEMtMS44LC04LjUgLTEuMiwtMTAgMCwtMTAgWiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNTIuNCwyNC4zKSByb3RhdGUoLTEyLjMpIHNjYWxlKDAuODY2KSI+PHBhdGggZD0iTTAsLTkgQy00LjgsLTkgLTguNSwtNS4zIC04LjUsLTAuNSBDLTguNSw2IDAsMTAgMCwxMCBDMCwxMCA4LjUsNiA4LjUsLTAuNSBDOC41LC01LjMgNC44LC05IDAsLTkgWiIvPjxjaXJjbGUgY3k9Ii0wLjUiIHI9IjMuMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNTIuNCwzODQuMykgcm90YXRlKC0xMi4zKSBzY2FsZSgwLjg2NikiPjxwYXRoIGQ9Ik0wLC05IEMtNC44LC05IC04LjUsLTUuMyAtOC41LC0wLjUgQy04LjUsNiAwLDEwIDAsMTAgQzAsMTAgOC41LDYgOC41LC0wLjUgQzguNSwtNS4zIDQuOCwtOSAwLC05IFoiLz48Y2lyY2xlIGN5PSItMC41IiByPSIzLjEiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTkyLjQsMjQuNSkgcm90YXRlKC03LjMpIHNjYWxlKDAuOTIxKSI+PGNpcmNsZSByPSI4LjUiLz48ZWxsaXBzZSByeD0iMy42IiByeT0iOC41Ii8+PHBhdGggZD0iTS04LjUsMCBIOC41IE0tNy41LC00LjIgSDcuNSBNLTcuNSw0LjIgSDcuNSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxOTIuNCwzODQuNSkgcm90YXRlKC03LjMpIHNjYWxlKDAuOTIxKSI+PGNpcmNsZSByPSI4LjUiLz48ZWxsaXBzZSByeD0iMy42IiByeT0iOC41Ii8+PHBhdGggZD0iTS04LjUsMCBIOC41IE0tNy41LC00LjIgSDcuNSBNLTcuNSw0LjIgSDcuNSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMzYuMiwxNy4xKSByb3RhdGUoLTE5LjIpIHNjYWxlKDAuODI3KSI+PHBhdGggZD0iTTAsLTkgQy00LjgsLTkgLTguNSwtNS4zIC04LjUsLTAuNSBDLTguNSw2IDAsMTAgMCwxMCBDMCwxMCA4LjUsNiA4LjUsLTAuNSBDOC41LC01LjMgNC44LC05IDAsLTkgWiIvPjxjaXJjbGUgY3k9Ii0wLjUiIHI9IjMuMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMzYuMiwzNzcuMSkgcm90YXRlKC0xOS4yKSBzY2FsZSgwLjgyNykiPjxwYXRoIGQ9Ik0wLC05IEMtNC44LC05IC04LjUsLTUuMyAtOC41LC0wLjUgQy04LjUsNiAwLDEwIDAsMTAgQzAsMTAgOC41LDYgOC41LC0wLjUgQzguNSwtNS4zIDQuOCwtOSAwLC05IFoiLz48Y2lyY2xlIGN5PSItMC41IiByPSIzLjEiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjg1LjYsMTMuNikgcm90YXRlKDEzLjMpIHNjYWxlKDAuODI3KSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyODUuNiwzNzMuNikgcm90YXRlKDEzLjMpIHNjYWxlKDAuODI3KSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMTMuMSwyMi4xKSByb3RhdGUoMTUuMCkgc2NhbGUoMC45MjQpIj48cmVjdCB4PSItOSIgeT0iLTQiIHdpZHRoPSIxMC41IiBoZWlnaHQ9IjkiLz48cGF0aCBkPSJNMS41LC0wLjUgSDYuNiBMOS42LDIuNSBWNSBIMS41Ii8+PGNpcmNsZSBjeD0iLTUiIGN5PSI2LjYiIHI9IjIiLz48Y2lyY2xlIGN4PSI2IiBjeT0iNi42IiByPSIyIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMxMy4xLDM4Mi4xKSByb3RhdGUoMTUuMCkgc2NhbGUoMC45MjQpIj48cmVjdCB4PSItOSIgeT0iLTQiIHdpZHRoPSIxMC41IiBoZWlnaHQ9IjkiLz48cGF0aCBkPSJNMS41LC0wLjUgSDYuNiBMOS42LDIuNSBWNSBIMS41Ii8+PGNpcmNsZSBjeD0iLTUiIGN5PSI2LjYiIHI9IjIiLz48Y2lyY2xlIGN4PSI2IiBjeT0iNi42IiByPSIyIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDcuMSwzMC44KSByb3RhdGUoLTMuNCkgc2NhbGUoMC45MjEpIj48Y2lyY2xlIHI9IjguNSIvPjxwYXRoIGQ9Ik0wLC04LjUgVi02LjYgTTAsOC41IFY2LjYgTS04LjUsMCBILTYuNiBNOC41LDAgSDYuNiBNMCwwLjQgVi01IE0wLDAuNCBMNCwyLjQiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzY3LjEsMzAuOCkgcm90YXRlKC0zLjQpIHNjYWxlKDAuOTIxKSI+PGNpcmNsZSByPSI4LjUiLz48cGF0aCBkPSJNMCwtOC41IFYtNi42IE0wLDguNSBWNi42IE0tOC41LDAgSC02LjYgTTguNSwwIEg2LjYgTTAsMC40IFYtNSBNMCwwLjQgTDQsMi40Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQxLjcsMjMuOCkgcm90YXRlKDUuNikgc2NhbGUoMC44NjkpIj48cGF0aCBkPSJNMCwtMTAgQzEuMiwtMTAgMS44LC04LjUgMS44LC02IEwxLjgsLTIgTDksMiBMOSw0IEwxLjgsMi42IEwxLjgsNiBMNC4yLDguMiBMNC4yLDkuNCBMMCw4LjEgTC00LjIsOS40IEwtNC4yLDguMiBMLTEuOCw2IEwtMS44LDIuNiBMLTksNCBMLTksMiBMLTEuOCwtMiBMLTEuOCwtNiBDLTEuOCwtOC41IC0xLjIsLTEwIDAsLTEwIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDEuNywzODMuOCkgcm90YXRlKDUuNikgc2NhbGUoMC44NjkpIj48cGF0aCBkPSJNMCwtMTAgQzEuMiwtMTAgMS44LC04LjUgMS44LC02IEwxLjgsLTIgTDksMiBMOSw0IEwxLjgsMi42IEwxLjgsNiBMNC4yLDguMiBMNC4yLDkuNCBMMCw4LjEgTC00LjIsOS40IEwtNC4yLDguMiBMLTEuOCw2IEwtMS44LDIuNiBMLTksNCBMLTksMiBMLTEuOCwtMiBMLTEuOCwtNiBDLTEuOCwtOC41IC0xLjIsLTEwIDAsLTEwIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTI3LjIsNTguMykgcm90YXRlKDkuMikgc2NhbGUoMC45NDQpIj48Y2lyY2xlIGN5PSItNyIgcj0iMi4yIi8+PHBhdGggZD0iTTAsLTQuOCBWNy42IE0tNCwtMy41IEg0IE0tOCwyLjUgUS04LDggMCw4IFE4LDggOCwyLjUgTS04LDIuNSBsLTEuOCwtMS4zIE0tOCwyLjUgbDEuOCwtMS4zIE04LDIuNSBsLTEuOCwtMS4zIE04LDIuNSBsMS44LC0xLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzMyLjgsNTguMykgcm90YXRlKDkuMikgc2NhbGUoMC45NDQpIj48Y2lyY2xlIGN5PSItNyIgcj0iMi4yIi8+PHBhdGggZD0iTTAsLTQuOCBWNy42IE0tNCwtMy41IEg0IE0tOCwyLjUgUS04LDggMCw4IFE4LDggOCwyLjUgTS04LDIuNSBsLTEuOCwtMS4zIE0tOCwyLjUgbDEuOCwtMS4zIE04LDIuNSBsLTEuOCwtMS4zIE04LDIuNSBsMS44LC0xLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTAuOCw1NC41KSByb3RhdGUoNS4yKSBzY2FsZSgwLjk1MSkiPjxyZWN0IHg9Ii05IiB5PSItNCIgd2lkdGg9IjEwLjUiIGhlaWdodD0iOSIvPjxwYXRoIGQ9Ik0xLjUsLTAuNSBINi42IEw5LjYsMi41IFY1IEgxLjUiLz48Y2lyY2xlIGN4PSItNSIgY3k9IjYuNiIgcj0iMiIvPjxjaXJjbGUgY3g9IjYiIGN5PSI2LjYiIHI9IjIiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzcwLjgsNTQuNSkgcm90YXRlKDUuMikgc2NhbGUoMC45NTEpIj48cmVjdCB4PSItOSIgeT0iLTQiIHdpZHRoPSIxMC41IiBoZWlnaHQ9IjkiLz48cGF0aCBkPSJNMS41LC0wLjUgSDYuNiBMOS42LDIuNSBWNSBIMS41Ii8+PGNpcmNsZSBjeD0iLTUiIGN5PSI2LjYiIHI9IjIiLz48Y2lyY2xlIGN4PSI2IiBjeT0iNi42IiByPSIyIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDUyLjEsNjIuNCkgcm90YXRlKDE2LjkpIHNjYWxlKDAuODc5KSI+PHBhdGggZD0iTS00LDggVi04IEg4IE0tNCwtOCBMLTcsLTQgTS00LC00IEwyLC04IE04LC04IFYtNCBMNSwtMSBNNSwtMSBWMS4yIi8+PGNpcmNsZSBjeD0iLTQiIGN5PSI5LjQiIHI9IjEuMyIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5My41LDU4LjUpIHJvdGF0ZSg5LjMpIHNjYWxlKDAuODU0KSI+PGNpcmNsZSByPSI4LjUiLz48ZWxsaXBzZSByeD0iMy42IiByeT0iOC41Ii8+PHBhdGggZD0iTS04LjUsMCBIOC41IE0tNy41LC00LjIgSDcuNSBNLTcuNSw0LjIgSDcuNSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNDIuNyw1OS41KSByb3RhdGUoMTMuOCkgc2NhbGUoMC43ODQpIj48cGF0aCBkPSJNMCwtOSBDLTQuOCwtOSAtOC41LC01LjMgLTguNSwtMC41IEMtOC41LDYgMCwxMCAwLDEwIEMwLDEwIDguNSw2IDguNSwtMC41IEM4LjUsLTUuMyA0LjgsLTkgMCwtOSBaIi8+PGNpcmNsZSBjeT0iLTAuNSIgcj0iMy4xIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE4Ni41LDY1LjkpIHJvdGF0ZSg2LjUpIHNjYWxlKDAuNzU0KSI+PGNpcmNsZSBjeT0iLTciIHI9IjIuMiIvPjxwYXRoIGQ9Ik0wLC00LjggVjcuNiBNLTQsLTMuNSBINCBNLTgsMi41IFEtOCw4IDAsOCBROCw4IDgsMi41IE0tOCwyLjUgbC0xLjgsLTEuMyBNLTgsMi41IGwxLjgsLTEuMyBNOCwyLjUgbC0xLjgsLTEuMyBNOCwyLjUgbDEuOCwtMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIyOS43LDY0LjApIHJvdGF0ZSgtMC45KSBzY2FsZSgwLjk2MykiPjxjaXJjbGUgcj0iOC41Ii8+PHBhdGggZD0iTTAsLTUuNiBMMi44LDAgTDAsNS42IEwtMi44LDAgWiIvPjxjaXJjbGUgcj0iMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjMuMCw2Ni4wKSByb3RhdGUoMTMuNCkgc2NhbGUoMC44NjIpIj48cGF0aCBkPSJNLTQsOCBWLTggSDggTS00LC04IEwtNywtNCBNLTQsLTQgTDIsLTggTTgsLTggVi00IEw1LC0xIE01LC0xIFYxLjIiLz48Y2lyY2xlIGN4PSItNCIgY3k9IjkuNCIgcj0iMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI5Ni42LDQ5LjcpIHJvdGF0ZSgtMjAuNykgc2NhbGUoMC44ODQpIj48cGF0aCBkPSJNMCwtOSBWNiBNLTksLTUuNSBIOSBNLTMuNSw4IEgzLjUiLz48cGF0aCBkPSJNLTksLTUuNSBMLTExLjMsMCBILTYuNyBaIE05LC01LjUgTDYuNywwIEgxMS4zIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTE4LjMsNzEuOCkgcm90YXRlKDYuNSkgc2NhbGUoMC44MzEpIj48Y2lyY2xlIHI9IjguNSIvPjxwYXRoIGQ9Ik0wLC04LjUgVi02LjYgTTAsOC41IFY2LjYgTS04LjUsMCBILTYuNiBNOC41LDAgSDYuNiBNMCwwLjQgVi01IE0wLDAuNCBMNCwyLjQiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzQxLjcsNzEuOCkgcm90YXRlKDYuNSkgc2NhbGUoMC44MzEpIj48Y2lyY2xlIHI9IjguNSIvPjxwYXRoIGQ9Ik0wLC04LjUgVi02LjYgTTAsOC41IFY2LjYgTS04LjUsMCBILTYuNiBNOC41LDAgSDYuNiBNMCwwLjQgVi01IE0wLDAuNCBMNCwyLjQiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTkuOCw2My4zKSByb3RhdGUoOC4xKSBzY2FsZSgwLjk0MykiPjxyZWN0IHg9Ii05LjUiIHk9Ii01IiB3aWR0aD0iMTkiIGhlaWdodD0iMTAiLz48cGF0aCBkPSJNLTUuNSwtNSBWNSBNLTEuNSwtNSBWNSBNMi41LC01IFY1IE02LjUsLTUgVjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzc5LjgsNjMuMykgcm90YXRlKDguMSkgc2NhbGUoMC45NDMpIj48cmVjdCB4PSItOS41IiB5PSItNSIgd2lkdGg9IjE5IiBoZWlnaHQ9IjEwIi8+PHBhdGggZD0iTS01LjUsLTUgVjUgTS0xLjUsLTUgVjUgTTIuNSwtNSBWNSBNNi41LC01IFY1Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0zLjYsOTcuOSkgcm90YXRlKC05LjMpIHNjYWxlKDAuODMwKSI+PHBhdGggZD0iTTAsLTkgQy00LjgsLTkgLTguNSwtNS4zIC04LjUsLTAuNSBDLTguNSw2IDAsMTAgMCwxMCBDMCwxMCA4LjUsNiA4LjUsLTAuNSBDOC41LC01LjMgNC44LC05IDAsLTkgWiIvPjxjaXJjbGUgY3k9Ii0wLjUiIHI9IjMuMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNTYuNCw5Ny45KSByb3RhdGUoLTkuMykgc2NhbGUoMC44MzApIj48cGF0aCBkPSJNMCwtOSBDLTQuOCwtOSAtOC41LC01LjMgLTguNSwtMC41IEMtOC41LDYgMCwxMCAwLDEwIEMwLDEwIDguNSw2IDguNSwtMC41IEM4LjUsLTUuMyA0LjgsLTkgMCwtOSBaIi8+PGNpcmNsZSBjeT0iLTAuNSIgcj0iMy4xIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ3LjIsMTA4LjUpIHJvdGF0ZSgxOS4wKSBzY2FsZSgwLjk1MCkiPjxjaXJjbGUgcj0iOC41Ii8+PGVsbGlwc2Ugcng9IjMuNiIgcnk9IjguNSIvPjxwYXRoIGQ9Ik0tOC41LDAgSDguNSBNLTcuNSwtNC4yIEg3LjUgTS03LjUsNC4yIEg3LjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNzMuNywxMTEuOCkgcm90YXRlKDE5LjApIHNjYWxlKDAuODYzKSI+PHBhdGggZD0iTTAsLTEwIEMxLjIsLTEwIDEuOCwtOC41IDEuOCwtNiBMMS44LC0yIEw5LDIgTDksNCBMMS44LDIuNiBMMS44LDYgTDQuMiw4LjIgTDQuMiw5LjQgTDAsOC4xIEwtNC4yLDkuNCBMLTQuMiw4LjIgTC0xLjgsNiBMLTEuOCwyLjYgTC05LDQgTC05LDIgTC0xLjgsLTIgTC0xLjgsLTYgQy0xLjgsLTguNSAtMS4yLC0xMCAwLC0xMCBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDExOS4xLDEwMS4wKSByb3RhdGUoLTIwLjIpIHNjYWxlKDAuNzg0KSI+PHJlY3QgeD0iLTciIHk9Ii02IiB3aWR0aD0iMTQiIGhlaWdodD0iMTMiLz48cGF0aCBkPSJNLTcsLTEuNSBINyBNMCwtNiBWNyBNLTcsLTYgTDAsLTkuNSBMNywtNiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNTAuMiwxMDMuMikgcm90YXRlKC0xOS40KSBzY2FsZSgwLjg4NSkiPjxwYXRoIGQ9Ik0wLC0xMCBDMS4yLC0xMCAxLjgsLTguNSAxLjgsLTYgTDEuOCwtMiBMOSwyIEw5LDQgTDEuOCwyLjYgTDEuOCw2IEw0LjIsOC4yIEw0LjIsOS40IEwwLDguMSBMLTQuMiw5LjQgTC00LjIsOC4yIEwtMS44LDYgTC0xLjgsMi42IEwtOSw0IEwtOSwyIEwtMS44LC0yIEwtMS44LC02IEMtMS44LC04LjUgLTEuMiwtMTAgMCwtMTAgWiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxOTMuNywxMDcuNSkgcm90YXRlKDEwLjgpIHNjYWxlKDAuODUzKSI+PHBhdGggZD0iTS05LDIgSDkgTDYuNSw3LjUgSC02LjUgWiIvPjxyZWN0IHg9Ii01IiB5PSItNCIgd2lkdGg9IjQiIGhlaWdodD0iNiIvPjxyZWN0IHg9IjAuNiIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cGF0aCBkPSJNMiwtNyBINC40IFYtNCIvPjxwYXRoIGQ9Ik0tOSw5LjYgUS02LjUsMTEuMSAtNCw5LjYgVDEsOS42IFQ2LDkuNiBUOSw5LjYiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjMwLjQsMTAxLjQpIHJvdGF0ZSgxMC44KSBzY2FsZSgwLjkwMikiPjxwYXRoIGQ9Ik0wLC0xMCBDMS4yLC0xMCAxLjgsLTguNSAxLjgsLTYgTDEuOCwtMiBMOSwyIEw5LDQgTDEuOCwyLjYgTDEuOCw2IEw0LjIsOC4yIEw0LjIsOS40IEwwLDguMSBMLTQuMiw5LjQgTC00LjIsOC4yIEwtMS44LDYgTC0xLjgsMi42IEwtOSw0IEwtOSwyIEwtMS44LC0yIEwtMS44LC02IEMtMS44LC04LjUgLTEuMiwtMTAgMCwtMTAgWiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNzkuMywxMDEuNykgcm90YXRlKC0yMS40KSBzY2FsZSgwLjc5NSkiPjxwYXRoIGQ9Ik0wLC05IEMtNC44LC05IC04LjUsLTUuMyAtOC41LC0wLjUgQy04LjUsNiAwLDEwIDAsMTAgQzAsMTAgOC41LDYgOC41LC0wLjUgQzguNSwtNS4zIDQuOCwtOSAwLC05IFoiLz48Y2lyY2xlIGN5PSItMC41IiByPSIzLjEiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzMwLjgsMTExLjkpIHJvdGF0ZSgtMTIuMCkgc2NhbGUoMC45NzApIj48cGF0aCBkPSJNLTYuNSwtOSBIMyBMNi41LC01LjUgVjkgSC02LjUgWiBNMywtOSBWLTUuNSBINi41Ii8+PHBhdGggZD0iTS0zLjUsLTIgSDMuNSBNLTMuNSwxLjUgSDMuNSBNLTMuNSw1IEgxIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xMS45LDEwMi40KSByb3RhdGUoLTQuOCkgc2NhbGUoMC45OTYpIj48cmVjdCB4PSItOS41IiB5PSItMyIgd2lkdGg9IjE5IiBoZWlnaHQ9IjMiLz48cGF0aCBkPSJNLTkuNSw2IEg5LjUgTS03LDMgVjYgTTAsMyBWNiBNNywzIFY2IE0tOS41LDMgVjAgTTkuNSwzIFYwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM0OC4xLDEwMi40KSByb3RhdGUoLTQuOCkgc2NhbGUoMC45OTYpIj48cmVjdCB4PSItOS41IiB5PSItMyIgd2lkdGg9IjE5IiBoZWlnaHQ9IjMiLz48cGF0aCBkPSJNLTkuNSw2IEg5LjUgTS03LDMgVjYgTTAsMyBWNiBNNywzIFY2IE0tOS41LDMgVjAgTTkuNSwzIFYwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ2LjcsMTA1LjcpIHJvdGF0ZSgyMy4yKSBzY2FsZSgwLjc4NCkiPjxwYXRoIGQ9Ik0tNCw4IFYtOCBIOCBNLTQsLTggTC03LC00IE0tNCwtNCBMMiwtOCBNOCwtOCBWLTQgTDUsLTEgTTUsLTEgVjEuMiIvPjxjaXJjbGUgY3g9Ii00IiBjeT0iOS40IiByPSIxLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTE2LjMsMTQ5LjUpIHJvdGF0ZSgxLjMpIHNjYWxlKDAuOTg2KSI+PHJlY3QgeD0iLTciIHk9Ii02IiB3aWR0aD0iMTQiIGhlaWdodD0iMTMiLz48cGF0aCBkPSJNLTcsLTEuNSBINyBNMCwtNiBWNyBNLTcsLTYgTDAsLTkuNSBMNywtNiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNDMuNywxNDkuNSkgcm90YXRlKDEuMykgc2NhbGUoMC45ODYpIj48cmVjdCB4PSItNyIgeT0iLTYiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMyIvPjxwYXRoIGQ9Ik0tNywtMS41IEg3IE0wLC02IFY3IE0tNywtNiBMMCwtOS41IEw3LC02Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMxLjMsMTI5LjkpIHJvdGF0ZSgtMTQuNSkgc2NhbGUoMC45MTUpIj48cGF0aCBkPSJNMCwtOSBDLTQuOCwtOSAtOC41LC01LjMgLTguNSwtMC41IEMtOC41LDYgMCwxMCAwLDEwIEMwLDEwIDguNSw2IDguNSwtMC41IEM4LjUsLTUuMyA0LjgsLTkgMCwtOSBaIi8+PGNpcmNsZSBjeT0iLTAuNSIgcj0iMy4xIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDU1LjksMTMwLjEpIHJvdGF0ZSgtMjMuMSkgc2NhbGUoMC45NzQpIj48cmVjdCB4PSItOSIgeT0iLTQiIHdpZHRoPSIxMC41IiBoZWlnaHQ9IjkiLz48cGF0aCBkPSJNMS41LC0wLjUgSDYuNiBMOS42LDIuNSBWNSBIMS41Ii8+PGNpcmNsZSBjeD0iLTUiIGN5PSI2LjYiIHI9IjIiLz48Y2lyY2xlIGN4PSI2IiBjeT0iNi42IiByPSIyIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDkyLjksMTM0LjYpIHJvdGF0ZSgxMS4yKSBzY2FsZSgwLjgxMikiPjxwYXRoIGQ9Ik0wLC0xMCBDMS4yLC0xMCAxLjgsLTguNSAxLjgsLTYgTDEuOCwtMiBMOSwyIEw5LDQgTDEuOCwyLjYgTDEuOCw2IEw0LjIsOC4yIEw0LjIsOS40IEwwLDguMSBMLTQuMiw5LjQgTC00LjIsOC4yIEwtMS44LDYgTC0xLjgsMi42IEwtOSw0IEwtOSwyIEwtMS44LC0yIEwtMS44LC02IEMtMS44LC04LjUgLTEuMiwtMTAgMCwtMTAgWiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNDguOCwxNDguOCkgcm90YXRlKDIuMSkgc2NhbGUoMC44NjIpIj48Y2lyY2xlIHI9IjguNSIvPjxwYXRoIGQ9Ik0wLC04LjUgVi02LjYgTTAsOC41IFY2LjYgTS04LjUsMCBILTYuNiBNOC41LDAgSDYuNiBNMCwwLjQgVi01IE0wLDAuNCBMNCwyLjQiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTg1LjksMTQ4LjgpIHJvdGF0ZSgtMTUuMSkgc2NhbGUoMC44MzIpIj48cmVjdCB4PSItOS41IiB5PSItMyIgd2lkdGg9IjE5IiBoZWlnaHQ9IjMiLz48cGF0aCBkPSJNLTkuNSw2IEg5LjUgTS03LDMgVjYgTTAsMyBWNiBNNywzIFY2IE0tOS41LDMgVjAgTTkuNSwzIFYwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIxNC41LDEzMy41KSByb3RhdGUoLTcuMCkgc2NhbGUoMC45ODIpIj48cmVjdCB4PSItOSIgeT0iLTQiIHdpZHRoPSIxMC41IiBoZWlnaHQ9IjkiLz48cGF0aCBkPSJNMS41LC0wLjUgSDYuNiBMOS42LDIuNSBWNSBIMS41Ii8+PGNpcmNsZSBjeD0iLTUiIGN5PSI2LjYiIHI9IjIiLz48Y2lyY2xlIGN4PSI2IiBjeT0iNi42IiByPSIyIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI1Ny44LDEzNC41KSByb3RhdGUoLTUuMykgc2NhbGUoMC44NjQpIj48cmVjdCB4PSItOS41IiB5PSItNSIgd2lkdGg9IjE5IiBoZWlnaHQ9IjEwIi8+PHBhdGggZD0iTS01LjUsLTUgVjUgTS0xLjUsLTUgVjUgTTIuNSwtNSBWNSBNNi41LC01IFY1Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI5OC45LDE0Ni42KSByb3RhdGUoMC4xKSBzY2FsZSgwLjc2NykiPjxwYXRoIGQ9Ik0wLC05IFY2IE0tOSwtNS41IEg5IE0tMy41LDggSDMuNSIvPjxwYXRoIGQ9Ik0tOSwtNS41IEwtMTEuMywwIEgtNi43IFogTTksLTUuNSBMNi43LDAgSDExLjMgWiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTYuNywxNTIuMCkgcm90YXRlKC0xNi4zKSBzY2FsZSgwLjg2OCkiPjxwYXRoIGQ9Ik0tOC41LDAgQTguNSw4LjUgMCAwLDEgOC41LDAgWiBNMCwwIFY3IFEwLDkuMiAyLjQsOS4yIE0tOC41LDAgUS02LjQsLTIuNCAtNC4yNSwwIFQwLDAgVDQuMjUsMCBUOC41LDAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzQzLjMsMTUyLjApIHJvdGF0ZSgtMTYuMykgc2NhbGUoMC44NjgpIj48cGF0aCBkPSJNLTguNSwwIEE4LjUsOC41IDAgMCwxIDguNSwwIFogTTAsMCBWNyBRMCw5LjIgMi40LDkuMiBNLTguNSwwIFEtNi40LC0yLjQgLTQuMjUsMCBUMCwwIFQ0LjI1LDAgVDguNSwwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI4LjksMTQzLjkpIHJvdGF0ZSg5LjIpIHNjYWxlKDAuODkzKSI+PHJlY3QgeD0iLTkuNSIgeT0iLTMiIHdpZHRoPSIxOSIgaGVpZ2h0PSIzIi8+PHBhdGggZD0iTS05LjUsNiBIOS41IE0tNywzIFY2IE0wLDMgVjYgTTcsMyBWNiBNLTkuNSwzIFYwIE05LjUsMyBWMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMC41LDE3Ni4xKSByb3RhdGUoNi4wKSBzY2FsZSgwLjg0NykiPjxjaXJjbGUgcj0iOC41Ii8+PHBhdGggZD0iTTAsLTUuNiBMMi44LDAgTDAsNS42IEwtMi44LDAgWiIvPjxjaXJjbGUgcj0iMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNzAuNSwxNzYuMSkgcm90YXRlKDYuMCkgc2NhbGUoMC44NDcpIj48Y2lyY2xlIHI9IjguNSIvPjxwYXRoIGQ9Ik0wLC01LjYgTDIuOCwwIEwwLDUuNiBMLTIuOCwwIFoiLz48Y2lyY2xlIHI9IjEiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDEuMCwxODYuNSkgcm90YXRlKDE1LjMpIHNjYWxlKDAuODgwKSI+PGNpcmNsZSBjeT0iLTciIHI9IjIuMiIvPjxwYXRoIGQ9Ik0wLC00LjggVjcuNiBNLTQsLTMuNSBINCBNLTgsMi41IFEtOCw4IDAsOCBROCw4IDgsMi41IE0tOCwyLjUgbC0xLjgsLTEuMyBNLTgsMi41IGwxLjgsLTEuMyBNOCwyLjUgbC0xLjgsLTEuMyBNOCwyLjUgbDEuOCwtMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDc4LjksMTc5LjgpIHJvdGF0ZSgtMy4yKSBzY2FsZSgwLjkxNykiPjxyZWN0IHg9Ii05LjUiIHk9Ii01IiB3aWR0aD0iMTkiIGhlaWdodD0iMTAiLz48cGF0aCBkPSJNLTUuNSwtNSBWNSBNLTEuNSwtNSBWNSBNMi41LC01IFY1IE02LjUsLTUgVjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTE4LjksMTg4LjQpIHJvdGF0ZSg5LjgpIHNjYWxlKDAuODYyKSI+PHBhdGggZD0iTTAsLTkgVjYgTS05LC01LjUgSDkgTS0zLjUsOCBIMy41Ii8+PHBhdGggZD0iTS05LC01LjUgTC0xMS4zLDAgSC02LjcgWiBNOSwtNS41IEw2LjcsMCBIMTEuMyBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2Ny43LDE3MC41KSByb3RhdGUoLTkuMikgc2NhbGUoMC44NTIpIj48cGF0aCBkPSJNLTYuNSwtOSBIMyBMNi41LC01LjUgVjkgSC02LjUgWiBNMywtOSBWLTUuNSBINi41Ii8+PHBhdGggZD0iTS0zLjUsLTIgSDMuNSBNLTMuNSwxLjUgSDMuNSBNLTMuNSw1IEgxIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIwMS4xLDE5MC43KSByb3RhdGUoLTEzLjEpIHNjYWxlKDAuOTM3KSI+PHBhdGggZD0iTTAsLTkgVjYgTS05LC01LjUgSDkgTS0zLjUsOCBIMy41Ii8+PHBhdGggZD0iTS05LC01LjUgTC0xMS4zLDAgSC02LjcgWiBNOSwtNS41IEw2LjcsMCBIMTEuMyBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzNy4xLDE4Ny45KSByb3RhdGUoMjEuMikgc2NhbGUoMC44OTkpIj48cmVjdCB4PSItOSIgeT0iLTQiIHdpZHRoPSIxMC41IiBoZWlnaHQ9IjkiLz48cGF0aCBkPSJNMS41LC0wLjUgSDYuNiBMOS42LDIuNSBWNSBIMS41Ii8+PGNpcmNsZSBjeD0iLTUiIGN5PSI2LjYiIHI9IjIiLz48Y2lyY2xlIGN4PSI2IiBjeT0iNi42IiByPSIyIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI4NS4wLDE3MC44KSByb3RhdGUoLTIuMikgc2NhbGUoMC45MzgpIj48Y2lyY2xlIGN5PSItNyIgcj0iMi4yIi8+PHBhdGggZD0iTTAsLTQuOCBWNy42IE0tNCwtMy41IEg0IE0tOCwyLjUgUS04LDggMCw4IFE4LDggOCwyLjUgTS04LDIuNSBsLTEuOCwtMS4zIE0tOCwyLjUgbDEuOCwtMS4zIE04LDIuNSBsLTEuOCwtMS4zIE04LDIuNSBsMS44LC0xLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzI4LjAsMTcwLjQpIHJvdGF0ZSgtMTAuOCkgc2NhbGUoMC45NzIpIj48cmVjdCB4PSItNyIgeT0iLTYiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMyIvPjxwYXRoIGQ9Ik0tNywtMS41IEg3IE0wLC02IFY3IE0tNywtNiBMMCwtOS41IEw3LC02Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC03LjYsMTY4LjkpIHJvdGF0ZSg5LjYpIHNjYWxlKDAuODc5KSI+PHBhdGggZD0iTS02LjUsLTkgSDMgTDYuNSwtNS41IFY5IEgtNi41IFogTTMsLTkgVi01LjUgSDYuNSIvPjxwYXRoIGQ9Ik0tMy41LC0yIEgzLjUgTS0zLjUsMS41IEgzLjUgTS0zLjUsNSBIMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNTIuNCwxNjguOSkgcm90YXRlKDkuNikgc2NhbGUoMC44NzkpIj48cGF0aCBkPSJNLTYuNSwtOSBIMyBMNi41LC01LjUgVjkgSC02LjUgWiBNMywtOSBWLTUuNSBINi41Ii8+PHBhdGggZD0iTS0zLjUsLTIgSDMuNSBNLTMuNSwxLjUgSDMuNSBNLTMuNSw1IEgxIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ3LjcsMTc5LjQpIHJvdGF0ZSgtMTEuNCkgc2NhbGUoMC45NDEpIj48cmVjdCB4PSItOS41IiB5PSItNSIgd2lkdGg9IjE5IiBoZWlnaHQ9IjEwIi8+PHBhdGggZD0iTS01LjUsLTUgVjUgTS0xLjUsLTUgVjUgTTIuNSwtNSBWNSBNNi41LC01IFY1Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xMy4zLDIyNy41KSByb3RhdGUoNS4yKSBzY2FsZSgwLjk4MCkiPjxjaXJjbGUgcj0iOC41Ii8+PHBhdGggZD0iTTAsLTguNSBWLTYuNiBNMCw4LjUgVjYuNiBNLTguNSwwIEgtNi42IE04LjUsMCBINi42IE0wLDAuNCBWLTUgTTAsMC40IEw0LDIuNCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNDYuNywyMjcuNSkgcm90YXRlKDUuMikgc2NhbGUoMC45ODApIj48Y2lyY2xlIHI9IjguNSIvPjxwYXRoIGQ9Ik0wLC04LjUgVi02LjYgTTAsOC41IFY2LjYgTS04LjUsMCBILTYuNiBNOC41LDAgSDYuNiBNMCwwLjQgVi01IE0wLDAuNCBMNCwyLjQiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjQuMiwyMTcuOSkgcm90YXRlKDE1LjQpIHNjYWxlKDAuOTQ4KSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzODQuMiwyMTcuOSkgcm90YXRlKDE1LjQpIHNjYWxlKDAuOTQ4KSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg1Ni41LDIyOC42KSByb3RhdGUoLTE4LjcpIHNjYWxlKDAuODA2KSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMDIuOSwyMTguOSkgcm90YXRlKC0xMi44KSBzY2FsZSgwLjc5NCkiPjxwYXRoIGQ9Ik0tOSwyIEg5IEw2LjUsNy41IEgtNi41IFoiLz48cmVjdCB4PSItNSIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cmVjdCB4PSIwLjYiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHBhdGggZD0iTTIsLTcgSDQuNCBWLTQiLz48cGF0aCBkPSJNLTksOS42IFEtNi41LDExLjEgLTQsOS42IFQxLDkuNiBUNiw5LjYgVDksOS42Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE1MC4yLDIxMC40KSByb3RhdGUoLTcuMykgc2NhbGUoMC44NzgpIj48cGF0aCBkPSJNMCwtOSBWNiBNLTksLTUuNSBIOSBNLTMuNSw4IEgzLjUiLz48cGF0aCBkPSJNLTksLTUuNSBMLTExLjMsMCBILTYuNyBaIE05LC01LjUgTDYuNywwIEgxMS4zIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTcxLjQsMjMwLjEpIHJvdGF0ZSgxOC4yKSBzY2FsZSgwLjgzMykiPjxwYXRoIGQ9Ik0tOSwyIEg5IEw2LjUsNy41IEgtNi41IFoiLz48cmVjdCB4PSItNSIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cmVjdCB4PSIwLjYiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHBhdGggZD0iTTIsLTcgSDQuNCBWLTQiLz48cGF0aCBkPSJNLTksOS42IFEtNi41LDExLjEgLTQsOS42IFQxLDkuNiBUNiw5LjYgVDksOS42Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIyOS44LDIyNy4wKSByb3RhdGUoLTE4LjEpIHNjYWxlKDAuODIxKSI+PGNpcmNsZSByPSI4LjUiLz48cGF0aCBkPSJNMCwtOC41IFYtNi42IE0wLDguNSBWNi42IE0tOC41LDAgSC02LjYgTTguNSwwIEg2LjYgTTAsMC40IFYtNSBNMCwwLjQgTDQsMi40Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI1MC45LDIyOS45KSByb3RhdGUoLTE5LjkpIHNjYWxlKDAuODkwKSI+PHJlY3QgeD0iLTkuNSIgeT0iLTUiIHdpZHRoPSIxOSIgaGVpZ2h0PSIxMCIvPjxwYXRoIGQ9Ik0tNS41LC01IFY1IE0tMS41LC01IFY1IE0yLjUsLTUgVjUgTTYuNSwtNSBWNSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMDYuNiwyMjEuOSkgcm90YXRlKC05LjApIHNjYWxlKDAuOTc4KSI+PHJlY3QgeD0iLTkuNSIgeT0iLTUiIHdpZHRoPSIxOSIgaGVpZ2h0PSIxMCIvPjxwYXRoIGQ9Ik0tNS41LC01IFY1IE0tMS41LC01IFY1IE0yLjUsLTUgVjUgTTYuNSwtNSBWNSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTYuNSwyMTYuMCkgcm90YXRlKC0yMy42KSBzY2FsZSgwLjk4NykiPjxyZWN0IHg9Ii05IiB5PSItNCIgd2lkdGg9IjEwLjUiIGhlaWdodD0iOSIvPjxwYXRoIGQ9Ik0xLjUsLTAuNSBINi42IEw5LjYsMi41IFY1IEgxLjUiLz48Y2lyY2xlIGN4PSItNSIgY3k9IjYuNiIgcj0iMiIvPjxjaXJjbGUgY3g9IjYiIGN5PSI2LjYiIHI9IjIiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzQzLjUsMjE2LjApIHJvdGF0ZSgtMjMuNikgc2NhbGUoMC45ODcpIj48cmVjdCB4PSItOSIgeT0iLTQiIHdpZHRoPSIxMC41IiBoZWlnaHQ9IjkiLz48cGF0aCBkPSJNMS41LC0wLjUgSDYuNiBMOS42LDIuNSBWNSBIMS41Ii8+PGNpcmNsZSBjeD0iLTUiIGN5PSI2LjYiIHI9IjIiLz48Y2lyY2xlIGN4PSI2IiBjeT0iNi42IiByPSIyIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE3LjIsMjE0LjEpIHJvdGF0ZSgyMS42KSBzY2FsZSgwLjc3MCkiPjxwYXRoIGQ9Ik0tOC41LDAgQTguNSw4LjUgMCAwLDEgOC41LDAgWiBNMCwwIFY3IFEwLDkuMiAyLjQsOS4yIE0tOC41LDAgUS02LjQsLTIuNCAtNC4yNSwwIFQwLDAgVDQuMjUsMCBUOC41LDAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzc3LjIsMjE0LjEpIHJvdGF0ZSgyMS42KSBzY2FsZSgwLjc3MCkiPjxwYXRoIGQ9Ik0tOC41LDAgQTguNSw4LjUgMCAwLDEgOC41LDAgWiBNMCwwIFY3IFEwLDkuMiAyLjQsOS4yIE0tOC41LDAgUS02LjQsLTIuNCAtNC4yNSwwIFQwLDAgVDQuMjUsMCBUOC41LDAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTEuNywyNTcuNykgcm90YXRlKC03LjgpIHNjYWxlKDAuOTEzKSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNTguMywyNTcuNykgcm90YXRlKC03LjgpIHNjYWxlKDAuOTEzKSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMC4yLDI0OC45KSByb3RhdGUoLTEyLjUpIHNjYWxlKDAuODA1KSI+PHBhdGggZD0iTTAsLTkgQy00LjgsLTkgLTguNSwtNS4zIC04LjUsLTAuNSBDLTguNSw2IDAsMTAgMCwxMCBDMCwxMCA4LjUsNiA4LjUsLTAuNSBDOC41LC01LjMgNC44LC05IDAsLTkgWiIvPjxjaXJjbGUgY3k9Ii0wLjUiIHI9IjMuMSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg4Mi43LDI1NS4wKSByb3RhdGUoLTIyLjIpIHNjYWxlKDAuODgyKSI+PGNpcmNsZSBjeT0iLTciIHI9IjIuMiIvPjxwYXRoIGQ9Ik0wLC00LjggVjcuNiBNLTQsLTMuNSBINCBNLTgsMi41IFEtOCw4IDAsOCBROCw4IDgsMi41IE0tOCwyLjUgbC0xLjgsLTEuMyBNLTgsMi41IGwxLjgsLTEuMyBNOCwyLjUgbC0xLjgsLTEuMyBNOCwyLjUgbDEuOCwtMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEwOS40LDI2OS45KSByb3RhdGUoMjAuOCkgc2NhbGUoMC45MDEpIj48cGF0aCBkPSJNMCwtOSBWNiBNLTksLTUuNSBIOSBNLTMuNSw4IEgzLjUiLz48cGF0aCBkPSJNLTksLTUuNSBMLTExLjMsMCBILTYuNyBaIE05LC01LjUgTDYuNywwIEgxMS4zIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTYwLjQsMjYxLjgpIHJvdGF0ZSgtMjMuMykgc2NhbGUoMC43NjcpIj48cGF0aCBkPSJNLTksMiBIOSBMNi41LDcuNSBILTYuNSBaIi8+PHJlY3QgeD0iLTUiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHJlY3QgeD0iMC42IiB5PSItNCIgd2lkdGg9IjQiIGhlaWdodD0iNiIvPjxwYXRoIGQ9Ik0yLC03IEg0LjQgVi00Ii8+PHBhdGggZD0iTS05LDkuNiBRLTYuNSwxMS4xIC00LDkuNiBUMSw5LjYgVDYsOS42IFQ5LDkuNiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMDQuNiwyNTcuMykgcm90YXRlKDkuOCkgc2NhbGUoMC45ODgpIj48cGF0aCBkPSJNMCwtOSBWNiBNLTksLTUuNSBIOSBNLTMuNSw4IEgzLjUiLz48cGF0aCBkPSJNLTksLTUuNSBMLTExLjMsMCBILTYuNyBaIE05LC01LjUgTDYuNywwIEgxMS4zIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjQwLjEsMjUyLjIpIHJvdGF0ZSgxMC42KSBzY2FsZSgwLjc3OSkiPjxwYXRoIGQ9Ik0tOSwyIEg5IEw2LjUsNy41IEgtNi41IFoiLz48cmVjdCB4PSItNSIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cmVjdCB4PSIwLjYiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHBhdGggZD0iTTIsLTcgSDQuNCBWLTQiLz48cGF0aCBkPSJNLTksOS42IFEtNi41LDExLjEgLTQsOS42IFQxLDkuNiBUNiw5LjYgVDksOS42Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI5MC41LDI0OS4yKSByb3RhdGUoLTE4LjEpIHNjYWxlKDAuODIyKSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMTQuMywyNjUuOCkgcm90YXRlKC0xLjQpIHNjYWxlKDAuODE2KSI+PHBhdGggZD0iTTAsLTEwIEMxLjIsLTEwIDEuOCwtOC41IDEuOCwtNiBMMS44LC0yIEw5LDIgTDksNCBMMS44LDIuNiBMMS44LDYgTDQuMiw4LjIgTDQuMiw5LjQgTDAsOC4xIEwtNC4yLDkuNCBMLTQuMiw4LjIgTC0xLjgsNiBMLTEuOCwyLjYgTC05LDQgTC05LDIgTC0xLjgsLTIgTC0xLjgsLTYgQy0xLjgsLTguNSAtMS4yLC0xMCAwLC0xMCBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIuOCwyNjQuOCkgcm90YXRlKDIyLjIpIHNjYWxlKDAuNzc4KSI+PHBhdGggZD0iTS00LDggVi04IEg4IE0tNCwtOCBMLTcsLTQgTS00LC00IEwyLC04IE04LC04IFYtNCBMNSwtMSBNNSwtMSBWMS4yIi8+PGNpcmNsZSBjeD0iLTQiIGN5PSI5LjQiIHI9IjEuMyIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzNjIuOCwyNjQuOCkgcm90YXRlKDIyLjIpIHNjYWxlKDAuNzc4KSI+PHBhdGggZD0iTS00LDggVi04IEg4IE0tNCwtOCBMLTcsLTQgTS00LC00IEwyLC04IE04LC04IFYtNCBMNSwtMSBNNSwtMSBWMS4yIi8+PGNpcmNsZSBjeD0iLTQiIGN5PSI5LjQiIHI9IjEuMyIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMS43LDI2OS43KSByb3RhdGUoMTkuNykgc2NhbGUoMC45MDYpIj48cGF0aCBkPSJNMCwtOSBDLTQuOCwtOSAtOC41LC01LjMgLTguNSwtMC41IEMtOC41LDYgMCwxMCAwLDEwIEMwLDEwIDguNSw2IDguNSwtMC41IEM4LjUsLTUuMyA0LjgsLTkgMCwtOSBaIi8+PGNpcmNsZSBjeT0iLTAuNSIgcj0iMy4xIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yNy4yLDI5NS44KSByb3RhdGUoMTYuNSkgc2NhbGUoMC45ODEpIj48cGF0aCBkPSJNMCwtMTAgQzEuMiwtMTAgMS44LC04LjUgMS44LC02IEwxLjgsLTIgTDksMiBMOSw0IEwxLjgsMi42IEwxLjgsNiBMNC4yLDguMiBMNC4yLDkuNCBMMCw4LjEgTC00LjIsOS40IEwtNC4yLDguMiBMLTEuOCw2IEwtMS44LDIuNiBMLTksNCBMLTksMiBMLTEuOCwtMiBMLTEuOCwtNiBDLTEuOCwtOC41IC0xLjIsLTEwIDAsLTEwIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzMyLjgsMjk1LjgpIHJvdGF0ZSgxNi41KSBzY2FsZSgwLjk4MSkiPjxwYXRoIGQ9Ik0wLC0xMCBDMS4yLC0xMCAxLjgsLTguNSAxLjgsLTYgTDEuOCwtMiBMOSwyIEw5LDQgTDEuOCwyLjYgTDEuOCw2IEw0LjIsOC4yIEw0LjIsOS40IEwwLDguMSBMLTQuMiw5LjQgTC00LjIsOC4yIEwtMS44LDYgTC0xLjgsMi42IEwtOSw0IEwtOSwyIEwtMS44LC0yIEwtMS44LC02IEMtMS44LC04LjUgLTEuMiwtMTAgMCwtMTAgWiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMS45LDI5My43KSByb3RhdGUoMjIuNSkgc2NhbGUoMC45ODEpIj48cmVjdCB4PSItOS41IiB5PSItNSIgd2lkdGg9IjE5IiBoZWlnaHQ9IjEwIi8+PHBhdGggZD0iTS01LjUsLTUgVjUgTS0xLjUsLTUgVjUgTTIuNSwtNSBWNSBNNi41LC01IFY1Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM4MS45LDI5My43KSByb3RhdGUoMjIuNSkgc2NhbGUoMC45ODEpIj48cmVjdCB4PSItOS41IiB5PSItNSIgd2lkdGg9IjE5IiBoZWlnaHQ9IjEwIi8+PHBhdGggZD0iTS01LjUsLTUgVjUgTS0xLjUsLTUgVjUgTTIuNSwtNSBWNSBNNi41LC01IFY1Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDU4LjgsMjg4LjcpIHJvdGF0ZSg3LjMpIHNjYWxlKDAuODI4KSI+PHBhdGggZD0iTTAsLTkgVjYgTS05LC01LjUgSDkgTS0zLjUsOCBIMy41Ii8+PHBhdGggZD0iTS05LC01LjUgTC0xMS4zLDAgSC02LjcgWiBNOSwtNS41IEw2LjcsMCBIMTEuMyBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDkzLjIsMjk5LjIpIHJvdGF0ZSgtMTMuMikgc2NhbGUoMC45NTQpIj48cGF0aCBkPSJNLTksMiBIOSBMNi41LDcuNSBILTYuNSBaIi8+PHJlY3QgeD0iLTUiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHJlY3QgeD0iMC42IiB5PSItNCIgd2lkdGg9IjQiIGhlaWdodD0iNiIvPjxwYXRoIGQ9Ik0yLC03IEg0LjQgVi00Ii8+PHBhdGggZD0iTS05LDkuNiBRLTYuNSwxMS4xIC00LDkuNiBUMSw5LjYgVDYsOS42IFQ5LDkuNiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMjguNCwyOTcuOCkgcm90YXRlKC01LjEpIHNjYWxlKDAuODY0KSI+PHBhdGggZD0iTTAsLTkgVjYgTS05LC01LjUgSDkgTS0zLjUsOCBIMy41Ii8+PHBhdGggZD0iTS05LC01LjUgTC0xMS4zLDAgSC02LjcgWiBNOSwtNS41IEw2LjcsMCBIMTEuMyBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE3Ni40LDMwOC4wKSByb3RhdGUoMTguMykgc2NhbGUoMC44MTIpIj48cmVjdCB4PSItOS41IiB5PSItNSIgd2lkdGg9IjE5IiBoZWlnaHQ9IjEwIi8+PHBhdGggZD0iTS01LjUsLTUgVjUgTS0xLjUsLTUgVjUgTTIuNSwtNSBWNSBNNi41LC01IFY1Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIwOS40LDI5NS4zKSByb3RhdGUoLTEwLjgpIHNjYWxlKDAuNzk1KSI+PHJlY3QgeD0iLTciIHk9Ii02IiB3aWR0aD0iMTQiIGhlaWdodD0iMTMiLz48cGF0aCBkPSJNLTcsLTEuNSBINyBNMCwtNiBWNyBNLTcsLTYgTDAsLTkuNSBMNywtNiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNzAuMywyOTMuNykgcm90YXRlKDEzLjkpIHNjYWxlKDAuODgxKSI+PHBhdGggZD0iTS05LDIgSDkgTDYuNSw3LjUgSC02LjUgWiIvPjxyZWN0IHg9Ii01IiB5PSItNCIgd2lkdGg9IjQiIGhlaWdodD0iNiIvPjxyZWN0IHg9IjAuNiIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cGF0aCBkPSJNMiwtNyBINC40IFYtNCIvPjxwYXRoIGQ9Ik0tOSw5LjYgUS02LjUsMTEuMSAtNCw5LjYgVDEsOS42IFQ2LDkuNiBUOSw5LjYiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjk3LjYsMzA5LjIpIHJvdGF0ZSgtMTEuNSkgc2NhbGUoMC44MTIpIj48cGF0aCBkPSJNMCwtMTAgQzEuMiwtMTAgMS44LC04LjUgMS44LC02IEwxLjgsLTIgTDksMiBMOSw0IEwxLjgsMi42IEwxLjgsNiBMNC4yLDguMiBMNC4yLDkuNCBMMCw4LjEgTC00LjIsOS40IEwtNC4yLDguMiBMLTEuOCw2IEwtMS44LDIuNiBMLTksNCBMLTksMiBMLTEuOCwtMiBMLTEuOCwtNiBDLTEuOCwtOC41IC0xLjIsLTEwIDAsLTEwIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzMxLjcsMjk4LjkpIHJvdGF0ZSgyMy40KSBzY2FsZSgwLjk5MCkiPjxwYXRoIGQ9Ik0tOSwyIEg5IEw2LjUsNy41IEgtNi41IFoiLz48cmVjdCB4PSItNSIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cmVjdCB4PSIwLjYiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHBhdGggZD0iTTIsLTcgSDQuNCBWLTQiLz48cGF0aCBkPSJNLTksOS42IFEtNi41LDExLjEgLTQsOS42IFQxLDkuNiBUNiw5LjYgVDksOS42Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzLjUsMzEwLjcpIHJvdGF0ZSgtMjMuNSkgc2NhbGUoMC44ODkpIj48cmVjdCB4PSItOS41IiB5PSItMyIgd2lkdGg9IjE5IiBoZWlnaHQ9IjMiLz48cGF0aCBkPSJNLTkuNSw2IEg5LjUgTS03LDMgVjYgTTAsMyBWNiBNNywzIFY2IE0tOS41LDMgVjAgTTkuNSwzIFYwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM4My41LDMxMC43KSByb3RhdGUoLTIzLjUpIHNjYWxlKDAuODg5KSI+PHJlY3QgeD0iLTkuNSIgeT0iLTMiIHdpZHRoPSIxOSIgaGVpZ2h0PSIzIi8+PHBhdGggZD0iTS05LjUsNiBIOS41IE0tNywzIFY2IE0wLDMgVjYgTTcsMyBWNiBNLTkuNSwzIFYwIE05LjUsMyBWMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMy41LC0yNS45KSByb3RhdGUoLTE0LjcpIHNjYWxlKDAuNzczKSI+PHBhdGggZD0iTTAsLTkgVjYgTS05LC01LjUgSDkgTS0zLjUsOCBIMy41Ii8+PHBhdGggZD0iTS05LC01LjUgTC0xMS4zLDAgSC02LjcgWiBNOSwtNS41IEw2LjcsMCBIMTEuMyBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0zLjUsMzM0LjEpIHJvdGF0ZSgtMTQuNykgc2NhbGUoMC43NzMpIj48cGF0aCBkPSJNMCwtOSBWNiBNLTksLTUuNSBIOSBNLTMuNSw4IEgzLjUiLz48cGF0aCBkPSJNLTksLTUuNSBMLTExLjMsMCBILTYuNyBaIE05LC01LjUgTDYuNywwIEgxMS4zIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzU2LjUsLTI1LjkpIHJvdGF0ZSgtMTQuNykgc2NhbGUoMC43NzMpIj48cGF0aCBkPSJNMCwtOSBWNiBNLTksLTUuNSBIOSBNLTMuNSw4IEgzLjUiLz48cGF0aCBkPSJNLTksLTUuNSBMLTExLjMsMCBILTYuNyBaIE05LC01LjUgTDYuNywwIEgxMS4zIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzU2LjUsMzM0LjEpIHJvdGF0ZSgtMTQuNykgc2NhbGUoMC43NzMpIj48cGF0aCBkPSJNMCwtOSBWNiBNLTksLTUuNSBIOSBNLTMuNSw4IEgzLjUiLz48cGF0aCBkPSJNLTksLTUuNSBMLTExLjMsMCBILTYuNyBaIE05LC01LjUgTDYuNywwIEgxMS4zIFoiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDQuNiwtMTUuNSkgcm90YXRlKDE3LjQpIHNjYWxlKDAuODc3KSI+PHJlY3QgeD0iLTciIHk9Ii02IiB3aWR0aD0iMTQiIGhlaWdodD0iMTMiLz48cGF0aCBkPSJNLTcsLTEuNSBINyBNMCwtNiBWNyBNLTcsLTYgTDAsLTkuNSBMNywtNiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0NC42LDM0NC41KSByb3RhdGUoMTcuNCkgc2NhbGUoMC44NzcpIj48cmVjdCB4PSItNyIgeT0iLTYiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMyIvPjxwYXRoIGQ9Ik0tNywtMS41IEg3IE0wLC02IFY3IE0tNywtNiBMMCwtOS41IEw3LC02Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDY5LjYsLTI3LjUpIHJvdGF0ZSg5LjMpIHNjYWxlKDAuOTg4KSI+PHJlY3QgeD0iLTkuNSIgeT0iLTMiIHdpZHRoPSIxOSIgaGVpZ2h0PSIzIi8+PHBhdGggZD0iTS05LjUsNiBIOS41IE0tNywzIFY2IE0wLDMgVjYgTTcsMyBWNiBNLTkuNSwzIFYwIE05LjUsMyBWMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg2OS42LDMzMi41KSByb3RhdGUoOS4zKSBzY2FsZSgwLjk4OCkiPjxyZWN0IHg9Ii05LjUiIHk9Ii0zIiB3aWR0aD0iMTkiIGhlaWdodD0iMyIvPjxwYXRoIGQ9Ik0tOS41LDYgSDkuNSBNLTcsMyBWNiBNMCwzIFY2IE03LDMgVjYgTS05LjUsMyBWMCBNOS41LDMgVjAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTMxLjMsLTI3LjcpIHJvdGF0ZSgxNC4yKSBzY2FsZSgwLjgzMikiPjxjaXJjbGUgcj0iOC41Ii8+PHBhdGggZD0iTTAsLTguNSBWLTYuNiBNMCw4LjUgVjYuNiBNLTguNSwwIEgtNi42IE04LjUsMCBINi42IE0wLDAuNCBWLTUgTTAsMC40IEw0LDIuNCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMzEuMywzMzIuMykgcm90YXRlKDE0LjIpIHNjYWxlKDAuODMyKSI+PGNpcmNsZSByPSI4LjUiLz48cGF0aCBkPSJNMCwtOC41IFYtNi42IE0wLDguNSBWNi42IE0tOC41LDAgSC02LjYgTTguNSwwIEg2LjYgTTAsMC40IFYtNSBNMCwwLjQgTDQsMi40Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2OC40LC0yNy45KSByb3RhdGUoLTE2LjEpIHNjYWxlKDAuOTQ2KSI+PHBhdGggZD0iTS04LjUsMCBBOC41LDguNSAwIDAsMSA4LjUsMCBaIE0wLDAgVjcgUTAsOS4yIDIuNCw5LjIgTS04LjUsMCBRLTYuNCwtMi40IC00LjI1LDAgVDAsMCBUNC4yNSwwIFQ4LjUsMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNjguNCwzMzIuMSkgcm90YXRlKC0xNi4xKSBzY2FsZSgwLjk0NikiPjxwYXRoIGQ9Ik0tOC41LDAgQTguNSw4LjUgMCAwLDEgOC41LDAgWiBNMCwwIFY3IFEwLDkuMiAyLjQsOS4yIE0tOC41LDAgUS02LjQsLTIuNCAtNC4yNSwwIFQwLDAgVDQuMjUsMCBUOC41LDAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjA5LjgsMzI4LjMpIHJvdGF0ZSgtMC45KSBzY2FsZSgwLjc5MSkiPjxyZWN0IHg9Ii03IiB5PSItNiIgd2lkdGg9IjE0IiBoZWlnaHQ9IjEzIi8+PHBhdGggZD0iTS03LC0xLjUgSDcgTTAsLTYgVjcgTS03LC02IEwwLC05LjUgTDcsLTYiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjQ3LjYsMzI5LjMpIHJvdGF0ZSgyMC44KSBzY2FsZSgwLjc3MykiPjxwYXRoIGQ9Ik0wLC05IEMtNC44LC05IC04LjUsLTUuMyAtOC41LC0wLjUgQy04LjUsNiAwLDEwIDAsMTAgQzAsMTAgOC41LDYgOC41LC0wLjUgQzguNSwtNS4zIDQuOCwtOSAwLC05IFoiLz48Y2lyY2xlIGN5PSItMC41IiByPSIzLjEiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjgzLjAsMzI5LjcpIHJvdGF0ZSgzLjgpIHNjYWxlKDAuNzkwKSI+PHJlY3QgeD0iLTkiIHk9Ii00IiB3aWR0aD0iMTAuNSIgaGVpZ2h0PSI5Ii8+PHBhdGggZD0iTTEuNSwtMC41IEg2LjYgTDkuNiwyLjUgVjUgSDEuNSIvPjxjaXJjbGUgY3g9Ii01IiBjeT0iNi42IiByPSIyIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYuNiIgcj0iMiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMDkuNSwzMzAuOSkgcm90YXRlKDIzLjkpIHNjYWxlKDAuOTQ2KSI+PHBhdGggZD0iTS00LDggVi04IEg4IE0tNCwtOCBMLTcsLTQgTS00LC00IEwyLC04IE04LC04IFYtNCBMNSwtMSBNNSwtMSBWMS4yIi8+PGNpcmNsZSBjeD0iLTQiIGN5PSI5LjQiIHI9IjEuMyIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLjYsLTI3LjQpIHJvdGF0ZSgyMy41KSBzY2FsZSgwLjc5OCkiPjxwYXRoIGQ9Ik0tOC41LDAgQTguNSw4LjUgMCAwLDEgOC41LDAgWiBNMCwwIFY3IFEwLDkuMiAyLjQsOS4yIE0tOC41LDAgUS02LjQsLTIuNCAtNC4yNSwwIFQwLDAgVDQuMjUsMCBUOC41LDAiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMC42LDMzMi42KSByb3RhdGUoMjMuNSkgc2NhbGUoMC43OTgpIj48cGF0aCBkPSJNLTguNSwwIEE4LjUsOC41IDAgMCwxIDguNSwwIFogTTAsMCBWNyBRMCw5LjIgMi40LDkuMiBNLTguNSwwIFEtNi40LC0yLjQgLTQuMjUsMCBUMCwwIFQ0LjI1LDAgVDguNSwwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM2MC42LC0yNy40KSByb3RhdGUoMjMuNSkgc2NhbGUoMC43OTgpIj48cGF0aCBkPSJNLTguNSwwIEE4LjUsOC41IDAgMCwxIDguNSwwIFogTTAsMCBWNyBRMCw5LjIgMi40LDkuMiBNLTguNSwwIFEtNi40LC0yLjQgLTQuMjUsMCBUMCwwIFQ0LjI1LDAgVDguNSwwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM2MC42LDMzMi42KSByb3RhdGUoMjMuNSkgc2NhbGUoMC43OTgpIj48cGF0aCBkPSJNLTguNSwwIEE4LjUsOC41IDAgMCwxIDguNSwwIFogTTAsMCBWNyBRMCw5LjIgMi40LDkuMiBNLTguNSwwIFEtNi40LC0yLjQgLTQuMjUsMCBUMCwwIFQ0LjI1LDAgVDguNSwwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM3LjQsLTE3LjgpIHJvdGF0ZSgtOC44KSBzY2FsZSgwLjk2NykiPjxwYXRoIGQ9Ik0tOSwyIEg5IEw2LjUsNy41IEgtNi41IFoiLz48cmVjdCB4PSItNSIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cmVjdCB4PSIwLjYiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHBhdGggZD0iTTIsLTcgSDQuNCBWLTQiLz48cGF0aCBkPSJNLTksOS42IFEtNi41LDExLjEgLTQsOS42IFQxLDkuNiBUNiw5LjYgVDksOS42Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM3LjQsMzQyLjIpIHJvdGF0ZSgtOC44KSBzY2FsZSgwLjk2NykiPjxwYXRoIGQ9Ik0tOSwyIEg5IEw2LjUsNy41IEgtNi41IFoiLz48cmVjdCB4PSItNSIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cmVjdCB4PSIwLjYiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHBhdGggZD0iTTIsLTcgSDQuNCBWLTQiLz48cGF0aCBkPSJNLTksOS42IFEtNi41LDExLjEgLTQsOS42IFQxLDkuNiBUNiw5LjYgVDksOS42Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMzMC41LDEzLjMpIHJvdGF0ZSgtNi43KSBzY2FsZSgwLjgxNikiPjxyZWN0IHg9Ii05IiB5PSItNCIgd2lkdGg9IjEwLjUiIGhlaWdodD0iOSIvPjxwYXRoIGQ9Ik0xLjUsLTAuNSBINi42IEw5LjYsMi41IFY1IEgxLjUiLz48Y2lyY2xlIGN4PSItNSIgY3k9IjYuNiIgcj0iMiIvPjxjaXJjbGUgY3g9IjYiIGN5PSI2LjYiIHI9IjIiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzMwLjUsMzczLjMpIHJvdGF0ZSgtNi43KSBzY2FsZSgwLjgxNikiPjxyZWN0IHg9Ii05IiB5PSItNCIgd2lkdGg9IjEwLjUiIGhlaWdodD0iOSIvPjxwYXRoIGQ9Ik0xLjUsLTAuNSBINi42IEw5LjYsMi41IFY1IEgxLjUiLz48Y2lyY2xlIGN4PSItNSIgY3k9IjYuNiIgcj0iMiIvPjxjaXJjbGUgY3g9IjYiIGN5PSI2LjYiIHI9IjIiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjIuNCwyMS4xKSByb3RhdGUoMTYuMSkgc2NhbGUoMC43NjYpIj48Y2lyY2xlIHI9IjguNSIvPjxlbGxpcHNlIHJ4PSIzLjYiIHJ5PSI4LjUiLz48cGF0aCBkPSJNLTguNSwwIEg4LjUgTS03LjUsLTQuMiBINy41IE0tNy41LDQuMiBINy41Ii8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIyLjQsMzgxLjEpIHJvdGF0ZSgxNi4xKSBzY2FsZSgwLjc2NikiPjxjaXJjbGUgcj0iOC41Ii8+PGVsbGlwc2Ugcng9IjMuNiIgcnk9IjguNSIvPjxwYXRoIGQ9Ik0tOC41LDAgSDguNSBNLTcuNSwtNC4yIEg3LjUgTS03LjUsNC4yIEg3LjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzgyLjQsMjEuMSkgcm90YXRlKDE2LjEpIHNjYWxlKDAuNzY2KSI+PGNpcmNsZSByPSI4LjUiLz48ZWxsaXBzZSByeD0iMy42IiByeT0iOC41Ii8+PHBhdGggZD0iTS04LjUsMCBIOC41IE0tNy41LC00LjIgSDcuNSBNLTcuNSw0LjIgSDcuNSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzODIuNCwzODEuMSkgcm90YXRlKDE2LjEpIHNjYWxlKDAuNzY2KSI+PGNpcmNsZSByPSI4LjUiLz48ZWxsaXBzZSByeD0iMy42IiByeT0iOC41Ii8+PHBhdGggZD0iTS04LjUsMCBIOC41IE0tNy41LC00LjIgSDcuNSBNLTcuNSw0LjIgSDcuNSIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0OS43LDIyLjgpIHJvdGF0ZSg0LjMpIHNjYWxlKDAuOTU5KSI+PHBhdGggZD0iTS05LDIgSDkgTDYuNSw3LjUgSC02LjUgWiIvPjxyZWN0IHg9Ii01IiB5PSItNCIgd2lkdGg9IjQiIGhlaWdodD0iNiIvPjxyZWN0IHg9IjAuNiIgeT0iLTQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiLz48cGF0aCBkPSJNMiwtNyBINC40IFYtNCIvPjxwYXRoIGQ9Ik0tOSw5LjYgUS02LjUsMTEuMSAtNCw5LjYgVDEsOS42IFQ2LDkuNiBUOSw5LjYiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDkuNywzODIuOCkgcm90YXRlKDQuMykgc2NhbGUoMC45NTkpIj48cGF0aCBkPSJNLTksMiBIOSBMNi41LDcuNSBILTYuNSBaIi8+PHJlY3QgeD0iLTUiIHk9Ii00IiB3aWR0aD0iNCIgaGVpZ2h0PSI2Ii8+PHJlY3QgeD0iMC42IiB5PSItNCIgd2lkdGg9IjQiIGhlaWdodD0iNiIvPjxwYXRoIGQ9Ik0yLC03IEg0LjQgVi00Ii8+PHBhdGggZD0iTS05LDkuNiBRLTYuNSwxMS4xIC00LDkuNiBUMSw5LjYgVDYsOS42IFQ5LDkuNiIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMDAuMCwyMi4zKSByb3RhdGUoMjIuMCkgc2NhbGUoMC44NjQpIj48cGF0aCBkPSJNLTQsOCBWLTggSDggTS00LC04IEwtNywtNCBNLTQsLTQgTDIsLTggTTgsLTggVi00IEw1LC0xIE01LC0xIFYxLjIiLz48Y2lyY2xlIGN4PSItNCIgY3k9IjkuNCIgcj0iMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEwMC4wLDM4Mi4zKSByb3RhdGUoMjIuMCkgc2NhbGUoMC44NjQpIj48cGF0aCBkPSJNLTQsOCBWLTggSDggTS00LC04IEwtNywtNCBNLTQsLTQgTDIsLTggTTgsLTggVi00IEw1LC0xIE01LC0xIFYxLjIiLz48Y2lyY2xlIGN4PSItNCIgY3k9IjkuNCIgcj0iMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEyOC4wLDEzLjIpIHJvdGF0ZSgtMi4yKSBzY2FsZSgwLjkxNSkiPjxjaXJjbGUgcj0iOC41Ii8+PGVsbGlwc2Ugcng9IjMuNiIgcnk9IjguNSIvPjxwYXRoIGQ9Ik0tOC41LDAgSDguNSBNLTcuNSwtNC4yIEg3LjUgTS03LjUsNC4yIEg3LjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTI4LjAsMzczLjIpIHJvdGF0ZSgtMi4yKSBzY2FsZSgwLjkxNSkiPjxjaXJjbGUgcj0iOC41Ii8+PGVsbGlwc2Ugcng9IjMuNiIgcnk9IjguNSIvPjxwYXRoIGQ9Ik0tOC41LDAgSDguNSBNLTcuNSwtNC4yIEg3LjUgTS03LjUsNC4yIEg3LjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTg4LjYsMTUuMCkgcm90YXRlKDEuOCkgc2NhbGUoMC43ODkpIj48Y2lyY2xlIGN5PSItNyIgcj0iMi4yIi8+PHBhdGggZD0iTTAsLTQuOCBWNy42IE0tNCwtMy41IEg0IE0tOCwyLjUgUS04LDggMCw4IFE4LDggOCwyLjUgTS04LDIuNSBsLTEuOCwtMS4zIE0tOCwyLjUgbDEuOCwtMS4zIE04LDIuNSBsLTEuOCwtMS4zIE04LDIuNSBsMS44LC0xLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTg4LjYsMzc1LjApIHJvdGF0ZSgxLjgpIHNjYWxlKDAuNzg5KSI+PGNpcmNsZSBjeT0iLTciIHI9IjIuMiIvPjxwYXRoIGQ9Ik0wLC00LjggVjcuNiBNLTQsLTMuNSBINCBNLTgsMi41IFEtOCw4IDAsOCBROCw4IDgsMi41IE0tOCwyLjUgbC0xLjgsLTEuMyBNLTgsMi41IGwxLjgsLTEuMyBNOCwyLjUgbC0xLjgsLTEuMyBNOCwyLjUgbDEuOCwtMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIxNC4zLDMxLjMpIHJvdGF0ZSgtMC4zKSBzY2FsZSgwLjkyNSkiPjxyZWN0IHg9Ii05LjUiIHk9Ii01IiB3aWR0aD0iMTkiIGhlaWdodD0iMTAiLz48cGF0aCBkPSJNLTUuNSwtNSBWNSBNLTEuNSwtNSBWNSBNMi41LC01IFY1IE02LjUsLTUgVjUiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjY0LjUsMTEuOCkgcm90YXRlKDE2LjApIHNjYWxlKDAuODA3KSI+PHJlY3QgeD0iLTkuNSIgeT0iLTMiIHdpZHRoPSIxOSIgaGVpZ2h0PSIzIi8+PHBhdGggZD0iTS05LjUsNiBIOS41IE0tNywzIFY2IE0wLDMgVjYgTTcsMyBWNiBNLTkuNSwzIFYwIE05LjUsMyBWMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjQuNSwzNzEuOCkgcm90YXRlKDE2LjApIHNjYWxlKDAuODA3KSI+PHJlY3QgeD0iLTkuNSIgeT0iLTMiIHdpZHRoPSIxOSIgaGVpZ2h0PSIzIi8+PHBhdGggZD0iTS05LjUsNiBIOS41IE0tNywzIFY2IE0wLDMgVjYgTTcsMyBWNiBNLTkuNSwzIFYwIE05LjUsMyBWMCIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzMTEuMSw4LjgpIHJvdGF0ZSgxMy42KSBzY2FsZSgwLjg4MykiPjxwYXRoIGQ9Ik0tNCw4IFYtOCBIOCBNLTQsLTggTC03LC00IE0tNCwtNCBMMiwtOCBNOCwtOCBWLTQgTDUsLTEgTTUsLTEgVjEuMiIvPjxjaXJjbGUgY3g9Ii00IiBjeT0iOS40IiByPSIxLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzExLjEsMzY4LjgpIHJvdGF0ZSgxMy42KSBzY2FsZSgwLjg4MykiPjxwYXRoIGQ9Ik0tNCw4IFYtOCBIOCBNLTQsLTggTC03LC00IE0tNCwtNCBMMiwtOCBNOCwtOCBWLTQgTDUsLTEgTTUsLTEgVjEuMiIvPjxjaXJjbGUgY3g9Ii00IiBjeT0iOS40IiByPSIxLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTI0LjcsMTIuMSkgcm90YXRlKC0xNi4yKSBzY2FsZSgwLjgyNSkiPjxwYXRoIGQ9Ik0tNCw4IFYtOCBIOCBNLTQsLTggTC03LC00IE0tNCwtNCBMMiwtOCBNOCwtOCBWLTQgTDUsLTEgTTUsLTEgVjEuMiIvPjxjaXJjbGUgY3g9Ii00IiBjeT0iOS40IiByPSIxLjMiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTI0LjcsMzcyLjEpIHJvdGF0ZSgtMTYuMikgc2NhbGUoMC44MjUpIj48cGF0aCBkPSJNLTQsOCBWLTggSDggTS00LC04IEwtNywtNCBNLTQsLTQgTDIsLTggTTgsLTggVi00IEw1LC0xIE01LC0xIFYxLjIiLz48Y2lyY2xlIGN4PSItNCIgY3k9IjkuNCIgcj0iMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMzNS4zLDEyLjEpIHJvdGF0ZSgtMTYuMikgc2NhbGUoMC44MjUpIj48cGF0aCBkPSJNLTQsOCBWLTggSDggTS00LC04IEwtNywtNCBNLTQsLTQgTDIsLTggTTgsLTggVi00IEw1LC0xIE01LC0xIFYxLjIiLz48Y2lyY2xlIGN4PSItNCIgY3k9IjkuNCIgcj0iMS4zIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMzNS4zLDM3Mi4xKSByb3RhdGUoLTE2LjIpIHNjYWxlKDAuODI1KSI+PHBhdGggZD0iTS00LDggVi04IEg4IE0tNCwtOCBMLTcsLTQgTS00LC00IEwyLC04IE04LC04IFYtNCBMNSwtMSBNNSwtMSBWMS4yIi8+PGNpcmNsZSBjeD0iLTQiIGN5PSI5LjQiIHI9IjEuMyIvPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyOC41LDE1LjkpIHJvdGF0ZSgxOC4yKSBzY2FsZSgwLjk5MykiPjxwYXRoIGQ9Ik0wLC05IEMtNC44LC05IC04LjUsLTUuMyAtOC41LC0wLjUgQy04LjUsNiAwLDEwIDAsMTAgQzAsMTAgOC41LDYgOC41LC0wLjUgQzguNSwtNS4zIDQuOCwtOSAwLC05IFoiLz48Y2lyY2xlIGN5PSItMC41IiByPSIzLjEiLz48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjguNSwzNzUuOSkgcm90YXRlKDE4LjIpIHNjYWxlKDAuOTkzKSI+PHBhdGggZD0iTTAsLTkgQy00LjgsLTkgLTguNSwtNS4zIC04LjUsLTAuNSBDLTguNSw2IDAsMTAgMCwxMCBDMCwxMCA4LjUsNiA4LjUsLTAuNSBDOC41LC01LjMgNC44LC05IDAsLTkgWiIvPjxjaXJjbGUgY3k9Ii0wLjUiIHI9IjMuMSIvPjwvZz4KPGNpcmNsZSBjeD0iMjQ3LjkiIGN5PSIyNTUuMSIgcj0iMS42NCIvPjxjaXJjbGUgY3g9IjMzLjAiIGN5PSIyNjkuNCIgcj0iMi4wMyIvPjxjaXJjbGUgY3g9IjI0Mi41IiBjeT0iMjM2LjciIHI9IjIuNTUiLz48Y2lyY2xlIGN4PSIyNDEuOSIgY3k9IjU5LjciIHI9IjIuMjUiLz48Y2lyY2xlIGN4PSIxOTYuMyIgY3k9IjM1My4yIiByPSIyLjQ5Ii8+PGNpcmNsZSBjeD0iMTkxLjciIGN5PSIzNDIuOCIgcj0iMi41OSIvPjxjaXJjbGUgY3g9IjI1Mi44IiBjeT0iMTQ2LjQiIHI9IjIuNTYiLz48Y2lyY2xlIGN4PSIxMTYuNCIgY3k9IjE0MC45IiByPSIyLjA2Ii8+PGNpcmNsZSBjeD0iOTQuMyIgY3k9IjIyMi45IiByPSIyLjAwIi8+PGNpcmNsZSBjeD0iNDMuNiIgY3k9IjIyNy41IiByPSIyLjE5Ii8+PGNpcmNsZSBjeD0iMzQ0LjQiIGN5PSIxMDMuNCIgcj0iMi41OSIvPjxjaXJjbGUgY3g9IjM1LjIiIGN5PSIzNDIuMSIgcj0iMS44OSIvPjxjaXJjbGUgY3g9IjE4NC41IiBjeT0iMTg1LjgiIHI9IjIuMzEiLz48Y2lyY2xlIGN4PSIxMzguMSIgY3k9IjE3My4wIiByPSIyLjE5Ii8+PGNpcmNsZSBjeD0iMTcxLjkiIGN5PSIxMjUuOCIgcj0iMi4yNiIvPjxjaXJjbGUgY3g9IjE3MC44IiBjeT0iMTk4LjEiIHI9IjEuODciLz48Y2lyY2xlIGN4PSIyOTIuOCIgY3k9IjUyLjkiIHI9IjEuNzgiLz48Y2lyY2xlIGN4PSIzMTYuMiIgY3k9IjEyNC4yIiByPSIyLjU5Ii8+PGNpcmNsZSBjeD0iMTUuMyIgY3k9IjI3OS4yIiByPSIyLjQxIi8+PGNpcmNsZSBjeD0iMjc5LjIiIGN5PSI3NC4xIiByPSIyLjEwIi8+PGNpcmNsZSBjeD0iMTQ2LjYiIGN5PSI4MS44IiByPSIyLjU1Ii8+PGNpcmNsZSBjeD0iMTgyLjciIGN5PSI1Ni43IiByPSIyLjUzIi8+PGNpcmNsZSBjeD0iNzcuNiIgY3k9IjEyOS40IiByPSIyLjI3Ii8+PGNpcmNsZSBjeD0iMTQyLjAiIGN5PSI0My4yIiByPSIyLjQwIi8+PGNpcmNsZSBjeD0iMjE1LjkiIGN5PSIyMDcuNSIgcj0iMi40MiIvPjxjaXJjbGUgY3g9IjE5NS40IiBjeT0iMjc0LjUiIHI9IjEuNzgiLz48Y2lyY2xlIGN4PSIxNzQuOCIgY3k9Ijg0LjciIHI9IjIuMjciLz48Y2lyY2xlIGN4PSI0MC4xIiBjeT0iMzA5LjgiIHI9IjIuMTciLz48Y2lyY2xlIGN4PSIzMjMuNiIgY3k9IjIzNC45IiByPSIxLjg2Ii8+PGNpcmNsZSBjeD0iNTIuNCIgY3k9IjM0Ni4wIiByPSIxLjkzIi8+PGNpcmNsZSBjeD0iMjUzLjAiIGN5PSIzMjEuMSIgcj0iMi4xNyIvPjxjaXJjbGUgY3g9IjMzNi41IiBjeT0iOTAuNCIgcj0iMS42OSIvPjxjaXJjbGUgY3g9IjI0Mi4wIiBjeT0iMzEuMyIgcj0iMS42MiIvPjxjaXJjbGUgY3g9IjMyMS4zIiBjeT0iNDkuMyIgcj0iMi4zMSIvPjxjaXJjbGUgY3g9IjI1Ny44IiBjeT0iMjIwLjQiIHI9IjEuNzciLz48Y2lyY2xlIGN4PSI5NC42IiBjeT0iMTEzLjMiIHI9IjEuNzMiLz48Y2lyY2xlIGN4PSIyNDcuOCIgY3k9IjkxLjIiIHI9IjEuNjYiLz48Y2lyY2xlIGN4PSIxNDUuOCIgY3k9IjEyNy42IiByPSIyLjA2Ii8+PGNpcmNsZSBjeD0iMjg1LjciIGN5PSI2MS4zIiByPSIxLjYyIi8+PGNpcmNsZSBjeD0iMTQ0LjYiIGN5PSI5Ny4xIiByPSIyLjAxIi8+PGNpcmNsZSBjeD0iMTQzLjYiIGN5PSIzMTguMiIgcj0iMi4yOCIvPjxjaXJjbGUgY3g9IjEwNy4wIiBjeT0iNDMuOCIgcj0iMS45NSIvPjxjaXJjbGUgY3g9Ijg1LjQiIGN5PSIyMjkuNCIgcj0iMi4zNyIvPjxjaXJjbGUgY3g9IjIzLjkiIGN5PSIyODEuMyIgcj0iMi4xNCIvPjxjaXJjbGUgY3g9IjEzNS42IiBjeT0iMjY4LjYiIHI9IjIuMTciLz48Y2lyY2xlIGN4PSIzMTIuNCIgY3k9Ii0wLjUiIHI9IjEuNzEiLz48Y2lyY2xlIGN4PSIzMTIuNCIgY3k9IjM1OS41IiByPSIxLjcxIi8+PGNpcmNsZSBjeD0iMjgxLjUiIGN5PSIxNzkuMyIgcj0iMi4yNCIvPjxjaXJjbGUgY3g9IjE0NC42IiBjeT0iMzIwLjkiIHI9IjEuNjYiLz48Y2lyY2xlIGN4PSIxNTcuNSIgY3k9IjIwMi4zIiByPSIyLjA5Ii8+PGNpcmNsZSBjeD0iMjE1LjYiIGN5PSIxOTAuNCIgcj0iMS42NyIvPjxjaXJjbGUgY3g9IjczLjciIGN5PSI3Ny41IiByPSIxLjkwIi8+PGNpcmNsZSBjeD0iMzUuOCIgY3k9IjYyLjkiIHI9IjIuMjQiLz48Y2lyY2xlIGN4PSIyNDMuMiIgY3k9IjIyMy4wIiByPSIyLjM4Ii8+PGNpcmNsZSBjeD0iMTgzLjIiIGN5PSIxNTIuNiIgcj0iMS42MiIvPjxjaXJjbGUgY3g9IjEzNC41IiBjeT0iMjUxLjMiIHI9IjIuMjQiLz48Y2lyY2xlIGN4PSI0MS41IiBjeT0iOTEuMiIgcj0iMi4wNyIvPjxjaXJjbGUgY3g9IjI3MS42IiBjeT0iLTIuMyIgcj0iMS45MCIvPjxjaXJjbGUgY3g9IjI3MS42IiBjeT0iMzU3LjciIHI9IjEuOTAiLz48Y2lyY2xlIGN4PSI4OS42IiBjeT0iNjAuNSIgcj0iMi4wNCIvPjxjaXJjbGUgY3g9IjMzNi4yIiBjeT0iNzkuNyIgcj0iMS45NCIvPjxjaXJjbGUgY3g9IjY3LjIiIGN5PSIzNDYuOSIgcj0iMS45MSIvPjxjaXJjbGUgY3g9IjI3OS41IiBjeT0iNjYuMSIgcj0iMi4xOCIvPjxjaXJjbGUgY3g9IjE0OC42IiBjeT0iMTc4LjIiIHI9IjIuMDQiLz48Y2lyY2xlIGN4PSIxNjYuNCIgY3k9IjIyMi4yIiByPSIyLjI0Ii8+PGNpcmNsZSBjeD0iODUuNSIgY3k9IjIwMC42IiByPSIyLjQzIi8+PGNpcmNsZSBjeD0iMTQyLjkiIGN5PSIyNzUuNyIgcj0iMi4wNiIvPjxjaXJjbGUgY3g9IjgyLjciIGN5PSIyOTAuNiIgcj0iMi40MCIvPjxjaXJjbGUgY3g9IjkyLjciIGN5PSIyOTMuOCIgcj0iMi4wMyIvPjxjaXJjbGUgY3g9IjE3MS43IiBjeT0iMzEuMCIgcj0iMS42OSIvPjxjaXJjbGUgY3g9IjM3LjQiIGN5PSIxNTUuOSIgcj0iMS42NiIvPjxjaXJjbGUgY3g9Ijg3LjMiIGN5PSIyNjIuNiIgcj0iMi40MCIvPgo8L2c+Cjwvc3ZnPg==') repeat;background-size:300px;max-height:56vh;overflow-y:auto;padding:12px 10px;border-radius:0 0 14px 14px;}
        .wa-day{text-align:center;margin:10px 0 8px;}
        .wa-day span{background:#fff;color:#54656f;font-size:11px;font-weight:600;padding:4px 12px;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.12);}
        .wa-row{display:flex;margin-top:8px;}
        .wa-row.tight{margin-top:2px;}
        .wa-row.me{justify-content:flex-end;}
        .wa-bubble{max-width:80%;padding:6px 9px 4px;border-radius:12px;box-shadow:0 1px 1px rgba(0,0,0,.13);display:flex;flex-direction:column;}
        .wa-bubble.them{background:#fff;border-top-left-radius:3px;color:#0f172a;}
        .wa-bubble.me{background:var(--amt-blue,#1A3553);border-top-right-radius:3px;color:#fff;}
        .wa-name{font-size:11px;font-weight:800;color:var(--amt-blue,#1A3553);margin-bottom:2px;}
        .wa-text{font-size:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word;}
        .wa-img{max-width:240px;max-height:260px;border-radius:9px;cursor:pointer;display:block;margin-bottom:3px;}
        .wa-time{align-self:flex-end;font-size:10px;opacity:.6;margin-top:2px;}
        .wa-bubble.me .wa-time{color:#dbe7f5;opacity:.85;}
        .wa-empty{text-align:center;color:#64748b;padding:26px 14px;font-size:13.5px;}
        .wa-input{display:flex;align-items:flex-end;gap:8px;margin-top:10px;}
        .wa-inputbar{flex:1;display:flex;align-items:flex-end;gap:4px;background:#fff;border-radius:24px;padding:6px 6px 6px 12px;box-shadow:0 1px 3px rgba(0,0,0,.1);}
        .wa-inputbar textarea{flex:1;border:none;outline:none;resize:none;font-size:14px;max-height:96px;background:transparent;font-family:inherit;color:#0f172a;padding:6px 0;}
        .wa-attach{background:none;border:none;font-size:20px;cursor:pointer;padding:0 4px;color:#54656f;}
        .wa-send{width:46px;height:46px;border-radius:50%;background:var(--amt-blue,#1A3553);color:#fff;border:none;font-size:18px;cursor:pointer;flex:none;box-shadow:0 2px 6px rgba(26,53,83,.3);}
      </style>
      <div class="wa-head">${backBtn}<div class="wa-avatar">${initials}</div><div><div class="wa-headname">${esc(conv.name)}</div><div class="wa-headsub">Agence AMT · en ligne</div></div></div>
      <div class="wa-scroll" id="chatScroll">${bubbles}</div>
      <div class="wa-input">
        <input type="file" id="chatImgInput" accept="image/*" style="display:none;">
        <div class="wa-inputbar"><button class="wa-attach" data-chatphoto="1" title="Joindre une photo">📷</button><textarea id="chatText" rows="1" placeholder="Votre message…"></textarea></div>
        <button class="wa-send" data-chatsend="1" title="Envoyer">➤</button>
      </div>`;
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
    // Voyage du conteneur (frise ShipsGo + navire + dates + carte) recopié sur la
    // facture par le serveur (champ tracking). Affiché sous le colis si présent.
    const SHIPSGO_STEPS = { PREPARATION:'🏗️ Préparation', EMBARQUE:'🚢 Embarqué', EN_TRANSIT:'🌊 En mer', TRANSBORDEMENT:'🔄 Transbordement', ARRIVE:'⚓ Arrivé', DEDOUANE:'🛃 Dédouané', LIVRAISON:'📦 Livré' };
    const trackByRef = {};
    INVOICES.forEach(i => { if (i.tracking && i.tracking.status) trackByRef[i.reference] = i.tracking; });
    const voyageBlock = (ref) => {
      const t = trackByRef[ref];
      if (!t) return '';
      const step = SHIPSGO_STEPS[t.status] || t.status || '';
      const dep = t.departureDate ? fdate(t.departureDate) : '—';
      const arr = (t.arrivalDate || t.eta) ? fdate(t.arrivalDate || t.eta) : '—';
      return `<div style="margin-top:6px; padding:8px 10px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; font-size:13px; color:#075985;">
        <div style="font-weight:700;">🛰️ Voyage : ${step}</div>
        <div style="margin-top:3px;">🚢 ${t.vesselName || 'Navire à confirmer'}${t.container ? ' · ' + t.container : ''}</div>
        <div style="margin-top:3px;">📅 Départ ${dep} → 📆 Arrivée prévue ${arr}</div>
      </div>`;
    };
    const carteBlock = (ref) => {
      const t = trackByRef[ref];
      if (!t || !t.vesselImo) return '';
      return `<details style="margin-top:6px;">
        <summary style="cursor:pointer; color:#0e7490; font-weight:700; font-size:13px;">🗺️ Carte du navire${t.vesselName ? ' — ' + t.vesselName : ''}</summary>
        <iframe src="../commun/carte-navire.html?imo=${encodeURIComponent(t.vesselImo)}" style="width:100%; height:280px; border:1px solid #cbd5e1; border-radius:8px; margin-top:6px;" loading="lazy" title="Position du navire"></iframe>
      </details>`;
    };
    // Regroupé PAR FACTURE : chaque facture = une carte avec son voyage + sa carte
    // du navire + ses sous-colis.
    const filtered = PARCELS.filter(p => trackFilter < 0 || p.stage === trackFilter);
    const byRef = {};
    filtered.forEach(p => { (byRef[p.ref] = byRef[p.ref] || []).push(p); });
    const list = Object.keys(byRef).map(ref => {
      const colisHtml = byRef[ref].map(p => `
        <div class="track-item">
          <div class="track-head">
            <div>
              <div class="track-ref">${p.label}</div>
              <div class="track-desc">${p.desc}</div>
            </div>
            <div class="track-date">${p.date ? fdate(p.date) : ''}</div>
          </div>
          ${stepper(p.stage)}
        </div>`).join('');
      return `<div class="card">
        <div style="font-weight:800; font-size:15px; color:#0f172a;">📄 ${ref}</div>
        ${voyageBlock(ref)}
        ${carteBlock(ref)}
        <div style="margin-top:8px;">${colisHtml}</div>
      </div>`;
    }).join('');

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
    const name = (clientSelfName || localStorage.getItem(LS.name) || '').trim();
    const initials = name ? name.slice(0, 2).toUpperCase() : (ph.replace(/\D/g, '').slice(-2) || '👤');
    const heroAv = clientProfile.photoUrl
      ? `<img src="${clientProfile.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : initials;
    const roleLbl = isExpediteur ? 'Expéditeur' : 'Destinataire';

    // Stats réelles depuis les factures déjà chargées.
    const nbFactures = INVOICES.length;
    const totalDuFcfa = INVOICES.reduce((s, i) => s + toFcfa(i.remaining, i.currency), 0);
    const envois = LOYALTY.sentAsSender || 0;
    const need = 10;
    const inCycle = envois % need;
    const pct = Math.min(100, Math.round(inCycle / need * 100));
    const toNext = LOYALTY.toNext != null ? LOYALTY.toNext : (need - inCycle);

    return `
      <div class="pf-hero">
        <div class="pf-hero__av">${heroAv}</div>
        <div style="min-width:0;">
          <div class="pf-hero__name">${name || 'Client AMT'}</div>
          <div class="pf-hero__sub">📞 ${ph}</div>
          <span class="pf-hero__chip">${roleLbl}</span>
        </div>
      </div>

      <div class="pf-stats">
        <div class="pf-stat"><div class="pf-stat__v">${nbFactures}</div><div class="pf-stat__l">Factures</div></div>
        <div class="pf-stat"><div class="pf-stat__v">${envois}</div><div class="pf-stat__l">Envois</div></div>
        <div class="pf-stat"><div class="pf-stat__v" style="${totalDuFcfa > 0 ? 'color:var(--amt-red);' : 'color:var(--green);'}">${money(totalDuFcfa, 'XOF')}</div><div class="pf-stat__l">Reste à payer</div></div>
      </div>

      ${clientAgencies.length ? `
      <div class="card">
        <div class="section-title">Mes agences AMT</div>
        <p class="muted" style="margin:0 0 8px;font-size:12.5px;">Agences rattachées à votre numéro (selon vos colis).</p>
        ${clientAgencies.map(a => {
          const r = a.role === 'exp' ? 'Vous expédiez via cette agence'
            : a.role === 'dest' ? 'Vous recevez via cette agence'
            : 'Expéditions & réceptions';
          return `<div class="pf-row" style="cursor:default;">
            <span class="pf-row__ic">🏢</span>
            <span class="pf-row__main"><span class="pf-row__t">${a.name}</span><span class="pf-row__s">${r}</span></span>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="card">
        <div class="section-title">Fidélité 🎁</div>
        <p class="muted" style="margin:0 0 10px;font-size:13px;">À ${need} envois (en tant qu'expéditeur), 1 carton moyen offert. ${LOYALTY.freeCartons ? `Déjà <b>${LOYALTY.freeCartons}</b> carton(s) gagné(s).` : ''}</p>
        <div class="pf-fid__bar"><div class="pf-fid__fill" style="width:${pct}%;"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:13px;">
          <span style="color:var(--muted);">${inCycle} / ${need}</span>
          <span style="font-weight:700;color:var(--amt-blue);">Plus que ${toNext} 🎁</span>
        </div>
      </div>

      <div class="card">
        <div class="section-title">Mon compte</div>
        <button class="pf-row" data-go="profile-edit">
          <span class="pf-row__ic">✏️</span>
          <span class="pf-row__main"><span class="pf-row__t">Modifier mes informations</span><span class="pf-row__s">Photo, prénom, nom</span></span>
          <span class="pf-row__chev">›</span>
        </button>
        <button class="pf-row" data-go="profile-pin">
          <span class="pf-row__ic">🔒</span>
          <span class="pf-row__main"><span class="pf-row__t">Changer mon code PIN</span><span class="pf-row__s">Code de déverrouillage de l'app</span></span>
          <span class="pf-row__chev">›</span>
        </button>
      </div>

      <div class="card">
        <div class="section-title">Aide & infos</div>
        <button class="pf-row" data-go="chat">
          <span class="pf-row__ic">💬</span>
          <span class="pf-row__main"><span class="pf-row__t">Contacter AMT Trans'it</span><span class="pf-row__s">Via la messagerie de l'app</span></span>
          <span class="pf-row__chev">›</span>
        </button>
        <button class="pf-row" data-pflang="1">
          <span class="pf-row__ic">🌐</span>
          <span class="pf-row__main"><span class="pf-row__t">Langue</span><span class="pf-row__s">${clientProfile.lang === 'en' ? 'English' : 'Français'} · appuyer pour changer</span></span>
          <span class="pf-row__chev">⇄</span>
        </button>
        <button class="pf-row" data-go="profile-about">
          <span class="pf-row__ic">ℹ️</span>
          <span class="pf-row__main"><span class="pf-row__t">À propos</span><span class="pf-row__s">${clientAbout ? (clientAbout.name || "AMT Trans'it") : "AMT Trans'it"}</span></span>
          <span class="pf-row__chev">›</span>
        </button>
      </div>

      <button class="btn btn--ghost" id="btnLock" style="color:var(--amt-blue);">🔒 Verrouiller l'application</button>
      <button class="btn btn--ghost" id="btnLogout" style="color:var(--amt-red);">Se déconnecter</button>
      <div class="pf-version">AMT Clients · v1.0</div>
    `;
  },

  // Écran : modifier mes informations (photo + prénom + nom).
  'profile-edit'() {
    const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');
    const photo = profilePhotoDraft !== null ? profilePhotoDraft : (clientProfile.photoUrl || '');
    const avatarInner = photo
      ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : `<span style="font-size:30px;">👤</span>`;
    return `
      <button class="btn btn--ghost" data-go="profile" style="text-align:left;margin:0 0 8px;">← Profil</button>
      <div class="rf-card"><div class="rf-card__head"><span class="rf-ic">✏️</span> Mes informations</div>
        <div class="rf-card__body">
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:14px;">
            <div style="width:90px;height:90px;border-radius:50%;border:2.5px solid var(--amt-gold);background:#eef4fb;display:flex;align-items:center;justify-content:center;overflow:hidden;">${avatarInner}</div>
            <input type="file" id="pfPhotoInput" accept="image/*" style="display:none;">
            <div style="display:flex;gap:8px;">
              <button class="btn btn--ghost" style="width:auto;padding:6px 14px;" data-pfphoto="1">📷 Choisir une photo</button>
              ${photo ? `<button class="btn btn--ghost" style="width:auto;padding:6px 14px;color:var(--amt-red);" data-pfphotodel="1">Retirer</button>` : ''}
            </div>
          </div>
          <div class="rf-field rf-field--full"><span class="rf-label">Prénom</span>
            <input id="pfPrenom" class="rf-input" type="text" placeholder="Votre prénom" value="${esc(clientProfile.prenom)}"></div>
          <div class="rf-field rf-field--full"><span class="rf-label">Nom</span>
            <input id="pfNom" class="rf-input" type="text" placeholder="Votre nom" value="${esc(clientProfile.nom)}"></div>
          <p class="placeholder" style="padding:8px;">Ces informations apparaissent sur vos demandes, vos messages et sont visibles par l'agence.</p>
          <div id="pfMsg" class="auth__error" hidden style="margin-bottom:10px;"></div>
          <button class="btn btn--primary" data-pfsaveinfo="1">Enregistrer</button>
        </div>
      </div>`;
  },

  // Écran : À propos (infos société de l'agence de départ).
  'profile-about'() {
    const a = clientAbout;
    const row = (ic, t, v) => v ? `<div class="pf-row"><span class="pf-row__ic">${ic}</span><span class="pf-row__main"><span class="pf-row__t">${t}</span><span class="pf-row__s">${String(v).replace(/</g,'&lt;')}</span></span></div>` : '';
    const body = a ? `
        <div style="text-align:center;margin-bottom:10px;">
          <div style="font-family:'Comfortaa',sans-serif;font-weight:700;font-size:18px;color:var(--amt-blue);">${(a.name||"AMT TRANS'IT").replace(/</g,'&lt;')}</div>
        </div>
        ${row('📍','Adresse',a.address)}
        ${row('📞','Téléphone',a.phone)}
        ${row('✉️','Email',a.email)}
        ${row('🌐','Site web',a.website)}
      ` : `<div class="placeholder" style="padding:20px;">Informations de l'agence indisponibles.</div>`;
    return `
      <button class="btn btn--ghost" data-go="profile" style="text-align:left;margin:0 0 8px;">← Profil</button>
      <div class="rf-card"><div class="rf-card__head"><span class="rf-ic">ℹ️</span> À propos</div>
        <div class="rf-card__body">${body}
          <div class="pf-version" style="margin-top:14px;">AMT Clients · v1.0</div>
        </div>
      </div>`;
  },

  // Écran : changer le code PIN.
  'profile-pin'() {
    return `
      <button class="btn btn--ghost" data-go="profile" style="text-align:left;margin:0 0 8px;">← Profil</button>
      <div class="rf-card"><div class="rf-card__head"><span class="rf-ic">🔒</span> Changer mon code PIN</div>
        <div class="rf-card__body">
          <div class="rf-field rf-field--full"><span class="rf-label">Code PIN actuel</span>
            <input id="pfPinOld" class="rf-input" type="tel" inputmode="numeric" maxlength="4" placeholder="••••"></div>
          <div class="rf-field rf-field--full"><span class="rf-label">Nouveau code (4 chiffres)</span>
            <input id="pfPin1" class="rf-input" type="tel" inputmode="numeric" maxlength="4" placeholder="••••"></div>
          <div class="rf-field rf-field--full"><span class="rf-label">Confirmer le nouveau code</span>
            <input id="pfPin2" class="rf-input" type="tel" inputmode="numeric" maxlength="4" placeholder="••••"></div>
          <div id="pfMsg" class="auth__error" hidden style="margin:10px 0;"></div>
          <button class="btn btn--primary" data-pfsavepin="1">Enregistrer</button>
        </div>
      </div>`;
  }
};

// Profil : verrouiller, se déconnecter, modifier nom, changer PIN.
document.addEventListener('click', async (e) => {
  // VERROUILLER : garde la session Firebase ; retour par code PIN.
  if (e.target && e.target.closest('#btnLock')) {
    appEl.hidden = true; authEl.hidden = false;
    if (localStorage.getItem(LS.registered) === '1' && auth.currentUser) {
      const ph = localStorage.getItem(LS.phone) || (auth.currentUser.phoneNumber || '');
      $('#pinWelcome').textContent = ph ? `Bon retour 👋  (${ph})` : 'Bon retour 👋';
      showStep('pin');
    } else { showStep('phone'); }
    return;
  }
  // SE DÉCONNECTER : ferme la session Firebase + oublie le PIN -> reconnexion SMS.
  if (e.target && e.target.closest('#btnLogout')) {
    const ok = confirm("Se déconnecter ? Vous devrez vous reconnecter par SMS.");
    if (!ok) return;
    try { await signOut(auth); } catch (_) {}
    localStorage.removeItem(LS.registered);
    localStorage.removeItem(LS.pin);
    localStorage.removeItem(LS.phone); // changer de compte : pas de pré-remplissage du n° suivant
    // Réinitialise l'état local pour ne rien laisser fuiter à la prochaine session.
    INVOICES = []; PARCELS = []; NOTIFS = []; REQUESTS = []; chatMessages = []; chatConversations = [];
    invoicesLoaded = false; notifsLoaded = false; requestsLoaded = false; chatLoaded = false;
    clientSelfName = ''; clientSelfAddress = ''; clientAgencies = [];
    clientProfile = { prenom: '', nom: '', photoUrl: '', lang: 'fr' }; clientAbout = null; profileLoaded = false; profilePhotoDraft = null;
    appEl.hidden = true; authEl.hidden = false;
    showStep('phone');
    return;
  }
  // Choisir une photo de profil (compression -> brouillon).
  if (e.target && e.target.closest('[data-pfphoto]')) {
    const input = $('#pfPhotoInput');
    if (!input) return;
    input.onchange = async (ev) => {
      const file = ev.target.files && ev.target.files[0]; ev.target.value = '';
      if (!file) return;
      try { profilePhotoDraft = await compressProfilePhoto(file); renderView('profile-edit'); }
      catch (_) { alert("Image illisible."); }
    };
    input.click();
    return;
  }
  // Retirer la photo (brouillon vide = suppression à l'enregistrement).
  if (e.target && e.target.closest('[data-pfphotodel]')) {
    profilePhotoDraft = ''; renderView('profile-edit'); return;
  }
  // Enregistrer mes informations (prénom + nom + éventuelle photo).
  if (e.target && e.target.closest('[data-pfsaveinfo]')) {
    const msg = $('#pfMsg');
    const showMsg = (m) => { if (msg) { msg.textContent = m; msg.hidden = false; } };
    const prenom = ($('#pfPrenom')?.value || '').trim();
    const nom = ($('#pfNom')?.value || '').trim();
    if (!prenom && !nom) { showMsg('Entrez au moins un prénom ou un nom.'); return; }
    const btn = e.target.closest('[data-pfsaveinfo]'); if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    const payload = { prenom, nom };
    if (profilePhotoDraft !== null) payload.photoUrl = profilePhotoDraft; // '' = retirer
    try {
      const u = auth.currentUser; if (u) { try { await u.getIdToken(true); } catch (_) {} }
      await httpsCallable(functions, 'saveMyProfile')(payload);
      clientProfile.prenom = prenom; clientProfile.nom = nom;
      if (profilePhotoDraft !== null) clientProfile.photoUrl = profilePhotoDraft;
      profilePhotoDraft = null;
      clientSelfName = `${prenom} ${nom}`.trim();
      try { localStorage.setItem(LS.name, clientSelfName); } catch (_) {}
      applyHeaderAvatar();
      renderView('profile');
    } catch (err) {
      console.warn('saveMyProfile:', err && err.code, err && err.message);
      showMsg(err && err.code === 'invalid-argument' ? 'Photo trop lourde, choisissez-en une autre.' : "Enregistrement impossible.");
      if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    }
    return;
  }
  // Changer la langue (FR <-> EN) : préférence enregistrée (app reste en FR pour l'instant).
  if (e.target && e.target.closest('[data-pflang]')) {
    const newLang = clientProfile.lang === 'en' ? 'fr' : 'en';
    clientProfile.lang = newLang;
    renderView('profile');
    try {
      const u = auth.currentUser; if (u) { try { await u.getIdToken(true); } catch (_) {} }
      await httpsCallable(functions, 'saveMyProfile')({ lang: newLang });
    } catch (_) {}
    if (newLang === 'en') alert("Language preference saved. Full English translation is coming soon.");
    return;
  }
  // Enregistrer le nouveau PIN.
  if (e.target && e.target.closest('[data-pfsavepin]')) {
    const msg = $('#pfMsg');
    const showMsg = (m) => { if (msg) { msg.textContent = m; msg.hidden = false; } };
    const old = ($('#pfPinOld')?.value || '').replace(/\D/g, '');
    const p1 = ($('#pfPin1')?.value || '').replace(/\D/g, '');
    const p2 = ($('#pfPin2')?.value || '').replace(/\D/g, '');
    if (pinHash(old) !== localStorage.getItem(LS.pin)) { showMsg('Code PIN actuel incorrect.'); return; }
    if (p1.length !== 4) { showMsg('Le nouveau code doit faire 4 chiffres.'); return; }
    if (p1 !== p2) { showMsg('Les deux nouveaux codes ne correspondent pas.'); return; }
    try { localStorage.setItem(LS.pin, pinHash(p1)); } catch (_) {}
    alert('✅ Code PIN mis à jour.');
    renderView('profile');
    return;
  }
});

// ======================= PWA : service worker =======================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors-ligne non bloquant */ });
  });
}

// Démarrage : géré par onAuthStateChanged (selon la session Firebase + le PIN).
