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
let calMonth = null;    // 1er du mois affiché par le calendrier
let calAvail = {};      // { 'YYYY-MM-DD': placesRestantes (-1 = jour off) }
let calSelected = '';   // date choisie 'YYYY-MM-DD'
let calCapacity = 80;
// --- Devis (simulateur) ---
let quoteRoutes = null;        // [{id,name,flag,model,tarifs}] chargé une fois
let quoteRoute = '';           // route choisie
let quoteMode = 'maritime';    // 'maritime' | 'aerien'
let quoteAerienType = 'normal';// 'normal' | 'express' (aérien chine)
let quoteItems = [{ desc:'', qty:1, pu:'', vol:'', poids:'', lng:'', lrg:'', haut:'', mode:'poids', parfum:false }];
let quoteResult = null;        // dernier résultat de computeQuote
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
  // Hook post-rendu : le formulaire de demande monte son calendrier + l'adresse.
  if (view === 'requestForm') initRequestForm();
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
  const rtype = e.target.closest('[data-reqtype]');
  if (rtype) { keepFormDraft(); requestFormType = rtype.dataset.reqtype; renderView('requestForm'); return; }
  const rslot = e.target.closest('[data-reqslot]');
  if (rslot) { keepFormDraft(); requestFormSlot = rslot.dataset.reqslot; renderView('requestForm'); return; }
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
});

// Changement de la route de départ (select) dans le simulateur de devis.
document.addEventListener('change', (e) => {
  const qr = e.target.closest('[data-qroute]');
  if (qr) { keepQuoteDraft(); quoteRoute = qr.value; quoteResult = null; renderView('quotes'); }
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
  calSelected = '';
  calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  calAvail = {};
  renderView('requestForm');
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
  import('../../paris/js/views/autocomplete.js').then(({ Autocomplete }) => {
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
    return `
      <button class="btn btn--ghost" data-go="requests" style="text-align:left;margin:0 0 6px;">← Retour</button>

      <div class="rf-card">
        <div class="rf-card__head"><span class="rf-ic">📦</span> Nouvelle demande</div>
        <div class="rf-card__body">
          <div class="rf-id">
            <div class="rf-id__av">${initials}</div>
            <div><div class="rf-id__name">${clientSelfName || 'Expéditeur'}</div><div class="rf-id__sub">📞 ${myPhone}</div></div>
          </div>
          <div class="rf-field rf-field--full">
            <span class="rf-label">Type de demande</span>
            <div class="rf-type">${opt('depot', '📦', 'Dépôt')}${opt('recup', '🔄', 'Récupération')}</div>
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

    // En-tête tarif (transparence) selon contexte.
    let tarifNote = '';
    if (quoteMode === 'maritime' && isChine) tarifNote = `Maritime : ${route.tarifs.cbmChine.toLocaleString('fr-FR')} FCFA / m³`;
    else if (quoteMode === 'maritime') tarifNote = `Maritime : prix par article (en €)`;
    else if (quoteMode === 'aerien' && isChine) tarifNote = `Aérien : ${route.tarifs.kgAerienNormal.toLocaleString('fr-FR')} FCFA/kg (normal) · ${route.tarifs.kgAerienExpress.toLocaleString('fr-FR')} FCFA/kg (express)`;
    else tarifNote = `Aérien : ${route.tarifs.kgStdEur} €/kg · ${route.tarifs.kgParfumEur} €/kg (parfum/alcool)`;

    // Lignes d'articles : les champs varient selon le contexte.
    const itemsHtml = quoteItems.map((it, i) => {
      let fields = '';
      if (quoteMode === 'maritime' && isChine) {
        fields = `
          <div class="rf-field"><span class="rf-label">Volume (m³ / unité)</span><input class="rf-input" type="number" step="0.01" min="0" data-qi="${i}" data-qf="vol" value="${esc(it.vol)}"></div>
          <div class="rf-field"><span class="rf-label">Quantité</span><input class="rf-input" type="number" min="1" data-qi="${i}" data-qf="qty" value="${esc(it.qty)}"></div>`;
      } else if (quoteMode === 'maritime') {
        fields = `
          <div class="rf-field"><span class="rf-label">Prix unitaire (€)</span><input class="rf-input" type="number" step="0.01" min="0" data-qi="${i}" data-qf="pu" value="${esc(it.pu)}"></div>
          <div class="rf-field"><span class="rf-label">Quantité</span><input class="rf-input" type="number" min="1" data-qi="${i}" data-qf="qty" value="${esc(it.qty)}"></div>`;
      } else if (quoteMode === 'aerien' && !isChine && it.mode === 'valeur') {
        fields = `
          <div class="rf-field"><span class="rf-label">Prix unitaire (€)</span><input class="rf-input" type="number" step="0.01" min="0" data-qi="${i}" data-qf="pu" value="${esc(it.pu)}"></div>
          <div class="rf-field"><span class="rf-label">Quantité</span><input class="rf-input" type="number" min="1" data-qi="${i}" data-qf="qty" value="${esc(it.qty)}"></div>`;
      } else {
        // aérien au poids (chine ou paris) : poids + dimensions + qté
        fields = `
          <div class="rf-field"><span class="rf-label">Poids réel (kg)</span><input class="rf-input" type="number" step="0.1" min="0" data-qi="${i}" data-qf="poids" value="${esc(it.poids)}"></div>
          <div class="rf-field"><span class="rf-label">Quantité</span><input class="rf-input" type="number" min="1" data-qi="${i}" data-qf="qty" value="${esc(it.qty)}"></div>
          <div class="rf-field"><span class="rf-label">Long. (cm)</span><input class="rf-input" type="number" min="0" data-qi="${i}" data-qf="lng" value="${esc(it.lng)}"></div>
          <div class="rf-field"><span class="rf-label">Larg. (cm)</span><input class="rf-input" type="number" min="0" data-qi="${i}" data-qf="lrg" value="${esc(it.lrg)}"></div>
          <div class="rf-field"><span class="rf-label">Haut. (cm)</span><input class="rf-input" type="number" min="0" data-qi="${i}" data-qf="haut" value="${esc(it.haut)}"></div>`;
      }
      // Option parfum/alcool (aérien Paris au poids).
      const parfum = (quoteMode === 'aerien' && !isChine && it.mode !== 'valeur')
        ? `<label class="rf-field rf-field--full" style="flex-direction:row;align-items:center;gap:8px;"><input type="checkbox" data-qi="${i}" data-qf="parfum" ${it.parfum ? 'checked' : ''}> <span class="rf-label" style="margin:0;">Parfum / alcool (tarif majoré)</span></label>` : '';
      // Bascule mode valeur/poids (aérien Paris uniquement).
      const modeToggle = (quoteMode === 'aerien' && !isChine)
        ? `<div class="rf-slots" style="margin-bottom:8px;"><button type="button" class="rf-slot${it.mode!=='valeur'?' active':''}" data-qimode="${i}|poids">Au poids</button><button type="button" class="rf-slot${it.mode==='valeur'?' active':''}" data-qimode="${i}|valeur">À la valeur</button></div>` : '';
      const delBtn = quoteItems.length > 1 ? `<button type="button" class="btn btn--ghost" style="font-size:12px;padding:4px 10px;" data-qdel="${i}">🗑 Retirer</button>` : '';
      return `<div class="rf-card" style="margin-bottom:10px;"><div class="rf-card__body">
        <div class="rf-field rf-field--full"><span class="rf-label">Description</span><input class="rf-input" type="text" placeholder="Ex : carton, valise…" data-qi="${i}" data-qf="desc" value="${esc(it.desc)}"></div>
        ${modeToggle}
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
