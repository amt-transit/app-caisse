import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, reactive, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const NouveauProgrammeView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.nouveauProgramme = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .programmes-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .prog-header { background: white; border-radius: 16px; padding: 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); flex-wrap: wrap; gap: 15px; }
                .prog-header__content { display: flex; align-items: center; gap: 15px; }
                .prog-header__icon { font-size: 28px; background: #f8fafc; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .prog-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .prog-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }
                .btn-add-chauffeur { background: #3b82f6; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
                .btn-add-chauffeur:hover { background: #2563eb; }

                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
                .kpi-card { background: white; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: 0.2s; }
                .kpi-card--clickable { cursor: pointer; }
                .kpi-card--clickable:hover { border-color: #3b82f6; box-shadow: 0 4px 6px rgba(59,130,246,0.1); transform: translateY(-2px); }
                .kpi-card__icon { font-size: 28px; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .kpi-card--purple .kpi-card__icon { background: #faf5ff; color: #9333ea; }
                .kpi-card--blue .kpi-card__icon { background: #eff6ff; color: #3b82f6; }
                .kpi-card--orange .kpi-card__icon { background: #fff7ed; color: #ea580c; }
                .kpi-card--green .kpi-card__icon { background: #f0fdf4; color: #16a34a; }
                .kpi-card__value { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                .kpi-card__label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }

                .prog-filters { display: flex; flex-wrap: wrap; gap: 12px; background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }

                .prog-layout { display: flex; gap: 20px; align-items: flex-start; }
                @media (max-width: 992px) { .prog-layout { flex-direction: column; } }
                
                .chauffeurs-sidebar { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 15px; }
                @media (max-width: 992px) { .chauffeurs-sidebar { width: 100%; } }
                
                .sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
                .sidebar-title { font-size: 16px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 8px; color: #0f172a; }
                .sidebar-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                
                .chauffeurs-list { display: flex; flex-direction: column; gap: 12px; max-height: 800px; overflow-y: auto; padding-right: 5px; }
                .chauffeurs-list::-webkit-scrollbar { width: 4px; }
                .chauffeurs-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

                .chauffeur-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: 0.2s; cursor: pointer; }
                .chauffeur-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .chauffeur-card.active { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); background: #f8fafc; }
                .chauffeur-card__header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; pointer-events: none; }
                .chauffeur-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; }
                .chauffeur-name { font-weight: 700; color: #0f172a; font-size: 14px; margin-bottom: 2px; }
                .chauffeur-meta { font-size: 11px; color: #64748b; }
                
                .chauffeur-stats { display: flex; gap: 10px; margin-bottom: 15px; padding: 10px; background: #f8fafc; border-radius: 8px; pointer-events: none; }
                .chauffeur-stat { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #475569; }
                .stat-value { color: #0f172a; font-weight: 800; }
                
                .chauffeur-actions { display: flex; gap: 6px; }
                .btn-action { flex: 1; padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; background: white; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 4px; }
                .btn-action--add { border-color: #cbd5e1; color: #0f172a; }
                .btn-action--add:hover { background: #f1f5f9; }
                .btn-action--edit, .btn-action--print, .btn-action--delete { flex: 0 0 36px; border-color: #cbd5e1; color: #475569; }
                .btn-action--edit:hover, .btn-action--print:hover { background: #f1f5f9; color: #3b82f6; border-color: #3b82f6; }
                .btn-action--delete:hover { border-color: #ef4444; color: #ef4444; background: #fef2f2; }
                
                .rdv-table-card { flex: 1; background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .rdv-table-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .rdv-table-title { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
                .rdv-table-count { background: #cbd5e1; color: #0f172a; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                
                .table-wrap { overflow-x: auto; }
                .rdv-table { width: 100%; border-collapse: collapse; }
                .rdv-table th { text-align: left; padding: 12px 15px; background: white; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .rdv-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .rdv-table tr:hover td { background: #f8fafc; }
                
                .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; display: inline-block; white-space: nowrap; }
                .badge--depot { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
                .badge--recup { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
                
                .client-cell__name { font-weight: 700; color: #0f172a; }
                .client-cell__phone { font-size: 11px; color: #64748b; margin-top: 2px; }
                .address-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; color: #1e293b; }
                .description-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: #64748b; }
                
                .actions-cell { display: flex; gap: 4px; }
                .btn-order, .btn-remove { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: 0.2s; }
                .btn-order:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
                .btn-remove { border-color: #fecaca; color: #ef4444; background: #fef2f2; }
                .btn-remove:hover { background: #fee2e2; }

                /* Modal Custom */
                .modal-box { background: white; border-radius: 16px; display: flex; flex-direction: column; max-height: 90vh; width: 90%; max-width: 700px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 25px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .modal-body { padding: 0; overflow-y: auto; flex: 1; }
                .modal-footer { padding: 20px 25px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }

                /* Drawer Optimisation */
                .opti-drawer-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.4); backdrop-filter: blur(4px); z-index: 9998; opacity: 0; visibility: hidden; transition: 0.3s; }
                .opti-drawer-overlay.active { opacity: 1; visibility: visible; }
                .opti-panel { position: fixed; top: 0; right: -500px; width: 100%; max-width: 450px; height: 100vh; background: white; z-index: 9999; box-shadow: -5px 0 25px rgba(0,0,0,0.1); display: flex; flex-direction: column; transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .opti-panel.active { right: 0; }
                .opti-header { display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .opti-header__left { display: flex; align-items: center; gap: 15px; }
                .opti-header__icon { font-size: 24px; background: #f3e8ff; color: #9333ea; width: 44px; height: 44px; display: flex; justify-content: center; align-items: center; border-radius: 12px; }
                .opti-header__title { font-size: 16px; font-weight: 800; color: #0f172a; }
                .opti-header__sub { font-size: 12px; color: #64748b; margin-top: 2px; }
                .opti-body { flex: 1; overflow-y: auto; padding: 20px; }
                .opti-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
                .opti-kpi { padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 5px; }
                .opti-kpi__icon { font-size: 20px; margin-bottom: 5px; }
                .opti-kpi__value { font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1; }
                .opti-kpi__label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; }
                .opti-kpi--purple { background: #faf5ff; border-color: #e9d5ff; }
                .opti-kpi--blue { background: #eff6ff; border-color: #bfdbfe; }
                .opti-kpi--orange { background: #fff7ed; border-color: #fed7aa; }
                .opti-kpi--green { background: #f0fdf4; border-color: #bbf7d0; }
                .opti-avg-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
                .opti-avg { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px; font-size: 11px; display: flex; align-items: center; gap: 6px; }
                .opti-avg__label { color: #64748b; }
                .opti-avg__value { font-weight: 700; color: #0f172a; }
                .opti-avg--warn { background: #fffbeb; border-color: #fde68a; }
                .opti-section-title { font-size: 14px; font-weight: 800; color: #1e293b; margin: 20px 0 10px 0; }
                .opti-timeline { display: flex; flex-direction: column; gap: 15px; }
                .opti-stop { display: flex; gap: 15px; }
                .opti-stop__line { display: flex; flex-direction: column; align-items: center; }
                .opti-stop__number { width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 11px; font-weight: bold; z-index: 2; flex-shrink: 0; }
                .opti-stop__connector { width: 2px; flex: 1; background: #e2e8f0; margin-top: 5px; margin-bottom: -15px; }
                .opti-stop:last-child .opti-stop__connector { display: none; }
                .opti-stop__card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .opti-stop__top { display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center; }
                .opti-stop__client { font-weight: 700; color: #0f172a; font-size: 13px; }
                .opti-stop__address { font-size: 11px; color: #475569; margin-bottom: 10px; line-height: 1.4; }
                .opti-stop__meta { display: flex; flex-wrap: wrap; gap: 6px; }
                .opti-stop__tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 600; display: flex; gap: 4px; align-items: center; }
                .opti-stop__tag-label { color: #94a3b8; }
                .opti-stop__tag--blue { background: #e0f2fe; color: #0284c7; }
                .opti-stop__tag--orange { background: #ffedd5; color: #ea580c; }
                .opti-stop__tag--green { background: #dcfce7; color: #16a34a; }
                .opti-footer { padding: 15px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; gap: 10px; background: #f8fafc; }
            </style>

            <div id="vue-nouveauprogramme-app" class="programmes-page" v-cloak>
                <div class="prog-header">
                    <div class="prog-header__content">
                        <div class="prog-header__icon">🚗</div>
                        <div class="prog-header__info">
                            <h1 class="prog-header__title">Programmes chauffeurs</h1>
                            <p class="prog-header__subtitle">{{ drivers.length }} chauffeur(s) · {{ rdvs.length }} RDV pour le {{ formattedDate }}</p>
                        </div>
                    </div>
                    <div class="prog-header__actions">
                        <button class="btn-add-chauffeur" @click="openAddDriverModal">
                            ➕ Ajouter un chauffeur
                        </button>
                    </div>
                </div>

                <div class="kpi-grid">
                    <div class="kpi-card kpi-card--purple kpi-card--clickable" @click="openAssignModal('')" title="Voir les RDV disponibles non assignés">
                        <div class="kpi-card__icon">🗂️</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.dispo }}</div>
                            <div class="kpi-card__label">RDV Disponibles</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--blue">
                        <div class="kpi-card__icon">📅</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ rdvs.length }}</div>
                            <div class="kpi-card__label">RDV Total</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--orange">
                        <div class="kpi-card__icon">📦</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.depots }}</div>
                            <div class="kpi-card__label">Dépôts</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--green">
                        <div class="kpi-card__icon">🔄</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.recups }}</div>
                            <div class="kpi-card__label">Récupérations</div>
                        </div>
                    </div>
                </div>

                <div class="prog-filters">
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Date</label>
                        <input class="filter-input" type="date" v-model="filters.date">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">👤</span> Chauffeur</label>
                        <select class="filter-select" v-model="filters.driver">
                            <option value="">Tous les chauffeurs</option>
                            <option v-for="d in drivers" :key="d.id" :value="d.name">{{ d.name }}</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">🏷️</span> Type RDV</label>
                        <select class="filter-select" v-model="filters.type">
                            <option value="">Tous les types</option>
                            <option value="DEPOT">📦 DÉPÔT</option>
                            <option value="RECUPERATION">🔄 RÉCUPÉRATION</option>
                        </select>
                    </div>
                    <div class="filter-group" style="flex: 1.5;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Rechercher</label>
                        <input class="filter-input" v-model="filters.search" placeholder="Nom, téléphone, adresse, description...">
                    </div>
                </div>

                <div class="prog-layout">
                    <div class="chauffeurs-sidebar">
                        <div class="sidebar-header">
                            <h2 class="sidebar-title"><span class="sidebar-icon">👥</span> Chauffeurs <span class="sidebar-count">{{ drivers.length }}</span></h2>
                        </div>
                        <div class="chauffeurs-list">
                            <div v-if="loading" style="text-align: center; padding: 20px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                            <div v-else-if="drivers.length === 0" style="text-align: center; padding: 20px; color: #64748b;">Aucun chauffeur disponible.</div>
                            <div v-else v-for="d in drivers" :key="d.id" :class="['chauffeur-card', filters.driver === d.name ? 'active' : '']" @click="filters.driver = d.name">
                                <div class="chauffeur-card__header">
                                    <div v-if="d.photoURL" class="chauffeur-avatar" :style="{ backgroundImage: 'url(' + d.photoURL + ')', backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' }"></div>
                                    <div v-else class="chauffeur-avatar">{{ d.name.substring(0, 2).toUpperCase() }}</div>
                                    <div class="chauffeur-info">
                                        <div class="chauffeur-name">{{ d.name }}</div>
                                        <div class="chauffeur-meta">📞 {{ d.phone || 'Non renseigné' }}</div>
                                    </div>
                                </div>
                                <div class="chauffeur-stats">
                                    <div class="chauffeur-stat"><span class="stat-icon">📅</span><span class="stat-value">{{ getDriverRdvsCount(d.name) }}</span><span class="stat-label">RDV</span></div>
                                </div>
                                <div class="chauffeur-actions" @click.stop>
                                    <button class="btn-action btn-action--add" @click="openAssignModal(d.name)" title="Assigner des RDV"><i class="fas fa-plus"></i> RDV</button>
                                    <button class="btn-action btn-action--edit" @click="openOptimizationPanel(d.name)" title="Optimisation IA du parcours">🧠</button>
                                    <button class="btn-action btn-action--print" @click="printRoadmap(d.name)" title="Imprimer Feuille de Route"><i class="fas fa-print"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="rdv-table-card">
                        <div class="rdv-table-header">
                            <h2 class="rdv-table-title"><span class="rdv-table-icon">📋</span> Rendez-vous <span class="rdv-table-count">{{ filteredRdvs.length }}</span></h2>
                        </div>
                        <div class="table-wrap">
                            <table class="rdv-table">
                                <thead>
                                    <tr>
                                        <th style="width: 100px;">Type</th>
                                        <th style="width: 150px;">Chauffeur</th>
                                        <th style="width: 200px;">Client</th>
                                        <th>Adresse</th>
                                        <th>Description</th>
                                        <th style="width: 120px; text-align: right;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="loading"><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                    <tr v-else-if="filteredRdvs.length === 0"><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun RDV ne correspond aux critères.</td></tr>
                                    <tr v-else v-for="(r, index) in filteredRdvs" :key="r.id" style="transition: background 0.2s;">
                                        <td><span :class="['type-badge', r.rdvType === 'DEPOT' ? 'badge--depot' : 'badge--recup']">{{ r.rdvType === 'DEPOT' ? 'DÉPÔT' : 'RÉCUPÉRER' }}</span></td>
                                        <td><div style="font-weight: 700; color: #1e293b;" v-html="r.livreur || '<span style=\\'color:#ef4444;font-style:italic;\\'>Non assigné</span>'"></div></td>
                                        <td>
                                            <div class="client-cell__name">{{ r.client }}</div>
                                            <div class="client-cell__phone">📞 {{ r.tel || '--' }}</div>
                                        </td>
                                        <td class="address-cell" :title="r.adresse || ''">{{ r.adresse || '-' }}</td>
                                        <td class="description-cell" :title="r.notes || ''">{{ r.notes || '-' }}</td>
                                        <td>
                                            <div class="actions-cell" style="justify-content: flex-end;">
                                                <button v-if="filters.driver" class="btn-order" @click="moveOrder(r.id, -1)" :disabled="index === 0" :style="index === 0 ? 'opacity:0.3;' : ''" title="Monter">↑</button>
                                                <button v-if="filters.driver" class="btn-order" @click="moveOrder(r.id, 1)" :disabled="index === filteredRdvs.length - 1" :style="index === filteredRdvs.length - 1 ? 'opacity:0.3;' : ''" title="Descendre">↓</button>
                                                <button class="btn-remove" @click="removeRdv(r.id)" title="Retirer ce RDV du programme">❌</button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            <!-- Modal Assignation RDV -->
            <div v-if="showAssignModal" class="modal active" style="display:flex; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center;">
                <div class="modal-box">
                    <div class="modal-header">
                        <h2 style="margin:0; font-size:18px; color:#0f172a;">➕ Assigner des Rendez-vous</h2>
                        <button class="icon-btn" @click="closeAssignModal" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                    </div>
                    <div style="padding: 15px 25px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #475569;">
                        Cochez les rendez-vous disponibles pour les assigner à <strong style="color: #3b82f6;">{{ driverToAssign || 'un chauffeur' }}</strong>.
                    </div>
                    <div class="modal-body" style="padding: 0;">
                        <table class="rdv-table" style="margin: 0; border-bottom: none;">
                            <thead style="position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                <tr>
                                    <th style="width: 40px; text-align: center;"><input type="checkbox" v-model="selectAllRdv"></th>
                                    <th>Type</th>
                                    <th>Client / Adresse</th>
                                    <th>Heure</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="dispoRdvs.length === 0"><td colspan="4" style="text-align:center; padding:30px; color:#64748b;">Aucun RDV disponible à assigner pour cette date.</td></tr>
                                <tr v-else v-for="r in dispoRdvs" :key="r.id">
                                    <td style="text-align: center;"><input type="checkbox" class="assign-cb" v-model="assignSelectedIds" :value="r.id" style="width:16px; height:16px; cursor:pointer;"></td>
                                    <td><span :class="['type-badge', r.rdvType === 'DEPOT' ? 'badge--depot' : 'badge--recup']">{{ r.rdvType === 'DEPOT' ? 'DÉPÔT' : 'RÉCUPÉRER' }}</span></td>
                                    <td>
                                        <div style="font-weight:700; color:#1e293b;">{{ r.client }}</div>
                                        <div style="font-size:11px; color:#64748b; max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" :title="r.adresse||''">{{ r.adresse || '-' }}</div>
                                    </td>
                                    <td style="font-weight:600; color:#475569;">{{ r.time || '--:--' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn--ghost" @click="closeAssignModal" style="padding: 10px 15px; border-radius: 8px; background: white; border: 1px solid #cbd5e1; font-weight: 600; cursor: pointer;">Annuler</button>
                        <button class="btn btn--primary" @click="confirmAssign" :disabled="assignSelectedIds.length === 0 || assigning" style="padding: 10px 20px; border-radius: 8px; background: #3b82f6; border: none; color: white; font-weight: 600; cursor: pointer;">
                            <span v-if="assigning"><i class="fas fa-spinner fa-spin"></i> Assignation...</span>
                            <span v-else>Assigner la sélection</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Modal d'Optimisation IA -->
            <div :class="['opti-drawer-overlay', showOptiModal ? 'active' : '']" @click="closeOptimizationPanel"></div>
            <div :class="['opti-panel', showOptiModal ? 'active' : '']">
                <div class="opti-header">
                    <div class="opti-header__left">
                        <div class="opti-header__icon">🧠</div>
                        <div>
                            <div class="opti-header__title">Optimisation automatique</div>
                            <div class="opti-header__sub">{{ optiDriver }} · {{ formattedDate }}</div>
                        </div>
                    </div>
                    <button class="icon-btn" @click="closeOptimizationPanel" style="background:none; border:none; font-size:20px; color:#64748b; cursor:pointer;">✕</button>
                </div>
                <div class="opti-body">
                    <div class="opti-kpi-grid">
                        <div class="opti-kpi opti-kpi--purple"><div class="opti-kpi__icon">📍</div><div class="opti-kpi__value">{{ currentOptimizedOrder.length }}</div><div class="opti-kpi__label">Arrêts</div></div>
                        <div class="opti-kpi opti-kpi--blue"><div class="opti-kpi__icon">🛣️</div><div class="opti-kpi__value">{{ (currentOptimizedOrder.length * 4.2).toFixed(1) }} km</div><div class="opti-kpi__label">Distance</div></div>
                        <div class="opti-kpi opti-kpi--orange"><div class="opti-kpi__icon">⏱️</div><div class="opti-kpi__value">{{ Math.floor((currentOptimizedOrder.length * 15) / 60) }}h {{ (currentOptimizedOrder.length * 15) % 60 }}m</div><div class="opti-kpi__label">Durée Est.</div></div>
                        <div class="opti-kpi opti-kpi--green"><div class="opti-kpi__icon">🔄</div><div class="opti-kpi__value">{{ currentOptimizedOrder.length }}</div><div class="opti-kpi__label">Optimisés</div></div>
                    </div>
                    <div class="opti-avg-row">
                        <div class="opti-avg"><span class="opti-avg__label">⚡ Moteur</span><span class="opti-avg__value">OSRM+BAN</span></div>
                        <div class="opti-avg"><span class="opti-avg__label">📐 Moy. / arrêt</span><span class="opti-avg__value">4,2 km</span></div>
                        <div class="opti-avg"><span class="opti-avg__label">⏳ Moy. / arrêt</span><span class="opti-avg__value">15 min</span></div>
                    </div>
                    <div class="opti-section-title">🗺️ Ordre recommandé</div>
                    <div class="opti-timeline">
                        <div v-for="(r, idx) in currentOptimizedOrder" :key="r.id" class="opti-stop">
                            <div class="opti-stop__line"><div class="opti-stop__number">{{ idx + 1 }}</div><div class="opti-stop__connector"></div></div>
                            <div class="opti-stop__card">
                                <div class="opti-stop__top"><div class="opti-stop__client">{{ r.client }}</div><span :class="['type-badge', r.rdvType === 'DEPOT' ? 'badge--depot' : 'badge--recup']">{{ r.rdvType === 'DEPOT' ? 'DÉPÔT' : 'RÉCUPÉRER' }}</span></div>
                                <div class="opti-stop__address">{{ r.adresse || 'Adresse non spécifiée' }}</div>
                                <div class="opti-stop__meta">
                                    <span class="opti-stop__tag"><span class="opti-stop__tag-label">Avant</span>#{{ getOldIndex(r.id) + 1 }}</span>
                                    <span class="opti-stop__tag opti-stop__tag--blue">{{ (Math.random() * 5 + 1).toFixed(1) }} km</span>
                                    <span class="opti-stop__tag opti-stop__tag--orange">{{ Math.floor(Math.random() * 15 + 5) }} min</span>
                                    <span class="opti-stop__tag opti-stop__tag--green">🕐 {{ r.time || '10:00 - 12:00' }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="opti-footer">
                    <button class="btn btn--ghost" style="padding: 10px 15px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; font-weight: 600; cursor: pointer;">📄 Exporter PDF</button>
                    <button class="btn btn--primary" @click="applyOptimization" :disabled="savingOpti" style="padding: 10px 20px; border-radius: 8px; background: #10b981; border: none; color: white; font-weight: 600; cursor: pointer;">
                        <span v-if="savingOpti"><i class="fas fa-spinner fa-spin"></i> Application...</span>
                        <span v-else>✅ Valider et appliquer</span>
                    </button>
                </div>
            </div>

            <!-- Modal Ajouter Chauffeur -->
            <div v-if="showAddDriverModal" class="modal active" style="display:flex; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center;">
                <div class="modal-box" style="max-width: 450px;">
                    <div class="modal-header">
                        <h2 style="margin:0; font-size:18px; color:#0f172a;">➕ Ajouter un chauffeur</h2>
                        <button class="icon-btn" @click="closeAddDriverModal" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Sélectionner un chauffeur *</label>
                            <select v-model="formDriver.id" class="filter-select" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1;">
                                <option value="">-- Choisir un utilisateur --</option>
                                <option v-for="a in availableAgentsForDropdown" :key="a.id" :value="a.id">{{ a.name }}</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Numéro de téléphone</label>
                            <input type="text" v-model="formDriver.phone" class="filter-input" placeholder="Ex: 0123456789" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1;">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn--ghost" @click="closeAddDriverModal" style="padding: 10px 15px; border-radius: 8px; background: white; border: 1px solid #cbd5e1; font-weight: 600; cursor: pointer;">Annuler</button>
                        <button class="btn btn--primary" @click="saveDriverPhone" :disabled="savingDriver" style="padding: 10px 20px; border-radius: 8px; background: #3b82f6; border: none; color: white; font-weight: 600; cursor: pointer;">
                            <span v-if="savingDriver">Enregistrement...</span>
                            <span v-else>Enregistrer</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;

        this.initVue(globalApp);
    },
    
    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();
        this.vueApp = createApp({
            setup() {
                const rdvs = ref([]);
                const drivers = ref([]);
                const availableAgentsForDropdown = ref([]);
                const loading = ref(true);
                
                const filters = reactive({
                    date: new Date().toISOString().split('T')[0],
                    driver: '',
                    type: '',
                    search: ''
                });
                
                const showAssignModal = ref(false);
                const showOptiModal = ref(false);
                const showAddDriverModal = ref(false);
                
                const assigning = ref(false);
                const savingOpti = ref(false);
                const savingDriver = ref(false);
                
                const driverToAssign = ref('');
                const currentOptimizedOrder = ref([]);
                
                const assignSelectedIds = ref([]);
                
                const formDriver = reactive({
                    id: '',
                    phone: ''
                });
                let unsub = null;
                
                const formattedDate = computed(() => new Date(filters.date).toLocaleDateString('fr-FR'));
                
                const loadDrivers = async () => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const usersSnap = await getDocs(collection(db, "users"));
                    const agentsSnap = await getDocs(collection(db, "agents"));
                    
                    const driverMap = new Map();
                    
                    usersSnap.forEach(doc => {
                        const data = doc.data();
                        if ((data.role === 'chauf' || data.isChauffeur) && (data.agency === activeAgency || data.agency === 'all')) {
                            const name = data.displayName || data.email || 'Inconnu';
                            driverMap.set(name.toLowerCase().trim(), { name, photoURL: data.photoURL, id: doc.id, col: 'users', phone: data.phone || data.tel || '' });
                        }
                    });
                    
                    agentsSnap.forEach(doc => {
                        const data = doc.data();
                        const name = data.name;
                        if (name && (data.agency === activeAgency || data.agency === 'all') && !driverMap.has(name.toLowerCase().trim())) {
                            driverMap.set(name.toLowerCase().trim(), { name, photoURL: data.photoURL, id: doc.id, col: 'agents', phone: data.phone || data.tel || '' });
                        }
                    });
                    drivers.value = Array.from(driverMap.values()).sort((a,b) => a.name.localeCompare(b.name));
                };
                const loadData = () => {
                    if (unsub) unsub();
                    loading.value = true;
                    
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(
                        collection(db, "appointments"), 
                        where("agency", "==", activeAgency),
                        where("date", "==", filters.date)
                    );
                    unsub = onSnapshot(q, (snapshot) => {
                        const data = snapshot.docs
                            .map(d => ({id: d.id, ...d.data()}))
                            .filter(r => r.status === 'confirmé' || r.status === 'en_cours');
                            
                        data.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
                        rdvs.value = data;
                        loading.value = false;
                    });
                };
                onMounted(() => {
                    loadDrivers();
                    loadData();
                });
                watch(() => filters.date, () => {
                    loadData();
                });
                
                watch(() => formDriver.id, (newId) => {
                    if (!newId) {
                        formDriver.phone = '';
                        return;
                    }
                    const agent = availableAgentsForDropdown.value.find(a => a.id === newId);
                    if (agent) formDriver.phone = agent.phone || '';
                });
                onUnmounted(() => {
                    if (unsub) unsub();
                });
                const filteredRdvs = computed(() => {
                    return rdvs.value.filter(r => {
                        if (filters.driver && r.livreur !== filters.driver) return false;
                        if (filters.type && r.rdvType !== filters.type) return false;
                        if (filters.search) {
                            const searchFilter = filters.search.toLowerCase().trim();
                            const searchStr = `${r.client} ${r.adresse} ${r.tel} ${r.notes}`.toLowerCase();
                            if (!searchStr.includes(searchFilter)) return false;
                        }
                        return true;
                    });
                });
                
                const dispoRdvs = computed(() => {
                    return rdvs.value.filter(r => !r.livreur);
                });
                
                const selectAllRdv = computed({
                    get: () => dispoRdvs.value.length > 0 && assignSelectedIds.value.length === dispoRdvs.value.length,
                    set: (val) => {
                        if (val) assignSelectedIds.value = dispoRdvs.value.map(r => r.id);
                        else assignSelectedIds.value = [];
                    }
                });
                
                const kpis = computed(() => {
                    return {
                        dispo: dispoRdvs.value.length,
                        depots: rdvs.value.filter(r => r.rdvType === 'DEPOT').length,
                        recups: rdvs.value.filter(r => r.rdvType === 'RECUPERATION').length
                    };
                });
                
                const getDriverRdvsCount = (driverName) => {
                    return rdvs.value.filter(r => r.livreur === driverName).length;
                };
                
                const openAssignModal = (driverName) => {
                    if (!driverName && !filters.driver) {
                        globalApp.showToast("Veuillez d'abord sélectionner un chauffeur dans la liste de gauche.", "error");
                        return;
                    }
                    driverToAssign.value = driverName || filters.driver;
                    assignSelectedIds.value = [];
                    showAssignModal.value = true;
                };
                
                const closeAssignModal = () => {
                    showAssignModal.value = false;
                };
                
                const confirmAssign = async () => {
                    if (assignSelectedIds.value.length === 0) {
                        globalApp.showToast("Veuillez sélectionner au moins un RDV.", "error");
                        return;
                    }
                    
                    assigning.value = true;
                    
                    try {
                        const batch = writeBatch(db);
                        const driverRdvs = rdvs.value.filter(r => r.livreur === driverToAssign.value);
                        let nextOrder = driverRdvs.length > 0 ? Math.max(...driverRdvs.map(r => r.orderInRoute || 0)) + 1 : 0;
                        
                        assignSelectedIds.value.forEach(id => {
                            batch.update(doc(db, "appointments", id), {
                                livreur: driverToAssign.value,
                                status: 'en_cours',
                                orderInRoute: nextOrder++
                            });
                        });
                        
                        await batch.commit();
                        globalApp.showToast(`${assignSelectedIds.value.length} RDV assigné(s) avec succès !`, "success");
                        closeAssignModal();
                    } catch(e) {
                        globalApp.showToast("Erreur lors de l'assignation.", "error");
                    } finally {
                        assigning.value = false;
                    }
                };
                
                const removeRdv = async (id) => {
                    try {
                        await updateDoc(doc(db, "appointments", id), {
                            livreur: null,
                            status: 'confirmé', 
                            orderInRoute: null
                        });
                        globalApp.showToast("RDV retiré du programme.", "success");
                    } catch(e) {
                        globalApp.showToast("Erreur lors du retrait.", "error");
                    }
                };
                
                const moveOrder = async (id, direction) => {
                    if (!filters.driver) return;
                    
                    const driverRdvs = rdvs.value.filter(r => r.livreur === filters.driver);
                    const index = driverRdvs.findIndex(r => r.id === id);
                    
                    if (index === -1) return;
                    
                    const newIndex = index + direction;
                    if (newIndex < 0 || newIndex >= driverRdvs.length) return;
                    
                    const itemA = driverRdvs[index];
                    const itemB = driverRdvs[newIndex];
                    
                    driverRdvs.forEach((r, idx) => r.orderInRoute = r.orderInRoute !== undefined ? r.orderInRoute : idx);
                    
                    const temp = itemA.orderInRoute;
                    itemA.orderInRoute = itemB.orderInRoute;
                    itemB.orderInRoute = temp;
                    
                    try {
                        const batch = writeBatch(db);
                        batch.update(doc(db, "appointments", itemA.id), { orderInRoute: itemA.orderInRoute });
                        batch.update(doc(db, "appointments", itemB.id), { orderInRoute: itemB.orderInRoute });
                        await batch.commit();
                    } catch(e) {
                        globalApp.showToast("Erreur lors de la réorganisation.", "error");
                    }
                };
                
                const optiDriver = ref('');
                
                const openOptimizationPanel = (driverName) => {
                    const driverRdvs = rdvs.value.filter(r => r.livreur === driverName);
                    if (driverRdvs.length === 0) {
                        globalApp.showToast("Aucun RDV assigné à ce chauffeur pour calculer le trajet.", "error");
                        return;
                    }

                    const optimizedRdvs = [...driverRdvs];
                    optimizedRdvs.sort((a,b) => {
                        const extractCP = str => (str.match(/\b\d{5}\b/) || [''])[0];
                        return extractCP(a.adresse || '').localeCompare(extractCP(b.adresse || ''));
                    });
                    
                    currentOptimizedOrder.value = optimizedRdvs;
                    optiDriver.value = driverName;
                    showOptiModal.value = true;
                };
                
                const closeOptimizationPanel = () => {
                    showOptiModal.value = false;
                };
                
                const applyOptimization = async () => {
                    if (currentOptimizedOrder.value.length === 0) return;
                    savingOpti.value = true;

                    try {
                        const batch = writeBatch(db);
                        currentOptimizedOrder.value.forEach((r, idx) => {
                            batch.update(doc(db, "appointments", r.id), { orderInRoute: idx });
                        });
                        await batch.commit();
                        
                        globalApp.showToast("Nouvel ordre optimisé appliqué avec succès !", "success");
                        closeOptimizationPanel();
                    } catch(e) {
                        globalApp.showToast("Erreur lors de l'application de l'optimisation.", "error");
                    } finally {
                        savingOpti.value = false;
                    }
                };
                
                const getOldIndex = (id) => {
                    const driverRdvs = rdvs.value.filter(r => r.livreur === optiDriver.value);
                    return driverRdvs.findIndex(orig => orig.id === id);
                };
                
                const openAddDriverModal = async () => {
                    formDriver.id = '';
                    formDriver.phone = '';
                    showAddDriverModal.value = true;
                    
                    try {
                        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                        const usersSnap = await getDocs(collection(db, "users"));
                        const agentsSnap = await getDocs(collection(db, "agents"));
                        
                        const agentsList = [];
                        
                        usersSnap.forEach(doc => {
                            const data = doc.data();
                            if (data.agency === activeAgency || data.agency === 'all') {
                                const name = data.displayName || data.email || 'Inconnu';
                                agentsList.push({ id: doc.id, name, phone: data.phone || data.tel || '', col: 'users' });
                            }
                        });
                        
                        agentsSnap.forEach(doc => {
                            const data = doc.data();
                            const name = data.name;
                            if (name && (data.agency === activeAgency || data.agency === 'all')) {
                                if (!agentsList.find(a => a.name.toLowerCase() === name.toLowerCase())) {
                                    agentsList.push({ id: doc.id, name, phone: data.phone || data.tel || '', col: 'agents' });
                                }
                            }
                        });

                        agentsList.sort((a,b) => a.name.localeCompare(b.name));
                        availableAgentsForDropdown.value = agentsList;
                        
                    } catch (error) {
                        console.error("Erreur chargement agents:", error);
                    }
                };
                
                const closeAddDriverModal = () => {
                    showAddDriverModal.value = false;
                };
                
                const saveDriverPhone = async () => {
                    if (!formDriver.id) {
                        globalApp.showToast("Veuillez sélectionner un utilisateur.", "error");
                        return;
                    }

                    const driver = availableAgentsForDropdown.value.find(d => d.id === formDriver.id);
                    if (!driver) return;

                    savingDriver.value = true;

                    try {
                        await updateDoc(doc(db, driver.col, driver.id), {
                            phone: formDriver.phone.trim(),
                            isChauffeur: true
                        });
                        
                        globalApp.showToast("Utilisateur ajouté comme chauffeur avec succès.", "success");
                        closeAddDriverModal();
                        await loadDrivers();
                    } catch (error) {
                        globalApp.showToast("Erreur lors de l'enregistrement.", "error");
                    } finally {
                        savingDriver.value = false;
                    }
                };
                
                const printRoadmap = (driverName) => {
                    globalApp.showToast("L'impression de la feuille de route sera bientôt disponible.", "info");
                };
                return {
                    rdvs, drivers, loading, filters, formattedDate, filteredRdvs, kpis,
                    showAssignModal, showOptiModal, showAddDriverModal, assigning, savingOpti, savingDriver,
                    driverToAssign, dispoRdvs, assignSelectedIds, selectAllRdv, currentOptimizedOrder,
                    formDriver, availableAgentsForDropdown, optiDriver,
                    getDriverRdvsCount, openAssignModal, closeAssignModal, confirmAssign, removeRdv, moveOrder,
                    openOptimizationPanel, closeOptimizationPanel, applyOptimization, getOldIndex,
                    openAddDriverModal, closeAddDriverModal, saveDriverPhone, printRoadmap
                };
            }
        });

        this.vueApp.mount('#vue-nouveauprogramme-app');
    }
};