import { db } from '../../../commun/firebase-config.js';
import { getCollectionName, AGENCIES } from '../../../commun/agencies-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, reactive, onMounted, onUnmounted, nextTick } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { Autocomplete } from './autocomplete.js';

export const TousLesRdvView = {
    vueApp: null,

    render(app, container, mode = 'all') {
        // Sécurité si l'argument "container" contient en fait le texte du mode (ex: 'pending')
        if (typeof container === 'string') {
            mode = container;
            container = null;
        }

        const globalApp = app;
        const title = mode === 'pending' ? 'Rendez-vous à valider' : 'Tous les Rendez-vous';
        const subtitle = mode === 'pending' ? 'Confirmez ou refusez les demandes en attente' : 'Gestion complète de votre planning';
        const icon = mode === 'pending' ? '⏳' : '📅';

        const html = `
            <style>
                [v-cloak] { display: none; }
                .rdv-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .rdv-header { background: white; border-radius: 16px; padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); flex-wrap: wrap; gap: 15px; }
                .rdv-header__content { display: flex; align-items: center; gap: 15px; width: 100%; }
                .rdv-header__icon { font-size: 28px; background: #f8fafc; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .rdv-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .rdv-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .rdv-header__actions { display: flex; gap: 10px; }
                
                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .kpi-card { background: white; border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .kpi-card__icon { font-size: 28px; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .kpi-card__value { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; display: flex; align-items: baseline; gap: 4px; }
                .kpi-card__label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }
                .kpi-card__bar { width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 8px; overflow: hidden; }
                .kpi-card__bar-fill { height: 100%; background: #4f46e5; border-radius: 3px; transition: width 0.3s ease; }
                /* Mobile/pliable : cartes KPI sur 2 colonnes (au lieu d'empilées). */
                @media (max-width: 768px) {
                    .kpi-grid { grid-template-columns: 1fr 1fr !important; gap: 10px; }
                    .kpi-card { padding: 13px 14px; gap: 10px; min-width: 0; }
                    .kpi-card > div { min-width: 0; }
                    .kpi-card__icon { width: 40px; height: 40px; font-size: 21px; flex-shrink: 0; }
                    .kpi-card__value { font-size: 20px; }
                    .kpi-card__label { font-size: 10px; white-space: normal; overflow-wrap: break-word; line-height: 1.25; }
                }
                
                .rdv-filters { display: flex; flex-wrap: wrap; gap: 15px; background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; box-sizing: border-box; background: #f8fafc; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); background: white; }
                .filter-actions { display: flex; align-items: flex-end; }
                .btn-filter-reset { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: 1px solid #cbd5e1; background: white; color: #475569; height: 41px; }
                .btn-filter-reset:hover { background: #f1f5f9; color: #0f172a; }
                
                .rdv-table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .rdv-table-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .rdv-table-title { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
                .rdv-count-badge { background: #cbd5e1; color: #0f172a; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
                
                .table-wrap { overflow-x: auto; }
                .rdv-table { width: 100%; border-collapse: collapse; }
                .rdv-table th { text-align: left; padding: 12px 15px; background: white; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .rdv-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .rdv-table tr:hover td { background: #f8fafc; }
                
                .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; display: inline-block; white-space: nowrap; }
                .badge-depot { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
                .badge-recup { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
                .badge-executed { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
                .badge-pending { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
                .badge-cancelled { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
                
                .td-actions { display: flex; gap: 6px; justify-content: flex-end; }
                .btn-edit, .btn-del { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; color: #475569; }
                .btn-edit:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
                .btn-del { color: #ef4444; border-color: #fecaca; background: #fef2f2; }
                .btn-del:hover { background: #fee2e2; }

                /* === Fiches RDV COMPACTES (tablette/pliable/mobile ≤1024px) ===
                   Remplace le format générique « 1 champ par ligne avec libellé »
                   (trop étalé) par une fiche dense SANS libellés : Client en tête,
                   badges Type/Statut, puis méta (date · tél), adresse, actions. */
                @media (max-width: 1024px) {
                    .rdv-table thead { display: none; }
                    .rdv-table, .rdv-table tbody { display: block; width: 100%; }
                    .rdv-table tbody tr { display: flex !important; flex-wrap: wrap; align-items: center; gap: 5px 10px; padding: 13px 15px !important; border: 1px solid #e8edf3; border-radius: 13px; margin-bottom: 11px; background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
                    .rdv-table tbody td { display: inline-flex !important; align-items: center; width: auto !important; max-width: 100%; border: none !important; padding: 0 !important; text-align: left !important; justify-content: flex-start !important; font-size: 12.5px; color: #475569; }
                    .rdv-table tbody td::before { display: none !important; }
                    .rdv-table td:nth-child(3) { order: 0; width: 100% !important; font-weight: 800; color: #0f172a; font-size: 14.5px; }
                    .rdv-table td:nth-child(1) { order: 1; }
                    .rdv-table td:nth-child(6) { order: 2; margin-left: auto; }
                    .rdv-table td:nth-child(2) { order: 3; color: #64748b; }
                    .rdv-table td:nth-child(2) br { display: none; }
                    .rdv-table td:nth-child(2) strong { font-weight: 700; color: #334155; margin-right: 6px; }
                    .rdv-table td:nth-child(4) { order: 4; font-weight: 700; }
                    .rdv-table td:nth-child(5) { order: 5; width: 100% !important; color: #64748b; }
                    .rdv-table td:nth-child(5) div { max-width: 100% !important; white-space: normal !important; overflow: visible !important; }
                    .rdv-table td:nth-child(7) { order: 6; width: 100% !important; justify-content: flex-end !important; margin-top: 5px; border-top: 1px solid #f1f5f9; padding-top: 9px !important; }
                }

                /* Edition Modal */
                .em-modal { display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 1000; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
                .em-modal.active { display: flex; animation: fadeIn 0.2s; }
                .em-content { background: white; width: 90%; max-width: 600px; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; max-height: 90vh; }
                .em-header { padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
                .em-header__left { display: flex; align-items: center; gap: 15px; }
                .em-header__icon { font-size: 24px; background: #eff6ff; color: #3b82f6; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .em-header__title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
                .em-header__sub { font-size: 13px; color: #64748b; }
                .em-close { background: none; border: none; cursor: pointer; color: #64748b; transition: 0.2s; }
                .em-close:hover { color: #0f172a; }
                .em-body { padding: 25px; overflow-y: auto; }
                .em-client-strip { display: flex; align-items: center; gap: 12px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
                .em-client-strip__icon { font-size: 24px; width: 40px; height: 40px; background: white; display: flex; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                .em-client-strip__name { font-weight: 800; color: #0f172a; font-size: 15px; }
                .em-client-strip__details { font-size: 12px; color: #64748b; margin-top: 2px; }
                .em-grid { display: flex; flex-direction: column; gap: 20px; }
                .em-card { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
                .em-card__head { padding: 12px 15px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b; font-size: 14px; display: flex; align-items: center; gap: 8px; }
                .em-card__head--purple { border-top: 3px solid #9333ea; }
                .em-card__head--blue { border-top: 3px solid #3b82f6; }
                .em-card__head--green { border-top: 3px solid #10b981; }
                .em-card__body { padding: 15px; display: flex; flex-direction: column; gap: 15px; }
                .em-type-selector { display: flex; gap: 10px; }
                .em-type-option { flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; color: #475569; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
                .em-type-option.active { border-color: #3b82f6; background: #eff6ff; color: #2563eb; }
                .em-field { display: flex; flex-direction: column; gap: 6px; }
                .em-field__label { font-size: 12px; font-weight: 600; color: #475569; }
                .em-field__input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: inherit; box-sizing: border-box; transition: 0.2s; }
                .em-field__input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); outline: none; }
                .em-footer { padding: 15px 25px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; }
                .em-btn { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; }
                .em-btn--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .em-btn--ghost:hover { background: #f1f5f9; color: #0f172a; }
                .em-btn--save { background: #3b82f6; color: white; }
                .em-btn--save:hover { background: #2563eb; }
                .em-btn:disabled { opacity: 0.6; cursor: not-allowed; }
            </style>
            <div id="vue-rdv-app" class="rdv-page" v-cloak>
                <!-- Header Pending -->
                <template v-if="isPendingMode">
                    <div class="page__header" style="margin-bottom: 20px;">
                        <h1 class="page__title" style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a;">RDV à valider</h1>
                    </div>
                    <div class="rdv-header">
                        <div class="rdv-header__content" style="flex: 1; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div class="rdv-header__info">
                                <h1 class="rdv-header__title">✅ RDV à valider</h1>
                                <p class="rdv-header__subtitle">{{ filteredRdvs.length }} rendez-vous en attente de validation</p>
                            </div>
                            <div class="rdv-header__actions">
                                <button class="btn-filter-reset" @click="resetFilters" style="background: white; border: 1px solid #cbd5e1; display: flex; align-items: center; gap: 8px;">
                                    🔄 Rafraîchir
                                </button>
                            </div>
                        </div>
                    </div>
                </template>
                <!-- Header All -->
                <template v-else>
                    <div class="rdv-header">
                        <div class="rdv-header__content">
                            <div class="rdv-header__icon">${icon}</div>
                            <div>
                                <h1 class="rdv-header__title">${title}</h1>
                                <p class="rdv-header__subtitle">${subtitle}</p>
                            </div>
                        </div>
                        <button class="amt-btn amt-btn-primary" @click="globalApp.renderPage('appointment-new')">
                            <i class="fas fa-plus"></i> Nouveau RDV
                        </button>
                    </div>
                    <div class="kpi-grid">
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #475569;">📋</div><div><div class="kpi-card__value">{{ rdvs.length }}</div><div class="kpi-card__label">Total RDV</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #0284c7; background: #e0f2fe;">📦</div><div><div class="kpi-card__value">{{ kpis.depots }}</div><div class="kpi-card__label">Dépôts</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #7e22ce; background: #f3e8ff;">🚚</div><div><div class="kpi-card__value">{{ kpis.recups }}</div><div class="kpi-card__label">Récupérations</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #166534; background: #dcfce7;">✅</div><div><div class="kpi-card__value">{{ kpis.executed }}</div><div class="kpi-card__label">Validés</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #b45309; background: #fef3c7;">⏳</div><div><div class="kpi-card__value">{{ kpis.pending }}</div><div class="kpi-card__label">En attente</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #4f46e5; background: #e0e7ff;">📊</div><div style="flex:1;"><div class="kpi-card__value"><span>{{ kpis.rate }}</span><span style="font-size:14px; color:#64748b;">%</span></div><div class="kpi-card__label">Taux validation</div><div class="kpi-card__bar"><div class="kpi-card__bar-fill" :style="'width: ' + kpis.rate + '%;'"></div></div></div></div>
                    </div>
                </template>

                <!-- Filters Pending -->
                <div v-if="isPendingMode" class="rdv-filters">
                    <div class="filter-group" style="flex: 2;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Rechercher</label>
                        <input type="text" v-model="filters.search" class="filter-input" placeholder="Nom, téléphone, adresse...">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📋</span> Type</label>
                        <select v-model="filters.type" class="filter-select">
                            <option value="">Tous les types</option>
                            <option value="DEPOT">Dépôt</option>
                            <option value="RECUPERATION">Récupération</option>
                        </select>
                    </div>
                    <div class="filter-actions">
                        <button class="btn-filter-reset" type="button" @click="resetFilters">✕ Réinitialiser</button>
                    </div>
                </div>
                <!-- Filters All -->
                <div v-else class="rdv-filters">
                    <div class="filter-group" style="flex: 2;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Recherche client</label>
                        <input type="text" v-model="filters.search" class="filter-input" placeholder="Nom, téléphone, adresse...">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📆</span> Date début</label>
                        <input type="date" v-model="filters.start" class="filter-input">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📆</span> Date fin</label>
                        <input type="date" v-model="filters.end" class="filter-input">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">🏷️</span> Type</label>
                        <select v-model="filters.type" class="filter-select">
                            <option value="">Tous</option>
                            <option value="DEPOT">Dépôt</option>
                            <option value="RECUPERATION">Récupération</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">✅</span> Statut</label>
                        <select v-model="filters.status" class="filter-select">
                            <option value="">Tous</option>
                            <option value="confirmé">Validé</option>
                            <option value="en_attente">En attente</option>
                            <option value="annulé">Annulé</option>
                        </select>
                    </div>
                    <div class="filter-actions">
                        <button class="btn-filter-reset" type="button" @click="resetFilters">↻ Réinitialiser</button>
                    </div>
                </div>

                <div class="rdv-table-card">
                    <div class="rdv-table-header">
                        <div class="rdv-table-title"><span class="rdv-count-badge">{{ filteredRdvs.length }}</span><span>Rendez-vous trouvés</span></div>
                    </div>
                    <table class="rdv-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Date & Heure</th>
                                <th>Client</th>
                                <th>Téléphone</th>
                                <th>Adresse / Notes</th>
                                <th>Statut</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="loading"><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            <tr v-else-if="filteredRdvs.length === 0">
                                <td colspan="7" style="text-align: center; padding: 60px;" v-if="isPendingMode">
                                    <div style="font-size: 48px; margin-bottom: 10px;">📭</div>
                                    <h3 style="margin: 0 0 5px 0; color: #1e293b; font-size: 18px;">Aucun RDV à valider</h3>
                                    <p style="margin: 0; color: #64748b; font-size: 14px;">Tous les RDV ont été validés</p>
                                </td>
                                <td colspan="7" style="text-align: center; padding: 40px; color: #64748b;" v-else>
                                    Aucun rendez-vous trouvé.
                                </td>
                            </tr>
                            <tr v-else v-for="rdv in filteredRdvs" :key="rdv.id" class="rdv-row">
                                <td data-label="Type"><span :class="['type-badge', rdv.rdvType === 'DEPOT' ? 'badge-depot' : 'badge-recup']">{{ rdv.rdvType === 'DEPOT' ? '📦 DEPOT' : '🚚 RECUP' }}</span></td>
                                <td data-label="Date & Heure"><strong>{{ formatDate(rdv.date) }}</strong><br><span style="color:#64748b; font-size:11px;">{{ rdv.time || 'Heure à définir' }}</span></td>
                                <td data-label="Client" style="font-weight: 600; color: #0f172a;">{{ rdv.client }}</td>
                                <td data-label="Téléphone" style="font-weight: bold;">{{ rdv.tel || '-' }}</td>
                                <td data-label="Adresse / Notes"><div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" :title="rdv.adresse + '\\n' + rdv.notes">{{ rdv.adresse || '-' }}<br><span style="color:#94a3b8; font-size:10px;">{{ rdv.notes || '' }}</span></div><div v-if="rdv.escaleAdresse" style="margin-top:5px; font-size:11px; color:#b45309; font-weight:700; white-space:normal; line-height:1.3;">🛑 Escale : {{ rdv.escaleAdresse }}<span v-if="rdv.escaleContact" style="font-weight:600;"> · {{ rdv.escaleContact }}</span></div></td>
                                <td data-label="Statut"><span :class="['type-badge', getStatusClass(rdv.status)]">{{ getStatusText(rdv.status) }}</span></td>
                                <td data-label="Actions" class="td-actions">
                                    <template v-if="rdv.status === 'en_attente'">
                                        <button class="btn-edit" @click="changeStatus(rdv.id, 'confirmé')" title="Valider" style="background:#dcfce7; color:#166534; border-color:#166534;"><i class="fas fa-check"></i></button>
                                        <button class="btn-del" @click="changeStatus(rdv.id, 'annulé')" title="Refuser"><i class="fas fa-times"></i></button>
                                        <button class="btn-edit" @click="openEditModal(rdv)" title="Modifier">✏️</button>
                                    </template>
                                    <template v-else-if="rdv.status === 'confirmé'">
                                        <button class="btn-del" @click="changeStatus(rdv.id, 'annulé')" title="Annuler le RDV" style="background:#fee2e2; color:#b91c1c; border-color:#fecaca;"><i class="fas fa-ban"></i></button>
                                        <button class="btn-edit" @click="openEditModal(rdv)" title="Modifier">✏️</button>
                                        <button class="btn-del" @click="deleteRdv(rdv.id)" title="Supprimer">🗑️</button>
                                    </template>
                                    <template v-else>
                                        <button class="btn-edit" @click="changeStatus(rdv.id, 'confirmé')" title="Re-valider" style="background:#dcfce7; color:#166534; border-color:#166534;"><i class="fas fa-check"></i></button>
                                        <button class="btn-edit" @click="openEditModal(rdv)" title="Modifier">✏️</button>
                                        <button class="btn-del" @click="deleteRdv(rdv.id)" title="Supprimer">🗑️</button>
                                    </template>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

            <!-- MODALE D'ÉDITION AVANCÉE -->
            <div v-if="showEditModal" class="em-modal active">
                <div class="em-content">
                    <div class="em-header">
                        <div class="em-header__left">
                            <div class="em-header__icon">📅</div>
                            <div>
                                <div class="em-header__title">Modifier le RDV <span style="color:#64748b;">#{{ editForm.id.substring(0,6).toUpperCase() }}</span></div>
                                <div class="em-header__sub">
                                    <span :class="['type-badge', getStatusClass(editForm.status)]">{{ getStatusText(editForm.status) }}</span>
                                </div>
                            </div>
                        </div>
                        <button class="em-close" type="button" @click="closeEditModal" title="Fermer"><i class="fas fa-times" style="font-size: 20px;"></i></button>
                    </div>
                    <div class="em-body">
                        <div class="em-client-strip">
                            <div class="em-client-strip__icon">👤</div>
                            <div>
                                <div class="em-client-strip__name">{{ editForm.client }}</div>
                                <div class="em-client-strip__details">
                                    <span>📞 {{ editForm.tel || 'Non renseigné' }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="em-grid">
                            <div class="em-col-form">
                                <div class="em-card">
                                    <div class="em-card__head em-card__head--purple"><span class="em-card__icon">🏷️</span><span class="em-card__title">Type de rendez-vous</span></div>
                                    <div class="em-card__body">
                                        <div class="em-type-selector">
                                            <button type="button" :class="['em-type-option', editForm.rdvType === 'DEPOT' ? 'active' : '']" @click="editForm.rdvType = 'DEPOT'"><span>📦</span><span>DEPOT</span></button>
                                            <button type="button" :class="['em-type-option', editForm.rdvType === 'RECUPERATION' ? 'active' : '']" @click="editForm.rdvType = 'RECUPERATION'"><span>🚚</span><span>RECUP</span></button>
                                        </div>
                                    </div>
                                </div>
                                <div class="em-card">
                                    <div class="em-card__head em-card__head--blue"><span class="em-card__icon">🕐</span><span class="em-card__title">Planification</span></div>
                                    <div class="em-card__body">
                                        <label class="em-field">
                                            <span class="em-field__label">Date du rendez-vous</span>
                                            <input type="date" v-model="editForm.date" class="em-field__input">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Créneau horaire / Heure</span>
                                            <input type="text" v-model="editForm.time" class="em-field__input" placeholder="Ex: Matin, 10:00...">
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div class="em-col-cal">
                                <div class="em-card" style="height: 100%;">
                                    <div class="em-card__head em-card__head--green"><span class="em-card__icon">📋</span><span class="em-card__title">Détails d'intervention</span></div>
                                    <div class="em-card__body">
                                        <label class="em-field">
                                            <span class="em-field__label">Nom du contact</span>
                                            <input type="text" v-model="editForm.client" class="em-field__input" placeholder="Nom de la personne">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Adresse exacte</span>
                                            <div style="position:relative;">
                                                <input id="tlrEditAdresse" type="text" v-model="editForm.adresse" class="em-field__input" placeholder="Adresse complète" autocomplete="off">
                                                <ul id="tlrEditAdresseSuggestions" style="margin:0; padding:0; list-style:none; display:none;"></ul>
                                            </div>
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Étage / Bâtiment</span>
                                            <input type="text" v-model="editForm.etage" class="em-field__input" placeholder="Ex : Bloc B, 3e étage, Porte 12">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Accès au bâtiment</span>
                                            <select v-model="editForm.acces" class="em-field__input">
                                                <option value="">Sélectionner…</option>
                                                <option value="Interphone">Interphone</option>
                                                <option value="Code">Code / Digicode</option>
                                                <option value="Aucun">Aucun / Accès libre</option>
                                            </select>
                                        </label>
                                        <label class="em-field" v-if="editForm.acces === 'Interphone' || editForm.acces === 'Code'">
                                            <span class="em-field__label">Code / Nom à l'interphone</span>
                                            <input type="text" v-model="editForm.codeAcces" class="em-field__input" placeholder="Ex : B1234 ou DUPONT">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Téléphone de contact</span>
                                            <input type="text" v-model="editForm.tel" class="em-field__input" placeholder="Numéro à appeler">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">🛑 Escale — adresse (récupération en chemin, facultatif)</span>
                                            <input type="text" v-model="editForm.escaleAdresse" class="em-field__input" placeholder="Adresse de l'escale (avant l'adresse du RDV)">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">🛑 Escale — contact sur place (facultatif)</span>
                                            <input type="text" v-model="editForm.escaleContact" class="em-field__input" placeholder="Nom / téléphone à l'escale">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Description / Instructions</span>
                                            <textarea v-model="editForm.notes" class="em-field__input" rows="4" style="resize:vertical;" placeholder="Instructions pour le chauffeur..."></textarea>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="em-footer">
                        <button class="em-btn em-btn--ghost" type="button" @click="closeEditModal">Annuler</button>
                        <button v-if="editForm.status === 'en_attente' || editForm.status === 'annulé'" class="em-btn" type="button" @click="validerEtFermer" style="background:#10b981; color:white; border:none; display:flex; align-items:center; gap:8px;"><i class="fas fa-check"></i> Valider ce RDV</button>
                        <button class="em-btn em-btn--save" type="button" @click="saveEditModal" :disabled="saving">
                            <span v-if="saving">💾 Enregistrement...</span>
                            <span v-else>💾 Enregistrer les modifications</span>
                        </button>
                    </div>
                </div>
            </div>
            </div>
        `;

        const targetContainer = container || document.getElementById('contentContainer');
        if (targetContainer) targetContainer.innerHTML = html;

        this.initVue(globalApp, mode);
    },

    initVue(globalApp, mode) {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                const rdvs = ref([]);
                const loading = ref(true);
                const isPendingMode = ref(mode === 'pending');
                
                const filters = reactive({
                    search: '',
                    type: '',
                    status: '',
                    start: '',
                    end: ''
                });
                
                const showEditModal = ref(false);
                const saving = ref(false);
                const editForm = reactive({});

                let unsub = null;
                
                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(collection(db, getCollectionName("appointments")), where("agency", "==", activeAgency));
                    unsub = onSnapshot(q, (snapshot) => {
                        const data = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                        data.sort((a, b) => new Date(b.date) - new Date(a.date));
                        rdvs.value = data;
                        loading.value = false;
                        globalApp.updateBadges(); // Mise à jour globale des badges (Bottom Nav / Sidebar)
                    });
                });
                
                onUnmounted(() => {
                    if (unsub) unsub();
                });

                const filteredRdvs = computed(() => {
                    let stat = filters.status;
                    if (isPendingMode.value) stat = 'en_attente';

                    return rdvs.value.filter(rdv => {
                        if (filters.search) {
                            const term = filters.search.toLowerCase().trim();
                            if (!rdv.client.toLowerCase().includes(term) && !(rdv.tel || '').includes(term)) return false;
                        }
                        if (stat && rdv.status !== stat) return false;
                        if (filters.type && rdv.rdvType !== filters.type) return false;
                        if (filters.start && rdv.date < filters.start) return false;
                        if (filters.end && rdv.date > filters.end) return false;
                        return true;
                    });
                });

                const kpis = computed(() => {
                    const total = rdvs.value.length;
                    const executed = rdvs.value.filter(a => a.status === 'confirmé').length;
                    return {
                        depots: rdvs.value.filter(a => a.rdvType === 'DEPOT').length,
                        recups: rdvs.value.filter(a => a.rdvType === 'RECUPERATION').length,
                        executed: executed,
                        pending: rdvs.value.filter(a => a.status === 'en_attente').length,
                        rate: total > 0 ? Math.round((executed / total) * 100) : 0
                    };
                });

                const getStatusClass = (status) => {
                    if (status === 'confirmé') return 'badge-executed';
                    if (status === 'en_attente') return 'badge-pending';
                    return 'badge-cancelled';
                };

                const getStatusText = (status) => {
                    if (status === 'confirmé') return '✅ Validé';
                    if (status === 'en_attente') return '⏳ En attente';
                    return '❌ Annulé';
                };

                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR') : '-';

                const resetFilters = () => {
                    filters.search = '';
                    filters.type = '';
                    filters.start = '';
                    filters.end = '';
                    if (!isPendingMode.value) filters.status = '';
                };

                const changeStatus = async (id, newStatus) => {
                    try {
                        await updateDoc(doc(db, getCollectionName("appointments"), id), { status: newStatus });
                        globalApp.showToast(`Rendez-vous ${newStatus} !`, newStatus === 'confirmé' ? 'success' : 'info');
                    } catch(e) { globalApp.showToast("Erreur de mise à jour", "error"); }
                };

                const deleteRdv = async (id) => {
                    if (window.AppModal) {
                        if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer ce rendez-vous de l'historique ?", "Supprimer RDV", true)) return;
                    } else if (!confirm("Supprimer ce rendez-vous ?")) return;

                    try {
                        await deleteDoc(doc(db, getCollectionName("appointments"), id));
                        globalApp.showToast("Rendez-vous supprimé", "success");
                    } catch(e) { globalApp.showToast("Erreur de suppression", "error"); }
                };

                const openEditModal = (rdv) => {
                    Object.assign(editForm, rdv);
                    showEditModal.value = true;
                    // Autocomplete BAN sur l'adresse (route France).
                    const _ag = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const _agObj = AGENCIES[_ag];
                    const _french = (_ag === 'paris') || (_agObj && _agObj.currency === 'EUR');
                    if (_french) {
                        nextTick(() => Autocomplete.initAddress('tlrEditAdresse', 'tlrEditAdresseSuggestions'));
                    }
                };

                const closeEditModal = () => {
                    showEditModal.value = false;
                };

                const saveEditModal = async () => {
                    if (!editForm.id) return;
                    saving.value = true;

                    const updates = {
                        client: editForm.client,
                        rdvType: editForm.rdvType,
                        date: editForm.date,
                        time: editForm.time,
                        adresse: editForm.adresse,
                        escaleAdresse: editForm.escaleAdresse || '',
                        escaleContact: editForm.escaleContact || '',
                        etage: editForm.etage || '',
                        acces: editForm.acces || '',
                        codeAcces: editForm.codeAcces || '',
                        tel: editForm.tel,
                        notes: editForm.notes
                    };

                    try {
                        await updateDoc(doc(db, getCollectionName("appointments"), editForm.id), updates);
                        globalApp.showToast("Rendez-vous mis à jour avec succès !", "success");
                        closeEditModal();
                    } catch(e) {
                        globalApp.showToast("Erreur lors de la sauvegarde.", "error");
                    } finally {
                        saving.value = false;
                    }
                };

                const validerEtFermer = async () => {
                    if (editForm.id) {
                        await changeStatus(editForm.id, 'confirmé');
                        closeEditModal();
                    }
                };

                return {
                    rdvs, loading, isPendingMode, filters, filteredRdvs, kpis,
                    showEditModal, editForm, saving,
                    globalApp, getStatusClass, getStatusText, formatDate, resetFilters,
                    changeStatus, deleteRdv, openEditModal, closeEditModal, saveEditModal, validerEtFermer
                };
            }
        });

        this.vueApp.mount('#vue-rdv-app');
    }
};