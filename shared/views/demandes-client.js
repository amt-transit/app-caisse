// Demandes client (dépôt / récupération) émises depuis l'app AMT Clients.
// Le STAFF (départ/arrivée) les voit ici, peut MODIFIER (date/créneau/adresse)
// puis VALIDER. À la validation, un vrai RENDEZ-VOUS (appointments) est créé,
// au statut « confirmé », et la demande passe « traitee ».
//
// Circuit prévu (par lots) :
//   Lot 1 (ICI) : staff voit, modifie, valide -> crée le RDV confirmé.
//   Lot 2/3 (à venir) : aller-retour de confirmation côté client avant création.
//
// Données : collection `client_requests` (créée par les Cloud Functions
// createClientRequest / getMyRequests). Le staff a read/write dessus
// (firestore.rules). Les RDV vont dans getCollectionName('appointments').
import { db } from '../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../agencies-config.js';

export const DemandesClientView = {
  unsub: null,
  requests: [],
  filter: 'en_attente', // 'en_attente' | 'tous' | 'depot' | 'recup'
  editing: null,        // demande en cours de modification

  render(app, container) {
    this.app = app;
    window.app.views = window.app.views || {};
    window.app.views.demandesClient = this;

    const html = `
      <style>
        .dc-page { max-width: 1100px; margin: 0 auto; animation: fadeIn .3s ease; }
        .dc-header { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:20px 24px; margin-bottom:20px; display:flex; align-items:center; gap:16px; }
        .dc-header__icon { font-size:28px; background:#eff6ff; color:#3b82f6; width:56px; height:56px; display:flex; align-items:center; justify-content:center; border-radius:14px; }
        .dc-header__title { margin:0; font-size:22px; font-weight:800; color:#0f172a; }
        .dc-header__sub { margin:4px 0 0; font-size:13px; color:#64748b; }
        .dc-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
        .dc-tab { padding:8px 14px; border:1px solid #e2e8f0; background:#fff; border-radius:20px; font-weight:600; font-size:13px; cursor:pointer; color:#475569; }
        .dc-tab.active { background:#eff6ff; color:#2563eb; border-color:#bfdbfe; }
        .dc-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:16px 18px; margin-bottom:12px; }
        .dc-card__top { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
        .dc-type { padding:4px 10px; border-radius:8px; font-size:11px; font-weight:800; }
        .dc-type--depot { background:#e0f2fe; color:#0284c7; }
        .dc-type--recup { background:#f3e8ff; color:#7e22ce; }
        .dc-badge { padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; }
        .dc-b-att { background:#fef3c7; color:#b45309; }
        .dc-b-mod { background:#dbeafe; color:#1e40af; }
        .dc-b-ok  { background:#dcfce7; color:#166534; }
        .dc-b-ko  { background:#fee2e2; color:#b91c1c; }
        .dc-row { font-size:13px; color:#475569; margin-top:6px; }
        .dc-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
        .dc-btn { padding:8px 14px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; border:1px solid transparent; }
        .dc-btn--ok { background:#10b981; color:#fff; }
        .dc-btn--mod { background:#fff; border-color:#cbd5e1; color:#475569; }
        .dc-btn--ko { background:#fef2f2; border-color:#fecaca; color:#b91c1c; }
        .dc-edit { margin-top:12px; padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .dc-edit label { font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:4px; }
        .dc-edit input, .dc-edit textarea, .dc-edit select { width:100%; box-sizing:border-box; padding:9px 11px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:inherit; }
        .dc-edit .full { grid-column:1 / -1; }
        @media (max-width:640px){ .dc-edit { grid-template-columns:1fr; } }
        .dc-empty { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:40px; text-align:center; color:#64748b; }
      </style>
      <div class="dc-page">
        <div class="dc-header">
          <div class="dc-header__icon">📥</div>
          <div>
            <h1 class="dc-header__title">Demandes des clients</h1>
            <p class="dc-header__sub">Dépôts et récupérations demandés depuis l'app client. Modifiez si besoin, puis validez : un rendez-vous sera créé.</p>
          </div>
        </div>
        <div class="dc-tabs" id="dcTabs"></div>
        <div id="dcList"><div class="dc-empty">Chargement…</div></div>
      </div>
    `;
    const target = container || document.getElementById('contentContainer');
    if (target) target.innerHTML = html;

    this.renderTabs();
    this.loadData();
  },

  renderTabs() {
    const tabs = [
      { k: 'en_attente', l: '⏳ À traiter' },
      { k: 'depot', l: '📦 Dépôts' },
      { k: 'recup', l: '🔄 Récups' },
      { k: 'tous', l: 'Tous' },
    ];
    const el = document.getElementById('dcTabs');
    if (el) el.innerHTML = tabs.map(t =>
      `<button class="dc-tab ${this.filter === t.k ? 'active' : ''}" onclick="window.app.views.demandesClient.setFilter('${t.k}')">${t.l}</button>`
    ).join('');
  },

  setFilter(k) { this.filter = k; this.renderTabs(); this.renderList(); },

  loadData() {
    if (this.unsub) this.unsub();
    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
    // Les demandes sont rattachées à une agence (paris/abidjan) par la Cloud
    // Function (selon l'indicatif du client). On affiche celles de l'agence active.
    const qReq = query(collection(db, 'client_requests'), where('agency', '==', activeAgency));
    this.unsub = onSnapshot(qReq, (snap) => {
      this.requests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      if (this.app && typeof this.app.updateBadges === 'function') this.app.updateBadges();
      this.renderList();
    }, (err) => {
      console.error('Demandes client:', err);
      const list = document.getElementById('dcList');
      if (list) list.innerHTML = `<div class="dc-empty">Erreur de chargement.</div>`;
    });
  },

  filtered() {
    return this.requests.filter(r => {
      if (this.filter === 'tous') return true;
      if (this.filter === 'depot') return r.type === 'depot';
      if (this.filter === 'recup') return r.type === 'recup';
      if (this.filter === 'en_attente') return (r.status || 'en_attente') === 'en_attente';
      return true;
    });
  },

  fdate(d) { try { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; } catch (e) { return d || '—'; } },

  statusBadge(s) {
    const map = {
      en_attente: ['dc-b-att', '⏳ À traiter'],
      modifiee:   ['dc-b-mod', '✏️ Modifiée — attente client'],
      confirmee:  ['dc-b-ok', '✅ Confirmée par le client'],
      traitee:    ['dc-b-ok', '✅ Traitée (RDV créé)'],
      refusee:    ['dc-b-ko', '❌ Refusée'],
    };
    const [cls, lbl] = map[s] || map.en_attente;
    return `<span class="dc-badge ${cls}">${lbl}</span>`;
  },

  renderList() {
    const list = document.getElementById('dcList');
    if (!list) return;
    const rows = this.filtered();
    if (rows.length === 0) {
      list.innerHTML = `<div class="dc-empty">Aucune demande dans cette catégorie.</div>`;
      return;
    }
    list.innerHTML = rows.map(r => this.cardHtml(r)).join('');
  },

  cardHtml(r) {
    const isDepot = r.type === 'depot';
    const typeCls = isDepot ? 'dc-type--depot' : 'dc-type--recup';
    const typeLbl = isDepot ? '📦 DÉPÔT' : '🔄 RÉCUPÉRATION';
    const status = r.status || 'en_attente';
    const where = [r.commune, r.address].filter(Boolean).join(' · ');
    const isEditing = this.editing === r.id;
    const canAct = status === 'en_attente' || status === 'modifiee' || status === 'confirmee';

    const editPanel = isEditing ? `
      <div class="dc-edit">
        <div><label>Date proposée</label><input type="date" id="dcDate_${r.id}" value="${(r.staffDate || r.wantedDate || '').slice(0,10)}"></div>
        <div><label>Créneau</label>
          <select id="dcTime_${r.id}">
            <option ${(r.staffTime||'')==='Matin (10H-12H)'?'selected':''}>Matin (10H-12H)</option>
            <option ${(r.staffTime||'')==='Après-midi (12H-18H)'?'selected':''}>Après-midi (12H-18H)</option>
          </select>
        </div>
        <div class="full"><label>Adresse</label><input type="text" id="dcAddr_${r.id}" value="${(r.address||'').replace(/"/g,'&quot;')}"></div>
        <div class="full"><label>Note du staff (visible par le client)</label><textarea id="dcNote_${r.id}" rows="2" placeholder="Ex : créneau ajusté selon la tournée">${(r.staffNote||'').replace(/</g,'&lt;')}</textarea></div>
        <div class="full" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="dc-btn dc-btn--mod" onclick="window.app.views.demandesClient.cancelEdit()">Annuler</button>
          <button class="dc-btn dc-btn--ok" onclick="window.app.views.demandesClient.saveEdit('${r.id}')">💾 Proposer cette modification</button>
        </div>
      </div>` : '';

    return `
      <div class="dc-card">
        <div class="dc-card__top">
          <span class="dc-type ${typeCls}">${typeLbl}</span>
          ${this.statusBadge(status)}
        </div>
        <div class="dc-row"><b>${r.fullName || 'Client'}</b> · 📞 ${r.phoneE164 || '—'}</div>
        ${where ? `<div class="dc-row">📍 ${where}</div>` : ''}
        <div class="dc-row">🗓️ Souhaité : <b>${this.fdate(r.wantedDate)}</b>${r.staffDate ? ` → Proposé : <b>${this.fdate(r.staffDate)}</b> ${r.staffTime ? '('+r.staffTime+')' : ''}` : ''}</div>
        ${r.description ? `<div class="dc-row">📝 ${r.description}</div>` : ''}
        <div class="dc-row" style="color:#94a3b8;">Reçue le ${this.fdate(r.createdAt)}</div>
        ${canAct ? `
          <div class="dc-actions">
            <button class="dc-btn dc-btn--ok" onclick="window.app.views.demandesClient.validate('${r.id}')">✅ Valider → créer le RDV</button>
            <button class="dc-btn dc-btn--mod" onclick="window.app.views.demandesClient.startEdit('${r.id}')">✏️ Modifier</button>
            <button class="dc-btn dc-btn--ko" onclick="window.app.views.demandesClient.refuse('${r.id}')">❌ Refuser</button>
          </div>` : ''}
        ${editPanel}
      </div>`;
  },

  startEdit(id) { this.editing = id; this.renderList(); },
  cancelEdit() { this.editing = null; this.renderList(); },

  async saveEdit(id) {
    const date = (document.getElementById('dcDate_' + id)?.value || '').trim();
    const time = (document.getElementById('dcTime_' + id)?.value || '').trim();
    const addr = (document.getElementById('dcAddr_' + id)?.value || '').trim();
    const note = (document.getElementById('dcNote_' + id)?.value || '').trim();
    try {
      await updateDoc(doc(db, 'client_requests', id), {
        staffDate: date, staffTime: time, address: addr, staffNote: note,
        status: 'modifiee', updatedAt: new Date().toISOString()
      });
      this.editing = null;
      this.app.showToast("Modification proposée. Le client en sera informé.", "success");
    } catch (e) {
      console.error(e); this.app.showToast("Erreur lors de l'enregistrement.", "error");
    }
  },

  async refuse(id) {
    const ok = window.AppModal ? await window.AppModal.confirm("Refuser cette demande ?", "Refuser", true) : confirm("Refuser cette demande ?");
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'client_requests', id), { status: 'refusee', updatedAt: new Date().toISOString() });
      this.app.showToast("Demande refusée.", "info");
    } catch (e) { console.error(e); this.app.showToast("Erreur.", "error"); }
  },

  // Validation : crée un RDV (appointments) confirmé à partir de la demande,
  // puis marque la demande « traitee ».
  async validate(id) {
    const r = this.requests.find(x => x.id === id);
    if (!r) return;
    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
    const rdvDate = (r.staffDate || r.wantedDate || '').slice(0, 10);
    if (!rdvDate) { this.app.showToast("Aucune date : modifiez d'abord la demande pour fixer une date.", "error"); return; }
    const rdvData = {
      client: r.fullName || 'Client',
      tel: r.phoneE164 || '',
      adresse: r.address || '',
      etage: '',
      acces: 'Aucun',
      codeAcces: '',
      date: rdvDate,
      time: r.staffTime || 'Matin (10H-12H)',
      notes: [r.description, r.staffNote].filter(Boolean).join(' — '),
      rdvType: r.type === 'recup' ? 'RECUPERATION' : 'DEPOT',
      status: 'confirmé',
      agency: activeAgency,
      createdAt: new Date().toISOString(),
      saisiPar: (sessionStorage.getItem('userName') || 'Agent') + ' (demande client)',
      sourceRequestId: id,
    };
    try {
      await addDoc(collection(db, getCollectionName('appointments')), rdvData);
      await updateDoc(doc(db, 'client_requests', id), { status: 'traitee', updatedAt: new Date().toISOString() });
      this.app.showToast("✅ Rendez-vous créé et demande traitée.", "success");
    } catch (e) {
      console.error('Validation demande:', e);
      this.app.showToast("Erreur lors de la création du RDV.", "error");
    }
  },

  destroy() { if (this.unsub) { try { this.unsub(); } catch (e) {} this.unsub = null; } }
};
