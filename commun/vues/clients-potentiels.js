// Clients potentiels (côté STAFF) — nouveaux comptes créés sur l'app AMT
// Clients. Collection `client_leads` (1 doc par phoneTail, créé par la Cloud
// Function registerClientLead). Liste temps réel, plus récents d'abord, badge
// rouge pour les non-lus ; ouverture de la page = marquer comme lus.
import { db } from '../firebase-config.js';
import { collection, query, onSnapshot, limit, doc, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ClientsPotentielsView = {
  unsub: null,
  leads: [],

  render(app, container) {
    this.app = app;
    window.app.views = window.app.views || {};
    window.app.views.clientsPotentiels = this;

    const html = `
      <style>
        .cp-page{max-width:920px;margin:0 auto;animation:fadeIn .3s ease;}
        .cp-head{background:linear-gradient(135deg,#1A3553,#13283F);color:#fff;border-radius:16px;padding:20px 24px;margin-bottom:16px;border-bottom:3px solid #FDC615;}
        .cp-head h1{margin:0;font-size:19px;font-weight:800;display:flex;align-items:center;gap:10px;}
        .cp-head p{margin:6px 0 0;font-size:13px;opacity:.85;}
        .cp-list{display:flex;flex-direction:column;gap:10px;}
        .cp-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:14px;}
        .cp-card.new{border-color:#fecaca;background:#fff7f7;}
        .cp-av{width:46px;height:46px;border-radius:50%;background:#e0e7ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex-shrink:0;}
        .cp-info{flex:1;min-width:0;}
        .cp-name{font-weight:800;color:#0f172a;font-size:15px;display:flex;align-items:center;gap:8px;}
        .cp-sub{font-size:12.5px;color:#64748b;margin-top:2px;}
        .cp-badge{background:#ef4444;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;}
        .cp-tag{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;}
        .cp-tag--lead{background:#fef3c7;color:#b45309;}
        .cp-tag--client{background:#dcfce7;color:#166534;}
        .cp-actions{display:flex;gap:8px;}
        .cp-actions a{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:15px;}
        .cp-wa{background:#dcfce7;color:#16a34a;} .cp-call{background:#e0e7ff;color:#4f46e5;}
        .cp-empty{text-align:center;color:#64748b;padding:50px 20px;background:#fff;border:1px dashed #cbd5e1;border-radius:14px;}
      </style>
      <div class="cp-page">
        <div class="cp-head">
          <h1>🌟 Clients potentiels</h1>
          <p>Chaque personne qui crée un compte sur l'application Client apparaît ici. Contactez-les pour les accueillir et les convertir. Les nouveaux sont en rouge.</p>
        </div>
        <div class="cp-list" id="cpList"><div class="cp-empty">Chargement…</div></div>
      </div>`;
    const target = container || document.getElementById('contentContainer');
    if (target) target.innerHTML = html;
    this.load();
  },

  load() {
    if (this.unsub) this.unsub();
    const q = query(collection(db, 'client_leads'), limit(500));
    this.unsub = onSnapshot(q, (snap) => {
      this.leads = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      this.renderList();
      this.markAllRead();
      if (this.app && typeof this.app.updateBadges === 'function') this.app.updateBadges();
    }, (err) => {
      console.error('Clients potentiels:', err);
      const el = document.getElementById('cpList');
      if (el) el.innerHTML = '<div class="cp-empty">Erreur de chargement.</div>';
    });
  },

  fdate(d) { try { return new Date(d).toLocaleString('fr-FR'); } catch (e) { return ''; } },

  renderList() {
    const el = document.getElementById('cpList');
    if (!el) return;
    if (!this.leads.length) { el.innerHTML = '<div class="cp-empty">Aucun nouveau client pour le moment. Ils apparaîtront ici dès qu\'une personne crée un compte sur l\'app.</div>'; return; }
    el.innerHTML = this.leads.map(l => {
      const name = `${l.prenom || ''} ${l.nom || ''}`.trim();
      const phone = l.phoneE164 || ('…' + (l.phoneTail || ''));
      const init = (name ? name.slice(0, 2) : (l.phoneTail || '?').slice(-2)).toUpperCase();
      const isNew = !l.readByStaff;
      const waNum = String(l.phoneE164 || '').replace(/\D/g, '');
      const tag = l.hasInvoices
        ? '<span class="cp-tag cp-tag--client">Client existant</span>'
        : '<span class="cp-tag cp-tag--lead">Nouveau prospect</span>';
      return `
      <div class="cp-card ${isNew ? 'new' : ''}">
        <div class="cp-av">${init}</div>
        <div class="cp-info">
          <div class="cp-name">${name || 'Nouveau client'} ${isNew ? '<span class="cp-badge">NOUVEAU</span>' : ''}</div>
          <div class="cp-sub">📞 ${phone} · inscrit le ${this.fdate(l.createdAt)} · ${tag}</div>
        </div>
        <div class="cp-actions">
          ${waNum ? `<a class="cp-wa" href="https://wa.me/${waNum}" target="_blank" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}
          ${waNum ? `<a class="cp-call" href="tel:+${waNum}" title="Appeler"><i class="fas fa-phone"></i></a>` : ''}
        </div>
      </div>`;
    }).join('');
  },

  // Ouvrir la page = marquer les nouveaux comme lus (efface le badge rouge).
  async markAllRead() {
    const unread = this.leads.filter(l => !l.readByStaff);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(l => batch.update(doc(db, 'client_leads', l.id), { readByStaff: true }));
      await batch.commit();
    } catch (e) { /* non bloquant */ }
  },

  destroy() { if (this.unsub) { try { this.unsub(); } catch (e) {} this.unsub = null; } }
};
