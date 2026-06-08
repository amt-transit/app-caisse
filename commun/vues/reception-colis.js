// Réception Colis — module routes SaaS (ex. Chine). Suivi du cycle de vie d'un
// colis depuis sa réception à l'entrepôt d'origine jusqu'à l'arrivée. INDÉPENDANT
// de la facture (collection dédiée `receptions` via getCollectionName, isolée par
// route SaaS). Rattachement au client par le NUMÉRO (ancre phoneTail).
// Voir PLAN-RECEPTION-COLIS.md. Passe 1 : réception + liste + pipeline + alerte
// (photo + app Clients en passe 2).
import { db, app } from '../firebase-config.js';
import { collection, doc, addDoc, updateDoc, query, where, getDocs, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { getCollectionName } from '../agencies-config.js';
import { phoneTail } from '../services/phone.js';

// Étapes du cycle de vie (ordre = progression). Le label + l'icône servent à
// l'affichage ; la clé est stockée en base.
// Ordre du cycle de vie. « En attente groupage » vient AVANT « Reçu / regroupé » :
// un colis à grouper accumule ses cartons, puis « Regrouper terminé » -> Reçu
// (SANS facture). La facture n'est exigée que pour passer Reçu -> Chargé conteneur.
const STEPS = [
    { key: 'ATTENTE_GROUPAGE', label: 'En attente groupage', icon: '⏳' },
    { key: 'RECU',             label: 'Reçu / regroupé',     icon: '📥' },
    { key: 'CHARGE_CONTENEUR', label: 'Chargé conteneur',    icon: '📦' },
    { key: 'EMBARQUE',         label: 'Embarqué',            icon: '🚢' },
    { key: 'EN_TRANSIT',       label: 'En transit',          icon: '🌊' },
    { key: 'ARRIVE',           label: 'Arrivé',              icon: '🏁' },
    { key: 'LIVRE',            label: 'Livré',               icon: '✅' },
];
const STEP_LABEL = Object.fromEntries(STEPS.map(s => [s.key, `${s.icon} ${s.label}`]));
// Couleurs par étape (pastilles de statut) — palette douce, lisible.
const STEP_COLORS = {
    ATTENTE_GROUPAGE: { bg: '#fff7ed', fg: '#9a3412' },
    RECU:             { bg: '#eff6ff', fg: '#1d4ed8' },
    CHARGE_CONTENEUR: { bg: '#eef2ff', fg: '#4338ca' },
    EMBARQUE:         { bg: '#ecfeff', fg: '#0e7490' },
    EN_TRANSIT:       { bg: '#f0f9ff', fg: '#0369a1' },
    ARRIVE:           { bg: '#f0fdf4', fg: '#15803d' },
    LIVRE:            { bg: '#dcfce7', fg: '#166534' },
};
const stepBadge = (key) => {
    const c = STEP_COLORS[key] || { bg: '#f1f5f9', fg: '#475569' };
    return `<span style="display:inline-block; background:${c.bg}; color:${c.fg}; padding:4px 11px; border-radius:999px; font-size:11.5px; font-weight:700; white-space:nowrap;">${STEP_LABEL[key] || key}</span>`;
};
// Tant que le colis n'est pas embarqué, il est "à l'entrepôt" (compte pour l'alerte).
const AT_WAREHOUSE = new Set(['ATTENTE_GROUPAGE', 'RECU', 'CHARGE_CONTENEUR']);
const ALERT_DAYS = 30; // seuil "trop long à l'entrepôt" (réglable plus tard)
const PAGE_SIZE = 50;

export const ReceptionColisView = {
    receptions: [],
    filtered: [],
    currentPage: 1,
    unsub: null,

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.receptionColis = this;

        const isAerien = (sessionStorage.getItem('shippingMode') || 'maritime') === 'aerien';
        container.innerHTML = `
            <style>
                .rc-page { --rc-primary: var(--primary-color, #1A3553); --rc-accent:#FDC615; }
                .rc-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; }
                .rc-title { margin:0; color:#0f172a; font-size:23px; font-weight:800; display:flex; align-items:center; gap:12px; }
                .rc-title .rc-ico { width:42px; height:42px; border-radius:12px; background:var(--rc-primary); color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 12px rgba(15,23,42,.18); }
                .rc-mode { font-size:12.5px; font-weight:700; color:var(--rc-primary); background:#fff; border:1.5px solid var(--rc-accent); padding:4px 12px; border-radius:999px; }
                .rc-new { display:inline-flex; align-items:center; gap:8px; padding:11px 18px; border:none; border-radius:10px; background:var(--rc-primary); color:#fff; font-weight:700; font-size:14px; cursor:pointer; box-shadow:0 4px 12px rgba(15,23,42,.18); transition:transform .08s, box-shadow .15s; }
                .rc-new:hover { transform:translateY(-1px); box-shadow:0 6px 16px rgba(15,23,42,.25); }
                .rc-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px; margin-bottom:20px; }
                .rc-stat { position:relative; background:#fff; border:1px solid #e7ebf0; border-radius:14px; padding:16px 18px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,.05); }
                .rc-stat::before { content:''; position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--c,#94a3b8); }
                .rc-stat .rc-stat-lbl { font-size:12.5px; color:#64748b; font-weight:600; margin:0 0 7px; display:flex; align-items:center; gap:7px; }
                .rc-stat .rc-stat-val { font-size:30px; font-weight:800; line-height:1; color:var(--c,#0f172a); }
                .rc-toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
                .rc-toolbar input, .rc-toolbar select { padding:10px 13px; border:1px solid #d4dbe4; border-radius:10px; font-size:14px; background:#fff; transition:border-color .15s, box-shadow .15s; }
                .rc-toolbar input:focus, .rc-toolbar select:focus { outline:none; border-color:var(--rc-primary); box-shadow:0 0 0 3px rgba(26,53,83,.10); }
                .rc-toolbar input { flex:1; min-width:230px; }
                .rc-card { background:#fff; border:1px solid #e7ebf0; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,.05); }
                .rc-table { width:100%; border-collapse:collapse; font-size:13.5px; }
                .rc-table thead th { background:#f8fafc; color:#475569; text-transform:uppercase; font-size:11px; letter-spacing:.04em; font-weight:700; text-align:left; padding:12px 14px; border-bottom:1px solid #e7ebf0; white-space:nowrap; }
                .rc-table tbody td { padding:12px 14px; border-bottom:1px solid #f1f5f9; color:#1e293b; vertical-align:middle; }
                .rc-table tbody tr { transition:background .12s; cursor:pointer; }
                .rc-table tbody tr:hover { background:#f8fbff; }
                .rc-table tbody tr:last-child td { border-bottom:none; }
                .rc-ref { font-weight:700; color:var(--rc-primary); }
                .rc-act { display:inline-flex; align-items:center; gap:4px; padding:6px 10px; border:none; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; }
                .rc-act-go { background:var(--rc-primary); color:#fff; }
                .rc-act-grp { background:#16a34a; color:#fff; }
                .rc-act-ghost { background:#f1f5f9; border:1px solid #d4dbe4; color:#475569; }
                .rc-act-del { background:#fee2e2; color:#b91c1c; }
                .rc-empty { text-align:center; padding:46px 20px; color:#94a3b8; }
            </style>
            <div class="dashboard-container rc-page">
                <div class="rc-head">
                    <h2 class="rc-title"><span class="rc-ico">📥</span> Réception Colis <span class="rc-mode">${isAerien ? '✈️ Aérien' : '🚢 Maritime'}</span></h2>
                    <button class="rc-new" onclick="window.app.views.receptionColis.openForm()">＋ Recevoir un colis</button>
                </div>

                <div class="rc-stats">
                    <div class="rc-stat" style="--c:#1d4ed8;"><p class="rc-stat-lbl">🏭 À l'entrepôt</p><div class="rc-stat-val" id="rcStatWarehouse">0</div></div>
                    <div class="rc-stat" style="--c:#ef4444;"><p class="rc-stat-lbl">🔴 En alerte (> ${ALERT_DAYS} j)</p><div class="rc-stat-val" id="rcStatAlert">0</div></div>
                    <div class="rc-stat" style="--c:#0f172a;"><p class="rc-stat-lbl">📦 Total colis</p><div class="rc-stat-val" id="rcStatTotal">0</div></div>
                </div>

                <div class="rc-toolbar">
                    <input type="text" id="rcSearch" placeholder="🔍 Rechercher (nom, numéro, référence, conteneur…)">
                    <select id="rcFilterStatut">
                        <option value="">Tous les statuts</option>
                        ${STEPS.map(s => `<option value="${s.key}">${s.icon} ${s.label}</option>`).join('')}
                    </select>
                    <select id="rcFilterAlert">
                        <option value="">Tous</option>
                        <option value="alert">🔴 En alerte seulement</option>
                    </select>
                </div>

                <div class="rc-card" style="overflow-x:auto;">
                    <table class="rc-table">
                        <thead>
                            <tr>
                                <th>Réf</th><th>Propriétaire</th><th>Numéro</th>
                                <th style="text-align:center;">${isAerien ? 'Poids' : 'CBM'}</th>
                                <th>Contenu</th>
                                <th>Réception</th><th style="text-align:center;">Durée</th>
                                <th>Statut</th><th style="text-align:center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="rcBody"><tr><td colspan="9" class="rc-empty">Chargement…</td></tr></tbody>
                    </table>
                </div>
                <div id="rcPagination" style="display:flex; justify-content:center; align-items:center; gap:12px; padding:16px 0; flex-wrap:wrap;"></div>

                <div id="rcModalContainer"></div>
            </div>
        `;

        const search = document.getElementById('rcSearch');
        const fStatut = document.getElementById('rcFilterStatut');
        const fAlert = document.getElementById('rcFilterAlert');
        if (search) search.addEventListener('input', () => { this.currentPage = 1; this.applyFilters(); });
        if (fStatut) fStatut.addEventListener('change', () => { this.currentPage = 1; this.applyFilters(); });
        if (fAlert) fAlert.addEventListener('change', () => { this.currentPage = 1; this.applyFilters(); });

        this.subscribe();
    },

    // Écoute en temps réel la collection (isolée par route via getCollectionName).
    subscribe() {
        if (this.unsub) { try { this.unsub(); } catch (_) {} }
        const col = getCollectionName('receptions');
        this.unsub = onSnapshot(query(collection(db, col)), snap => {
            // On filtre isDeleted CÔTÉ CLIENT (les docs sans le champ ne sont pas exclus).
            this.receptions = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => !r.isDeleted);
            // Tri : les plus récents en premier.
            this.receptions.sort((a, b) => (b.dateReception || '').localeCompare(a.dateReception || ''));
            this.applyFilters();
        }, err => console.error('Réception Colis — écoute:', err));
    },

    daysAt(r) {
        if (!r.dateReception) return 0;
        const d = new Date(r.dateReception + 'T00:00:00');
        return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
    },
    isAlert(r) { return AT_WAREHOUSE.has(r.statut || 'RECU') && this.daysAt(r) > ALERT_DAYS; },

    applyFilters() {
        const term = (document.getElementById('rcSearch')?.value || '').toLowerCase().trim();
        const fStatut = document.getElementById('rcFilterStatut')?.value || '';
        const fAlert = document.getElementById('rcFilterAlert')?.value || '';
        this.filtered = this.receptions.filter(r => {
            if (fStatut && (r.statut || 'RECU') !== fStatut) return false;
            if (fAlert === 'alert' && !this.isAlert(r)) return false;
            if (term) {
                const hay = `${r.ownerName || ''} ${r.ownerPhone || ''} ${r.reference || ''} ${r.conteneur || ''} ${r.contenu || ''}`.toLowerCase();
                if (!hay.includes(term)) return false;
            }
            return true;
        });
        // Stats (sur TOUTE la liste, pas la page)
        const elW = document.getElementById('rcStatWarehouse');
        const elA = document.getElementById('rcStatAlert');
        const elT = document.getElementById('rcStatTotal');
        if (elW) elW.textContent = this.receptions.filter(r => AT_WAREHOUSE.has(r.statut || 'RECU')).length;
        if (elA) elA.textContent = this.receptions.filter(r => this.isAlert(r)).length;
        if (elT) elT.textContent = this.receptions.length;
        this.renderList();
    },

    renderList() {
        const tbody = document.getElementById('rcBody');
        if (!tbody) return;
        if (this.filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="rc-empty">Aucun colis 📭</td></tr>';
            const pag = document.getElementById('rcPagination'); if (pag) pag.innerHTML = '';
            return;
        }
        const totalPages = Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;
        const start = (this.currentPage - 1) * PAGE_SIZE;
        const pageItems = this.filtered.slice(start, start + PAGE_SIZE);

        tbody.innerHTML = pageItems.map(r => {
            const statut = r.statut || 'RECU';
            const days = this.daysAt(r);
            const alert = this.isAlert(r);
            const isAer = (r.mode || 'maritime') === 'aerien';
            const idx = STEPS.findIndex(s => s.key === statut);
            const nextStep = idx >= 0 && idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
            let advBtn = '';
            if (statut === 'ATTENTE_GROUPAGE') {
                // Colis groupé : pas d'avancement en un clic — confirmation requise.
                advBtn = `<button class="rc-act rc-act-grp" title="Confirmer que le regroupement est terminé" onclick="window.app.views.receptionColis.advance('${r.id}')">✓ Regrouper</button>`;
            } else if (nextStep) {
                advBtn = `<button class="rc-act rc-act-go" title="Passer à : ${nextStep.label}" onclick="window.app.views.receptionColis.advance('${r.id}')">→ ${nextStep.icon}</button>`;
            }
            const dureeCell = !AT_WAREHOUSE.has(statut) ? '—'
                : (alert
                    ? `<span style="display:inline-flex; align-items:center; gap:4px; background:#fef2f2; color:#b91c1c; font-weight:700; font-size:11.5px; padding:3px 9px; border-radius:999px;">🔴 ${days} j</span>`
                    : `${days} j`);
            return `
                <tr onclick="window.app.views.receptionColis.openDetail('${r.id}')" title="Cliquer pour voir / ajouter les cartons"${alert ? ' style="background:#fff7f7;"' : ''}>
                    <td><span class="rc-ref">${r.reference || '—'}</span></td>
                    <td style="font-weight:600;">${r.ownerName || '—'}${r.groupage === 'attendre' ? ' <span title="En attente de groupage">⏸️</span>' : ''}</td>
                    <td style="color:#64748b;">${r.ownerPhone || ''}</td>
                    <td style="text-align:center; font-weight:600;">${isAer ? (r.poids ? r.poids + ' kg' : '—') : (r.volume ? r.volume + ' m³' : '—')}</td>
                    <td>${r.contenu || '—'}${r.cartons ? ` <span style="color:#94a3b8;">(${r.cartons} cart.)</span>` : ''}</td>
                    <td style="color:#64748b; white-space:nowrap;">${r.dateReception || '—'}</td>
                    <td style="text-align:center;">${dureeCell}</td>
                    <td>${stepBadge(statut)}</td>
                    <td style="text-align:center; white-space:nowrap;" onclick="event.stopPropagation()">
                        <div style="display:inline-flex; gap:5px; align-items:center;">
                            ${advBtn}
                            <button class="rc-act rc-act-ghost" title="Détail" onclick="window.app.views.receptionColis.openDetail('${r.id}')">👁️</button>
                            <button class="rc-act rc-act-del" title="Supprimer" onclick="window.app.views.receptionColis.remove('${r.id}')">🗑️</button>
                        </div>
                    </td>
                </tr>`;
        }).join('');

        this.renderPagination(totalPages);
    },

    renderPagination(totalPages) {
        const el = document.getElementById('rcPagination');
        if (!el) return;
        if (!totalPages || totalPages <= 1) { el.innerHTML = ''; return; }
        const p = this.currentPage;
        const b = (label, target, off) => `<button onclick="window.app.views.receptionColis.goToPage(${target})" ${off ? 'disabled' : ''} style="padding:8px 14px; border:1px solid #cbd5e1; border-radius:8px; background:${off ? '#f1f5f9' : '#fff'}; color:${off ? '#94a3b8' : '#1e293b'}; cursor:${off ? 'default' : 'pointer'}; font-weight:600;">${label}</button>`;
        el.innerHTML = `${b('‹ Précédent', p - 1, p <= 1)}<span style="font-weight:600; color:#475569;">Page ${p} / ${totalPages}</span>${b('Suivant ›', p + 1, p >= totalPages)}`;
    },
    goToPage(p) { this.currentPage = p; this.renderList(); },

    // --- Formulaire « Recevoir un colis » ---
    // Formulaire de RÉCEPTION (création) ET de MODIFICATION (si id fourni).
    openForm(id) {
        const r = id ? this.receptions.find(x => x.id === id) : null;
        const today = new Date().toISOString().slice(0, 10);
        const g = (k, d = '') => { const x = (r && r[k] != null) ? r[k] : d; return String(x); };
        const att = s => String(s).replace(/"/g, '&quot;');
        const sel = (cur, val) => cur === val ? ' selected' : '';
        const grp = g('groupage', 'seul');
        // La réception suit le MODE ACTIF (bascule Maritime/Aérien de l'en-tête),
        // comme le reste du site. Pas de choix par colis (évite les erreurs).
        const activeMode = sessionStorage.getItem('shippingMode') || 'maritime';
        const c = document.getElementById('rcModalContainer');
        if (!c) return;
        c.innerHTML = `
            <div class="modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;" onclick="if(event.target===this) window.app.views.receptionColis.closeForm()">
                <div class="modal-content" style="background:#fff; border-radius:12px; max-width:640px; width:100%; max-height:90vh; overflow:auto; padding:22px;">
                    <h3 style="margin:0 0 16px;">${r ? '✏️ Modifier le colis' : '📥 Recevoir un colis'}</h3>
                    <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <label style="grid-column:1/2;">Propriétaire (nom)*<input id="rcfName" type="text" value="${att(g('ownerName'))}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label style="grid-column:2/3;">Numéro*<input id="rcfPhone" type="tel" value="${att(g('ownerPhone'))}" placeholder="ex: 0700000000" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        ${!r ? (activeMode === 'aerien'
                            ? `<label>Poids unitaire (kg/carton)<input id="rcfPoids" type="number" step="0.1" min="0" value="${g('poids')}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>`
                            : `<label>Volume unitaire (CBM/carton)<input id="rcfVolume" type="number" step="0.001" min="0" value="${g('volume')}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>`) : ''}
                        <label>Mode (suit la bascule)<input type="text" value="${activeMode === 'aerien' ? '✈️ Aérien' : '🚢 Maritime'}" disabled style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px; background:#f1f5f9; color:#475569;"></label>
                        ${!r ? `<label>Nombre de cartons<input id="rcfCartons" type="number" step="1" min="1" value="${g('cartons')}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>` : `<div style="grid-column:1/3; font-size:12px; color:#64748b; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px;">ℹ️ Le CBM/poids et le nombre de cartons se modifient dans la <strong>liste des cartons</strong> (ci-dessous, dans le détail).</div>`}
                        <label style="grid-column:1/3;">Contenu / nature<input id="rcfContenu" type="text" value="${att(g('contenu'))}" placeholder="ex: chaussures, textile…" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Fournisseur (Chine)<input id="rcfFournisseur" type="text" value="${att(g('fournisseur'))}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>N° de suivi Chine<input id="rcfTracking" type="text" value="${att(g('trackingChine'))}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Valeur déclarée<input id="rcfValeur" type="number" step="1" min="0" value="${g('valeurDeclaree')}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Date de réception<input id="rcfDate" type="date" value="${g('dateReception', today)}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label style="grid-column:1/3;">Expédition<select id="rcfGroupage" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"><option value="seul"${sel(grp,'seul')}>Part seul</option><option value="attendre"${sel(grp,'attendre')}>Attend d'autres colis (groupage)</option></select></label>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
                        <button onclick="window.app.views.receptionColis.closeForm()" style="padding:9px 16px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; font-weight:600; cursor:pointer;">Annuler</button>
                        <button class="btn btn-primary" onclick="window.app.views.receptionColis.save(${id ? `'${id}'` : ''})" style="padding:9px 16px; border:none; border-radius:8px; background:#2563eb; color:#fff;">${r ? 'Enregistrer les modifications' : 'Enregistrer la réception'}</button>
                    </div>
                </div>
            </div>
        `;
    },
    closeForm() { const c = document.getElementById('rcModalContainer'); if (c) c.innerHTML = ''; },

    async save(id) {
        const v = elId => (document.getElementById(elId)?.value || '').trim();
        const name = v('rcfName');
        const phone = v('rcfPhone');
        if (!name || !phone) {
            window.AppModal ? window.AppModal.error('Le nom et le numéro du propriétaire sont obligatoires.') : alert('Nom + numéro obligatoires.');
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const groupage = v('rcfGroupage') || 'seul';
        const base = {
            ownerName: name,
            ownerPhone: phone,
            ownerPhoneTail: phoneTail(phone),
            poids: parseFloat(v('rcfPoids')) || 0,
            volume: parseFloat(v('rcfVolume')) || 0,
            mode: sessionStorage.getItem('shippingMode') || 'maritime', // suit la bascule active
            cartons: parseInt(v('rcfCartons'), 10) || 1,
            contenu: v('rcfContenu'),
            fournisseur: v('rcfFournisseur'),
            trackingChine: v('rcfTracking'),
            valeurDeclaree: parseFloat(v('rcfValeur')) || 0,
            groupage,
            dateReception: v('rcfDate') || today,
        };

        // --- MODIFICATION d'un colis déjà reçu (on préserve statut, cartons,
        // historique, facture liée, référence). ---
        if (id) {
            // Modification : on ne met à jour QUE les infos du colis. Le poids/volume
            // et le nombre de cartons viennent des CARTONS (édités dans leur liste) :
            // on n'y touche pas ici.
            const editFields = {
                ownerName: name,
                ownerPhone: phone,
                ownerPhoneTail: phoneTail(phone),
                mode: base.mode,
                contenu: base.contenu,
                fournisseur: base.fournisseur,
                trackingChine: base.trackingChine,
                valeurDeclaree: base.valeurDeclaree,
                groupage: base.groupage,
                dateReception: base.dateReception,
            };
            try {
                await updateDoc(doc(db, getCollectionName('receptions'), id), editFields);
                this.closeForm();
                window.app.showToast && window.app.showToast('Colis modifié ✅');
            } catch (e) {
                console.error('Réception — modification:', e);
                window.AppModal ? window.AppModal.error("Modification impossible.") : alert("Modification impossible.");
            }
            return;
        }

        // --- CRÉATION d'un nouveau colis ---
        const agency = sessionStorage.getItem('currentActiveAgency') || 'chine';
        const initials = (sessionStorage.getItem('userInitials') || name.slice(0, 2)).toUpperCase();
        // Colis à grouper : démarre "En attente groupage".
        const startStatut = groupage === 'attendre' ? 'ATTENTE_GROUPAGE' : 'RECU';
        // Le contenu saisi à la création devient le PREMIER carton : ainsi le
        // poids/volume du colis (= somme des cartons) reste cohérent quand on en
        // ajoute d'autres (sinon le 1er ajout écraserait les données de création).
        const initItems = (base.contenu || base.poids || base.volume) ? [{
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            designation: base.contenu || 'Colis',
            quantite: base.cartons || 1,
            poids: base.poids || 0,   // unitaire (par carton)
            volume: base.volume || 0, // unitaire (par carton)
        }] : [];
        // Total du colis = somme(qté × unitaire).
        const _tP = initItems.reduce((s, it) => s + (Number(it.poids) || 0) * (Number(it.quantite) || 1), 0);
        const _tV = initItems.reduce((s, it) => s + (Number(it.volume) || 0) * (Number(it.quantite) || 1), 0);
        const doc0 = {
            ...base,
            poids: _tP,
            volume: _tV,
            items: initItems,
            statut: startStatut,
            statusHistory: [{ statut: startStatut, date: new Date().toISOString() }],
            reference: `${initials}-${base.dateReception.replace(/-/g, '').slice(2)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            agency,
            isDeleted: false,
            createdAt: serverTimestamp(),
        };
        try {
            await addDoc(collection(db, getCollectionName('receptions')), doc0);
            this.closeForm();
            window.app.showToast && window.app.showToast('Colis reçu ✅');
        } catch (e) {
            console.error('Réception — enregistrement:', e);
            window.AppModal ? window.AppModal.error("Enregistrement impossible.") : alert("Enregistrement impossible.");
        }
    },

    // Faire avancer le colis à l'étape suivante (+ historique horodaté).
    async advance(id) {
        const r = this.receptions.find(x => x.id === id);
        if (!r) return;
        const cur = r.statut || 'RECU';
        const idx = STEPS.findIndex(s => s.key === cur);
        if (idx < 0 || idx >= STEPS.length - 1) return;
        const next = STEPS[idx + 1].key;
        // RÈGLE DE CONTRÔLE : pas de chargement en conteneur sans facture liée
        // (vérification supplémentaire du suivi). Voir setFacture().
        if (next === 'CHARGE_CONTENEUR' && !r.factureRef) {
            const go = window.AppModal
                ? await window.AppModal.confirm("Ce colis n'a pas de facture. Voulez-vous la créer maintenant ? Les infos de réception (client, produits, poids, volume) seront pré-remplies, et la facture sera reliée au colis automatiquement.", 'Créer la facture', false)
                : confirm("Ce colis n'a pas de facture. La créer maintenant ?");
            if (go) this.createFactureFromColis(id);
            return;
        }
        // Colis en attente de groupage : NE PAS avancer en un clic — il faut
        // confirmer explicitement que le regroupement est terminé.
        if (cur === 'ATTENTE_GROUPAGE') {
            const ok = window.AppModal
                ? await window.AppModal.confirm("Le regroupement est-il terminé (tous les cartons du client sont arrivés) ? Le colis passera en « Reçu / regroupé ». La facture sera demandée ensuite, pour le chargement en conteneur.", 'Regroupement terminé ?', false)
                : confirm('Le regroupement est-il terminé ?');
            if (!ok) return;
        }
        const history = Array.isArray(r.statusHistory) ? r.statusHistory.slice() : [];
        history.push({ statut: next, date: new Date().toISOString() });
        try {
            await updateDoc(doc(db, getCollectionName('receptions'), id), { statut: next, statusHistory: history });
        } catch (e) {
            console.error('Réception — avancement:', e);
        }
    },

    openDetail(id) {
        const r = this.receptions.find(x => x.id === id);
        if (!r) return;
        const statut = r.statut || 'RECU';
        const isAerien = (r.mode || 'maritime') === 'aerien'; // mesure affichée selon le mode
        // Produits modifiables tant que le colis n'est pas embarqué.
        const editable = !['EMBARQUE', 'EN_TRANSIT', 'ARRIVE', 'LIVRE'].includes(statut);
        const items = Array.isArray(r.items) ? r.items : [];
        const att = s => String(s == null ? '' : s).replace(/"/g, '&quot;');
        const hist = (r.statusHistory || []).map(h => `<li>${STEP_LABEL[h.statut] || h.statut} — ${new Date(h.date).toLocaleString('fr-FR')}</li>`).join('') || '<li>—</li>';

        // Fil visuel du cycle de vie (étapes franchies en bleu, étape en cours mise en avant).
        const curIdx = STEPS.findIndex(s => s.key === statut);
        const stepper = `
            <div style="display:flex; align-items:flex-start; margin:16px 0 6px; overflow-x:auto; padding-bottom:4px;">
                ${STEPS.map((s, i) => {
                    const done = i <= curIdx, isCur = i === curIdx;
                    return `<div style="flex:1; min-width:64px; text-align:center; position:relative;">
                        ${i > 0 ? `<div style="position:absolute; top:14px; left:-50%; width:100%; height:3px; background:${i <= curIdx ? 'var(--primary-color,#1A3553)' : '#e2e8f0'};"></div>` : ''}
                        <div style="position:relative; z-index:1; width:30px; height:30px; margin:0 auto; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; background:${done ? 'var(--primary-color,#1A3553)' : '#e9edf2'}; color:${done ? '#fff' : '#94a3b8'};${isCur ? ' box-shadow:0 0 0 4px rgba(26,53,83,.15);' : ''}">${done && !isCur ? '✓' : s.icon}</div>
                        <div style="font-size:9.5px; margin-top:5px; color:${isCur ? 'var(--primary-color,#1A3553)' : '#94a3b8'}; font-weight:${isCur ? '700' : '500'}; line-height:1.2;">${s.label}</div>
                    </div>`;
                }).join('')}
            </div>`;

        const rows = items.length
            ? items.map(it => `
                <tr>
                    <td>${editable ? `<input value="${att(it.designation || '')}" onchange="window.app.views.receptionColis.updateProduct('${r.id}','${it.id}','designation',this.value)" style="width:100%; padding:5px; border:1px solid #cbd5e1; border-radius:5px;">` : (it.designation || '')}</td>
                    <td style="text-align:center;">${editable ? `<input type="number" min="1" value="${it.quantite || 1}" onchange="window.app.views.receptionColis.updateProduct('${r.id}','${it.id}','quantite',this.value)" style="width:55px; padding:5px; border:1px solid #cbd5e1; border-radius:5px; text-align:center;">` : (it.quantite || 1)}</td>
                    <td style="text-align:center;">${editable ? `<input type="number" min="0" step="${isAerien ? '0.1' : '0.001'}" value="${isAerien ? (it.poids || 0) : (it.volume || 0)}" onchange="window.app.views.receptionColis.updateProduct('${r.id}','${it.id}','${isAerien ? 'poids' : 'volume'}',this.value)" style="width:75px; padding:5px; border:1px solid #cbd5e1; border-radius:5px; text-align:center;">` : (isAerien ? (it.poids || 0) + ' kg' : (it.volume || 0) + ' m³')}</td>
                    <td style="text-align:center;">${editable ? `<button title="Retirer ce carton" onclick="window.app.views.receptionColis.removeProduct('${r.id}','${it.id}')" style="background:#fee2e2; color:#b91c1c; border:none; padding:3px 7px; border-radius:5px; cursor:pointer;">🗑</button>` : ''}</td>
                </tr>`).join('')
            : '<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:10px;">Aucun carton ajouté</td></tr>';

        const addForm = editable ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; align-items:center;">
                <input id="rcpDesig" placeholder="Désignation*" style="flex:2; min-width:120px; padding:7px; border:1px solid #cbd5e1; border-radius:6px;">
                <input id="rcpQte" type="number" min="1" placeholder="Qté" style="width:60px; padding:7px; border:1px solid #cbd5e1; border-radius:6px;">
                ${isAerien
                    ? '<input id="rcpPoids" type="number" step="0.1" min="0" placeholder="Poids/carton (kg)" style="width:130px; padding:7px; border:1px solid #cbd5e1; border-radius:6px;">'
                    : '<input id="rcpVol" type="number" step="0.001" min="0" placeholder="CBM/carton" style="width:130px; padding:7px; border:1px solid #cbd5e1; border-radius:6px;">'}
                <button onclick="window.app.views.receptionColis.addProduct('${r.id}')" style="background:#2563eb; color:#fff; border:none; padding:7px 12px; border-radius:6px; cursor:pointer;">+ Ajouter</button>
            </div>` : '';

        const groupNote = statut === 'ATTENTE_GROUPAGE'
            ? `<div style="background:#fff7ed; color:#9a3412; padding:8px 12px; border-radius:8px; margin:10px 0; font-size:13px;">⏳ Ce colis attend le regroupement. <strong>Ajoutez ses cartons au fur et à mesure</strong> de leur arrivée à l'entrepôt ; il n'avancera qu'après « ✓ Regroupement terminé » (la facture viendra ensuite).</div>`
            : '';

        const factureBlock = `
            <div style="background:${r.factureRef ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${r.factureRef ? '#86efac' : '#fecaca'}; padding:10px 12px; border-radius:8px; margin:10px 0; font-size:13px;">
                <strong>Facture liée :</strong> ${r.factureRef ? `✅ ${r.factureRef}` : '❌ aucune — requise avant « Chargé conteneur »'}
                ${editable ? `<div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; align-items:center;">
                    ${!r.factureRef ? `<button onclick="window.app.views.receptionColis.createFactureFromColis('${r.id}')" style="background:#16a34a; color:#fff; border:none; padding:7px 12px; border-radius:6px; cursor:pointer;">+ Créer la facture (pré-remplie)</button>` : ''}
                    <input id="rcFactureRef" placeholder="ou n° d'une facture existante" value="${r.factureRef || ''}" style="flex:1; min-width:150px; padding:7px; border:1px solid #cbd5e1; border-radius:6px;">
                    <button onclick="window.app.views.receptionColis.setFacture('${r.id}')" style="background:#2563eb; color:#fff; border:none; padding:7px 12px; border-radius:6px; cursor:pointer;">Lier</button>
                </div>` : ''}
            </div>`;

        const photoBlock = `
            <div style="margin:12px 0; display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                ${r.photoUrl
                    ? `<a href="${r.photoUrl}" target="_blank" rel="noopener"><img src="${r.photoUrl}" loading="lazy" alt="Photo du colis" style="width:92px; height:92px; border-radius:10px; border:1px solid #e2e8f0; object-fit:cover;"></a>`
                    : `<div style="width:92px; height:92px; border-radius:10px; border:1px dashed #cbd5e1; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:26px;">📷</div>`}
                ${editable ? `<label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; background:#f1f5f9; border:1px solid #d4dbe4; color:#334155; padding:8px 14px; border-radius:8px; font-weight:600; font-size:13px;">📷 ${r.photoUrl ? 'Changer la photo' : 'Ajouter une photo'}<input type="file" accept="image/*" onchange="window.app.views.receptionColis.uploadPhoto('${r.id}', this)" style="display:none;"></label>` : ''}
            </div>`;

        const c = document.getElementById('rcModalContainer');
        if (!c) return;
        c.innerHTML = `
            <div class="modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;" onclick="if(event.target===this) window.app.views.receptionColis.closeForm()">
                <div class="modal-content" style="background:#fff; border-radius:12px; max-width:600px; width:100%; max-height:90vh; overflow:auto; padding:22px;">
                    <h3 style="margin:0 0 12px;">Colis ${r.reference || ''}</h3>
                    <p><strong>${r.ownerName}</strong> — ${r.ownerPhone}</p>
                    <p>${isAerien ? '✈️ Aérien' : '🚢 Maritime'} · <strong id="rcDetMeasure">${isAerien ? (r.poids || 0) + ' kg' : (r.volume || 0) + ' m³ (CBM)'}</strong> · <span id="rcDetCartons">${r.cartons || 1}</span> carton(s)</p>
                    <p>Contenu : ${r.contenu || '—'} · Fournisseur : ${r.fournisseur || '—'} · Suivi Chine : ${r.trackingChine || '—'}</p>
                    <p style="color:#64748b; margin:6px 0 0;">Reçu le ${r.dateReception || '—'}</p>
                    ${stepper}
                    ${photoBlock}
                    ${groupNote}
                    ${factureBlock}
                    <h4 style="margin:14px 0 6px;">Cartons / produits ${items.length ? `(${items.length})` : ''}</h4>
                    <div style="background:#f8fafc; padding:6px; border:1px solid #e2e8f0; border-radius:8px;">
                        <p style="margin:0 0 6px; font-size:12px; color:#64748b;">Quand il y a des produits, le poids/volume du colis = somme des produits.</p>
                        <table class="table" style="width:100%; font-size:13px;">
                            <thead><tr><th>Désignation</th><th style="text-align:center;">Qté</th><th style="text-align:center;">${isAerien ? 'Poids/u' : 'CBM/u'}</th><th></th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                        ${addForm}
                    </div>
                    <h4 style="margin:16px 0 6px;">Historique</h4>
                    <ul style="margin:0; padding-left:18px; color:#475569;">${hist}</ul>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:18px; gap:10px;">
                        ${editable ? `<button onclick="window.app.views.receptionColis.openForm('${r.id}')" style="padding:9px 16px; border:none; border-radius:8px; background:#f59e0b; color:#fff; cursor:pointer; font-weight:600;">✏️ Modifier le colis</button>` : '<span></span>'}
                        <button onclick="window.app.views.receptionColis.closeForm()" style="padding:9px 16px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; font-weight:600; cursor:pointer;">Fermer</button>
                    </div>
                </div>
            </div>
        `;
    },

    // Recalcule poids/volume du colis = somme des produits (si produits présents).
    async saveItems(r, items) {
        const upd = { items };
        if (items.length) {
            // La mesure par carton est UNITAIRE -> total = somme(qté × unitaire).
            upd.poids = items.reduce((s, it) => s + (Number(it.poids) || 0) * (Number(it.quantite) || 1), 0);
            upd.volume = items.reduce((s, it) => s + (Number(it.volume) || 0) * (Number(it.quantite) || 1), 0);
            upd.cartons = items.reduce((s, it) => s + (Number(it.quantite) || 0), 0);
        }
        r.items = items; // maj locale immédiate
        if (items.length) { r.poids = upd.poids; r.volume = upd.volume; r.cartons = upd.cartons; }
        try { await updateDoc(doc(db, getCollectionName('receptions'), r.id), upd); }
        catch (e) { console.error('Réception — produits:', e); }
    },

    // Upload de la photo du colis vers Firebase Storage (même mécanique que le
    // logo de facture). L'URL obtenue est stockée sur le colis (photoUrl).
    async uploadPhoto(id, input) {
        const file = input && input.files && input.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type || '')) {
            window.AppModal ? window.AppModal.error('Veuillez choisir une image.') : alert('Image attendue.');
            return;
        }
        window.app.showToast && window.app.showToast('Envoi de la photo…');
        try {
            const path = `receptions/${getCollectionName('receptions')}/${id}`;
            const sref = storageRef(getStorage(app), path);
            await uploadBytes(sref, file);
            const url = await getDownloadURL(sref);
            const r = this.receptions.find(x => x.id === id);
            if (r) r.photoUrl = url;
            await updateDoc(doc(db, getCollectionName('receptions'), id), { photoUrl: url });
            this.openDetail(id);
            window.app.showToast && window.app.showToast('Photo ajoutée ✅');
        } catch (e) {
            console.error('Réception — photo:', e);
            window.AppModal ? window.AppModal.error("Envoi de la photo impossible.") : alert("Envoi impossible.");
        }
    },

    async addProduct(id) {
        const r = this.receptions.find(x => x.id === id);
        if (!r) return;
        const desig = (document.getElementById('rcpDesig')?.value || '').trim();
        if (!desig) { window.app.showToast && window.app.showToast('Désignation obligatoire'); return; }
        const item = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            designation: desig,
            quantite: parseInt(document.getElementById('rcpQte')?.value, 10) || 1,
            poids: parseFloat(document.getElementById('rcpPoids')?.value) || 0,
            volume: parseFloat(document.getElementById('rcpVol')?.value) || 0,
        };
        const items = (Array.isArray(r.items) ? r.items.slice() : []);
        items.push(item);
        await this.saveItems(r, items);
        this.openDetail(id); // re-rend la modale avec le nouveau produit
    },

    async removeProduct(id, itemId) {
        const r = this.receptions.find(x => x.id === id);
        if (!r) return;
        const items = (r.items || []).filter(it => it.id !== itemId);
        await this.saveItems(r, items);
        this.openDetail(id);
    },

    // Édite un carton existant (désignation / quantité / mesure). On met à jour les
    // totaux affichés SANS re-rendre toute la modale, pour ne pas perdre le focus.
    async updateProduct(id, itemId, field, value) {
        const r = this.receptions.find(x => x.id === id);
        if (!r) return;
        const items = (r.items || []).map(it => {
            if (it.id !== itemId) return it;
            const u = { ...it };
            if (field === 'designation') u.designation = value;
            else u[field] = parseFloat(value) || 0;
            return u;
        });
        await this.saveItems(r, items);
        const isAerien = (r.mode || 'maritime') === 'aerien';
        const m = document.getElementById('rcDetMeasure');
        if (m) m.textContent = isAerien ? (r.poids || 0) + ' kg' : (r.volume || 0) + ' m³ (CBM)';
        const c = document.getElementById('rcDetCartons');
        if (c) c.textContent = r.cartons || 1;
    },

    // Lie une facture au colis APRÈS avoir vérifié qu'elle existe dans les
    // transactions de la route. Contrôle requis avant le chargement en conteneur.
    async setFacture(id) {
        const r = this.receptions.find(x => x.id === id);
        if (!r) return;
        const ref = (document.getElementById('rcFactureRef')?.value || '').trim();
        if (!ref) return;
        try {
            const snap = await getDocs(query(collection(db, getCollectionName('transactions')), where('reference', '==', ref)));
            if (snap.empty) {
                window.AppModal ? window.AppModal.error('Facture introuvable (vérifiez le numéro).') : alert('Facture introuvable.');
                return;
            }
            await updateDoc(doc(db, getCollectionName('receptions'), id), { factureRef: ref });
            r.factureRef = ref;
            window.app.showToast && window.app.showToast('Facture liée ✅');
            this.openDetail(id);
        } catch (e) {
            console.error('Réception — lien facture:', e);
        }
    },

    // Phase 1.5 : redirige vers la création de facture PRÉ-REMPLIE avec les
    // données de réception. Le côté facture lit sessionStorage 'rc_prefillFacture'
    // pour remplir le formulaire, et reliera la facture au colis après save.
    createFactureFromColis(id) {
        const r = this.receptions.find(x => x.id === id);
        if (!r) return;
        const prefill = {
            colisId: r.id,
            reception: r.reference || '',
            ownerName: r.ownerName || '',
            ownerPhone: r.ownerPhone || '',
            mode: r.mode || 'maritime',
            poids: r.poids || 0,
            volume: r.volume || 0,
            contenu: r.contenu || '',
            items: Array.isArray(r.items) ? r.items : [],
        };
        try { sessionStorage.setItem('rc_prefillFacture', JSON.stringify(prefill)); } catch (_) {}
        this.closeForm();
        // Routes SaaS (Chine…) : la facturation maritime ET aérien se fait sur
        // « Nouvelle facture » (nouvellefacture.js), qui s'adapte au mode actif et
        // au modèle de la route (factureModel='chine'). facture-aerien.js est
        // réservé à l'aérien PARIS — on ne l'utilise donc PAS ici.
        window.app.renderPage('invoice-new');
    },

    async remove(id) {
        const go = window.AppModal
            ? await window.AppModal.confirm('Supprimer ce colis de la réception ?', 'Supprimer', true)
            : confirm('Supprimer ce colis ?');
        if (!go) return;
        try {
            await updateDoc(doc(db, getCollectionName('receptions'), id), { isDeleted: true });
        } catch (e) {
            console.error('Réception — suppression:', e);
        }
    },
};
