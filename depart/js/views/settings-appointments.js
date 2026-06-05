import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const SettingsAppointmentsView = {
    docRef: null,
    config: {
        trucksPerDay: 4,
        rdvPerTruck: 20,
        startTime: '09:00',
        endTime: '18:00',
        slotDuration: 30,
        offDays: [0] // 0 = Dimanche par défaut
    },

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsAppointments = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        this.docRef = doc(db, "settings", `appointments_${activeAgency}`);

        const html = `
            <style>
                .sp-page { max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                
                /* Hero Header */
                .sp-hero { display: flex; justify-content: space-between; align-items: center; background: white; padding: 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 25px; flex-wrap: wrap; gap: 15px; }
                .sp-hero__left { display: flex; align-items: center; gap: 15px; }
                .sp-hero__icon { background: #eff6ff; color: #3b82f6; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .sp-hero__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .sp-hero__sub { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .sp-hero-btn { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: none; }
                .sp-hero-btn--ghost { background: white; border: 1px solid #cbd5e1; color: #475569; }
                .sp-hero-btn--ghost:hover { background: #f8fafc; color: #0f172a; }

                /* KPIs */
                .sp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
                .sp-kpi { background: white; border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .sp-kpi__icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .sp-kpi--blue .sp-kpi__icon { background: #eff6ff; color: #3b82f6; }
                .sp-kpi--green .sp-kpi__icon { background: #dcfce7; color: #10b981; }
                .sp-kpi--purple .sp-kpi__icon { background: #f3e8ff; color: #9333ea; }
                .sp-kpi--orange .sp-kpi__icon { background: #fffbeb; color: #d97706; }
                .sp-kpi__value { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 4px; line-height: 1; }
                .sp-kpi__label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }

                /* Main Card */
                .sp-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); overflow: hidden; }
                .sp-section { padding: 25px; border-bottom: 1px solid #f1f5f9; }
                .sp-section:last-of-type { border-bottom: none; }
                .sp-section__head { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
                .sp-section__icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
                .sp-section__icon--blue { background: #eff6ff; color: #3b82f6; }
                .sp-section__icon--green { background: #dcfce7; color: #10b981; }
                .sp-section__icon--orange { background: #fffbeb; color: #d97706; }
                .sp-section__title { font-size: 16px; font-weight: 800; color: #1e293b; }
                .sp-section__desc { font-size: 13px; color: #64748b; margin-top: 2px; }

                /* Form Fields */
                .sp-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .sp-form-row--3 { grid-template-columns: 1fr 1fr 1fr; }
                @media (max-width: 768px) { .sp-form-row, .sp-form-row--3 { grid-template-columns: 1fr; } }
                
                .sp-field { display: flex; flex-direction: column; gap: 8px; }
                .sp-field__label { font-size: 12px; font-weight: 700; color: #475569; }
                .sp-field__input-wrap { position: relative; display: flex; align-items: center; }
                .sp-field__icon { position: absolute; left: 12px; color: #94a3b8; }
                .sp-input { width: 100%; padding: 12px 12px 12px 36px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 14px; font-weight: 600; color: #0f172a; outline: none; transition: 0.2s; background: #f8fafc; box-sizing: border-box; }
                .sp-input:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

                /* Off Days Toggle */
                .sp-offdays { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; }
                .sp-offday { position: relative; cursor: pointer; user-select: none; }
                .sp-offday__input { position: absolute; opacity: 0; cursor: pointer; height: 0; width: 0; }
                .sp-offday__content { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; background: white; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 13px; font-weight: 700; color: #64748b; transition: 0.2s; min-width: 100px; }
                .sp-offday:hover .sp-offday__content { border-color: #cbd5e1; background: #f8fafc; }
                .sp-offday__input:checked ~ .sp-offday__content { background: #fef2f2; border-color: #ef4444; color: #b91c1c; }
                .sp-offday__check { display: none; color: #ef4444; }
                .sp-offday__input:checked ~ .sp-offday__content .sp-offday__check { display: block; }

                .sp-offdays-summary { display: flex; gap: 20px; padding: 12px 15px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 13px; color: #475569; font-weight: 600; }
                .sp-offdays-summary__item { display: flex; align-items: center; gap: 8px; }
                .sp-offdays-summary__item svg { color: #3b82f6; }

                /* Footer */
                .sp-footer { padding: 20px 25px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px; }
                .sp-footer__btn { padding: 12px 20px; border-radius: 10px; font-weight: 700; font-size: 14px; cursor: pointer; transition: 0.2s; border: none; display: flex; align-items: center; gap: 8px; }
                .sp-footer__btn--ghost { background: white; border: 1px solid #cbd5e1; color: #475569; }
                .sp-footer__btn--ghost:hover { background: #f1f5f9; color: #0f172a; }
                .sp-footer__btn--primary { background: #3b82f6; color: white; }
                .sp-footer__btn--primary:hover { background: #2563eb; }
                .sp-footer__btn:disabled { opacity: 0.6; cursor: not-allowed; }
            </style>

            <div class="sp-page">
                <div class="sp-hero">
                    <div class="sp-hero__left">
                        <div class="sp-hero__icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        </div>
                        <div>
                            <h1 class="sp-hero__title">Paramètres RDV</h1>
                            <p class="sp-hero__sub">Configurez les capacités journalières et les règles de disponibilité de votre agence.</p>
                        </div>
                    </div>
                    <div class="sp-hero__right">
                        <button class="sp-hero-btn sp-hero-btn--ghost" onclick="window.app.views.settingsAppointments.loadData()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> 
                            Recharger 
                        </button>
                    </div>
                </div>

                <div class="sp-kpis">
                    <div class="sp-kpi sp-kpi--blue">
                        <div class="sp-kpi__icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h15v13H1z"></path><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                        </div>
                        <div class="sp-kpi__body">
                            <div class="sp-kpi__value" id="kpiTrucks">4</div>
                            <div class="sp-kpi__label">Camion(s) / jour</div>
                        </div>
                    </div>
                    <div class="sp-kpi sp-kpi--green">
                        <div class="sp-kpi__icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M9 16l2 2 4-4"></path></svg>
                        </div>
                        <div class="sp-kpi__body">
                            <div class="sp-kpi__value" id="kpiPlacesDay">80</div>
                            <div class="sp-kpi__label">Places / jour</div>
                        </div>
                    </div>
                    <div class="sp-kpi sp-kpi--purple">
                        <div class="sp-kpi__icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                        </div>
                        <div class="sp-kpi__body">
                            <div class="sp-kpi__value" id="kpiPlacesWeek">480</div>
                            <div class="sp-kpi__label">Places / semaine</div>
                        </div>
                    </div>
                    <div class="sp-kpi sp-kpi--orange">
                        <div class="sp-kpi__icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </div>
                        <div class="sp-kpi__body">
                            <div class="sp-kpi__value" id="kpiHours" style="font-size: 18px;">09:00 - 18:00</div>
                            <div class="sp-kpi__label">Horaires</div>
                        </div>
                    </div>
                </div>

                <div class="sp-card">
                    
                    <!-- CAPACITÉ -->
                    <div class="sp-section">
                        <div class="sp-section__head">
                            <div class="sp-section__icon sp-section__icon--blue">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h15v13H1z"></path><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                            </div>
                            <div>
                                <div class="sp-section__title">Capacité</div>
                                <div class="sp-section__desc">Nombre de véhicules et RDV par véhicule</div>
                            </div>
                        </div>
                        <div class="sp-form-row">
                            <label class="sp-field">
                                <span class="sp-field__label">Camions / chauffeurs par jour</span>
                                <div class="sp-field__input-wrap">
                                    <svg class="sp-field__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h15v13H1z"></path><path d="M16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                                    <input class="sp-input" type="number" id="cfgTrucks" min="1" oninput="window.app.views.settingsAppointments.recalcKPIs()">
                                </div>
                            </label>
                            <label class="sp-field">
                                <span class="sp-field__label">RDV par camion / chauffeur</span>
                                <div class="sp-field__input-wrap">
                                    <svg class="sp-field__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    <input class="sp-input" type="number" id="cfgRdvPerTruck" min="1" oninput="window.app.views.settingsAppointments.recalcKPIs()">
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- HORAIRES -->
                    <div class="sp-section">
                        <div class="sp-section__head">
                            <div class="sp-section__icon sp-section__icon--green">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            </div>
                            <div>
                                <div class="sp-section__title">Horaires de travail</div>
                                <div class="sp-section__desc">Plage horaire et durée des créneaux</div>
                            </div>
                        </div>
                        <div class="sp-form-row sp-form-row--3">
                            <label class="sp-field">
                                <span class="sp-field__label">Début de journée</span>
                                <div class="sp-field__input-wrap">
                                    <svg class="sp-field__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                                    <input class="sp-input" type="time" id="cfgStartTime" onchange="window.app.views.settingsAppointments.recalcKPIs()">
                                </div>
                            </label>
                            <label class="sp-field">
                                <span class="sp-field__label">Fin de journée</span>
                                <div class="sp-field__input-wrap">
                                    <svg class="sp-field__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                                    <input class="sp-input" type="time" id="cfgEndTime" onchange="window.app.views.settingsAppointments.recalcKPIs()">
                                </div>
                            </label>
                            <label class="sp-field">
                                <span class="sp-field__label">Durée créneau (min)</span>
                                <div class="sp-field__input-wrap">
                                    <svg class="sp-field__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                    <input class="sp-input" type="number" id="cfgSlotDuration" min="5" step="5">
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- JOURS OFF -->
                    <div class="sp-section">
                        <div class="sp-section__head">
                            <div class="sp-section__icon sp-section__icon--orange">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            </div>
                            <div>
                                <div class="sp-section__title">Jours non travaillés</div>
                                <div class="sp-section__desc">Sélectionnez les jours de repos (Rouge = OFF)</div>
                            </div>
                        </div>
                        <div class="sp-offdays">
                            ${this.renderOffDay(1, 'Lun', 'Lundi')}
                            ${this.renderOffDay(2, 'Mar', 'Mardi')}
                            ${this.renderOffDay(3, 'Mer', 'Mercredi')}
                            ${this.renderOffDay(4, 'Jeu', 'Jeudi')}
                            ${this.renderOffDay(5, 'Ven', 'Vendredi')}
                            ${this.renderOffDay(6, 'Sam', 'Samedi')}
                            ${this.renderOffDay(0, 'Dim', 'Dimanche')}
                        </div>
                        <div class="sp-offdays-summary">
                            <span class="sp-offdays-summary__item">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> 
                                <span id="summaryWorkDays">6 jour(s) travaillé(s)</span> / semaine
                            </span>
                            <span class="sp-offdays-summary__item" style="color: #ef4444;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> 
                                <span id="summaryOffDays">1 jour(s) off</span> / semaine
                            </span>
                        </div>
                    </div>

                    <!-- FOOTER ACTIONS -->
                    <div class="sp-footer">
                        <button class="sp-footer__btn sp-footer__btn--ghost" onclick="window.app.views.settingsAppointments.loadData()"> Annuler </button>
                        <button class="sp-footer__btn sp-footer__btn--primary" id="btnSaveConfig" onclick="window.app.views.settingsAppointments.saveData()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                            Enregistrer les paramètres
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    renderOffDay(val, short, full) {
        return `
            <label class="sp-offday">
                <input type="checkbox" class="sp-offday__input" value="${val}" onchange="window.app.views.settingsAppointments.toggleOffDay(this)">
                <div class="sp-offday__content">
                    <span>${full}</span>
                    <span class="sp-offday__check">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </span>
                </div>
            </label>
        `;
    },

    async loadData() {
        try {
            const docSnap = await getDoc(this.docRef);
            if (docSnap.exists()) {
                this.config = { ...this.config, ...docSnap.data() };
            }

            // Remplissage UI
            document.getElementById('cfgTrucks').value = this.config.trucksPerDay || 4;
            document.getElementById('cfgRdvPerTruck').value = this.config.rdvPerTruck || 20;
            document.getElementById('cfgStartTime').value = this.config.startTime || '09:00';
            document.getElementById('cfgEndTime').value = this.config.endTime || '18:00';
            document.getElementById('cfgSlotDuration').value = this.config.slotDuration || 30;

            // Reset checkboxes
            const checkboxes = document.querySelectorAll('.sp-offday__input');
            checkboxes.forEach(cb => {
                cb.checked = this.config.offDays.includes(parseInt(cb.value));
            });

            this.recalcKPIs();
        } catch (e) {
            console.error("Erreur chargement config rdv :", e);
            this.app.showToast("Erreur lors du chargement.", "error");
        }
    },

    toggleOffDay() {
        // Met juste à jour les KPIs visuellement sans sauvegarder
        this.recalcKPIs();
    },

    recalcKPIs() {
        const trucks = parseInt(document.getElementById('cfgTrucks').value) || 4;
        const rdvPerTruck = parseInt(document.getElementById('cfgRdvPerTruck').value) || 20;
        const start = document.getElementById('cfgStartTime').value || '09:00';
        const end = document.getElementById('cfgEndTime').value || '18:00';
        
        const offDaysCheckboxes = document.querySelectorAll('.sp-offday__input:checked');
        const nbOffDays = offDaysCheckboxes.length;
        const nbWorkDays = 7 - nbOffDays;
        
        const placesPerDay = trucks * rdvPerTruck;
        const placesPerWeek = placesPerDay * nbWorkDays;

        // Mise à jour des Textes
        document.getElementById('kpiTrucks').textContent = trucks;
        document.getElementById('kpiPlacesDay').textContent = placesPerDay;
        document.getElementById('kpiPlacesWeek').textContent = placesPerWeek;
        document.getElementById('kpiHours').textContent = `${start} - ${end}`;
        
        document.getElementById('summaryWorkDays').textContent = `${nbWorkDays} jour(s) travaillé(s)`;
        document.getElementById('summaryOffDays').textContent = `${nbOffDays} jour(s) off`;
    },

    async saveData() {
        const btn = document.getElementById('btnSaveConfig');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        try {
            const offDaysCheckboxes = document.querySelectorAll('.sp-offday__input:checked');
            const offDaysArray = Array.from(offDaysCheckboxes).map(cb => parseInt(cb.value));

            this.config = {
                trucksPerDay: parseInt(document.getElementById('cfgTrucks').value) || 4,
                rdvPerTruck: parseInt(document.getElementById('cfgRdvPerTruck').value) || 20,
                startTime: document.getElementById('cfgStartTime').value || '09:00',
                endTime: document.getElementById('cfgEndTime').value || '18:00',
                slotDuration: parseInt(document.getElementById('cfgSlotDuration').value) || 30,
                offDays: offDaysArray
            };

            await setDoc(this.docRef, this.config, { merge: true });
            this.app.showToast("Paramètres RDV enregistrés avec succès !", "success");
        } catch (e) {
            console.error("Erreur sauvegarde config rdv :", e);
            this.app.showToast("Erreur lors de la sauvegarde.", "error");
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }
};