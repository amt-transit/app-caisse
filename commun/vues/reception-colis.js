// Réception Colis — module routes SaaS (ex. Chine). Suivi du cycle de vie d'un
// colis depuis sa réception à l'entrepôt d'origine jusqu'à l'arrivée. INDÉPENDANT
// de la facture (collection dédiée `receptions` via getCollectionName, isolée par
// route SaaS). Rattachement au client par le NUMÉRO (ancre phoneTail).
// Voir PLAN-RECEPTION-COLIS.md. Passe 1 : réception + liste + pipeline + alerte
// (photo + app Clients en passe 2).
import { db } from '../firebase-config.js';
import { collection, doc, addDoc, updateDoc, query, where, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../agencies-config.js';
import { phoneTail } from '../services/phone.js';

// Étapes du cycle de vie (ordre = progression). Le label + l'icône servent à
// l'affichage ; la clé est stockée en base.
const STEPS = [
    { key: 'RECU',             label: 'Reçu',              icon: '📥' },
    { key: 'ATTENTE_GROUPAGE', label: 'En attente groupage', icon: '⏳' },
    { key: 'CHARGE_CONTENEUR', label: 'Chargé conteneur',  icon: '📦' },
    { key: 'EMBARQUE',         label: 'Embarqué',          icon: '🚢' },
    { key: 'EN_TRANSIT',       label: 'En transit',        icon: '🌊' },
    { key: 'ARRIVE',           label: 'Arrivé',            icon: '🏁' },
    { key: 'LIVRE',            label: 'Livré',             icon: '✅' },
];
const STEP_LABEL = Object.fromEntries(STEPS.map(s => [s.key, `${s.icon} ${s.label}`]));
// Tant que le colis n'est pas embarqué, il est "à l'entrepôt" (compte pour l'alerte).
const AT_WAREHOUSE = new Set(['RECU', 'ATTENTE_GROUPAGE', 'CHARGE_CONTENEUR']);
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

        container.innerHTML = `
            <div class="dashboard-container">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:18px;">
                    <h2 style="margin:0; color:#1e293b;">📥 Réception Colis</h2>
                    <button class="btn btn-primary" onclick="window.app.views.receptionColis.openForm()" style="padding:10px 16px;">+ Recevoir un colis</button>
                </div>

                <div class="totals-container" style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:18px;">
                    <div class="total-card"><h3>Colis à l'entrepôt</h3><p id="rcStatWarehouse" style="color:#2563eb;">0</p></div>
                    <div class="total-card"><h3>En alerte (> ${ALERT_DAYS} j)</h3><p id="rcStatAlert" style="color:#ef4444;">0</p></div>
                    <div class="total-card"><h3>Total colis</h3><p id="rcStatTotal">0</p></div>
                </div>

                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
                    <input type="text" id="rcSearch" placeholder="Rechercher (nom, numéro, référence, conteneur…)" style="flex:1; min-width:220px; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px;">
                    <select id="rcFilterStatut" style="padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px;">
                        <option value="">Tous les statuts</option>
                        ${STEPS.map(s => `<option value="${s.key}">${s.icon} ${s.label}</option>`).join('')}
                    </select>
                    <select id="rcFilterAlert" style="padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px;">
                        <option value="">Tous</option>
                        <option value="alert">🔴 En alerte seulement</option>
                    </select>
                </div>

                <div style="overflow-x:auto;">
                    <table class="table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>Réf</th><th>Propriétaire</th><th>Numéro</th>
                                <th style="text-align:center;">Poids</th><th style="text-align:center;">Volume</th>
                                <th style="text-align:center;">Mode</th><th>Contenu</th>
                                <th>Réception</th><th style="text-align:center;">Durée</th>
                                <th>Statut</th><th style="text-align:center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="rcBody"><tr><td colspan="11" style="text-align:center; padding:30px;">Chargement…</td></tr></tbody>
                    </table>
                </div>
                <div id="rcPagination" style="display:flex; justify-content:center; align-items:center; gap:12px; padding:14px 0; flex-wrap:wrap;"></div>

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
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:30px; color:#64748b;">Aucun colis</td></tr>';
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
            const durTxt = AT_WAREHOUSE.has(statut)
                ? `${days} j${alert ? ' 🔴' : ''}`
                : '—';
            const idx = STEPS.findIndex(s => s.key === statut);
            const nextStep = idx >= 0 && idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
            const advBtn = nextStep
                ? `<button class="btn btn-small" title="Passer à : ${nextStep.label}" onclick="window.app.views.receptionColis.advance('${r.id}')" style="background:#2563eb; color:#fff; border:none; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:11px;">→ ${nextStep.icon}</button>`
                : '';
            return `
                <tr${alert ? ' style="background:#fff1f2;"' : ''}>
                    <td><strong>${r.reference || '—'}</strong></td>
                    <td>${r.ownerName || '—'}${r.groupage === 'attendre' ? ' <span title="En attente de groupage" style="font-size:11px;">⏸️</span>' : ''}</td>
                    <td style="color:#64748b;">${r.ownerPhone || ''}</td>
                    <td style="text-align:center;">${r.poids ? r.poids + ' kg' : '—'}</td>
                    <td style="text-align:center;">${r.volume ? r.volume + ' m³' : '—'}</td>
                    <td style="text-align:center;">${r.mode === 'aerien' ? '✈️' : '🚢'}</td>
                    <td>${r.contenu || '—'}${r.cartons ? ` <span style="color:#94a3b8;">(${r.cartons} cart.)</span>` : ''}</td>
                    <td>${r.dateReception || '—'}</td>
                    <td style="text-align:center; ${alert ? 'color:#ef4444; font-weight:700;' : ''}">${durTxt}</td>
                    <td>${STEP_LABEL[statut] || statut}</td>
                    <td style="text-align:center; white-space:nowrap;">
                        ${advBtn}
                        <button class="btn btn-small" title="Détail" onclick="window.app.views.receptionColis.openDetail('${r.id}')" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:11px;">👁️</button>
                        <button class="btn btn-small" title="Supprimer" onclick="window.app.views.receptionColis.remove('${r.id}')" style="background:#fee2e2; color:#b91c1c; border:none; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:11px;">🗑️</button>
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
    openForm() {
        const today = new Date().toISOString().slice(0, 10);
        const c = document.getElementById('rcModalContainer');
        if (!c) return;
        c.innerHTML = `
            <div class="modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;" onclick="if(event.target===this) window.app.views.receptionColis.closeForm()">
                <div class="modal-content" style="background:#fff; border-radius:12px; max-width:640px; width:100%; max-height:90vh; overflow:auto; padding:22px;">
                    <h3 style="margin:0 0 16px;">📥 Recevoir un colis</h3>
                    <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <label style="grid-column:1/2;">Propriétaire (nom)*<input id="rcfName" type="text" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label style="grid-column:2/3;">Numéro*<input id="rcfPhone" type="tel" placeholder="ex: 0700000000" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Poids (kg)<input id="rcfPoids" type="number" step="0.1" min="0" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Volume (m³)<input id="rcfVolume" type="number" step="0.001" min="0" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Mode<select id="rcfMode" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"><option value="maritime">🚢 Maritime</option><option value="aerien">✈️ Aérien</option></select></label>
                        <label>Nombre de cartons<input id="rcfCartons" type="number" step="1" min="1" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label style="grid-column:1/3;">Contenu / nature<input id="rcfContenu" type="text" placeholder="ex: chaussures, textile…" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Fournisseur (Chine)<input id="rcfFournisseur" type="text" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>N° de suivi Chine<input id="rcfTracking" type="text" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Valeur déclarée<input id="rcfValeur" type="number" step="1" min="0" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label>Date de réception<input id="rcfDate" type="date" value="${today}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"></label>
                        <label style="grid-column:1/3;">Expédition<select id="rcfGroupage" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:8px;"><option value="seul">Part seul</option><option value="attendre">Attend d'autres colis (groupage)</option></select></label>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
                        <button class="btn" onclick="window.app.views.receptionColis.closeForm()" style="padding:9px 16px; border:1px solid #cbd5e1; border-radius:8px; background:#fff;">Annuler</button>
                        <button class="btn btn-primary" onclick="window.app.views.receptionColis.save()" style="padding:9px 16px; border:none; border-radius:8px; background:#2563eb; color:#fff;">Enregistrer la réception</button>
                    </div>
                </div>
            </div>
        `;
    },
    closeForm() { const c = document.getElementById('rcModalContainer'); if (c) c.innerHTML = ''; },

    async save() {
        const v = id => (document.getElementById(id)?.value || '').trim();
        const name = v('rcfName');
        const phone = v('rcfPhone');
        if (!name || !phone) {
            window.AppModal ? window.AppModal.error('Le nom et le numéro du propriétaire sont obligatoires.') : alert('Nom + numéro obligatoires.');
            return;
        }
        const agency = sessionStorage.getItem('currentActiveAgency') || 'chine';
        const initials = (sessionStorage.getItem('userInitials') || name.slice(0, 2)).toUpperCase();
        const date = v('rcfDate') || new Date().toISOString().slice(0, 10);
        const doc0 = {
            ownerName: name,
            ownerPhone: phone,
            ownerPhoneTail: phoneTail(phone),
            poids: parseFloat(v('rcfPoids')) || 0,
            volume: parseFloat(v('rcfVolume')) || 0,
            mode: v('rcfMode') || 'maritime',
            cartons: parseInt(v('rcfCartons'), 10) || 1,
            contenu: v('rcfContenu'),
            fournisseur: v('rcfFournisseur'),
            trackingChine: v('rcfTracking'),
            valeurDeclaree: parseFloat(v('rcfValeur')) || 0,
            groupage: v('rcfGroupage') || 'seul',
            dateReception: date,
            statut: 'RECU',
            statusHistory: [{ statut: 'RECU', date: new Date().toISOString() }],
            reference: `${initials}-${date.replace(/-/g, '').slice(2)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
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
        const idx = STEPS.findIndex(s => s.key === (r.statut || 'RECU'));
        if (idx < 0 || idx >= STEPS.length - 1) return;
        const next = STEPS[idx + 1].key;
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
        const hist = (r.statusHistory || []).map(h => `<li>${STEP_LABEL[h.statut] || h.statut} — ${new Date(h.date).toLocaleString('fr-FR')}</li>`).join('') || '<li>—</li>';
        const c = document.getElementById('rcModalContainer');
        if (!c) return;
        c.innerHTML = `
            <div class="modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;" onclick="if(event.target===this) window.app.views.receptionColis.closeForm()">
                <div class="modal-content" style="background:#fff; border-radius:12px; max-width:520px; width:100%; max-height:90vh; overflow:auto; padding:22px;">
                    <h3 style="margin:0 0 12px;">Colis ${r.reference || ''}</h3>
                    <p><strong>${r.ownerName}</strong> — ${r.ownerPhone}</p>
                    <p>${r.mode === 'aerien' ? '✈️ Aérien' : '🚢 Maritime'} · ${r.poids || 0} kg · ${r.volume || 0} m³ · ${r.cartons || 1} carton(s)</p>
                    <p>Contenu : ${r.contenu || '—'} · Fournisseur : ${r.fournisseur || '—'} · Suivi Chine : ${r.trackingChine || '—'}</p>
                    <p>Reçu le ${r.dateReception || '—'} · Statut : ${STEP_LABEL[r.statut || 'RECU']}</p>
                    <h4 style="margin:14px 0 6px;">Historique</h4>
                    <ul style="margin:0; padding-left:18px; color:#475569;">${hist}</ul>
                    <div style="display:flex; justify-content:flex-end; margin-top:18px;">
                        <button class="btn" onclick="window.app.views.receptionColis.closeForm()" style="padding:9px 16px; border:1px solid #cbd5e1; border-radius:8px; background:#fff;">Fermer</button>
                    </div>
                </div>
            </div>
        `;
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
