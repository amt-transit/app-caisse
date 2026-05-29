// AMT Clients — squelette PWA (Phase 1, étape 1 : démo, sans SMS réel).
// La connexion par SMS Firebase + le vrai chargement des factures seront
// branchés à l'étape suivante. Ici : flux de connexion simulé + navigation.

const LS = {
  registered: 'amtc_registered',
  phone: 'amtc_phone',
  pin: 'amtc_pin',          // démo uniquement (sera remplacé par Firebase)
  name: 'amtc_name'
};

// --- Outils démo ---
const demoHash = (s) => btoa(unescape(encodeURIComponent('amtc:' + s))); // obfuscation démo, NON sécurisé
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Données de démonstration (remplacées par les vraies factures à l'étape 2)
const DEMO_INVOICES = [
  { ref: 'JB-014-AER1', role: 'Expéditeur', dest: 'KONE Awa', date: '2026-05-22', total: 145, paid: 145, status: 'PAYE' },
  { ref: 'JB-011-CTN7', role: 'Expéditeur', dest: 'TRAORE M.', date: '2026-05-18', total: 320, paid: 150, status: 'PARTIEL' },
  { ref: 'AB-208-CTN7', role: 'Destinataire', dest: 'Vous', date: '2026-05-15', total: 90, paid: 0, status: 'IMPAYE' },
  { ref: 'JB-007-AER1', role: 'Expéditeur', dest: 'DIALLO S.', date: '2026-05-09', total: 60, paid: 60, status: 'PAYE' },
  { ref: 'JB-004-CTN6', role: 'Expéditeur', dest: 'YAO K.', date: '2026-05-02', total: 210, paid: 210, status: 'PAYE' },
];

const STATUS_LABEL = { PAYE: 'Payé', PARTIEL: 'Partiel', IMPAYE: 'Impayé' };
const money = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0).replace(/[  ]/g, ' ');
const fdate = (d) => { try { return new Date(d).toLocaleDateString('fr-FR'); } catch (e) { return d; } };

// ======================= CONNEXION (démo) =======================
const authEl = $('#auth');
const appEl = $('#appShell');
let pendingPhone = '';

function showStep(step) {
  $$('.auth__step').forEach(s => s.hidden = (s.dataset.step !== step));
  hideAuthError();
  const focusable = $(`.auth__step[data-step="${step}"] input`);
  if (focusable) setTimeout(() => focusable.focus(), 120);
}
function authError(msg) { const e = $('#authError'); e.textContent = msg; e.hidden = false; }
function hideAuthError() { $('#authError').hidden = true; }

function initAuth() {
  if (localStorage.getItem(LS.registered) === '1') {
    const ph = localStorage.getItem(LS.phone) || '';
    $('#pinWelcome').textContent = ph ? `Bon retour 👋  (${ph})` : 'Bon retour 👋';
    showStep('pin');
  } else {
    showStep('phone');
  }
}

// Étape 1 -> envoi du code (démo : pas de vrai SMS)
$('#btnSendCode').addEventListener('click', () => {
  const cc = $('#dialCode').value;
  const num = ($('#phoneInput').value || '').replace(/[^0-9]/g, '');
  if (num.length < 6) { authError('Numéro invalide.'); return; }
  pendingPhone = cc + ' ' + num;
  $('#sentTo').textContent = 'Envoyé au ' + pendingPhone;
  showStep('code');
});

// Retour modifier numéro
$$('.auth__back').forEach(b => b.addEventListener('click', () => showStep(b.dataset.goto)));

// Étape 2 -> vérifier le code (démo : accepte tout code de 4+ chiffres)
$('#btnVerifyCode').addEventListener('click', () => {
  const code = ($('#codeInput').value || '').replace(/[^0-9]/g, '');
  if (code.length < 4) { authError('Entrez le code reçu (mode démo : 000000).'); return; }
  localStorage.setItem(LS.phone, pendingPhone);
  if (localStorage.getItem(LS.registered) === '1') enterApp();
  else showStep('setpin');
});

// Étape 3 -> enregistrer le PIN
$('#btnSavePin').addEventListener('click', () => {
  const p1 = ($('#pinSet1').value || '').replace(/[^0-9]/g, '');
  const p2 = ($('#pinSet2').value || '').replace(/[^0-9]/g, '');
  if (p1.length !== 4) { authError('Le code PIN doit faire 4 chiffres.'); return; }
  if (p1 !== p2) { authError('Les deux codes ne correspondent pas.'); return; }
  localStorage.setItem(LS.pin, demoHash(p1));
  localStorage.setItem(LS.registered, '1');
  enterApp();
});

// Étape 4 -> déverrouiller par PIN
$('#btnPin').addEventListener('click', () => {
  const p = ($('#pinInput').value || '').replace(/[^0-9]/g, '');
  if (demoHash(p) !== localStorage.getItem(LS.pin)) { authError('Code PIN incorrect.'); return; }
  enterApp();
});
$('#btnForgotPin').addEventListener('click', () => {
  localStorage.removeItem(LS.registered);
  localStorage.removeItem(LS.pin);
  showStep('phone');
});

function enterApp() {
  authEl.hidden = true;
  appEl.hidden = false;
  const ph = localStorage.getItem(LS.phone) || '';
  const init = (localStorage.getItem(LS.name) || 'Client').trim().slice(0, 2).toUpperCase() || (ph.replace(/\D/g, '').slice(-2));
  $('#avatarInit').textContent = init || '👤';
  renderView('dashboard');
}

// ======================= NAVIGATION =======================
const VIEW_TITLES = {
  dashboard: 'Tableau de bord', requests: 'Dépôt / Récupération', quotes: 'Devis',
  stats: 'Statistiques', chat: 'Messagerie', profile: 'Profil'
};

function setActiveTab(view) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
}

function renderView(view) {
  const c = $('#content');
  $('#topTitle').textContent = VIEW_TITLES[view] || 'AMT Clients';
  if (view !== 'profile') setActiveTab(view);
  else $$('.tab').forEach(t => t.classList.remove('active'));
  c.scrollTop = 0;
  c.innerHTML = (VIEWS[view] || VIEWS.dashboard)();
  window.scrollTo(0, 0);
}

$$('.tab').forEach(t => t.addEventListener('click', () => renderView(t.dataset.view)));
$('#btnProfile').addEventListener('click', () => renderView('profile'));
$('#btnNotif').addEventListener('click', () => renderView('dashboard'));

// Délégation : raccourcis du tableau de bord
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) renderView(go.dataset.go);
});

// ======================= VUES (démo) =======================
function invRow(i) {
  const cls = i.status === 'PAYE' ? 'paye' : i.status === 'PARTIEL' ? 'partiel' : 'impaye';
  return `<div class="inv">
    <div class="inv__main">
      <div class="inv__ref">${i.ref} <span class="tagp tagp--${cls}">${STATUS_LABEL[i.status]}</span></div>
      <div class="inv__sub">${i.role} · ${i.dest} · ${fdate(i.date)}</div>
    </div>
    <div class="inv__amt">${money(i.total)}</div>
  </div>`;
}

const VIEWS = {
  dashboard() {
    const last5 = DEMO_INVOICES.slice(0, 5).map(invRow).join('');
    const totalDu = DEMO_INVOICES.reduce((s, i) => s + (i.total - i.paid), 0);
    return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi__v">${DEMO_INVOICES.length}</div><div class="kpi__l">Mes factures</div></div>
        <div class="kpi"><div class="kpi__v">${money(totalDu)}</div><div class="kpi__l">Reste à payer</div></div>
      </div>

      <div class="shortcuts">
        <button class="shortcut" data-go="requests"><span class="shortcut__ic">📦</span><span class="shortcut__tx">Demander un dépôt</span></button>
        <button class="shortcut" data-go="requests"><span class="shortcut__ic">🔄</span><span class="shortcut__tx">Faire récupérer</span></button>
        <button class="shortcut" data-go="quotes"><span class="shortcut__ic">🧾</span><span class="shortcut__tx">Faire un devis</span></button>
        <button class="shortcut" data-go="stats"><span class="shortcut__ic">📊</span><span class="shortcut__tx">Mes statistiques</span></button>
        <button class="shortcut" data-go="dashboard"><span class="shortcut__ic">🔔</span><span class="shortcut__tx">Notifications</span></button>
        <button class="shortcut" data-go="dashboard"><span class="shortcut__ic">🚢</span><span class="shortcut__tx">Prochains départs</span></button>
      </div>

      <div class="card">
        <div class="section-title">5 dernières factures <span class="link" data-go="dashboard">Tout voir →</span></div>
        ${last5}
      </div>
      <p class="placeholder" style="padding:6px;">Données de démonstration — les vraies factures seront reliées à votre numéro à l'étape suivante.</p>
    `;
  },

  requests() {
    return `
      <div class="subtabs">
        <button class="subtab active">Tous</button>
        <button class="subtab">Dépôts</button>
        <button class="subtab">Récups</button>
      </div>
      <button class="btn btn--primary" style="margin-bottom:14px;">+ Nouvelle demande</button>
      <div class="card"><div class="placeholder"><span class="ph-ic">📦</span>Vos demandes de dépôt et de récupération apparaîtront ici, avec leur statut (en attente / validée).</div></div>
    `;
  },

  quotes() {
    return `
      <button class="btn btn--primary" style="margin-bottom:14px;">+ Nouveau devis</button>
      <div class="card"><div class="placeholder"><span class="ph-ic">🧾</span>Créez et retrouvez vos devis ici. Vous pourrez les transformer en demande d'envoi.</div></div>
    `;
  },

  stats() {
    const nb = DEMO_INVOICES.length;
    const colis = 9, paye = 565, impaye = 260, total = paye + impaye;
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

    // Histogramme : nombre de factures par mois (6 derniers mois, démo).
    const months = [
      { l: 'Déc', v: 1 }, { l: 'Jan', v: 0 }, { l: 'Fév', v: 2 },
      { l: 'Mar', v: 1 }, { l: 'Avr', v: 1 }, { l: 'Mai', v: 2 }
    ];
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
        <div class="kpi"><div class="kpi__v">${colis}</div><div class="kpi__l">Colis envoyés</div></div>
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
      <p class="placeholder" style="padding:6px;">Chiffres de démonstration.</p>
    `;
  },

  chat() {
    return `
      <div class="card"><div class="placeholder"><span class="ph-ic">💬</span>Échangez avec AMT Trans'it. Vos messages seront dirigés vers votre agence (départ ou arrivée) selon votre profil.</div></div>
    `;
  },

  profile() {
    const ph = localStorage.getItem(LS.phone) || '—';
    const sent = 6, need = 10; // démo : 6/10 factures vers carton gratuit
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

// Déconnexion (délégation car bouton recréé à chaque rendu)
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'btnLogout') {
    appEl.hidden = true; authEl.hidden = false;
    // On garde l'enregistrement -> retour par PIN.
    initAuth();
  }
});

// ======================= PWA : service worker =======================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors-ligne non bloquant */ });
  });
}

// Démarrage
initAuth();
