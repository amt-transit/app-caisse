import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const MonProgrammeView = {
    unsub: null,
    rdvs: [],
    drivers: [],
    selectedDate: new Date().toISOString().split('T')[0],
    selectedDriver: '', // '' = Moi

    async render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.monProgramme = this;

        await this.loadDrivers();

        const html = `
            <style>
                .my-programme-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .prog-header { background: white; border-radius: 16px; padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); flex-wrap: wrap; gap: 15px; }
                .prog-header__content { display: flex; align-items: center; gap: 15px; }
                .prog-header__icon { background: #f8fafc; font-size: 28px; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .prog-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .prog-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                
                .btn-refresh { background: white; border: 1px solid #cbd5e1; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; color: #475569; display: flex; align-items: center; gap: 8px; }
                .btn-refresh:hover { background: #f1f5f9; color: #0f172a; }

                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .kpi-card { display: flex; align-items: center; gap: 15px; padding: 20px; background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .kpi-card__icon { font-size: 24px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .kpi-card--purple .kpi-card__icon { background: #faf5ff; color: #9333ea; }
                .kpi-card--blue .kpi-card__icon { background: #eff6ff; color: #3b82f6; }
                .kpi-card--green .kpi-card__icon { background: #f0fdf4; color: #16a34a; }
                .kpi-card--teal .kpi-card__icon { background: #ccfbf1; color: #0d9488; }
                .kpi-card__value { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                .kpi-card__label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }

                .prog-filters { display: flex; flex-wrap: wrap; gap: 15px; background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

                .rdv-table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .rdv-table-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .rdv-table-title { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
                .rdv-table-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                
                .table-wrap { overflow-x: auto; }
                .rdv-table { width: 100%; border-collapse: collapse; }
                .rdv-table th { text-align: left; padding: 12px 15px; background: white; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .rdv-table td { padding: 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .rdv-table tr:hover td { background: #f8fafc; }
                
                .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; display: inline-block; white-space: nowrap; }
                .badge--depot { background: #e0f2fe; color: #0284c7; }
                .badge--recup { background: #f3e8ff; color: #7e22ce; }
                
                .client-cell__name { font-weight: 700; color: #0f172a; font-size: 14px; margin-bottom: 2px;}
                .phone-cell { font-weight: 600; color: #475569; }
                .time-cell { background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; display: inline-block; white-space: nowrap; }
                .address-cell { font-size: 13px; color: #475569; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                
                .actions-cell { display: flex; gap: 6px; }
                .btn-action { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; }
                .btn-action:hover { background: #f1f5f9; transform: scale(1.05); }
                .btn-action--call { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
                .btn-action--call:hover { background: #dbeafe; }
                .btn-action--map { color: #ea580c; border-color: #fed7aa; background: #fff7ed; }
                .btn-action--map:hover { background: #ffedd5; }
                .btn-action--invoice { color: #7e22ce; border-color: #e9d5ff; background: #faf5ff; }
                .btn-action--invoice:hover { background: #f3e8ff; }
                .btn-action--validate { color: #16a34a; border-color: #bbf7d0; background: #f0fdf4; }
                .btn-action--validate:hover { background: #dcfce7; }
                
                .rdv-table tr.validated td { opacity: 0.6; background: #f8fafc; }
                .rdv-table tr.validated .btn-action--validate { opacity: 0.4; cursor: not-allowed; }
            </style>

            <div class="my-programme-page">
                <div class="prog-header">
                    <div class="prog-header__content">
                        <div class="prog-header__icon">📋</div>
                        <div class="prog-header__info">
                            <h1 class="prog-header__title">Mon programme</h1>
                            <p class="prog-header__subtitle" id="progSubtitle">Date: ${this.selectedDate}</p>
                        </div>
                    </div>
                    <div class="prog-header__actions">
                        <button class="btn-refresh" type="button" title="Rafraîchir" onclick="window.app.views.monProgramme.loadData()">
                            🔄 Rafraîchir
                        </button>
                    </div>
                </div>

                <div class="kpi-grid">
                    <div class="kpi-card kpi-card--purple">
                        <div class="kpi-card__icon">📅</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value" id="kpiTotal">0</div>
                            <div class="kpi-card__label">RDV Total</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--blue">
                        <div class="kpi-card__icon">📦</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value" id="kpiDepots">0</div>
                            <div class="kpi-card__label">Dépôts</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--green">
                        <div class="kpi-card__icon">🔄</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value" id="kpiRecups">0</div>
                            <div class="kpi-card__label">Récupérations</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--teal">
                        <div class="kpi-card__icon">✅</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value" id="kpiValides">0</div>
                            <div class="kpi-card__label">Validés</div>
                        </div>
                    </div>
                </div>

                <div class="prog-filters">
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Date</label>
                        <input class="filter-input" type="date" id="progMyDateFilter" value="${this.selectedDate}">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">👤</span> Chauffeur</label>
                        <select class="filter-select" id="progMyDriverFilter">
                            <!-- Injecté via JS -->
                        </select>
                    </div>
                    <div class="filter-group" style="flex: 1.5;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Recherche</label>
                        <input class="filter-input" id="progMySearchFilter" placeholder="Adresse, nom, prénom, téléphone...">
                    </div>
                </div>

                <div class="rdv-table-card">
                    <div class="rdv-table-header">
                        <h2 class="rdv-table-title"><span class="rdv-table-icon">📋</span> Rendez-vous <span class="rdv-table-count" id="progMyCount">0</span></h2>
                    </div>
                    <div class="table-wrap">
                        <table class="rdv-table">
                            <thead>
                                <tr>
                                    <th style="width: 100px;">Type</th>
                                    <th style="width: 200px;">Client</th>
                                    <th style="width: 140px;">Téléphone</th>
                                    <th style="width: 140px;">Heure</th>
                                    <th>Adresse</th>
                                    <th style="width: 180px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="progMyTableBody">
                                <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        
        document.getElementById('progMyDateFilter')?.addEventListener('change', (e) => { this.selectedDate = e.target.value; this.loadData(); });
        document.getElementById('progMyDriverFilter')?.addEventListener('change', (e) => { this.selectedDriver = e.target.value; this.renderTable(); });
        document.getElementById('progMySearchFilter')?.addEventListener('input', () => this.renderTable());

        this.loadData();
    },

    async loadDrivers() {
        try {
            const usersSnap = await getDocs(collection(db, "users"));
            const agentsSnap = await getDocs(collection(db, "agents"));
            
            const driverMap = new Map();
            usersSnap.forEach(doc => {
                const data = doc.data();
                if (data.role === 'chauf') {
                    const name = data.displayName || data.email || 'Inconnu';
                    driverMap.set(name.toLowerCase().trim(), name);
                }
            });
            agentsSnap.forEach(doc => {
                const name = doc.data().name;
                if (name && !driverMap.has(name.toLowerCase().trim())) {
                    driverMap.set(name.toLowerCase().trim(), name);
                }
            });
            this.drivers = Array.from(driverMap.values()).sort();
        } catch (e) {
            console.error("Erreur chargement chauffeurs:", e);
        }
    },

    loadData() {
        if (this.unsub) this.unsub();
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const q = query(
            collection(db, "appointments"), 
            where("agency", "==", activeAgency),
            where("date", "==", this.selectedDate)
        );

        document.getElementById('progSubtitle').textContent = `Date: ${new Date(this.selectedDate).toLocaleDateString('fr-FR')}`;

        this.unsub = onSnapshot(q, (snapshot) => {
            // On ne prend que les RDV confirmés, en_cours ou réalisés
            this.rdvs = snapshot.docs
                .map(d => ({id: d.id, ...d.data()}))
                .filter(r => ['confirmé', 'en_cours', 'réalisé'].includes(r.status));
            
            // Tri par orderInRoute
            this.rdvs.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
            this.renderTable();
        });
    },

    renderTable() {
        const currentUser = sessionStorage.getItem('userName') || '';
        
        // Remplissage du select Chauffeurs
        const driverSelect = document.getElementById('progMyDriverFilter');
        if (driverSelect && driverSelect.options.length === 0) {
            let selectHtml = `<option value="">Moi (${currentUser})</option>`;
            selectHtml += `<option value="ALL">Tous les chauffeurs</option>`;
            this.drivers.forEach(d => {
                if (d !== currentUser) selectHtml += `<option value="${d}">${d}</option>`;
            });
            driverSelect.innerHTML = selectHtml;
            if (this.selectedDriver) driverSelect.value = this.selectedDriver;
        }

        const targetDriver = this.selectedDriver === '' ? currentUser : (this.selectedDriver === 'ALL' ? null : this.selectedDriver);
        const searchTerm = (document.getElementById('progMySearchFilter')?.value || '').toLowerCase().trim();

        const filtered = this.rdvs.filter(r => {
            if (targetDriver && r.livreur !== targetDriver) return false;
            if (searchTerm) {
                const str = `${r.client} ${r.tel} ${r.adresse}`.toLowerCase();
                if (!str.includes(searchTerm)) return false;
            }
            return true;
        });

        const validesCount = filtered.filter(r => r.status === 'réalisé').length;
        const depotsCount = filtered.filter(r => r.rdvType === 'DEPOT').length;
        const recupsCount = filtered.filter(r => r.rdvType === 'RECUPERATION').length;

        document.getElementById('kpiTotal').textContent = filtered.length;
        document.getElementById('kpiDepots').textContent = depotsCount;
        document.getElementById('kpiRecups').textContent = recupsCount;
        document.getElementById('kpiValides').textContent = validesCount;
        document.getElementById('progMyCount').textContent = filtered.length;

        const tbody = document.getElementById('progMyTableBody');
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun rendez-vous trouvé pour ce programme.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(r => {
            const isDepot = r.rdvType === 'DEPOT';
            const typeClass = isDepot ? 'badge--depot' : 'badge--recup';
            const typeLabel = isDepot ? 'DEPOT' : 'RECUP';
            
            const isRealise = r.status === 'réalisé';
            const rowClass = isRealise ? 'validated' : '';
            
            const validateBtn = isRealise ? 
                `<button class="btn-action btn-action--validate" disabled title="Déjà validé">✅</button>` : 
                `<button class="btn-action btn-action--validate" onclick="window.app.views.monProgramme.validateRdv('${r.id}')" title="Valider RDV">✅</button>`;

            // NOUVEAU : Nettoyage du téléphone pour le lien tel:
            const cleanPhone = (r.tel || '').replace(/[^\d+]/g, '');

            return `
                <tr class="${rowClass}">
                    <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
                    <td>
                        <div class="client-cell">
                            <div class="client-cell__name">${r.client}</div>
                        </div>
                    </td>
                    <td><div class="phone-cell">📞 ${r.tel || '--'}</div></td>
                    <td><div class="time-cell">🕐 ${r.time || '10:00 - 12:00'}</div></td>
                    <td class="address-cell" title="${r.adresse || ''}">${r.adresse || '-'}</td>
                    <td class="actions-cell">
                        <button class="btn-action btn-action--call" onclick="window.location.href='tel:${cleanPhone}'" title="Appeler">📞</button>
                        <button class="btn-action btn-action--map" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.adresse || '')}', '_blank')" title="Itinéraire">🗺️</button>
                        <button class="btn-action btn-action--invoice" onclick="window.app.renderPage('invoice-new')" title="Créer facture">📄</button>
                        ${validateBtn}
                    </td>
                </tr>
            `;
        }).join('');
    },

    async validateRdv(id) {
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Confirmer la réalisation de ce rendez-vous ?", "Validation RDV", false)) return;
        } else if (!confirm("Confirmer la réalisation ?")) {
            return;
        }

        try {
            await updateDoc(doc(db, "appointments", id), { status: 'réalisé' });
            this.app.showToast("Rendez-vous validé !", "success");
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de la validation", "error");
        }
    }
};