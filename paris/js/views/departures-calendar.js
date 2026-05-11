import { db } from '../../../firebase-config.js';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const DeparturesCalendarView = {
    unsub: null,
    departures: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.departuresCalendar = this;

        const html = `
            <style>
                .departures-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .departures-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .departures-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .departures-header__left { display: flex; align-items: center; gap: 15px; }
                .departures-header__icon { background: #f0fdf4; color: #16a34a; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 28px; }
                .departures-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .departures-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .departures-header__actions { display: flex; gap: 10px; }
                
                .btn-new { background: #3b82f6; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
                .btn-new:hover { background: #2563eb; }
                .btn-refresh { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
                .btn-refresh:hover { background: #f1f5f9; color: #0f172a; }

                .departures-filters { display: flex; flex-wrap: wrap; gap: 15px; background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; background: #f8fafc; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                
                .filter-actions { display: flex; align-items: flex-end; gap: 10px; }
                .btn-filter { background: #0f172a; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; height: 40px; display: flex; align-items: center; gap: 8px;}
                .btn-filter:hover { background: #1e293b; }
                .btn-reset { background: #f1f5f9; color: #475569; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; height: 40px; display: flex; align-items: center; gap: 8px;}
                .btn-reset:hover { background: #e2e8f0; color: #0f172a; }

                .departures-empty { background: white; border: 1px dashed #cbd5e1; border-radius: 16px; padding: 60px 20px; text-align: center; color: #64748b; }
                .empty-icon { font-size: 48px; margin-bottom: 15px; opacity: 0.5; }

                .departures-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
                .departure-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; }
                .departure-card:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
                .dc-header { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
                .dc-date { font-size: 16px; font-weight: 800; color: #0f172a; }
                .dc-badge { font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: 700; text-transform: uppercase; }
                .dc-badge--active { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
                .dc-badge--past { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
                .dc-body { padding: 20px; flex: 1; }
                .dc-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
                .dc-row:last-child { margin-bottom: 0; }
                .dc-icon { width: 24px; color: #94a3b8; text-align: center; }
                .dc-text { font-size: 14px; color: #334155; font-weight: 500; }
                .dc-text strong { color: #0f172a; font-weight: 700; }
                .dc-footer { padding: 15px 20px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }
                
                .btn-icon { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #475569; transition: 0.2s; }
                .btn-icon:hover { background: #f1f5f9; color: #0f172a; }
                .btn-icon--danger { border-color: #fecaca; color: #ef4444; background: #fef2f2; }
                .btn-icon--danger:hover { background: #fee2e2; }
                
                /* Modal */
                .dep-modal { display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center; }
                .dep-modal.active { display:flex; animation: fadeIn 0.2s; }
                .dep-modal-box { background: white; border-radius: 16px; display: flex; flex-direction: column; width: 90%; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .dep-modal-header { padding: 20px 25px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .dep-modal-title { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
                .dep-modal-body { padding: 25px; }
                .dep-modal-footer { padding: 15px 25px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }
            </style>

            <div class="page departures-page">
                <div class="departures-header">
                    <div class="departures-header__content">
                        <div class="departures-header__left">
                            <div class="departures-header__icon">✈️</div>
                            <div class="departures-header__info">
                                <h1 class="departures-header__title">Dates de départ</h1>
                                <p class="departures-header__subtitle" id="depCount">0 date(s) de départ</p>
                            </div>
                        </div>
                        <div class="departures-header__actions">
                            <button class="btn-new" type="button" onclick="window.app.views.departuresCalendar.openModal()">➕ Nouvelle date</button>
                            <button class="btn-refresh" type="button" onclick="window.app.views.departuresCalendar.loadData()">🔄 Rafraîchir</button>
                        </div>
                    </div>
                </div>

                <div class="departures-filters">
                    <div class="filter-group" style="flex: 1.5 1 0%;">
                        <label class="filter-label"><span class="filter-icon">🌍</span> Destination</label>
                        <select class="filter-select" id="depDestFilter">
                            <option value="">Toutes les destinations</option>
                            <option value="ABIDJAN">Abidjan</option>
                            <option value="CHINE">Chine</option>
                            <option value="BAMAKO">Bamako</option>
                            <option value="CONAKRY">Conakry</option>
                            <option value="DAKAR">Dakar</option>
                            <option value="LIBREVILLE">Libreville</option>
                            <option value="PARIS">Paris</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Du</label>
                        <input class="filter-input" type="date" id="depDateStart">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Au</label>
                        <input class="filter-input" type="date" id="depDateEnd">
                    </div>
                    <div class="filter-actions">
                        <button class="btn-filter" type="button" onclick="window.app.views.departuresCalendar.applyFilters()">🔍 Filtrer</button>
                        <button class="btn-reset" type="button" onclick="window.app.views.departuresCalendar.resetFilters()">🔄 Reset</button>
                    </div>
                </div>

                <div id="depListContainer">
                    <div class="departures-empty">
                        <div class="empty-icon">📭</div>
                        <p>Aucune date de départ trouvée</p>
                    </div>
                </div>
            </div>

            <!-- Modal Nouvelle Date -->
            <div id="depModal" class="dep-modal">
                <div class="dep-modal-box">
                    <div class="dep-modal-header">
                        <h2 class="dep-modal-title" id="depModalTitle">Nouvelle date de départ</h2>
                        <button class="icon-btn" onclick="window.app.views.departuresCalendar.closeModal()" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                    </div>
                    <div class="dep-modal-body">
                        <input type="hidden" id="depEditId">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Date de départ *</label>
                            <input type="date" id="depInputDate" class="filter-input" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Destination *</label>
                            <select id="depInputDest" class="filter-select" style="width: 100%; box-sizing: border-box;">
                                <option value="ABIDJAN">Abidjan</option>
                                <option value="CHINE">Chine</option>
                                <option value="BAMAKO">Bamako</option>
                                <option value="CONAKRY">Conakry</option>
                                <option value="DAKAR">Dakar</option>
                                <option value="LIBREVILLE">Libreville</option>
                                <option value="PARIS">Paris</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Type de transport</label>
                            <select id="depInputType" class="filter-select" style="width: 100%; box-sizing: border-box;">
                                <option value="MARITIME">🚢 Maritime</option>
                                <option value="AERIEN">✈️ Aérien</option>
                                <option value="ROUTIER">🚛 Routier</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Remarques (Navire, Vol, etc.)</label>
                            <input type="text" id="depInputNote" class="filter-input" placeholder="Ex: MSC KATYAYNI..." style="width: 100%; box-sizing: border-box;">
                        </div>
                    </div>
                    <div class="dep-modal-footer">
                        <button class="btn btn-outline" style="padding: 8px 16px; border-radius: 8px;" onclick="window.app.views.departuresCalendar.closeModal()">Annuler</button>
                        <button class="btn btn-primary" style="padding: 8px 16px; border-radius: 8px; background: #3b82f6; color: white; border: none;" onclick="window.app.views.departuresCalendar.saveDeparture()"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';

        const q = query(collection(db, "departures"), orderBy("date", "desc"));
        this.unsub = onSnapshot(q, (snapshot) => {
            this.departures = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            this.applyFilters();
        });
    },

    applyFilters() {
        const dest = document.getElementById('depDestFilter').value;
        const start = document.getElementById('depDateStart').value;
        const end = document.getElementById('depDateEnd').value;

        let filtered = this.departures.filter(d => {
            if (dest && d.destination !== dest) return false;
            if (start && d.date < start) return false;
            if (end && d.date > end) return false;
            return true;
        });

        this.renderList(filtered);
    },

    resetFilters() {
        document.getElementById('depDestFilter').value = '';
        document.getElementById('depDateStart').value = '';
        document.getElementById('depDateEnd').value = '';
        this.applyFilters();
    },

    renderList(data) {
        document.getElementById('depCount').textContent = `${data.length} date(s) de départ`;
        const container = document.getElementById('depListContainer');

        if (data.length === 0) {
            container.innerHTML = `
                <div class="departures-empty">
                    <div class="empty-icon">📭</div>
                    <p>Aucune date de départ trouvée</p>
                </div>
            `;
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        let html = '<div class="departures-grid">';
        data.forEach(d => {
            const dateObj = new Date(d.date);
            const isPast = d.date < today;
            const badgeClass = isPast ? 'dc-badge--past' : 'dc-badge--active';
            const badgeText = isPast ? 'PASSÉ' : 'À VENIR';

            let typeIcon = '🚢';
            if (d.type === 'AERIEN') typeIcon = '✈️';
            if (d.type === 'ROUTIER') typeIcon = '🚛';

            html += `
                <div class="departure-card">
                    <div class="dc-header">
                        <div class="dc-date">${dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                        <div class="dc-badge ${badgeClass}">${badgeText}</div>
                    </div>
                    <div class="dc-body">
                        <div class="dc-row">
                            <div class="dc-icon">🌍</div>
                            <div class="dc-text">Destination : <strong>${d.destination || 'Non spécifiée'}</strong></div>
                        </div>
                        <div class="dc-row">
                            <div class="dc-icon">${typeIcon}</div>
                            <div class="dc-text">Type : <strong>${d.type || 'MARITIME'}</strong></div>
                        </div>
                        ${d.note ? `
                        <div class="dc-row">
                            <div class="dc-icon">📝</div>
                            <div class="dc-text" style="color: #64748b;">${d.note}</div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="dc-footer">
                        <button class="btn-icon" onclick="window.app.views.departuresCalendar.openModal('${d.id}')" title="Modifier"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon btn-icon--danger" onclick="window.app.views.departuresCalendar.deleteDeparture('${d.id}')" title="Supprimer"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    openModal(id = null) {
        if (id) {
            const d = this.departures.find(x => x.id === id);
            if (d) {
                document.getElementById('depEditId').value = id;
                document.getElementById('depInputDate').value = d.date || '';
                document.getElementById('depInputDest').value = d.destination || 'ABIDJAN';
                document.getElementById('depInputType').value = d.type || 'MARITIME';
                document.getElementById('depInputNote').value = d.note || '';
                document.getElementById('depModalTitle').textContent = "Modifier date de départ";
            }
        } else {
            document.getElementById('depEditId').value = '';
            document.getElementById('depInputDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('depInputDest').value = 'ABIDJAN';
            document.getElementById('depInputType').value = 'MARITIME';
            document.getElementById('depInputNote').value = '';
            document.getElementById('depModalTitle').textContent = "Nouvelle date de départ";
        }
        document.getElementById('depModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('depModal').classList.remove('active');
    },

    async saveDeparture() {
        const id = document.getElementById('depEditId').value;
        const date = document.getElementById('depInputDate').value;
        const destination = document.getElementById('depInputDest').value;
        const type = document.getElementById('depInputType').value;
        const note = document.getElementById('depInputNote').value.trim();

        if (!date || !destination) {
            this.app.showToast("La date et la destination sont requises", "error");
            return;
        }

        const data = {
            date,
            destination,
            type,
            note,
            agency: sessionStorage.getItem('currentActiveAgency') || 'paris',
            updatedAt: new Date().toISOString()
        };

        try {
            if (id) {
                await setDoc(doc(db, "departures", id), data, { merge: true });
                this.app.showToast("Date de départ modifiée", "success");
            } else {
                data.createdAt = new Date().toISOString();
                await setDoc(doc(collection(db, "departures")), data);
                this.app.showToast("Nouvelle date de départ ajoutée", "success");
            }
            this.closeModal();
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'enregistrement", "error");
        }
    },

    async deleteDeparture(id) {
        if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer cette date de départ ?", "Supprimer", true)) return;
        try {
            await deleteDoc(doc(db, "departures", id));
            this.app.showToast("Date de départ supprimée", "success");
        } catch(e) {
            this.app.showToast("Erreur lors de la suppression", "error");
        }
    }
};