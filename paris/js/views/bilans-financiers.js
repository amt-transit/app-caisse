import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, getDoc, doc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../../constants.js';
import { getCollectionName } from '../../../agencies-config.js';
import { isEurAgency } from '../../../agency-money.js';

export const BilansFinanciersView = {
    unsubTrans: null,
    unsubExp: null,
    unsubLiv: null,
    unsubCont: null,
    objectives: { monthlyTarget: 50000, yearlyTarget: 600000, boatTarget: 25000 },
    transactions: [],
    expenses: [],
    livraisons: [],
    containers: [],
    selectedPeriod: null,
    charts: {},
    // Diviseur €/CFA route-aware : on ne convertit (÷ taux) QUE pour Paris
    // (seule zone €). Chine/Dakar/Abidjan sont en CFA -> diviseur = 1.
    // Getter : évalué au moment de l'usage (après que l'agence soit connue).
    get TAUX_CONVERSION() { return isEurAgency() ? CONSTANTS.TAUX_CONVERSION : 1; },

    render(app, subView = 'monthly') {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.bilansFinanciers = this;
        this.activeTab = subView;

        let title = "Bilan Mensuel Comparatif";
        let subtitle = "Analyse des mois avec comparaison objectifs";
        let selectorLabel = "Mois de référence";
        
        if (subView === 'yearly') {
            title = "Bilan Annuel Comparatif";
            subtitle = "Analyse des années d'exercice";
            selectorLabel = "Année de référence";
        } else if (subView === 'boat') {
            title = "Bilan par Conteneur";
            subtitle = "Analyse de la rentabilité par expédition";
            selectorLabel = "Conteneur de référence";
        } else if (subView === '12m') {
            title = "Tableau de Bord Direction";
            subtitle = "Analyse sur 12 mois glissants";
            selectorLabel = "Fin de période";
        }

        const html = `
            <style>
                .bilan-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                
                .page-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .page-header__content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .page-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
                .page-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                
                .header-actions { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
                .month-selector { display: flex; align-items: center; gap: 10px; background: #f8fafc; padding: 8px 15px; border-radius: 12px; border: 1px solid #e2e8f0; }
                .month-label { font-size: 12px; font-weight: 700; color: #475569; margin: 0; }
                .month-select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-weight: 600; color: #0f172a; outline: none; cursor: pointer; }
                .month-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
                
                .btn-refresh { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
                .btn-refresh:hover { background: #f1f5f9; color: #0f172a; }

                /* Sub Nav */
                .bf-tabs { display: flex; gap: 10px; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; overflow-x: auto; }
                .bf-tab { padding: 8px 16px; font-weight: 700; font-size: 14px; color: #64748b; cursor: pointer; border-radius: 8px; transition: 0.2s; text-decoration: none; white-space: nowrap; }
                .bf-tab:hover { background: #f1f5f9; color: #0f172a; }
                .bf-tab.active { background: #eff6ff; color: #2563eb; }

                /* KPI Grid */
                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .kpi-card { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; position: relative; overflow: hidden; transition: transform 0.2s; }
                .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
                
                .kpi-card__header { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
                .kpi-card__icon { font-size: 18px; }
                .kpi-card__label { font-size: 13px; font-weight: 700; color: #475569; }
                .kpi-card__value { font-size: 24px; font-weight: 900; color: #0f172a; margin-bottom: 10px; }
                
                .kpi-card__evolution { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; width: fit-content; }
                .kpi-card__evolution.positive { background: #dcfce7; color: #166534; }
                .kpi-card__evolution.negative { background: #fee2e2; color: #991b1b; }
                .kpi-card__evolution.neutral { background: #f1f5f9; color: #475569; }
                
                .kpi-card--blue { border-top: 4px solid #3b82f6; }
                .kpi-card--green { border-top: 4px solid #10b981; }
                .kpi-card--purple { border-top: 4px solid #8b5cf6; }
                .kpi-card--orange { border-top: 4px solid #f59e0b; }
                .kpi-card--indigo { border-top: 4px solid #4f46e5; }
                .kpi-card--red { border-top: 4px solid #ef4444; }

                /* Charts Layout */
                .charts-row { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 24px; }
                @media (max-width: 992px) { .charts-row { grid-template-columns: 1fr; } }
                
                .chart-card { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .chart-header { margin-bottom: 20px; }
                .chart-title { margin: 0; font-size: 16px; font-weight: 800; color: #1e293b; }
                .chart-subtitle { margin: 4px 0 0 0; font-size: 12px; color: #64748b; }
                .chart-canvas-wrap { position: relative; height: 320px; width: 100%; }

                /* Objectives Section */
                .objectifs-section { background: white; border-radius: 16px; padding: 25px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
                .section-header { margin-bottom: 25px; }
                .section-title { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
                .section-subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                
                .objectifs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
                .objectif-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
                .objectif-card__header { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
                .objectif-icon { font-size: 20px; }
                .objectif-label { font-weight: 700; color: #1e293b; font-size: 14px; }
                
                .objectif-values { display: flex; justify-content: space-between; margin-bottom: 12px; }
                .objectif-value { display: flex; flex-direction: column; }
                .value-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 2px; }
                .value-amount { font-size: 16px; font-weight: 800; color: #0f172a; }
                
                .objectif-progress { display: flex; align-items: center; gap: 15px; }
                .progress-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
                .progress-fill { height: 100%; border-radius: 4px; transition: width 1s ease-out; }
                .progress-fill.success { background: #10b981; }
                .progress-fill.warning { background: #f59e0b; }
                .progress-fill.danger { background: #ef4444; }
                .progress-label { font-weight: 800; font-size: 13px; color: #1e293b; width: 45px; text-align: right; }

                /* Metrics Card */
                .metrics-list { display: flex; flex-direction: column; gap: 15px; }
                .metric-item { display: flex; align-items: center; gap: 15px; padding: 15px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
                .metric-icon { font-size: 24px; background: white; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                .metric-content { flex: 1; display: flex; flex-direction: column; }
                .metric-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; }
                .metric-value { font-size: 18px; font-weight: 900; color: #0f172a; }
                
                /* --- STYLES SPECIFIQUES DIRECTION 12M --- */
                .kpi-grid--3 { grid-template-columns: repeat(3, 1fr); }
                .human-note { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 8px; margin-bottom: 24px; }
                .human-note__title { font-weight: bold; margin-bottom: 5px; color: #1e293b; font-size: 14px; }
                .human-note__text { font-size: 13px; color: #475569; margin: 0 0 10px 0; }
                .human-chip { background: #e2e8f0; padding: 4px 10px; border-radius: 12px; font-size: 11px; margin-right: 5px; display: inline-block; font-weight: 600; color: #334155; }
                .kpi-card--violet { border-top: 4px solid #8b5cf6; }
                .kpi-card--cyan { border-top: 4px solid #06b6d4; }
                .kpi-card__sub { font-size: 12px; color: #64748b; margin-top: 5px; }
                .pct-up { color: #10b981; background: #dcfce7; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
                .pct-down { color: #ef4444; background: #fee2e2; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
                .actions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .action-card { background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: left; display: flex; flex-direction: column; gap: 5px; cursor: pointer; transition: 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .action-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .action-card--red { border-left: 4px solid #ef4444; }
                .action-card--orange { border-left: 4px solid #f59e0b; }
                .action-card--blue { border-left: 4px solid #3b82f6; }
                .action-card--green { border-left: 4px solid #10b981; }
                .filters-grid { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
                .filter-chip { padding: 8px 16px; border-radius: 20px; border: 1px solid #cbd5e1; background: white; cursor: pointer; font-weight: 600; font-size: 13px; color: #475569; transition: 0.2s; }
                .filter-chip:hover { background: #f1f5f9; color: #0f172a; }
                .containers-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .container-card { background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .container-card__ref { font-size: 20px; font-weight: 900; margin-bottom: 12px; color: #0f172a; }
                .container-card__stats { display: flex; gap: 15px; }
                .container-card__stat { display: flex; flex-direction: column; }
                .container-card__stat-value { font-weight: 800; font-size: 15px; color: #1e293b; }
                .container-card__stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
            </style>

            <div class="bilan-page">
                
                <div class="bf-tabs">
                    <a href="#" class="bf-tab ${this.activeTab === 'monthly' ? 'active' : ''}" onclick="window.app.views.bilansFinanciers.switchTab('monthly')">Bilan Mensuel</a>
                    <a href="#" class="bf-tab ${this.activeTab === 'yearly' ? 'active' : ''}" onclick="window.app.views.bilansFinanciers.switchTab('yearly')">Bilan Annuel</a>
                    <a href="#" class="bf-tab ${this.activeTab === 'boat' ? 'active' : ''}" onclick="window.app.views.bilansFinanciers.switchTab('boat')">Bilan par Conteneur</a>
                    <a href="#" class="bf-tab ${this.activeTab === '12m' ? 'active' : ''}" onclick="window.app.views.bilansFinanciers.switchTab('12m')">Direction 12M</a>
                </div>
                
                <div class="page-header">
                    <div class="page-header__content">
                        <div>
                            <h1 class="page-header__title">📊 ${title}</h1>
                            <p class="page-header__subtitle">${subtitle}</p>
                        </div>
                        <div class="header-actions">
                            <div class="month-selector">
                                <label class="month-label">📅 ${selectorLabel}</label>
                                <select class="month-select" id="bfPeriodSelect" onchange="window.app.views.bilansFinanciers.changePeriod()">
                                    <option value="">Chargement...</option>
                                </select>
                            </div>
                            <button class="btn-refresh" onclick="window.app.views.bilansFinanciers.loadData()">
                                🔄 Rafraîchir
                            </button>
                            ${this.activeTab === '12m' ? '<button class="btn-refresh" onclick="window.print()"><i class="fas fa-file-pdf"></i> PDF</button>' : ''}
                        </div>
                    </div>
                </div>

                <div id="bilanContent" style="min-height: 400px;">
                    <div style="text-align: center; padding: 50px;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.loadSettings();
        this.loadData();
    },
    async loadSettings() {
        try {
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const objSnap = await getDoc(doc(db, "settings", `objectives_${activeAgency}`));
            if (objSnap.exists()) {
                this.objectives = { ...this.objectives, ...objSnap.data() };
            }
        } catch(e) { console.error("Erreur chargement objectifs:", e); }
    },

    switchTab(tab) {
        this.activeTab = tab;
        this.selectedPeriod = null; // Réinitialiser la période lors d'un changement d'onglet
        this.render(this.app, tab); // Recharger la vue pour le nouvel onglet
    },

    changePeriod() {
        const select = document.getElementById('bfPeriodSelect');
        if (select) {
            this.selectedPeriod = select.value;
            this.renderContent();
        }
    },

    loadData() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        if (this.unsubTrans) this.unsubTrans();
        const qTrans = query(collection(db, getCollectionName("transactions")), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        this.unsubTrans = onSnapshot(qTrans, snap => {
            this.transactions = snap.docs.map(d => d.data());
            this.checkAndRender();
        });

        if (this.unsubLiv) this.unsubLiv();
        const qLiv = query(collection(db, getCollectionName("livraisons")), where("agency", "==", activeAgency));
        this.unsubLiv = onSnapshot(qLiv, snap => {
            this.livraisons = snap.docs.map(d => d.data());
            this.checkAndRender();
        });

        if (this.unsubExp) this.unsubExp();
        const qExp = query(collection(db, getCollectionName("expenses")), where("isDeleted", "==", false), where("agency", "==", activeAgency));
        this.unsubExp = onSnapshot(qExp, snap => {
            this.expenses = snap.docs.map(d => d.data());
            this.checkAndRender();
        });

        if (this.unsubCont) this.unsubCont();
        this.unsubCont = onSnapshot(query(collection(db, getCollectionName("containers")), where("agency", "==", activeAgency)), snap => {
            this.containers = snap.docs.map(d => ({id: d.id, ...d.data()}));
            this.checkAndRender();
        });
    },

    checkAndRender() {
        if (this.transactions && this.expenses && this.livraisons && this.containers) {
            this.renderContent();
        }
    },

    renderContent() {
        const container = document.getElementById('bilanContent');
        const select = document.getElementById('bfPeriodSelect');
        if (!container) return;

        if (this.activeTab === '12m') {
            if (select) select.parentElement.style.display = 'none'; // Pas besoin du selecteur mensuel
            return this.render12MContent(container);
        }
        if (select) select.parentElement.style.display = '';

        // Traitement global des données
        const data = this.processData();
        let labels = Object.keys(data);
        if (this.activeTab === 'boat') {
            labels.sort((a, b) => {
                const numA = parseInt((a.match(/\d+/) || [0])[0]);
                const numB = parseInt((b.match(/\d+/) || [0])[0]);
                if (numA !== numB) return numB - numA;
                return b.localeCompare(a);
            });
        } else {
            labels.sort((a,b) => b.localeCompare(a));
        }

        if (labels.length === 0) {
            if (select) select.innerHTML = '<option value="">Aucune donnée</option>';
            container.innerHTML = '<div class="form-card" style="text-align:center; padding: 40px;">Aucune donnée à afficher pour cette période.</div>';
            return;
        }

        // Mise à jour du Select
        if (select) {
            const currentVal = this.selectedPeriod || labels[0];
            select.innerHTML = labels.map(l => {
                let displayLabel = l;
                if (this.activeTab === 'monthly' && l.includes('-')) {
                    const [y, m] = l.split('-');
                    const date = new Date(y, parseInt(m)-1);
                    displayLabel = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                }
                return `<option value="${l}" ${l === currentVal ? 'selected' : ''}>${displayLabel}</option>`;
            }).join('');
            this.selectedPeriod = currentVal;
        }

        const currentData = data[this.selectedPeriod];
        if (!currentData) return;
        
        // Trouver la période précédente pour l'évolution
        const currentIndex = labels.indexOf(this.selectedPeriod);
        const prevData = (currentIndex + 1 < labels.length) ? data[labels[currentIndex + 1]] : null;

        // Fonction pour générer le badge d'évolution
        const renderEvol = (curr, prev, inverseColors = false) => {
            if (!prev || prev === 0) return `<div class="kpi-card__evolution neutral"><span>—</span></div>`;
            const diff = ((curr - prev) / prev) * 100;
            const sign = diff > 0 ? '+' : '';
            const isPositive = diff > 0;
            
            let colorClass = 'neutral';
            if (diff > 0) colorClass = inverseColors ? 'negative' : 'positive';
            if (diff < 0) colorClass = inverseColors ? 'positive' : 'negative';
            
            const icon = diff > 0 ? '📈' : '📉';
            return `<div class="kpi-card__evolution ${colorClass}"><span class="evolution-icon">${icon}</span><span>${sign}${diff.toFixed(1)}% vs préc.</span></div>`;
        };

        

        const getColorObj = (pct) => pct >= 100 ? 'success' : (pct >= 50 ? 'warning' : 'danger');



        let kpiGridHtml = '';
        let objectivesHtml = '';
        let metricsHtml = '';

        if (this.activeTab === 'boat') {
            const maxCBM = 68; // Capacité moyenne 40HC
            const fillRate = currentData.volumeCBM > 0 ? ((currentData.volumeCBM / maxCBM) * 100).toFixed(1) : 0;
            const targetBenefice = this.objectives.boatTarget || 25000;
            const pctBenefice = Math.min(100, (currentData.benefice / targetBenefice) * 100);
            const pctVol = Math.min(100, (currentData.volumeCBM / maxCBM) * 100);
            const rentabiliteCBM = currentData.volumeCBM > 0 ? (currentData.benefice / currentData.volumeCBM) : 0;
            const tauxEncaissement = currentData.ca > 0 ? ((currentData.encaissements / currentData.ca) * 100).toFixed(1) : 0;
            const margeNet = currentData.ca > 0 ? ((currentData.benefice / currentData.ca) * 100).toFixed(1) : 0;

            const containerMeta = this.containers.find(c => (c.number || c.id) === this.selectedPeriod) || {};
            const statutConteneur = containerMeta.status || 'Inconnu';
            let statusBadge = '';
            if (statutConteneur === 'EN_CHARGEMENT') statusBadge = '<span class="badge" style="background:#fef3c7; color:#d97706; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px;">En chargement</span>';
            else if (statutConteneur === 'EN_ATTENTE_BATEAU') statusBadge = '<span class="badge" style="background:#e0f2fe; color:#0284c7; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px;">Attente bateau</span>';
            else if (statutConteneur === 'EN_TRANSIT') statusBadge = '<span class="badge" style="background:#dbeafe; color:#2563eb; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px;">En mer</span>';
            else if (statutConteneur === 'ARRIVE') statusBadge = '<span class="badge" style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px;">Arrivé / Dépoté</span>';
            else statusBadge = `<span class="badge" style="background:#f1f5f9; color:#475569; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px;">${statutConteneur}</span>`;

            const dateDepart = containerMeta.departureDate ? new Date(containerMeta.departureDate).toLocaleDateString('fr-FR') : 'Non définie';
            const dateArrivee = containerMeta.realArrivalDate ? new Date(containerMeta.realArrivalDate).toLocaleDateString('fr-FR') : (containerMeta.arrivalDate ? new Date(containerMeta.arrivalDate).toLocaleDateString('fr-FR') : 'Non définie');

            kpiGridHtml = `
                <div class="kpi-card kpi-card--indigo" style="grid-column: 1 / -1; display:flex; justify-content:space-between; align-items:center; flex-direction:row;">
                    <div>
                        <div style="font-size: 13px; color: #64748b; font-weight:700; text-transform:uppercase;">Conteneur sélectionné</div>
                        <div style="font-size: 28px; font-weight: 900; color: #0f172a;">${this.selectedPeriod}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="margin-bottom:8px;">${statusBadge}</div>
                        <div style="font-size:13px; color:#64748b; font-weight:600;"><strong>Départ :</strong> ${dateDepart}</div>
                        <div style="font-size:13px; color:#64748b; font-weight:600; margin-top:4px;"><strong>Arrivée :</strong> ${dateArrivee}</div>
                    </div>
                </div>

                <div class="kpi-card kpi-card--blue">
                    <div class="kpi-card__header"><span class="kpi-card__icon">💰</span><span class="kpi-card__label">CA Facturé</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(currentData.ca)}</div>
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; background: #f1f5f9; padding: 4px 8px; border-radius: 12px; display: inline-block;">📑 ${currentData.factures} factures</div>
                </div>
                <div class="kpi-card kpi-card--green">
                    <div class="kpi-card__header"><span class="kpi-card__icon">💵</span><span class="kpi-card__label">Encaissements</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(currentData.encaissements)}</div>
                    <div style="font-size: 11px; color: #166534; font-weight: 600; background: #dcfce7; padding: 4px 8px; border-radius: 12px; display: inline-block;">📈 ${tauxEncaissement}% recouvré</div>
                </div>
                <div class="kpi-card kpi-card--red">
                    <div class="kpi-card__header"><span class="kpi-card__icon">⚠️</span><span class="kpi-card__label">Reste à encaisser</span></div>
                    <div class="kpi-card__value" style="color: #ef4444;">${this.app.formatMoney(currentData.resteAEncaisser)}</div>
                    <div style="font-size: 11px; color: #991b1b; font-weight: 600; background: #fee2e2; padding: 4px 8px; border-radius: 12px; display: inline-block;">Dettes clients</div>
                </div>
                <div class="kpi-card kpi-card--purple">
                    <div class="kpi-card__header"><span class="kpi-card__icon">📉</span><span class="kpi-card__label">Total Dépenses</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(currentData.depenses)}</div>
                    <div style="font-size: 11px; color: #7e22ce; font-weight: 600; background: #f3e8ff; padding: 4px 8px; border-radius: 12px; display: inline-block;">Coûts du conteneur</div>
                </div>
                <div class="kpi-card kpi-card--orange">
                    <div class="kpi-card__header"><span class="kpi-card__icon">📦</span><span class="kpi-card__label">Total Colis</span></div>
                    <div class="kpi-card__value">${currentData.livraisonsTotal}</div>
                    <div style="display:flex; gap:8px; font-size:11px; font-weight:600;">
                        <span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 12px;">✅ ${currentData.livraisonsLivre} livrés</span>
                        <span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 12px;">❌ ${currentData.colisNonLivres} restants</span>
                    </div>
                </div>
                <div class="kpi-card kpi-card--indigo">
                    <div class="kpi-card__header"><span class="kpi-card__icon">💼</span><span class="kpi-card__label">Bénéfice Net</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(currentData.benefice)}</div>
                    <div style="font-size: 11px; color: #4338ca; font-weight: 600; background: #e0e7ff; padding: 4px 8px; border-radius: 12px; display: inline-block;">Marge Brute : ${margeNet}%</div>
                </div>
            `;

            objectivesHtml = `
                <div class="objectif-card">
                    <div class="objectif-card__header"><span class="objectif-icon">💼</span><span class="objectif-label">Objectif Bénéfice</span></div>
                    <div class="objectif-values">
                        <div class="objectif-value"><span class="value-label">Réalisé</span><span class="value-amount">${this.app.formatMoney(currentData.benefice)}</span></div>
                        <div class="objectif-value" style="text-align: right;"><span class="value-label">Objectif</span><span class="value-amount">${this.app.formatMoney(targetBenefice)}</span></div>
                    </div>
                    <div class="objectif-progress">
                        <div class="progress-bar"><div class="progress-fill ${getColorObj(pctBenefice)}" style="width: ${Math.max(0, pctBenefice)}%;"></div></div>
                        <span class="progress-label">${Math.max(0, pctBenefice).toFixed(1)}%</span>
                    </div>
                </div>
                <div class="objectif-card">
                    <div class="objectif-card__header"><span class="objectif-icon">📐</span><span class="objectif-label">Remplissage Conteneur (CBM)</span></div>
                    <div class="objectif-values">
                        <div class="objectif-value"><span class="value-label">Actuel</span><span class="value-amount">${currentData.volumeCBM.toFixed(2)} m³</span></div>
                        <div class="objectif-value" style="text-align: right;"><span class="value-label">Capacité (40HC)</span><span class="value-amount">${maxCBM} m³</span></div>
                    </div>
                    <div class="objectif-progress">
                        <div class="progress-bar"><div class="progress-fill ${getColorObj(pctVol)}" style="width: ${pctVol}%;"></div></div>
                        <span class="progress-label">${pctVol.toFixed(1)}%</span>
                    </div>
                </div>
            `;

            const pmArray = Object.entries(currentData.modesPaiement).sort((a,b) => b[1] - a[1]);
            const pmHtml = pmArray.length > 0 ? pmArray.map(([m, val]) => `
                <div style="display:flex; justify-content:space-between; font-size:13px; padding: 8px 0; border-bottom:1px solid #f1f5f9;">
                    <span style="color:#475569; font-weight:600;">${m}</span>
                    <span style="font-weight:800; color:#0f172a;">${this.app.formatMoney(val)}</span>
                </div>
            `).join('') : '<div style="font-size:13px; color:#64748b; padding:8px 0;">Aucun paiement</div>';

            const depArray = Object.entries(currentData.categoriesDepenses || {}).sort((a,b) => b[1] - a[1]);
            const depHtml = depArray.length > 0 ? depArray.map(([cat, val]) => `
                <div style="display:flex; justify-content:space-between; font-size:13px; padding: 8px 0; border-bottom:1px solid #fef2f2;">
                    <span style="color:#475569; font-weight:600;">${cat || 'Autre'}</span>
                    <span style="font-weight:800; color:#991b1b;">${this.app.formatMoney(val)}</span>
                </div>
            `).join('') : '<div style="font-size:13px; color:#64748b; padding:8px 0;">Aucune dépense</div>';

            metricsHtml = `
                <div class="metric-item" style="margin-bottom: 20px;"><span class="metric-icon">💎</span><div class="metric-content"><span class="metric-label">Bénéfice par CBM</span><span class="metric-value">${this.app.formatMoney(rentabiliteCBM)}</span></div></div>
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
                    <h4 style="font-size:13px; font-weight:800; color:#1e293b; margin: 0 0 10px 0; display:flex; align-items:center; gap:8px;"><span>💳</span> Répartition des encaissements</h4>
                    ${pmHtml}
                </div>
                <div style="background: #fff5f5; border: 1px solid #fecaca; border-radius: 12px; padding: 15px;">
                    <h4 style="font-size:13px; font-weight:800; color:#991b1b; margin: 0 0 10px 0; display:flex; align-items:center; gap:8px;"><span>📉</span> Répartition des dépenses</h4>
                    ${depHtml}
                </div>
            `;
        } else {
            let targetCA = this.activeTab === 'monthly' ? (this.objectives.monthlyTarget || 50000) : (this.objectives.yearlyTarget || 600000);
            let targetFactures = this.activeTab === 'monthly' ? 250 : 3000;
            const pctCA = Math.min(100, (currentData.ca / targetCA) * 100);
            const pctFact = Math.min(100, (currentData.factures / targetFactures) * 100);

            kpiGridHtml = `
                <div class="kpi-card kpi-card--blue">
                    <div class="kpi-card__header"><span class="kpi-card__icon">💰</span><span class="kpi-card__label">CA Facturé</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(currentData.ca)}</div>
                    ${renderEvol(currentData.ca, prevData?.ca)}
                </div>
                <div class="kpi-card kpi-card--green">
                    <div class="kpi-card__header"><span class="kpi-card__icon">💵</span><span class="kpi-card__label">Encaissements</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(currentData.encaissements)}</div>
                    ${renderEvol(currentData.encaissements, prevData?.encaissements)}
                </div>
                <div class="kpi-card kpi-card--purple">
                    <div class="kpi-card__header"><span class="kpi-card__icon">📄</span><span class="kpi-card__label">Factures</span></div>
                    <div class="kpi-card__value">${currentData.factures}</div>
                    ${renderEvol(currentData.factures, prevData?.factures)}
                </div>
                <div class="kpi-card kpi-card--orange">
                    <div class="kpi-card__header"><span class="kpi-card__icon">📦</span><span class="kpi-card__label">Colis</span></div>
                    <div class="kpi-card__value">${currentData.colis}</div>
                    ${renderEvol(currentData.colis, prevData?.colis)}
                </div>
                <div class="kpi-card kpi-card--indigo">
                    <div class="kpi-card__header"><span class="kpi-card__icon">👥</span><span class="kpi-card__label">Clients actifs</span></div>
                    <div class="kpi-card__value">${currentData.clients.size}</div>
                    ${renderEvol(currentData.clients.size, prevData?.clients?.size)}
                </div>
                <div class="kpi-card kpi-card--red">
                    <div class="kpi-card__header"><span class="kpi-card__icon">💼</span><span class="kpi-card__label">Solde (Bénéfice)</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(currentData.benefice)}</div>
                    ${renderEvol(currentData.benefice, prevData?.benefice)}
                </div>
             `;

            objectivesHtml = `    
                <div class="objectif-card">
                <div class="objectif-card__header"><span class="objectif-icon">💰</span><span class="objectif-label">Chiffre d'affaires</span></div>
                    <div class="objectif-values">
                        <div class="objectif-value"><span class="value-label">Réalisé</span><span class="value-amount">${this.app.formatMoney(currentData.ca)}</span></div>
                        <div class="objectif-value" style="text-align: right;"><span class="value-label">Objectif</span><span class="value-amount">${this.app.formatMoney(targetCA)}</span></div>
                    </div>
                    <div class="objectif-progress">
                        <div class="progress-bar"><div class="progress-fill ${getColorObj(pctCA)}" style="width: ${pctCA}%;"></div></div>
                        <span class="progress-label">${pctCA.toFixed(1)}%</span>
                    </div>
                </div>

                <div class="objectif-card">
                    <div class="objectif-card__header"><span class="objectif-icon">📄</span><span class="objectif-label">Factures éditées</span></div>
                        <div class="objectif-values">
                            <div class="objectif-value"><span class="value-label">Réalisé</span><span class="value-amount">${currentData.factures}</span></div>
                            <div class="objectif-value" style="text-align: right;"><span class="value-label">Objectif</span><span class="value-amount">${targetFactures}</span></div>
                        </div>
                        <div class="objectif-progress">
                            <div class="progress-bar"><div class="progress-fill ${getColorObj(pctFact)}" style="width: ${pctFact}%;"></div></div>
                            <span class="progress-label">${pctFact.toFixed(1)}%</span>
                        </div>
                    </div>

                    `;

            metricsHtml = `
                <div class="metric-item"><span class="metric-icon">🛒</span><div class="metric-content"><span class="metric-label">Panier moyen</span><span class="metric-value">${this.app.formatMoney(currentData.factures ? currentData.ca / currentData.factures : 0)}</span></div></div>
                <div class="metric-item"><span class="metric-icon">💳</span><div class="metric-content"><span class="metric-label">Taux d'encaissement</span><span class="metric-value">${currentData.ca ? ((currentData.encaissements / currentData.ca)*100).toFixed(1) : 0}%</span></div></div>
                <div class="metric-item"><span class="metric-icon">✅</span><div class="metric-content"><span class="metric-label">Taux de livraison</span><span class="metric-value">${currentData.livraisonsTotal ? ((currentData.livraisonsLivre / currentData.livraisonsTotal)*100).toFixed(1) : 0}%</span></div></div>
            `;
        }

        container.innerHTML = `
            <!-- KPI GRID -->
            <div class="kpi-grid">
                ${kpiGridHtml}
            </div>

            <!-- CHARTS ROW 1 -->
            <div class="charts-row">
                <div class="chart-card">
                    <div class="chart-header">
                        <h3 class="chart-title">📊 Comparaison financière</h3>
                        <p class="chart-subtitle">Évolution du CA, encaissements et dépenses</p>
                    </div>
                    <div class="chart-canvas-wrap"><canvas id="chart-finance"></canvas></div>
                </div>
                <div class="chart-card">
                    <div class="chart-header">
                        <h3 class="chart-title">📈 Volume d'activité</h3>
                        <p class="chart-subtitle">Factures et colis traités</p>
                    </div>
                    <div class="chart-canvas-wrap"><canvas id="chart-activity"></canvas></div>
                </div>
            </div>

            <!-- OBJECTIVES & METRICS ROW -->
            <div class="charts-row">
                <div class="objectifs-section" style="margin-bottom: 0;">
                    <div class="section-header">
                        <h2 class="section-title">🎯 Réalisation des objectifs</h2>
                        <p class="section-subtitle">Comparaison entre les objectifs fixés et les résultats obtenus</p>
                    </div>
                    <div class="objectifs-grid" style="grid-template-columns: 1fr;">
                        ${objectivesHtml}
                    </div>
                </div>

                <div class="chart-card" style="display: flex; flex-direction: column;">
                    <div class="chart-header">
                        <h3 class="chart-title">🎯 Métriques clés</h3>
                        <p class="chart-subtitle">Indicateurs de performance qualité</p>
                    </div>
                    <div class="metrics-list" style="flex: 1; justify-content: center;">
                        ${metricsHtml}
                    </div>
                </div>
            </div>
        `;

        this.renderCharts(data, labels);
    },

    processData() {
        const grouped = {};
        const getKey = (dateStr, conteneurStr) => {
            if (this.activeTab === 'boat') return (conteneurStr || 'SANS_CTN').trim().toUpperCase();
            if (!dateStr) return 'Indéfini';
            if (this.activeTab === 'yearly') return dateStr.substring(0, 4); // YYYY
            return dateStr.substring(0, 7); // YYYY-MM
        };

        // Identification du conteneur actif pour lui assigner les volumes restants (reliquats)
        let activeCtnName = null;
        if (this.activeTab === 'boat') {
            const activeContainer = this.containers.find(c => c.status === 'EN_CHARGEMENT');
            if (activeContainer) activeCtnName = (activeContainer.number || activeContainer.id).trim().toUpperCase();
        }

        // Init keys based on transactions, expenses, livraisons
        this.transactions.forEach(t => {
            const key = getKey(t.date, t.conteneur);
            if (!grouped[key]) grouped[key] = { ca: 0, encaissements: 0, depenses: 0, factures: 0, colis: 0, volumeCBM: 0, clients: new Set(), livraisonsLivre: 0, livraisonsTotal: 0, benefice: 0, resteAEncaisser: 0, colisNonLivres: 0, modesPaiement: {}, categoriesDepenses: {} };
            
            const ca = (parseFloat(t.prix) || 0) / this.TAUX_CONVERSION;
            const encaissements = ((parseFloat(t.montantParis) || 0) + (parseFloat(t.montantAbidjan) || 0)) / this.TAUX_CONVERSION;

            grouped[key].ca += ca;
            grouped[key].encaissements += encaissements;
            grouped[key].resteAEncaisser += Math.max(0, ca - encaissements);
            grouped[key].factures += 1;
            grouped[key].colis += (parseInt(t.quantite) || 1);
            if (t.nom) grouped[key].clients.add(t.nom);

            if (t.paymentHistory && t.paymentHistory.length > 0) {
                t.paymentHistory.forEach(ph => {
                    const mode = ph.modePaiement || 'Non défini';
                    const phAmount = ((parseFloat(ph.montantParis) || 0) + (parseFloat(ph.montantAbidjan) || 0)) / this.TAUX_CONVERSION;
                    if (phAmount > 0) {
                        grouped[key].modesPaiement[mode] = (grouped[key].modesPaiement[mode] || 0) + phAmount;
                    }
                });
            } else if (encaissements > 0) {
                const mode = t.modePaiement || 'Non défini';
                grouped[key].modesPaiement[mode] = (grouped[key].modesPaiement[mode] || 0) + encaissements;
            }
        });

        this.expenses.forEach(e => {
            const key = getKey(e.date, e.conteneur);
            if (!grouped[key]) grouped[key] = { ca: 0, encaissements: 0, depenses: 0, factures: 0, colis: 0, volumeCBM: 0, clients: new Set(), livraisonsLivre: 0, livraisonsTotal: 0, benefice: 0, resteAEncaisser: 0, colisNonLivres: 0, modesPaiement: {}, categoriesDepenses: {} };
            
            const mnt = parseFloat(e.montant) || 0;
            grouped[key].depenses += mnt;
            
            const cat = e.category || 'Non définie';
            grouped[key].categoriesDepenses[cat] = (grouped[key].categoriesDepenses[cat] || 0) + mnt;
        });

        this.livraisons.forEach(l => {
            const originalKey = getKey(l.dateAjout || l.date, l.conteneur);
            let volumeKey = originalKey;
            
            // LOGIQUE RELIQUATS : Si on est en vue conteneur, que le colis est toujours à PARIS (non expédié),
            // on ajoute son volume au conteneur actuellement en chargement (qui héritera de cet espace physique).
            if (this.activeTab === 'boat' && l.containerStatus === 'PARIS' && activeCtnName) {
                volumeKey = activeCtnName;
            }

            if (!grouped[originalKey]) grouped[originalKey] = { ca: 0, encaissements: 0, depenses: 0, factures: 0, colis: 0, volumeCBM: 0, clients: new Set(), livraisonsLivre: 0, livraisonsTotal: 0, benefice: 0, resteAEncaisser: 0, colisNonLivres: 0, modesPaiement: {}, categoriesDepenses: {} };
            
            const qte = parseInt(l.quantite) || 1;
            grouped[originalKey].livraisonsTotal += qte;
            if (l.status === 'LIVRE') {
                grouped[originalKey].livraisonsLivre += qte;
            } else if (l.status === 'LIVRAISON_PARTIELLE' || l.status === 'PARTIEL') {
                const qteL = parseInt(l.quantiteLivree) || 0;
                grouped[originalKey].livraisonsLivre += qteL;
                grouped[originalKey].colisNonLivres += Math.max(0, qte - qteL);
            } else {
                grouped[originalKey].colisNonLivres += qte;
            }
            
            if (volumeKey !== originalKey && !grouped[volumeKey]) grouped[volumeKey] = { ca: 0, encaissements: 0, depenses: 0, factures: 0, colis: 0, volumeCBM: 0, clients: new Set(), livraisonsLivre: 0, livraisonsTotal: 0, benefice: 0, resteAEncaisser: 0, colisNonLivres: 0, modesPaiement: {}, categoriesDepenses: {} };
            grouped[volumeKey].volumeCBM += (parseFloat(l.volumeCBM) || 0);
        });

        for (const key in grouped) {
            grouped[key].benefice = grouped[key].ca - grouped[key].depenses;
        }

        return grouped;
    },

    render12MContent(container) {
        const now = new Date();
        const t7 = new Date(now); t7.setDate(now.getDate() - 7);
        const t30 = new Date(now); t30.setDate(now.getDate() - 30);
        const t60 = new Date(now); t60.setDate(now.getDate() - 60);
        const t90 = new Date(now); t90.setDate(now.getDate() - 90);
        const t365 = new Date(now); t365.setFullYear(now.getFullYear() - 1);
        const t730 = new Date(now); t730.setFullYear(now.getFullYear() - 2);

        let ca7j=0, fact7j=0, ca30j=0, fact30j=0, ca12m=0, fact12m=0, caN1=0, factN1=0;
        let totalImpayes=0, factImpayes=0;

        const clients12M = new Map(); const clientsN1 = new Map(); const allClients = new Map();
        const agents12M = new Map();
        const monthlyData = {};

        // Init des 13 derniers mois pour le chart
        for(let i=12; i>=0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            monthlyData[mk] = { key: mk, ca: 0, factures: 0, clients: new Set(), newClients: new Set(), caNew: 0, caExist: 0 };
        }

        this.transactions.forEach(t => {
            if (t.isDeleted) return;
            const date = new Date(t.date);
            const ca = (parseFloat(t.prix) || 0) / this.TAUX_CONVERSION;
            const nom = (t.nom || 'Inconnu').trim().toUpperCase();
            const agent = (t.saisiPar || 'Système').trim().toUpperCase();
            const reste = (parseFloat(t.reste) || 0) / this.TAUX_CONVERSION;

            if (!allClients.has(nom)) allClients.set(nom, { firstDate: date, totalUnpaid: 0, phone: t.numero || t.tel || '', factures: 0, ca: 0 });
            if (date < allClients.get(nom).firstDate) allClients.get(nom).firstDate = date;
            
            allClients.get(nom).factures++;
            allClients.get(nom).ca += ca;

            if (reste < 0) {
                totalImpayes += Math.abs(reste); factImpayes++;
                allClients.get(nom).totalUnpaid += Math.abs(reste);
            }

            if (date >= t7) { ca7j+=ca; fact7j++; }
            if (date >= t30) { ca30j+=ca; fact30j++; }

            if (date >= t365) {
                ca12m += ca; fact12m++;
                if (!clients12M.has(nom)) clients12M.set(nom, { ca: 0, factures: 0, lastDate: date, phone: t.numero || t.tel || '' });
                clients12M.get(nom).ca += ca;
                clients12M.get(nom).factures++;
                if (date > clients12M.get(nom).lastDate) clients12M.get(nom).lastDate = date;

                agents12M.set(agent, (agents12M.get(agent) || {ca:0, factures:0, clients:new Set()}));
                agents12M.get(agent).ca += ca; agents12M.get(agent).factures++; agents12M.get(agent).clients.add(nom);

                const mk = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
                if (monthlyData[mk]) {
                    monthlyData[mk].ca += ca;
                    monthlyData[mk].factures++;
                    monthlyData[mk].clients.add(nom);
                }
            } else if (date >= t730 && date < t365) {
                caN1 += ca; factN1++;
                clientsN1.set(nom, (clientsN1.get(nom)||0) + 1);
            }
        });

        // Identification Nouveaux vs Existants par mois
        this.transactions.forEach(t => {
            if (t.isDeleted) return;
            const date = new Date(t.date);
            if (date >= t365) {
                const nom = (t.nom || 'Inconnu').trim().toUpperCase();
                const mk = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
                const ca = (parseFloat(t.prix) || 0) / this.TAUX_CONVERSION;

                if (monthlyData[mk]) {
                    const firstD = allClients.get(nom).firstDate;
                    const mkFirst = `${firstD.getFullYear()}-${String(firstD.getMonth()+1).padStart(2,'0')}`;
                    if (mkFirst === mk) {
                        monthlyData[mk].newClients.add(nom);
                        monthlyData[mk].caNew += ca;
                    } else {
                        monthlyData[mk].caExist += ca;
                    }
                }
            }
        });

        // Calculs avancés
        let actifs30j = 0, actifs60j = 0, actifs90j = 0;
        let reactives = 0;
        let top10CA = 0;
        let top20CA = 0;
        let caARisque = 0;
        let new30j = 0;
        
        const clientsArr = Array.from(clients12M.entries()).map(([nom, d]) => ({ nom, ...d }));
        clientsArr.sort((a,b) => b.ca - a.ca); // Tri par CA 12M

        clientsArr.forEach((c, idx) => {
            if (c.lastDate >= t30) actifs30j++;
            if (c.lastDate >= t60) actifs60j++;
            if (c.lastDate >= t90) actifs90j++;
            else caARisque += c.ca; // Inactif > 90j

            if (idx < 10) top10CA += c.ca;
            if (idx < 20) top20CA += c.ca;

            if (!clientsN1.has(c.nom) && allClients.get(c.nom).firstDate < t730) reactives++;
            
            if (allClients.get(c.nom).firstDate >= t30) new30j++;
        });

        let churnes = 0;
        clientsN1.forEach((count, nom) => { if (!clients12M.has(nom)) churnes++; });

        const tauxChurn = clientsN1.size > 0 ? (churnes / clientsN1.size) * 100 : 0;
        const tauxReac = clients12M.size > 0 ? (reactives / clients12M.size) * 100 : 0;
        const partTop10 = ca12m > 0 ? (top10CA / ca12m) * 100 : 0;
        
        const getEvol = (curr, prev) => {
            if (prev === 0) return curr > 0 ? `<div class="kpi-card__evolution positive"><span class="evolution-icon">📈</span><span>Nouveau</span></div>` : '';
            const pct = ((curr - prev) / prev) * 100;
            const cls = pct >= 0 ? 'positive' : 'negative';
            const ico = pct >= 0 ? '📈' : '📉';
            return `<div class="kpi-card__evolution ${cls}"><span class="evolution-icon">${ico}</span><span>${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs N-1</span></div>`;
        };

        // Segments
        let caReg = 0, caHab = 0, caDor = 0;
        clientsArr.forEach(c => {
            if (c.factures >= 5) caReg += c.ca;
            else if (c.factures >= 2) caHab += c.ca;
            else caDor += c.ca;
        });

        const topImpayes = Array.from(allClients.entries())
            .filter(c => c[1].totalUnpaid > 0)
            .sort((a,b) => b[1].totalUnpaid - a[1].totalUnpaid)
            .slice(0, 15);

        const agentsArr = Array.from(agents12M.entries()).map(([nom, d]) => ({nom, ...d})).sort((a,b) => b.ca - a.ca);
        const topCtns = this.containers.slice(0, 5);

        container.innerHTML = `
            <div class="kpi-grid kpi-grid--3">
                <div class="kpi-card kpi-card--blue">
                    <div class="kpi-card__header"><span class="kpi-card__icon">⚡</span><span class="kpi-card__label">CA 7 jours</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(ca7j)}</div>
                    <div class="kpi-card__sub">${fact7j} factures</div>
                </div>
                <div class="kpi-card kpi-card--green">
                    <div class="kpi-card__header"><span class="kpi-card__icon">📅</span><span class="kpi-card__label">CA 30 jours</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(ca30j)}</div>
                    <div class="kpi-card__sub">${fact30j} factures</div>
                </div>
                <div class="kpi-card kpi-card--red">
                    <div class="kpi-card__header"><span class="kpi-card__icon">🚨</span><span class="kpi-card__label">Impayés en cours</span></div>
                    <div class="kpi-card__value">${this.app.formatMoney(totalImpayes)}</div>
                    <div class="kpi-card__sub">${factImpayes} factures concernées</div>
                </div>
            </div>
            
            <div class="section-header">
                <h2 class="section-title">📊 Performance 12 mois</h2>
                <p class="section-subtitle">Indicateurs clés avec évolution annuelle</p>
            </div>
            
            <div class="human-note">
                <div class="human-note__title">Comment lire ces KPI ?</div>
                <p class="human-note__text">Ces cartes donnent une vue rapide de la santé commerciale : volume facturé, activité client, acquisition et risque. Le badge <strong>vs N-1</strong> permet de voir l'évolution annuelle.</p>
                <div class="human-note__chips">
                    <span class="human-chip">Hausse = momentum positif</span>
                    <span class="human-chip">Baisse = zone à investiguer</span>
                </div>
            </div>
            
            <div class="kpi-grid">
                <div class="kpi-card kpi-card--success"><div class="kpi-card__header"><span class="kpi-card__icon">💚</span><span class="kpi-card__label">CA 12M</span></div><div class="kpi-card__value">${this.app.formatMoney(ca12m)}</div>${getEvol(ca12m, caN1)}</div>
                <div class="kpi-card kpi-card--info"><div class="kpi-card__header"><span class="kpi-card__icon">💙</span><span class="kpi-card__label">Factures 12M</span></div><div class="kpi-card__value">${fact12m}</div>${getEvol(fact12m, factN1)}</div>
                <div class="kpi-card kpi-card--violet"><div class="kpi-card__header"><span class="kpi-card__icon">💜</span><span class="kpi-card__label">Clients 12M</span></div><div class="kpi-card__value">${clients12M.size}</div>${getEvol(clients12M.size, clientsN1.size)}</div>
                <div class="kpi-card kpi-card--cyan"><div class="kpi-card__header"><span class="kpi-card__icon">🩵</span><span class="kpi-card__label">Actifs 30j</span></div><div class="kpi-card__value">${actifs30j}</div><div class="kpi-card__sub">Activité récente</div></div>
                <div class="kpi-card kpi-card--cyan"><div class="kpi-card__header"><span class="kpi-card__icon">🩵</span><span class="kpi-card__label">Actifs 60j</span></div><div class="kpi-card__value">${actifs60j}</div><div class="kpi-card__sub">Activité intermédiaire</div></div>
                <div class="kpi-card kpi-card--cyan"><div class="kpi-card__header"><span class="kpi-card__icon">🩵</span><span class="kpi-card__label">Actifs 90j</span></div><div class="kpi-card__value">${actifs90j}</div><div class="kpi-card__sub">Base régulière</div></div>
                <div class="kpi-card kpi-card--primary"><div class="kpi-card__header"><span class="kpi-card__icon">🔷</span><span class="kpi-card__label">Panier moyen</span></div><div class="kpi-card__value">${this.app.formatMoney(fact12m ? ca12m/fact12m : 0)}</div></div>
                <div class="kpi-card kpi-card--primary"><div class="kpi-card__header"><span class="kpi-card__icon">🔷</span><span class="kpi-card__label">Fréquence</span></div><div class="kpi-card__value">${clients12M.size ? (fact12m/clients12M.size).toFixed(1) : 0}</div></div>
            </div>

            <div class="section-header">
                <h2 class="section-title">⚠️ Risques & Rétention</h2>
            </div>
            <div class="kpi-grid">
                <div class="kpi-card kpi-card--danger"><div class="kpi-card__header"><span class="kpi-card__icon">🔴</span><span class="kpi-card__label">Clients perdus (12M)</span></div><div class="kpi-card__value">${churnes}</div><div class="kpi-card__sub">Absents depuis 1 an</div></div>
                <div class="kpi-card kpi-card--danger"><div class="kpi-card__header"><span class="kpi-card__icon">🔴</span><span class="kpi-card__label">Taux perte (12M)</span></div><div class="kpi-card__value">${tauxChurn.toFixed(1)}%</div><div class="kpi-card__sub">Churnés / Base N-1</div></div>
                <div class="kpi-card kpi-card--success"><div class="kpi-card__header"><span class="kpi-card__icon">💚</span><span class="kpi-card__label">Réactivés (12M)</span></div><div class="kpi-card__value">${reactives}</div><div class="kpi-card__sub">Anciens clients de retour</div></div>
                <div class="kpi-card kpi-card--success"><div class="kpi-card__header"><span class="kpi-card__icon">💚</span><span class="kpi-card__label">Taux réactivation</span></div><div class="kpi-card__value">${tauxReac.toFixed(1)}%</div><div class="kpi-card__sub">Sur les actifs 12M</div></div>
                <div class="kpi-card kpi-card--warning"><div class="kpi-card__header"><span class="kpi-card__icon">🟡</span><span class="kpi-card__label">CA à risque</span></div><div class="kpi-card__value">${this.app.formatMoney(caARisque)}</div><div class="kpi-card__sub">Clients inactifs > 90j</div></div>
                <div class="kpi-card kpi-card--warning"><div class="kpi-card__header"><span class="kpi-card__icon">🟡</span><span class="kpi-card__label">Part CA Top 10</span></div><div class="kpi-card__value">${partTop10.toFixed(1)}%</div><div class="kpi-card__sub">Dépendance aux plus gros</div></div>
            </div>

            <div class="section-header"><h2 class="section-title">📈 Tendances</h2></div>
            
            <div class="charts-row">
                <div class="chart-card chart-card--large">
                    <div class="chart-header"><h3 class="chart-title">💰 CA mensuel</h3><p class="chart-subtitle">Évolution sur 13 mois</p></div>
                    <div class="chart-canvas-wrap"><canvas id="c12m-ca"></canvas></div>
                </div>
                <div class="chart-card">
                    <div class="chart-header"><h3 class="chart-title">👥 Clients Actifs vs Nouveaux</h3></div>
                    <div class="chart-canvas-wrap"><canvas id="c12m-clients"></canvas></div>
                </div>
            </div>

            <div class="charts-row">
                <div class="chart-card chart-card--large">
                    <div class="chart-header"><h3 class="chart-title">📊 Mix de Croissance (CA Existant vs Nouveau)</h3></div>
                    <div class="chart-canvas-wrap"><canvas id="c12m-mix"></canvas></div>
                </div>
                <div class="chart-card">
                    <div class="chart-header"><h3 class="chart-title">🛒 Panier Moyen Mensuel</h3></div>
                    <div class="chart-canvas-wrap"><canvas id="c12m-panier"></canvas></div>
                </div>
            </div>

            <div class="section-header"><h2 class="section-title">📑 Segmentation clients</h2></div>
            <div class="charts-row">
                <div class="chart-card">
                    <div class="chart-header"><h3 class="chart-title">🎯 Dépendance CA</h3><p class="chart-subtitle">Top 10 / 11-20 / Autres</p></div>
                    <div class="chart-canvas-wrap"><canvas id="c12m-pie1"></canvas></div>
                </div>
                <div class="chart-card">
                    <div class="chart-header"><h3 class="chart-title">📈 CA par Segment</h3><p class="chart-subtitle">Régulier / Habituel / Dormant</p></div>
                    <div class="chart-canvas-wrap"><canvas id="c12m-pie2"></canvas></div>
                </div>
            </div>

            <div class="section-header"><h2 class="section-title">🎯 Actions commerciales</h2></div>
            <div class="actions-grid">
                <div class="action-card action-card--red"><div style="font-size:12px; font-weight:700;">🔴 Réactiver</div><div style="font-size:24px; font-weight:900;">${clientsArr.filter(c => c.ca > 500 && c.lastDate < t90).length}</div><div style="font-size:11px; color:#64748b;">Inactifs > 90j, valeur > 500€</div></div>
                <div class="action-card action-card--orange"><div style="font-size:12px; font-weight:700;">🟠 Sécuriser</div><div style="font-size:24px; font-weight:900;">${clientsArr.slice(0,20).filter(c => c.lastDate < t60).length}</div><div style="font-size:11px; color:#64748b;">Top 20 clients, inactifs > 60j</div></div>
                <div class="action-card action-card--blue"><div style="font-size:12px; font-weight:700;">🔵 Développer</div><div style="font-size:24px; font-weight:900;">${clientsArr.filter(c => c.factures >= 2 && c.factures < 5).length}</div><div style="font-size:11px; color:#64748b;">Clients habituels (2-4 factures)</div></div>
                <div class="action-card action-card--green"><div style="font-size:12px; font-weight:700;">🟢 Onboarder</div><div style="font-size:24px; font-weight:900;">${new30j}</div><div style="font-size:11px; color:#64748b;">Nouveaux de moins de 30j</div></div>
            </div>

            <div class="section-header"><h2 class="section-title">👥 Équipe & Impayés</h2></div>
            <div class="charts-row">
                <div class="chart-card chart-card--large">
                    <div class="chart-header"><h3 class="chart-title">💼 Performance Agents (12M)</h3></div>
                    <div class="table-wrap">
                        <table class="data-table" style="width:100%;">
                            <thead><tr><th>Agent</th><th style="text-align:right;">CA</th><th style="text-align:right;">Factures</th><th style="text-align:right;">Clients</th></tr></thead>
                            <tbody>
                                ${agentsArr.slice(0, 10).map(a => `<tr><td style="font-weight:700;">${a.nom}</td><td style="text-align:right; font-weight:700; color:#3b82f6;">${this.app.formatMoney(a.ca)}</td><td style="text-align:right;">${a.factures}</td><td style="text-align:right;">${a.clients.size}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-header"><h3 class="chart-title">🚨 Top 15 Impayés</h3></div>
                    <div class="table-wrap">
                        <table class="data-table" style="width:100%;">
                            <thead><tr><th>Client</th><th style="text-align:right;">Reste Dû</th></tr></thead>
                            <tbody>
                                ${topImpayes.length === 0 ? '<tr><td colspan="2" style="text-align:center;">Aucun impayé majeur</td></tr>' : topImpayes.map(c => `<tr><td style="font-weight:700; font-size:12px;">${c[0]}<br><span style="font-weight:normal; color:#64748b;">${c[1].phone}</span></td><td style="text-align:right; font-weight:700; color:#ef4444;">${this.app.formatMoney(c[1].totalUnpaid)}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="section-header"><h2 class="section-title">📦 Derniers Conteneurs</h2></div>
            <div class="containers-grid">
                ${topCtns.map(c => `<div class="container-card"><div class="container-card__ref">${c.number || c.id}</div><div class="container-card__stats"><span class="badge" style="background:#e0f2fe; color:#0369a1;">${new Date(c.createdAt).toLocaleDateString('fr-FR')}</span><span class="badge" style="background:#dcfce7; color:#166534;">${c.status}</span></div></div>`).join('')}
            </div>
        `;

        this.render12MCharts(monthlyData, top10CA, top20CA - top10CA, ca12m - top20CA, caReg, caHab, caDor);
    },

    render12MCharts(monthlyData, top10, top11_20, rest, caReg, caHab, caDor) {
        if (typeof Chart === 'undefined') return;
        const labels = Object.keys(monthlyData).sort();
        const mLabels = labels.map(l => { const d = new Date(l+'-01'); return d.toLocaleDateString('fr-FR', {month:'short', year:'2-digit'}).replace('.',''); });

        const destroyChart = id => { if(this.charts[id]) this.charts[id].destroy(); };
        const cOptions = { responsive: true, maintainAspectRatio: false };

        // 1. CA Mensuel
        destroyChart('c12m-ca');
        this.charts['c12m-ca'] = new Chart(document.getElementById('c12m-ca'), { type: 'line', data: { labels: mLabels, datasets: [{ label: 'CA Facturé', data: labels.map(l => monthlyData[l].ca), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4 }] }, options: cOptions });

        // 2. Clients (Stack)
        destroyChart('c12m-clients');
        this.charts['c12m-clients'] = new Chart(document.getElementById('c12m-clients'), { type: 'bar', data: { labels: mLabels, datasets: [
            { label: 'Existants', data: labels.map(l => monthlyData[l].clients.size - monthlyData[l].newClients.size), backgroundColor: '#0ea5e9' },
            { label: 'Nouveaux', data: labels.map(l => monthlyData[l].newClients.size), backgroundColor: '#f59e0b' }
        ]}, options: { ...cOptions, scales: { x: { stacked: true }, y: { stacked: true } } }});

        // 3. Mix CA (Stack)
        destroyChart('c12m-mix');
        this.charts['c12m-mix'] = new Chart(document.getElementById('c12m-mix'), { type: 'bar', data: { labels: mLabels, datasets: [
            { label: 'CA Existants', data: labels.map(l => monthlyData[l].caExist), backgroundColor: '#10b981' },
            { label: 'CA Nouveaux', data: labels.map(l => monthlyData[l].caNew), backgroundColor: '#8b5cf6' }
        ]}, options: { ...cOptions, scales: { x: { stacked: true }, y: { stacked: true } } }});

        // 4. Panier
        destroyChart('c12m-panier');
        this.charts['c12m-panier'] = new Chart(document.getElementById('c12m-panier'), { type: 'line', data: { labels: mLabels, datasets: [{ label: 'Panier Moyen', data: labels.map(l => monthlyData[l].factures ? monthlyData[l].ca/monthlyData[l].factures : 0), borderColor: '#6366f1', tension: 0.4 }] }, options: cOptions });

        // 5. Pies
        destroyChart('c12m-pie1');
        this.charts['c12m-pie1'] = new Chart(document.getElementById('c12m-pie1'), { type: 'doughnut', data: { labels: ['Top 10', 'Top 11-20', 'Autres'], datasets: [{ data: [top10, top11_20, rest], backgroundColor: ['#f59e0b', '#6366f1', '#10b981'] }] }, options: cOptions });

        destroyChart('c12m-pie2');
        this.charts['c12m-pie2'] = new Chart(document.getElementById('c12m-pie2'), { type: 'doughnut', data: { labels: ['Régulier', 'Habituel', 'Dormant'], datasets: [{ data: [caReg, caHab, caDor], backgroundColor: ['#22c55e', '#0ea5e9', '#ef4444'] }] }, options: cOptions });
    },

    renderCharts(dataObj, allLabels) {
        if (typeof Chart === 'undefined') return;

        // Take up to 6 most recent periods for charts, reverse for chronological order (left to right)
        const chartLabels = allLabels.slice(0, 6).reverse();
        
        const caData = chartLabels.map(l => dataObj[l].ca);
        const encData = chartLabels.map(l => dataObj[l].encaissements);
        const depData = chartLabels.map(l => dataObj[l].depenses);
        
        const factData = chartLabels.map(l => dataObj[l].factures);
        const colisData = chartLabels.map(l => dataObj[l].colis);

        const formatLabel = (l) => {
            if (this.activeTab === 'monthly' && l.includes('-')) {
                const [y, m] = l.split('-');
                return new Date(y, parseInt(m)-1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
            }
            return l;
        };
        const displayLabels = chartLabels.map(formatLabel);

        // 1. Finance Chart
        const ctxFin = document.getElementById('chart-finance')?.getContext('2d');
        if (ctxFin) {
            if (this.charts['finance']) this.charts['finance'].destroy();
            this.charts['finance'] = new Chart(ctxFin, {
            type: 'bar',
            data: {
                    labels: displayLabels,
                datasets: [
                        { label: "CA Facturé", data: caData, backgroundColor: '#3b82f6', borderRadius: 4 },
                        { label: 'Encaissements', data: encData, backgroundColor: '#10b981', borderRadius: 4 },
                        { label: 'Dépenses', data: depData, backgroundColor: '#f59e0b', borderRadius: 4 }
                ]
            },
            options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${this.app.formatMoney(ctx.raw)}` } } },
                    scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5] }, ticks: { callback: (v) => this.app.formatMoney(v) } }, x: { grid: { display: false } } }
                }
            });
        }

        // 2. Activity Chart
        const ctxAct = document.getElementById('chart-activity')?.getContext('2d');
        if (ctxAct) {
            if (this.charts['activity']) this.charts['activity'].destroy();
            this.charts['activity'] = new Chart(ctxAct, {
                type: 'line',
                data: {
                    labels: displayLabels,
                    datasets: [
                        { label: "Factures", data: factData, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true, tension: 0.4, borderWidth: 3 },
                        { label: 'Colis', data: colisData, borderColor: '#ec4899', backgroundColor: 'transparent', fill: false, tension: 0.4, borderWidth: 3 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5] } }, x: { grid: { display: false } } }
                }
            });
        }
    }
};