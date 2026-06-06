// Chat Clients (côté STAFF) — messages venus de l'app AMT Clients.
// Collection `client_messages` (un doc par message, voir functions/index.js).
// On affiche la liste des clients ayant écrit à l'agence active, et la
// conversation du client sélectionné ; le staff peut répondre (sender:'staff').
import { db } from '../../firebase-config.js';
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, updateDoc, writeBatch, getDocs, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ChatClientsView = {
  unsub: null,
  messages: [],
  selectedTail: null,
  profiles: {},   // phoneTail -> { prenom, nom, photoUrl } (fiche client_profiles)

  render(app, container) {
    this.app = app;
    window.app.views = window.app.views || {};
    window.app.views.chatClients = this;

    const html = `
      <style>
        .cc-page{max-width:1100px;margin:0 auto;animation:fadeIn .3s ease;}
        .cc-head{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 22px;margin-bottom:16px;display:flex;align-items:center;gap:14px;}
        .cc-head__ic{font-size:24px;background:#e0e7ff;color:#4f46e5;width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;}
        .cc-head__t{margin:0;font-size:18px;font-weight:800;color:#0f172a;}
        .cc-head__s{margin:2px 0 0;font-size:12px;color:#64748b;}
        .cc-layout{display:grid;grid-template-columns:300px 1fr;gap:16px;}
        @media(max-width:760px){.cc-layout{grid-template-columns:1fr;}}
        .cc-list{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;max-height:70vh;overflow-y:auto;}
        .cc-conv{padding:12px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;}
        .cc-conv:hover{background:#f8fafc;}
        .cc-conv.active{background:#eef4fb;}
        .cc-conv__n{font-weight:700;color:#1e293b;font-size:14px;}
        .cc-conv__last{font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;}
        .cc-badge{background:#ef4444;color:#fff;border-radius:10px;font-size:11px;font-weight:700;padding:1px 7px;}
        .cc-panel{background:#fff;border:1px solid #e2e8f0;border-radius:14px;display:flex;flex-direction:column;height:70vh;}
        .cc-msgs{flex:1;padding:18px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;background:#f8fafc;}
        .cc-msg{max-width:75%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.45;}
        .cc-msg--client{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;border-bottom-left-radius:4px;}
        .cc-msg--staff{align-self:flex-end;background:#3b82f6;color:#fff;border-bottom-right-radius:4px;}
        .cc-msg__meta{font-size:10px;opacity:.7;margin-bottom:3px;}
        .cc-input{display:flex;gap:10px;padding:14px;border-top:1px solid #e2e8f0;}
        .cc-input textarea{flex:1;border:1px solid #cbd5e1;border-radius:10px;padding:11px;font-family:inherit;font-size:14px;resize:none;outline:none;}
        .cc-send{background:#3b82f6;color:#fff;border:none;border-radius:10px;padding:0 18px;font-weight:700;cursor:pointer;}
        .cc-empty{padding:40px;text-align:center;color:#64748b;}
      </style>
      <div class="cc-page">
        <div class="cc-head">
          <div class="cc-head__ic">💬</div>
          <div><h1 class="cc-head__t">Messagerie clients</h1><p class="cc-head__s">Messages envoyés depuis l'application client à votre agence.</p></div>
        </div>
        <div class="cc-layout">
          <div class="cc-list" id="ccList"><div class="cc-empty">Chargement…</div></div>
          <div class="cc-panel">
            <div class="cc-msgs" id="ccMsgs"><div class="cc-empty">Sélectionnez une conversation.</div></div>
            <div class="cc-input">
              <input type="file" id="ccImgInput" accept="image/*" style="display:none;" onchange="window.app.views.chatClients.handleImage(event)">
              <button class="cc-send" style="background:#f1f5f9;color:#475569;padding:0 14px;" onclick="document.getElementById('ccImgInput').click()" title="Joindre une photo">📷</button>
              <textarea id="ccText" rows="2" placeholder="Votre réponse au client…"></textarea>
              <button class="cc-send" onclick="window.app.views.chatClients.send()">Envoyer</button>
            </div>
          </div>
        </div>
      </div>`;
    const target = container || document.getElementById('contentContainer');
    if (target) target.innerHTML = html;
    this.loadData();
  },

  loadData() {
    if (this.unsub) this.unsub();
    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
    const q = query(collection(db, 'client_messages'), where('agency', '==', activeAgency), limit(1000));
    this.unsub = onSnapshot(q, (snap) => {
      this.messages = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      this.loadProfiles();   // charge photo + nom des clients (fiche client_profiles)
      this.renderList();
      if (this.selectedTail) this.renderConversation();
      if (this.app && typeof this.app.updateBadges === 'function') this.app.updateBadges();
    }, (err) => {
      console.error('Chat clients:', err);
      const l = document.getElementById('ccList'); if (l) l.innerHTML = '<div class="cc-empty">Erreur de chargement.</div>';
    });
  },

  // Charge les fiches profil (photo + nom) des clients présents, une seule fois
  // chacune. Rafraîchit la liste quand de nouveaux profils arrivent.
  async loadProfiles() {
    const tails = [...new Set(this.messages.map(m => m.phoneTail).filter(Boolean))];
    const missing = tails.filter(t => this.profiles[t] === undefined);
    if (!missing.length) return;
    missing.forEach(t => { this.profiles[t] = null; }); // marque « en cours » (évite double fetch)
    let changed = false;
    await Promise.all(missing.map(async (t) => {
      try {
        const d = await getDoc(doc(db, 'client_profiles', t));
        if (d.exists()) { const x = d.data() || {}; this.profiles[t] = { prenom: x.prenom || '', nom: x.nom || '', photoUrl: x.photoUrl || '' }; changed = true; }
      } catch (e) { /* fiche inaccessible : on garde null */ }
    }));
    if (changed) { this.renderList(); if (this.selectedTail) this.renderConversation(); }
  },

  // Nom affichable d'un client : fiche profil > nom du message > téléphone.
  clientName(tail, fallbackName, fallbackPhone) {
    const p = this.profiles[tail];
    const full = p ? `${p.prenom} ${p.nom}`.trim() : '';
    return full || fallbackName || fallbackPhone || ('…' + tail);
  },

  // Avatar HTML (photo de profil ronde, sinon initiales).
  avatarHtml(tail, name) {
    const p = this.profiles[tail];
    const base = 'width:38px;height:38px;border-radius:50%;flex-shrink:0;object-fit:cover;';
    if (p && p.photoUrl) return `<img src="${p.photoUrl}" style="${base}">`;
    const init = (name || '').trim().slice(0, 2).toUpperCase() || '👤';
    return `<div style="${base}display:flex;align-items:center;justify-content:center;background:#e0e7ff;color:#4f46e5;font-weight:800;font-size:13px;">${init}</div>`;
  },

  // Regroupe les messages par client (phoneTail).
  conversations() {
    const map = new Map(); // tail -> {tail, name, phone, last, lastDate, unread}
    for (const m of this.messages) {
      const t = m.phoneTail || '?';
      const c = map.get(t) || { tail: t, name: '', phone: m.phoneE164 || '', last: '', lastDate: '', unread: 0 };
      if (m.sender === 'client' && m.senderName && !c.name) c.name = m.senderName;
      if (m.phoneE164 && !c.phone) c.phone = m.phoneE164;
      c.last = m.text || ''; c.lastDate = m.createdAt || '';
      if (m.sender === 'client' && !m.readByStaff) c.unread++;
      map.set(t, c);
    }
    return Array.from(map.values()).sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)));
  },

  renderList() {
    const el = document.getElementById('ccList');
    if (!el) return;
    const convs = this.conversations();
    if (!convs.length) { el.innerHTML = '<div class="cc-empty">Aucun message client pour le moment.</div>'; return; }
    el.innerHTML = convs.map(c => {
      const nm = this.clientName(c.tail, c.name, c.phone);
      return `
      <div class="cc-conv ${c.tail === this.selectedTail ? 'active' : ''}" onclick="window.app.views.chatClients.select('${c.tail}')" style="display:flex;align-items:center;gap:10px;">
        ${this.avatarHtml(c.tail, nm)}
        <div style="min-width:0;flex:1;">
          <div class="cc-conv__n">${nm}</div>
          <div class="cc-conv__last">${(c.last || '').slice(0, 34)}</div>
        </div>
        ${c.unread ? `<span class="cc-badge">${c.unread}</span>` : ''}
      </div>`; }).join('');
  },

  select(tail) {
    this.selectedTail = tail;
    this.renderList();
    this.renderConversation();
    this.markRead(tail);
  },

  renderConversation() {
    const el = document.getElementById('ccMsgs');
    if (!el) return;
    const conv = this.messages.filter(m => m.phoneTail === this.selectedTail);
    if (!conv.length) { el.innerHTML = '<div class="cc-empty">Aucun message.</div>'; return; }
    const fdate = (d) => { try { return new Date(d).toLocaleString('fr-FR'); } catch (e) { return ''; } };
    const clientNm = this.clientName(this.selectedTail, conv.find(m => m.senderName)?.senderName, conv[0] && conv[0].phoneE164);
    // Index du DERNIER message du STAFF lu par le client (readByClient) -> on
    // affiche « Vu » dessous, comme dans une messagerie.
    let lastSeenStaff = -1;
    conv.forEach((m, i) => { if (m.sender === 'staff' && m.readByClient) lastSeenStaff = i; });
    const bubbles = conv.map((m, idx) => {
      const img = m.imageUrl ? `<img src="${m.imageUrl}" onclick="window.open(this.src,'_blank')" style="max-width:100%;max-height:240px;border-radius:8px;margin-top:${m.text ? '6px' : '0'};cursor:pointer;display:block;">` : '';
      const audio = m.audioUrl ? `<audio controls src="${m.audioUrl}" style="margin-top:6px;max-width:240px;height:38px;display:block;"></audio>` : '';
      const seen = idx === lastSeenStaff ? `<div style="align-self:flex-end;font-size:10px;color:#3b82f6;font-weight:700;margin:2px 2px 0;">Vu ✓✓</div>` : '';
      return `
      <div class="cc-msg cc-msg--${m.sender === 'staff' ? 'staff' : 'client'}">
        <div class="cc-msg__meta">${m.sender === 'staff' ? (m.senderName || 'Agence') : clientNm} · ${fdate(m.createdAt)}</div>
        <div>${(m.text || '').replace(/</g, '&lt;')}</div>${img}${audio}
      </div>${seen}`; }).join('');
    // Bandeau en-tête : avatar + nom + téléphone du client.
    const ph = (conv.find(m => m.phoneE164) || {}).phoneE164 || '';
    const header = `<div style="position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 14px;display:flex;align-items:center;gap:10px;margin:-18px -18px 14px;z-index:1;">
        ${this.avatarHtml(this.selectedTail, clientNm)}
        <div><div style="font-weight:800;color:#0f172a;font-size:14px;">${clientNm}</div>${ph ? `<div style="font-size:12px;color:#64748b;">📞 ${ph}</div>` : ''}</div>
      </div>`;
    el.innerHTML = header + bubbles;
    el.scrollTop = el.scrollHeight;
  },

  async markRead(tail) {
    const unread = this.messages.filter(m => m.phoneTail === tail && m.sender === 'client' && !m.readByStaff);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(m => batch.update(doc(db, 'client_messages', m.id), { readByStaff: true }));
      await batch.commit();
    } catch (e) { /* non bloquant */ }
  },

  async send(imageUrl) {
    if (!this.selectedTail) { this.app.showToast("Sélectionnez une conversation.", "error"); return; }
    const ta = document.getElementById('ccText');
    const text = (ta?.value || '').trim();
    if (!text && !imageUrl) return;
    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
    // On retrouve le numéro complet du client pour le rattachement.
    const any = this.messages.find(m => m.phoneTail === this.selectedTail);
    try {
      await addDoc(collection(db, 'client_messages'), {
        phoneTail: this.selectedTail,
        phoneE164: (any && any.phoneE164) || '',
        agency: activeAgency,
        text,
        imageUrl: imageUrl || '',
        sender: 'staff',
        senderName: sessionStorage.getItem('userName') || 'Agence',
        createdAt: new Date().toISOString(),
        readByClient: false,
        readByStaff: true,
      });
      if (ta) ta.value = '';
    } catch (e) {
      console.error('Envoi réponse client:', e);
      this.app.showToast("Erreur d'envoi.", "error");
    }
  },

  // Photo jointe par le staff : compresse (JPEG 800px, q0.6) puis envoie.
  handleImage(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!this.selectedTail) { this.app.showToast("Sélectionnez d'abord une conversation.", "error"); return; }
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
        this.send(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  destroy() { if (this.unsub) { try { this.unsub(); } catch (e) {} this.unsub = null; } }
};
