import { db } from '../../../commun/firebase-config.js';
import { getCollectionName } from '../../../commun/agencies-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const CalendrierRdvView = {
    unsub: null,
    appointments: [],
    currentDate: new Date(),
    capacityPerDay: 80, // Base: 4 camions * 20
    offDaysOfWeek: [0], // 0 = Dimanche

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.calendrierRdv = this;

        // S'assurer de toujours commencer au 1er du mois pour la navigation
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);

        const html = `
            <style>
                /* --- STYLES CALENDRIER RDV --- */
                .rdvc-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .rdvc-hero { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px; }
                .rdvc-hero__left { display: flex; align-items: center; gap: 15px; }
                .rdvc-hero__icon { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 24px; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3); }
                .rdvc-hero__title { margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; }
                .rdvc-hero__sub { margin: 4px 0 0 0; color: #64748b; font-size: 13px; }
                .rdvc-hero__right { display: flex; gap: 10px; }
                
                .rdvc-hero-btn { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; border: none; transition: 0.2s; }
                .rdvc-hero-btn--primary { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); }
                .rdvc-hero-btn--primary:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4); }
                .rdvc-hero-btn--ghost { background: white; border: 1px solid #cbd5e1; color: #475569; }
                .rdvc-hero-btn--ghost:hover { background: #f1f5f9; color: #0f172a; }

                /* KPIs */
                .rdvc-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .kpi { display: flex; align-items: center; gap: 15px; padding: 20px; border-radius: 16px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s; }
                .kpi:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
                .kpi__icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 20px; }
                .kpi--blue .kpi__icon { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3); }
                .kpi--green .kpi__icon { background: linear-gradient(135deg, #10b981, #059669); color: white; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3); }
                .kpi--orange .kpi__icon { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; box-shadow: 0 4px 10px rgba(245, 158, 11, 0.3); }
                .kpi--red .kpi__icon { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3); }
                .kpi__value { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                .kpi__label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }

                /* Calendrier */
                .rdvc-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); padding: 25px; }
                .rdvc-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                .rdvc-nav__center { text-align: center; }
                .rdvc-nav__month { font-size: 18px; font-weight: 800; color: #0f172a; text-transform: capitalize; }
                .rdvc-nav__info { font-size: 12px; color: #64748b; margin-top: 4px; }
                .rdvc-nav__arrow { background: white; border: 1px solid #cbd5e1; color: #475569; width: 36px; height: 36px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
                .rdvc-nav__arrow:hover { background: #f1f5f9; color: #0f172a; }

                .rdvc-legend { display: flex; gap: 15px; margin-bottom: 20px; justify-content: center; flex-wrap: wrap; }
                .rdvc-legend__item { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #475569; }
                .rdvc-legend__dot { width: 10px; height: 10px; border-radius: 50%; }
                .rdvc-legend__dot--ok { background: #10b981; }
                .rdvc-legend__dot--full { background: #ef4444; }
                .rdvc-legend__dot--off { background: #cbd5e1; }
                .rdvc-legend__dot--past { background: #f1f5f9; border: 1px solid #cbd5e1; }
                .rdvc-legend__dot--today { border: 2px solid #3b82f6; background: white; }

                .rdvc-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 10px; }
                .rdvc-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
                
                .rdvc-day { border: 1px solid #e2e8f0; border-radius: 12px; min-height: 110px; display: flex; flex-direction: column; background: white; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; }
                .rdvc-day:not(.rdvc-day--empty):not(.rdvc-day--off):hover { border-color: var(--primary); box-shadow: 0 10px 20px -5px rgba(0,0,0,0.1); cursor: pointer; transform: scale(1.02); z-index: 10; position: relative; }
                .rdvc-day--empty { background: transparent; border: none; }
                .rdvc-day--off { background: #f8fafc; opacity: 0.7; }
                .rdvc-day--past { background: #fcfcfc; opacity: 0.8; }
                .rdvc-day--today { border: 2px solid var(--primary); background: #f0f9ff; }

                .rdvc-day__top { padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid transparent; }
                .rdvc-day__num { font-size: 14px; font-weight: 700; color: #1e293b; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
                .rdvc-day__num--today { background: var(--primary); color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                
                .rdvc-day__body { padding: 10px; flex: 1; display: flex; flex-direction: column; justify-content: flex-end; }
                .rdvc-day__off-label { text-align: center; color: #94a3b8; font-weight: 800; font-size: 12px; letter-spacing: 1px; margin: auto; }
                .rdvc-day__past-count { text-align: center; font-size: 12px; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 4px; border-radius: 6px; }
                
                .rdvc-day__bar-wrap { height: 6px; background: #e2e8f0; border-radius: 3px; margin-bottom: 6px; overflow: hidden; }
                .rdvc-day__bar { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
                .rdvc-day__stats { display: flex; justify-content: center; align-items: baseline; gap: 2px; font-size: 11px; }
                .rdvc-day__stat--prog { font-weight: 800; font-size: 14px; color: #0f172a; }
                .rdvc-day__stat--cap { color: #64748b; font-weight: 600; }
                .rdvc-day__sep { color: #cbd5e1; }

                /* Modal Détails du jour */
                .rdvm { display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); align-items: center; justify-content: center; }
                .rdvm.active { display: flex; animation: fadeIn 0.2s; }
                .rdvm-content { background: white; width: 90%; max-width: 600px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .rdvm-header { padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
                .rdvm-title { font-size: 18px; font-weight: 800; color: #0f172a; }
                .rdvm-date { font-size: 13px; color: #64748b; text-transform: capitalize; margin-top: 2px; }
                .rdvm-close { background: none; border: none; cursor: pointer; color: #64748b; padding: 5px; }
                .rdvm-close:hover { color: #0f172a; }
                
                .rdvm-body { padding: 25px; overflow-y: auto; flex: 1; }
                
                .rdvm-kpis { display: flex; gap: 15px; margin-bottom: 25px; }
                .rdvm-kpi { flex: 1; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; }
                .rdvm-kpi--blue { background: #eff6ff; border-color: #bfdbfe; }
                .rdvm-kpi--green { background: #f0fdf4; border-color: #bbf7d0; }
                .rdvm-kpi--red { background: #fef2f2; border-color: #fecaca; }
                .rdvm-kpi-val { font-size: 24px; font-weight: 800; color: #0f172a; }
                .rdvm-kpi-lbl { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-top: 4px; }

                .rdvm-list-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 15px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; }
                .rdvm-list-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
                
                .rdv-item { border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 10px; transition: 0.2s; }
                .rdv-item:hover { border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .rdv-item-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
                .rdv-item-id { font-size: 12px; color: #94a3b8; font-weight: 700; }
                .rdv-item-time { margin-left: auto; font-size: 12px; font-weight: 600; color: #475569; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; }
                .rdv-item-client { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
                .rdv-item-details { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
                .rdv-item-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #475569; background: #f8fafc; padding: 4px 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
                .rdv-item-note { font-size: 12px; color: #64748b; background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 12px; border-radius: 0 8px 8px 0; }

                .type-badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800; }
                .type-badge--depot { background: #e0f2fe; color: #0284c7; }
                .type-badge--recup { background: #f3e8ff; color: #7e22ce; }
            </style>

            <div class="rdvc-page">
                <div class="rdvc-hero">
                    <div class="rdvc-hero__left">
                        <div class="rdvc-hero__icon"><i class="fas fa-calendar-alt"></i></div>
                        <div>
                            <h1 class="rdvc-hero__title">Calendrier RDV</h1>
                            <p class="rdvc-hero__sub">Visualisez les RDV programmés, places disponibles et jours off en un coup d'œil.</p>
                        </div>
                    </div>
                    <div class="rdvc-hero__right">
                        <button class="rdvc-hero-btn rdvc-hero-btn--ghost" onclick="window.app.views.calendrierRdv.goToToday()">Aujourd'hui</button>
                        <button class="rdvc-hero-btn rdvc-hero-btn--primary" onclick="window.app.views.calendrierRdv.loadData()">
                            <i class="fas fa-sync-alt"></i> Rafraîchir
                        </button>
                    </div>
                </div>

                <div class="rdvc-kpis" id="kpiContainer">
                    <!-- Rendu dynamique -->
                </div>

                <div class="rdvc-card">
                    <div class="rdvc-nav">
                        <button class="rdvc-nav__arrow" onclick="window.app.views.calendrierRdv.prevMonth()"><i class="fas fa-chevron-left"></i></button>
                        <div class="rdvc-nav__center">
                            <div class="rdvc-nav__month" id="calendarMonthLabel">Mois Année</div>
                            <div class="rdvc-nav__info">Base : <strong id="calendarCapacityLabel">80 places/jour</strong></div>
                        </div>
                        <button class="rdvc-nav__arrow" onclick="window.app.views.calendrierRdv.nextMonth()"><i class="fas fa-chevron-right"></i></button>
                    </div>

                    <div class="rdvc-legend">
                        <span class="rdvc-legend__item"><span class="rdvc-legend__dot rdvc-legend__dot--ok"></span>Disponible</span>
                        <span class="rdvc-legend__item"><span class="rdvc-legend__dot rdvc-legend__dot--full"></span>Complet</span>
                        <span class="rdvc-legend__item"><span class="rdvc-legend__dot rdvc-legend__dot--off"></span>Jour off</span>
                        <span class="rdvc-legend__item"><span class="rdvc-legend__dot rdvc-legend__dot--past"></span>Passé</span>
                        <span class="rdvc-legend__item"><span class="rdvc-legend__dot rdvc-legend__dot--today"></span>Aujourd'hui</span>
                    </div>

                    <div class="rdvc-weekdays">
                        <span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span>
                    </div>

                    <div class="rdvc-grid" id="calendarGrid">
                        <!-- Rendu dynamique -->
                    </div>
                </div>
            </div>

            <!-- Modal Détail du jour -->
            <div id="dayModal" class="rdvm">
                <div class="rdvm-content">
                    <div class="rdvm-header">
                        <div>
                            <div class="rdvm-title">Détails du jour</div>
                            <div class="rdvm-date" id="modalDayDate">Date</div>
                        </div>
                        <button class="rdvm-close" onclick="window.app.views.calendrierRdv.closeModal()"><i class="fas fa-times fa-lg"></i></button>
                    </div>
                    <div class="rdvm-body">
                        <div class="rdvm-kpis" id="modalKpis">
                            <!-- Kpis dynamiques -->
                        </div>
                        
                        <div class="rdvm-list-head">
                            <span>RDV programmés</span>
                            <span class="rdvm-list-count" id="modalRdvCount">0</span>
                        </div>
                        
                        <div id="modalRdvList">
                            <!-- Liste dynamique -->
                        </div>
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
        const q = query(collection(db, getCollectionName("appointments")), where("agency", "==", activeAgency));
        
        this.unsub = onSnapshot(q, (snapshot) => {
            // On ne prend que les RDV confirmés ou en attente (pas annulés)
            this.appointments = snapshot.docs
                .map(d => ({id: d.id, ...d.data()}))
                .filter(a => a.status !== 'annulé');
            
            this.renderCalendar();
        }, (error) => {
            console.error("Erreur chargement RDV:", error);
            this.app.showToast("Erreur de chargement des données", "error");
        });
    },

    goToToday() {
        this.currentDate = new Date();
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        this.renderCalendar();
    },

    prevMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.renderCalendar();
    },

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.renderCalendar();
    },

    renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        const monthLabel = document.getElementById('calendarMonthLabel');
        const capacityLabel = document.getElementById('calendarCapacityLabel');
        const grid = document.getElementById('calendarGrid');
        const kpiContainer = document.getElementById('kpiContainer');

        if (!monthLabel || !capacityLabel || !grid || !kpiContainer) return; // Sécurité si on a changé de page

        monthLabel.textContent = this.currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        capacityLabel.textContent = `${this.capacityPerDay} places/jour`;

        // Premier jour du mois (0 = Dimanche, 1 = Lundi, etc.)
        let firstDay = new Date(year, month, 1).getDay();
        // Ajustement pour commencer par Lundi (0 = Lundi, 6 = Dimanche)
        firstDay = firstDay === 0 ? 6 : firstDay - 1;
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
        const todayDate = today.getDate();

        let totalProgrammes = 0;
        let totalDispo = 0;
        let joursComplets = 0;
        let validDaysCount = 0;

        // Grouper les RDV du mois par date ("YYYY-MM-DD")
        const rdvsByDate = {};
        this.appointments.forEach(rdv => {
            if (rdv.date && rdv.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
                if (!rdvsByDate[rdv.date]) rdvsByDate[rdv.date] = [];
                rdvsByDate[rdv.date].push(rdv);
            }
        });

        let gridHtml = '';

        // Jours vides avant le 1er
        for (let i = 0; i < firstDay; i++) {
            gridHtml += `<div class="rdvc-day rdvc-day--empty"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayOfWeek = dateObj.getDay(); // 0 = Dimanche
            
            const isOff = this.offDaysOfWeek.includes(dayOfWeek);
            const isPast = dateObj < new Date(today.getFullYear(), today.getMonth(), todayDate);
            const isToday = isCurrentMonth && day === todayDate;
            
            const dayRdvs = rdvsByDate[dateString] || [];
            const count = dayRdvs.length;
            
            let classes = ['rdvc-day'];
            let contentHtml = '';

            if (isOff) {
                classes.push('rdvc-day--off');
                contentHtml = `
                    <div class="rdvc-day__top"><span class="rdvc-day__num">${day}</span></div>
                    <div class="rdvc-day__body"><div class="rdvc-day__off-label">OFF</div></div>
                `;
            } else {
                validDaysCount++;
                totalProgrammes += count;
                
                if (!isPast) {
                    const placesDispo = Math.max(0, this.capacityPerDay - count);
                    totalDispo += placesDispo;
                    if (count >= this.capacityPerDay) joursComplets++;
                }

                const isFull = count >= this.capacityPerDay;
                const percentage = Math.min(100, Math.round((count / this.capacityPerDay) * 100));
                let barColor = percentage >= 100 ? '#ef4444' : '#10b981'; // Rouge si plein, Vert sinon
                if (percentage > 0 && percentage < 100) barColor = '#3b82f6'; // Bleu si entamé

                if (isToday) classes.push('rdvc-day--today');
                
                if (isPast) {
                    classes.push('rdvc-day--past');
                    contentHtml = `
                        <div class="rdvc-day__top"><span class="rdvc-day__num ${isToday ? 'rdvc-day__num--today' : ''}">${day}</span></div>
                        <div class="rdvc-day__body">${count > 0 ? `<div class="rdvc-day__past-count">${count} RDV</div>` : ''}</div>
                    `;
                } else {
                    classes.push(isFull ? 'rdvc-day--full' : 'rdvc-day--ok');
                    contentHtml = `
                        <div class="rdvc-day__top"><span class="rdvc-day__num ${isToday ? 'rdvc-day__num--today' : ''}">${day}</span></div>
                        <div class="rdvc-day__body">
                            <div class="rdvc-day__bar-wrap"><div class="rdvc-day__bar" style="width: ${percentage}%; background: ${barColor};"></div></div>
                            <div class="rdvc-day__stats">
                                <span class="rdvc-day__stat--prog">${count}</span>
                                <span class="rdvc-day__sep">/</span>
                                <span class="rdvc-day__stat--cap">${this.capacityPerDay}</span>
                            </div>
                        </div>
                    `;
                }
            }

            // Ajouter l'événement onClick si ce n'est pas un jour off (ou même si c'est off mais qu'il y a des RDV)
            const onClickAttr = (!isOff || count > 0) ? `onclick="window.app.views.calendrierRdv.openModal('${dateString}')"` : '';

            gridHtml += `<div class="${classes.join(' ')}" ${onClickAttr}>${contentHtml}</div>`;
        }

        grid.innerHTML = gridHtml;

        // MAJ KPIs globaux du mois
        const occRate = (validDaysCount * this.capacityPerDay) > 0 ? Math.round((totalProgrammes / (validDaysCount * this.capacityPerDay)) * 100) : 0;
        
        kpiContainer.innerHTML = `
            <div class="kpi kpi--blue"><div class="kpi__icon"><i class="fas fa-calendar-check"></i></div><div class="kpi__body"><div class="kpi__value">${totalProgrammes}</div><div class="kpi__label">RDV programmés</div></div></div>
            <div class="kpi kpi--green"><div class="kpi__icon"><i class="fas fa-ticket-alt"></i></div><div class="kpi__body"><div class="kpi__value">${totalDispo}</div><div class="kpi__label">Places disponibles</div></div></div>
            <div class="kpi kpi--orange"><div class="kpi__icon"><i class="fas fa-chart-pie"></i></div><div class="kpi__body"><div class="kpi__value">${occRate}%</div><div class="kpi__label">Taux occupation</div></div></div>
            <div class="kpi kpi--red"><div class="kpi__icon"><i class="fas fa-ban"></i></div><div class="kpi__body"><div class="kpi__value">${joursComplets}</div><div class="kpi__label">Jours complets</div></div></div>
        `;
    },

    openModal(dateString) {
        const dateObj = new Date(dateString);
        document.getElementById('modalDayDate').textContent = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        const dayRdvs = this.appointments.filter(a => a.date === dateString);
        // Tri par heure
        dayRdvs.sort((a, b) => (a.time || '23:59').localeCompare(b.time || '23:59'));

        const count = dayRdvs.length;
        const dispo = Math.max(0, this.capacityPerDay - count);

        document.getElementById('modalKpis').innerHTML = `
            <div class="rdvm-kpi rdvm-kpi--blue"><div class="rdvm-kpi-val">${count}</div><div class="rdvm-kpi-lbl">Programmés</div></div>
            <div class="rdvm-kpi rdvm-kpi--green"><div class="rdvm-kpi-val">${dispo}</div><div class="rdvm-kpi-lbl">Disponibles</div></div>
            <div class="rdvm-kpi rdvm-kpi--red"><div class="rdvm-kpi-val">${this.capacityPerDay}</div><div class="rdvm-kpi-lbl">Capacité</div></div>
        `;
        
        document.getElementById('modalRdvCount').textContent = count;

        const listContainer = document.getElementById('modalRdvList');
        if (count === 0) {
            listContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b; background:#f8fafc; border-radius:12px;">Aucun rendez-vous pour cette date.</div>';
        } else {
            listContainer.innerHTML = dayRdvs.map(rdv => {
                const isDepot = rdv.rdvType === 'DEPOT';
                const typeClass = isDepot ? 'type-badge--depot' : 'type-badge--recup';
                const typeText = isDepot ? 'DEPOT' : 'RECUP';
                const refText = rdv.id ? `#${rdv.id.substring(0,6).toUpperCase()}` : '#----';

                return `
                    <div class="rdv-item">
                        <div class="rdv-item-top">
                            <span class="rdv-item-id">${refText}</span>
                            <span class="type-badge ${typeClass}">${typeText}</span>
                            <span class="rdv-item-time">${rdv.time || 'Heure non définie'}</span>
                        </div>
                        <div class="rdv-item-client">${rdv.client || 'Client Inconnu'}</div>
                        <div class="rdv-item-details">
                            <span class="rdv-item-tag"><i class="fas fa-phone text-gray-400"></i> ${rdv.tel || 'Non renseigné'}</span>
                            <span class="rdv-item-tag"><i class="fas fa-map-marker-alt text-gray-400"></i> ${rdv.adresse || 'Adresse non spécifiée'}</span>
                        </div>
                        ${rdv.notes ? `<div class="rdv-item-note">${rdv.notes}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        document.getElementById('dayModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('dayModal').classList.remove('active');
    }
};