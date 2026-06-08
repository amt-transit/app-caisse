// Suivi Conteneurs — frise de suivi du voyage par CONTENEUR (routes SaaS / maritime).
// Phase 1 (fondation) : AMT saisit le N° RÉEL de la compagnie maritime (ex. MSKU1234567,
// clé future pour ShipsGo) + le navire, et avance les étapes du voyage. Les clients
// verront cette frise plus tard. Socle pour l'automatique (ShipsGo) + WhatsApp.
// Étend la collection `containers` (isolée par route + mode via getCollectionName) :
// champs ajoutés realContainerNo, vesselName, bl, eta, trackingStatus, trackingHistory.
import { db, functions } from '../../../commun/firebase-config.js';
import { collection, doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";
import { getCollectionName } from '../../../commun/agencies-config.js';

// Étapes du voyage d'un conteneur (ordre = progression).
const STEPS = [
    { key: 'PREPARATION',     label: 'En préparation',     icon: '📦' },
    { key: 'CHARGE',          label: 'Chargé / scellé',    icon: '🔒' },
    { key: 'EMBARQUE',        label: 'Embarqué',           icon: '🚢' },
    { key: 'EN_TRANSIT',      label: 'En transit',         icon: '🌊' },
    { key: 'TRANSBORDEMENT',  label: 'Transbordement',     icon: '⚓' },
    { key: 'ARRIVE',          label: 'Arrivé au port',     icon: '🏁' },
    { key: 'DEDOUANE',        label: 'Dédouané',           icon: '📋' },
    { key: 'LIVRAISON',       label: 'En livraison',       icon: '🚚' },
];
const STEP_LABEL = Object.fromEntries(STEPS.map(s => [s.key, `${s.icon} ${s.label}`]));
const STEP_COLORS = {
    PREPARATION:    { bg: '#f1f5f9', fg: '#475569' },
    CHARGE:         { bg: '#fff7ed', fg: '#9a3412' },
    EMBARQUE:       { bg: '#eff6ff', fg: '#1d4ed8' },
    EN_TRANSIT:     { bg: '#f0f9ff', fg: '#0369a1' },
    TRANSBORDEMENT: { bg: '#faf5ff', fg: '#7e22ce' },
    ARRIVE:         { bg: '#f0fdf4', fg: '#15803d' },
    DEDOUANE:       { bg: '#ecfeff', fg: '#0e7490' },
    LIVRAISON:      { bg: '#dcfce7', fg: '#166534' },
};
const stepBadge = (key) => {
    const c = STEP_COLORS[key] || { bg: '#f1f5f9', fg: '#475569' };
    return `<span style="display:inline-block; background:${c.bg}; color:${c.fg}; padding:4px 11px; border-radius:999px; font-size:11.5px; font-weight:700; white-space:nowrap;">${STEP_LABEL[key] || key}</span>`;
};
const att = s => String(s == null ? '' : s).replace(/"/g, '&quot;');

export const SuiviConteneursView = {
    containers: [],
    filtered: [],
    unsub: null,

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.suiviConteneurs = this;
        const isAerien = (sessionStorage.getItem('shippingMode') || 'maritime') === 'aerien';

        container.innerHTML = `
            <style>
                .sc-page { --sc-primary: var(--primary-color, #1A3553); }
                .sc-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; }
                .sc-title { margin:0; color:#0f172a; font-size:23px; font-weight:800; display:flex; align-items:center; gap:12px; }
                .sc-title .sc-ico { width:42px; height:42px; border-radius:12px; background:var(--sc-primary); color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 12px rgba(15,23,42,.18); }
                .sc-mode { font-size:12.5px; font-weight:700; color:var(--sc-primary); background:#fff; border:1.5px solid #FDC615; padding:4px 12px; border-radius:999px; }
                .sc-toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
                .sc-toolbar input, .sc-toolbar select { padding:10px 13px; border:1px solid #d4dbe4; border-radius:10px; font-size:14px; background:#fff; }
                .sc-toolbar input:focus, .sc-toolbar select:focus { outline:none; border-color:var(--sc-primary); box-shadow:0 0 0 3px rgba(26,53,83,.10); }
                .sc-toolbar input { flex:1; min-width:230px; }
                .sc-card { background:#fff; border:1px solid #e7ebf0; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,.05); }
                .sc-table { width:100%; border-collapse:collapse; font-size:13.5px; }
                .sc-table thead th { background:#f8fafc; color:#475569; text-transform:uppercase; font-size:11px; letter-spacing:.04em; font-weight:700; text-align:left; padding:12px 14px; border-bottom:1px solid #e7ebf0; white-space:nowrap; }
                .sc-table tbody td { padding:12px 14px; border-bottom:1px solid #f1f5f9; color:#1e293b; vertical-align:middle; }
                .sc-table tbody tr { transition:background .12s; cursor:pointer; }
                .sc-table tbody tr:hover { background:#f8fbff; }
                .sc-table tbody tr:last-child td { border-bottom:none; }
                .sc-code { font-weight:700; color:var(--sc-primary); }
                .sc-real { font-family:monospace; font-weight:700; }
                .sc-empty { text-align:center; padding:46px 20px; color:#94a3b8; }
                .sc-act { display:inline-flex; align-items:center; gap:4px; padding:6px 11px; border:none; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; background:var(--sc-primary); color:#fff; }
            </style>
            <div class="dashboard-container sc-page">
                <div class="sc-head">
                    <h2 class="sc-title"><span class="sc-ico">🛰️</span> Suivi Conteneurs <span class="sc-mode">${isAerien ? '✈️ Aérien' : '🚢 Maritime'}</span></h2>
                </div>
                <div class="sc-toolbar">
                    <input type="text" id="scSearch" placeholder="🔍 Rechercher (code, n° réel, navire, destination…)">
                    <select id="scFilterStep">
                        <option value="">Toutes les étapes</option>
                        ${STEPS.map(s => `<option value="${s.key}">${s.icon} ${s.label}</option>`).join('')}
                    </select>
                </div>
                <div class="sc-card" style="overflow-x:auto;">
                    <table class="sc-table">
                        <thead>
                            <tr>
                                <th>Code interne</th><th>N° réel (compagnie)</th><th>Navire</th>
                                <th>Destination</th><th>Étape de suivi</th><th>Arrivée prévue</th><th style="text-align:center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="scBody"><tr><td colspan="7" class="sc-empty">Chargement…</td></tr></tbody>
                    </table>
                </div>
                <div id="scModalContainer"></div>
            </div>
        `;

        const search = document.getElementById('scSearch');
        const fStep = document.getElementById('scFilterStep');
        if (search) search.addEventListener('input', () => this.applyFilters());
        if (fStep) fStep.addEventListener('change', () => this.applyFilters());

        this.subscribe();
    },

    subscribe() {
        if (this.unsub) this.unsub();
        const col = getCollectionName('containers');
        this.unsub = onSnapshot(collection(db, col), snap => {
            this.containers = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.isDeleted);
            this.applyFilters();
            if (!this._autoRefreshed) { this._autoRefreshed = true; this.autoRefreshShipsgo(); }
        }, err => console.error('Suivi conteneurs — écoute:', err));
    },

    // Rafraîchit en arrière-plan (GET ShipsGo, SANS crédit) les conteneurs déjà suivis
    // mais non peuplés (ex. "INPROGRESS" après création du bateau) ou anciens (> 6 h).
    async autoRefreshShipsgo() {
        const coll = getCollectionName('containers');
        const STALE = 6 * 3600 * 1000, now = Date.now();
        const need = this.containers.filter(c =>
            c.shipsgoShipmentId && (c.trackingStatus || 'PREPARATION') !== 'LIVRAISON' &&
            /^[A-Z]{4}[0-9]{7}$/.test(String(c.realContainerNo || '').toUpperCase()) &&
            (!c.vesselName || !c.eta || !c.shipsgoSyncedAt || (now - new Date(c.shipsgoSyncedAt).getTime()) > STALE || ['ARRIVE', 'DEDOUANE'].includes(c.trackingStatus))
        ).slice(0, 15);
        if (!need.length) return;
        const sync = httpsCallable(functions, 'shipsgoSync');
        for (const c of need) {
            try { await sync({ collection: coll, id: c.id, containerNumber: c.realContainerNo }); }
            catch (e) { console.warn('ShipsGo refresh:', c.id, e && e.message); }
        }
    },

    applyFilters() {
        const q = (document.getElementById('scSearch')?.value || '').toLowerCase().trim();
        const step = document.getElementById('scFilterStep')?.value || '';
        this.filtered = this.containers.filter(c => {
            if (step && (c.trackingStatus || 'PREPARATION') !== step) return false;
            if (!q) return true;
            return [c.id, c.number, c.realContainerNo, c.vesselName, c.destination, c.destinationAgency]
                .some(v => String(v || '').toLowerCase().includes(q));
        }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        this.renderList();
    },

    renderList() {
        const tb = document.getElementById('scBody');
        if (!tb) return;
        if (!this.filtered.length) {
            tb.innerHTML = '<tr><td colspan="7" class="sc-empty">Aucun conteneur 📦</td></tr>';
            return;
        }
        tb.innerHTML = this.filtered.map(c => {
            const statut = c.trackingStatus || 'PREPARATION';
            const idx = STEPS.findIndex(s => s.key === statut);
            const next = idx >= 0 && idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
            const code = c.number || c.id || '—';
            return `
                <tr onclick="window.app.views.suiviConteneurs.openDetail('${c.id}')" title="Voir / mettre à jour le suivi">
                    <td><span class="sc-code">${code}</span></td>
                    <td>${c.realContainerNo ? `<span class="sc-real">${c.realContainerNo}</span>` : '<span style="color:#f59e0b;">à saisir</span>'}</td>
                    <td>${c.vesselName || '—'}</td>
                    <td style="color:#64748b;">${c.destination || c.destinationAgency || '—'}</td>
                    <td>${stepBadge(statut)}</td>
                    <td style="color:#64748b; white-space:nowrap;">${c.eta || '—'}</td>
                    <td style="text-align:center; white-space:nowrap;">
                        ${c.shipsgoShipmentId ? '<span title="Suivi automatique ShipsGo actif" style="color:#0e7490;">🛰️</span>' : '<span title="Suivi non lancé" style="color:#cbd5e1;">—</span>'}
                    </td>
                </tr>`;
        }).join('');
    },

    openDetail(id) {
        const c = this.containers.find(x => x.id === id);
        if (!c) return;
        const statut = c.trackingStatus || 'PREPARATION';
        const curIdx = STEPS.findIndex(s => s.key === statut);
        const code = c.number || c.id || '';
        const hist = (c.trackingHistory || []).map(h => `<li>${STEP_LABEL[h.key] || h.key} — ${new Date(h.date).toLocaleString('fr-FR')}</li>`).join('') || '<li>—</li>';

        // Fil visuel du voyage.
        const stepper = `
            <div style="display:flex; align-items:flex-start; margin:16px 0 6px; overflow-x:auto; padding-bottom:4px;">
                ${STEPS.map((s, i) => {
                    const done = i <= curIdx, isCur = i === curIdx;
                    return `<div style="flex:1; min-width:78px; text-align:center; position:relative;" title="${s.label}">
                        ${i > 0 ? `<div style="position:absolute; top:14px; left:-50%; width:100%; height:3px; background:${i <= curIdx ? 'var(--primary-color,#1A3553)' : '#e2e8f0'};"></div>` : ''}
                        <div style="position:relative; z-index:1; width:30px; height:30px; margin:0 auto; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; background:${done ? 'var(--primary-color,#1A3553)' : '#e9edf2'}; color:${done ? '#fff' : '#94a3b8'};${isCur ? ' box-shadow:0 0 0 4px rgba(26,53,83,.15);' : ''}">${done && !isCur ? '✓' : s.icon}</div>
                        <div style="font-size:9.5px; margin-top:5px; color:${isCur ? 'var(--primary-color,#1A3553)' : '#94a3b8'}; font-weight:${isCur ? '700' : '500'}; line-height:1.2;">${s.label}</div>
                    </div>`;
                }).join('')}
            </div>`;

        const m = document.getElementById('scModalContainer');
        if (!m) return;
        m.innerHTML = `
            <div class="modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;" onclick="if(event.target===this) window.app.views.suiviConteneurs.closeModal()">
                <div class="modal-content" style="background:#fff; border-radius:12px; max-width:640px; width:100%; max-height:90vh; overflow:auto; padding:22px;">
                    <h3 style="margin:0 0 4px;">📦 Conteneur ${code}</h3>
                    <p style="color:#64748b; margin:0 0 12px;">Statut logistique : ${c.status || '—'}</p>

                    <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <label style="grid-column:1/3;">N° de conteneur réel (compagnie maritime)*
                            <input id="scReal" type="text" value="${att(c.realContainerNo)}" placeholder="ex: MSKU1234567" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px; font-family:monospace; text-transform:uppercase;"></label>
                        <label>Navire<input id="scVessel" type="text" value="${att(c.vesselName)}" placeholder="ex: MSC OSCAR" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>N° de BL<input id="scBl" type="text" value="${att(c.bl)}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label style="grid-column:1/3;">Arrivée prévue (ETA)<input id="scEta" type="date" value="${att(c.eta)}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                    </div>
                    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; margin-top:10px;">
                        <button onclick="window.app.views.suiviConteneurs.syncShipsgo('${c.id}')" style="background:#0e7490; color:#fff; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;" title="Remplir automatiquement le suivi depuis ShipsGo (consomme 1 crédit)">🛰️ Suivre via ShipsGo (auto)</button>
                        <button onclick="window.app.views.suiviConteneurs.saveInfo('${c.id}')" style="background:#2563eb; color:#fff; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">💾 Enregistrer les infos</button>
                    </div>

                    <h4 style="margin:18px 0 4px;">Voyage</h4>
                    <p style="margin:0 0 4px; font-size:12px; color:#64748b;">🛰️ Étapes mises à jour <strong>automatiquement</strong> par le suivi ShipsGo (lecture seule).</p>
                    ${stepper}

                    <h4 style="margin:16px 0 6px;">Historique</h4>
                    <ul style="margin:0; padding-left:18px; color:#475569;">${hist}</ul>

                    <h4 style="margin:18px 0 6px;">🗺️ Carte du navire ${c.vesselName ? '— ' + c.vesselName : ''}</h4>
                    ${c.vesselImo ? `
                        <iframe src="/commun/carte-navire.html?imo=${encodeURIComponent(c.vesselImo)}" style="width:100%; height:320px; border:1px solid #cbd5e1; border-radius:10px;" loading="lazy" title="Position du navire"></iframe>
                        <div style="margin-top:6px;"><a href="https://www.vesselfinder.com/?imo=${encodeURIComponent(c.vesselImo)}" target="_blank" rel="noopener" style="font-size:13px; color:#0e7490;">Ouvrir la carte en grand ↗</a></div>
                    ` : `<p style="margin:0; font-size:13px; color:#94a3b8;">La carte du navire s'affiche dès que le suivi ShipsGo est récupéré (navire + IMO).</p>`}

                    <div style="display:flex; justify-content:flex-end; margin-top:18px;">
                        <button onclick="window.app.views.suiviConteneurs.closeModal()" style="padding:9px 16px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; font-weight:600; cursor:pointer;">Fermer</button>
                    </div>
                </div>
            </div>
        `;
    },

    closeModal() { const m = document.getElementById('scModalContainer'); if (m) m.innerHTML = ''; },

    async saveInfo(id) {
        const v = elId => (document.getElementById(elId)?.value || '').trim();
        const upd = {
            realContainerNo: v('scReal').toUpperCase(),
            vesselName: v('scVessel'),
            bl: v('scBl'),
            eta: v('scEta'),
        };
        try {
            await updateDoc(doc(db, getCollectionName('containers'), id), upd);
            window.app.showToast && window.app.showToast('Infos enregistrées ✅');
        } catch (e) {
            console.error('Suivi conteneurs — infos:', e);
            window.AppModal ? window.AppModal.error("Enregistrement impossible.") : alert("Enregistrement impossible.");
        }
    },

    // Remplissage AUTOMATIQUE du suivi via ShipsGo (fonction serveur, clé secrète).
    async syncShipsgo(id) {
        const c = this.containers.find(x => x.id === id);
        if (!c) return;
        const real = (document.getElementById('scReal')?.value || c.realContainerNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!/^[A-Z]{4}[0-9]{7}$/.test(real)) {
            window.AppModal ? window.AppModal.error("Saisis d'abord un n° de conteneur réel valide (ex. MSKU1234567).") : alert("N° réel invalide.");
            return;
        }
        window.app.showToast && window.app.showToast('Interrogation de ShipsGo… ⏳');
        try {
            await updateDoc(doc(db, getCollectionName('containers'), id), { realContainerNo: real });
            const fn = httpsCallable(functions, 'shipsgoSync');
            const res = await fn({ collection: getCollectionName('containers'), id, containerNumber: real });
            const d = (res && res.data) || {};
            const st = String(d.status || '').toUpperCase();
            if (st === 'INPROGRESS' || st === 'PENDING' || (!d.vessel && !d.eta)) {
                window.app.showToast && window.app.showToast('🛰️ ShipsGo récupère les données du transporteur… réessaie dans 1-2 min (sans recoût).');
            } else {
                window.app.showToast && window.app.showToast(`ShipsGo ✅ ${d.vessel ? d.vessel + ' — ' : ''}ETA ${d.eta || '?'}`);
            }
            setTimeout(() => this.openDetail(id), 600);
        } catch (e) {
            console.error('ShipsGo sync:', e);
            const msg = (e && e.message) || 'Erreur ShipsGo.';
            window.AppModal ? window.AppModal.error(`ShipsGo : ${msg}`) : alert(`ShipsGo : ${msg}`);
        }
    },

    // Avance à l'étape suivante (depuis la liste).
    async advance(id) {
        const c = this.containers.find(x => x.id === id);
        if (!c) return;
        const cur = c.trackingStatus || 'PREPARATION';
        const idx = STEPS.findIndex(s => s.key === cur);
        if (idx < 0 || idx >= STEPS.length - 1) return;
        await this.setStep(id, STEPS[idx + 1].key, true);
    },

    // Marque une étape précise comme atteinte (date du jour) + l'historise.
    async setStep(id, key, silent) {
        const c = this.containers.find(x => x.id === id);
        if (!c) return;
        const history = Array.isArray(c.trackingHistory) ? c.trackingHistory.slice() : [];
        if (!history.some(h => h.key === key)) history.push({ key, date: new Date().toISOString() });
        try {
            await updateDoc(doc(db, getCollectionName('containers'), id), { trackingStatus: key, trackingHistory: history });
            if (!silent) this.openDetail(id);
            window.app.showToast && window.app.showToast('Étape mise à jour ✅');
        } catch (e) {
            console.error('Suivi conteneurs — étape:', e);
            window.AppModal ? window.AppModal.error("Mise à jour impossible.") : alert("Mise à jour impossible.");
        }
    },
};
