import { db, functions, auth, app } from '../../firebase-config.js';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp, increment, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";
import { createApp, ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { isAffiliationActive } from '../../affiliation-config.js';
import { AGENCIES, getCollectionName } from '../../agencies-config.js';

export const ParrainageView = {
    vueApp: null,

    render(app, container) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.parrainage = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .parrainage-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .access-denied { text-align: center; padding: 50px; background: white; border-radius: 12px; border: 1px solid #fee2e2; }
                
                .stat-box { background: white; border-radius: 16px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid #e2e8f0; transition: transform 0.2s, box-shadow 0.2s; }
                .stat-box:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
                .stat-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
                .stat-value { font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                .stat-value.text-green { color: #10b981; }
                .stat-value.text-warning { color: #f59e0b; }
                .stat-value.text-danger { color: #ef4444; }
                
                .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
                .badge-success { background: #dcfce7; color: #166534; }
                .badge-warning { background: #ffedd5; color: #92400e; }
                .badge-info { background: #e0f2fe; color: #0369a1; }
                
                .sub-nav-container { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 20px; }
                .sub-nav-link { padding: 10px 20px; border-radius: 12px; border: 1px solid #cbd5e1; background: white; color: #475569; font-weight: 700; font-size: 14px; cursor: pointer; transition: 0.2s; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
                .sub-nav-link:hover { background: #f8fafc; }
                .sub-nav-link.active { background: #3b82f6; color: white; border-color: #3b82f6; box-shadow: 0 4px 6px rgba(59,130,246,0.2); }
                
                .filter-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; }
                .filter-bar input, .filter-bar select { padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; background: #f8fafc; outline: none; transition: 0.2s; }
                .filter-bar input:focus, .filter-bar select:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .filter-bar input { flex: 1; min-width: 200px; }
                
                .chart-container { background: white; border-radius: 16px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid #e2e8f0; }
                
                .ranking-list { max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
                .ranking-item { display: flex; align-items: center; gap: 15px; padding: 15px; border-radius: 12px; border: 1px solid #f1f5f9; cursor: pointer; transition: 0.2s; background: #f8fafc; }
                .ranking-item:hover { background: white; border-color: #cbd5e1; transform: translateX(5px); }
                .ranking-number { width: 36px; height: 36px; background: #e2e8f0; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; color: #475569; }
                .ranking-number.top1 { background: #fef3c7; color: #d97706; }
                .ranking-number.top2 { background: #f1f5f9; color: #475569; }
                .ranking-number.top3 { background: #ffedd5; color: #9a3412; }
                
                .table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { text-align: left; padding: 15px 20px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
                .data-table td { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .data-table tr:hover td { background: #f8fafc; }

                .pm-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
                .pm-box { background: white; width: 90%; max-width: 500px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; max-height: 90vh; }
                .pm-header { padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border-radius: 16px 16px 0 0; }
                .pm-body { padding: 25px; overflow-y: auto; }
                .pm-footer { padding: 15px 25px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; border-radius: 0 0 16px 16px; }
            </style>

            <div id="vue-parrainage-app" class="parrainage-page" v-cloak>
                <!-- SECURITE -->
                <div v-if="!isAsieAgency" class="access-denied">
                    <div style="font-size: 48px; margin-bottom: 15px;">⛔</div>
                    <h2 style="color: #ef4444; margin-top: 0;">Accès Refusé</h2>
                    <p style="color: #64748b;">Le programme de parrainage est exclusivement géré par les agences d'Asie.</p>
                </div>

                <div v-else>
                    <!-- HEADER -->
                    <div style="background: white; border-radius: 16px; padding: 20px 25px; display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="font-size: 32px; background: #fef2f2; color: #ef4444; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">🤝</div>
                            <div>
                                <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a;">Parrainage & Partenaires</h1>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Gestion du réseau d'apporteurs d'affaires Chine/Asie</p>
                            </div>
                        </div>
                    </div>

                    <!-- ONGLETS -->
                    <div class="sub-nav-container">
                        <button :class="['sub-nav-link', {active: currentTab === 'dashboard'}]" @click="currentTab = 'dashboard'"><i class="fas fa-chart-line"></i> Dashboard</button>
                        <button :class="['sub-nav-link', {active: currentTab === 'reseau'}]" @click="currentTab = 'reseau'"><i class="fas fa-sitemap"></i> Réseau</button>
                        <button :class="['sub-nav-link', {active: currentTab === 'commissions'}]" @click="currentTab = 'commissions'"><i class="fas fa-coins"></i> Commissions</button>
                        <button :class="['sub-nav-link', {active: currentTab === 'retraits'}]" @click="currentTab = 'retraits'"><i class="fas fa-money-bill-wave"></i> Paiements</button>
                        <button :class="['sub-nav-link', {active: currentTab === 'demandes'}]" @click="currentTab = 'demandes'"><i class="fas fa-inbox"></i> Demandes <span v-if="pendingDemandesCount > 0" style="background:#ef4444;color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:800;margin-left:4px;">{{ pendingDemandesCount }}</span></button>
                        <button :class="['sub-nav-link', {active: currentTab === 'analytique'}]" @click="currentTab = 'analytique'"><i class="fas fa-chart-pie"></i> Analytique</button>
                        <button v-if="isSuperAdmin" :class="['sub-nav-link', {active: currentTab === 'parametres'}]" @click="currentTab = 'parametres'"><i class="fas fa-sliders-h"></i> Paramètres</button>
                    </div>

                    <!-- ============================================== -->
                    <!-- ONGLET: DASHBOARD -->
                    <!-- ============================================== -->
                    <div v-if="currentTab === 'dashboard'">
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:16px; margin-bottom:20px;">
                            <div class="stat-box">
                                <div class="stat-label"><i class="fas fa-users"></i> Partenaires actifs</div>
                                <div class="stat-value">{{ partners.length }}</div>
                                <small style="color:#94a3b8;">Total inscrits au réseau</small>
                            </div>
                            <div class="stat-box">
                                <div class="stat-label"><i class="fas fa-chart-line"></i> Total généré</div>
                                <div class="stat-value text-green">{{ formatMoney(kpis.totalGenere) }}</div>
                                <small style="color:#94a3b8;">Commissions brutes créées</small>
                            </div>
                            <div class="stat-box">
                                <div class="stat-label"><i class="fas fa-hand-holding-usd"></i> Total versé</div>
                                <div class="stat-value text-warning">{{ formatMoney(kpis.totalPaye) }}</div>
                                <small style="color:#94a3b8;">Retraits effectués</small>
                            </div>
                            <div class="stat-box">
                                <div class="stat-label"><i class="fas fa-clock"></i> Passif (Dues)</div>
                                <div class="stat-value text-danger">{{ formatMoney(kpis.totalDette) }}</div>
                                <small style="color:#94a3b8;">Commissions en attente de paiement</small>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(350px,1fr)); gap:20px; margin-bottom:20px;">
                            <div class="chart-container">
                                <h3 style="margin-top:0; font-size:16px; color:#1e293b;"><i class="fas fa-trophy text-orange-500"></i> Top 5 du Réseau</h3>
                                <div class="ranking-list">
                                    <div v-if="topPartners.length === 0" style="text-align:center; padding: 20px; color:#94a3b8;">Aucun partenaire actif.</div>
                                    <div v-for="(p, idx) in topPartners" :key="p.id" class="ranking-item" @click="openDetails(p)">
                                        <div :class="['ranking-number', idx === 0 ? 'top1' : (idx === 1 ? 'top2' : (idx === 2 ? 'top3' : ''))]">{{ idx + 1 }}</div>
                                        <div style="flex:1;">
                                            <strong style="color:#0f172a;">{{ p.prenom }} {{ p.nom }}</strong><br>
                                            <small style="color:#64748b;">📞 {{ p.telephone || '-' }}</small>
                                        </div>
                                        <div style="text-align:right;">
                                            <strong style="color:#10b981;">{{ formatMoney(p.totalGagne) }}</strong><br>
                                            <small style="color:#64748b;"><i class="fas fa-users"></i> {{ p.filleulsCount }} filleuls</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="chart-container">
                                <h3 style="margin-top:0; font-size:16px; color:#1e293b;"><i class="fas fa-chart-bar text-blue-500"></i> Performance mensuelle</h3>
                                <canvas id="monthlyChart" style="max-height:250px; width:100%;"></canvas>
                            </div>
                        </div>

                        <div style="background:#fffbeb; border:1px solid #fde68a; border-left:4px solid #f59e0b; padding: 20px; border-radius: 12px;">
                            <h4 style="margin:0 0 10px 0; color:#92400e;"><i class="fas fa-bell"></i> Alertes importantes</h4>
                            <ul style="margin:0; padding-left: 20px; color:#b45309; line-height: 1.6;">
                                <li v-if="kpis.partnersInDebt > 0"><strong>{{ kpis.partnersInDebt }}</strong> partenaire(s) ont un solde supérieur à 50 000 CFA en attente de paiement.</li>
                                <li v-if="kpis.inactivePartners > 0"><strong>{{ kpis.inactivePartners }}</strong> partenaire(s) inactif(s) - Relance recommandée.</li>
                                <li v-if="kpis.topPerformers > 0"><strong>{{ kpis.topPerformers }}</strong> partenaire(s) ont dépassé 100 000 CFA de commissions.</li>
                                <li v-if="kpis.partnersInDebt === 0 && kpis.inactivePartners === 0 && kpis.topPerformers === 0" style="list-style: none; padding-left: 0;">✅ Aucune alerte majeure.</li>
                            </ul>
                        </div>
                    </div>

                    <!-- ============================================== -->
                    <!-- ONGLET: RESEAU -->
                    <!-- ============================================== -->
                    <div v-if="currentTab === 'reseau'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                            <h2 style="margin:0; font-size:18px;"><i class="fas fa-sitemap text-indigo-500"></i> Réseau des partenaires</h2>
                            <button v-if="isSuperAdmin" class="btn btn-primary" @click="openPartnerModal()"><i class="fas fa-plus"></i> Nouveau partenaire</button>
                        </div>

                        <div class="filter-bar">
                            <input type="text" v-model="filters.networkSearch" placeholder="🔍 Rechercher (nom, prénom, téléphone)...">
                            <select v-model="filters.networkStatus">
                                <option value="all">Tous les statuts</option>
                                <option value="actif">Actifs</option>
                                <option value="inactif">Inactifs</option>
                            </select>
                            <select v-model="filters.networkSponsor">
                                <option value="all">Tous (Leaders & Filleuls)</option>
                                <option value="avec_parrain">Filleuls (Avec Leader parent)</option>
                                <option value="sans_parrain">Leaders Directs (Sans parent)</option>
                            </select>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <div v-if="filteredNetwork.length === 0" style="text-align:center; padding: 40px; background: white; border-radius: 12px; color: #64748b;">Aucun partenaire trouvé.</div>
                            <!-- Affichage sous forme d'arbre plat visuel -->
                            <div v-for="p in filteredNetworkTree" :key="p.id" class="stat-box" :style="p.indentStyle" @click="openDetails(p)" style="cursor: pointer;">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                                    <div style="display:flex; align-items:center; gap:15px;">
                                        <img v-if="p.photoUrl" :src="p.photoUrl" alt="Photo" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid #e2e8f0;">
                                        <div v-else :style="'width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; ' + (p.level > 0 ? 'background:#ecfdf5; color:#059669;' : 'background:#eff6ff; color:#2563eb;')">
                                            {{ (p.prenom?.[0] || p.nom?.[0] || '?').toUpperCase() }}
                                        </div>
                                        <div>
                                            <div style="font-weight:700; font-size:15px; color:#0f172a; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                                {{ p.prenom }} {{ p.nom }}
                                                <span v-html="getRoleBadge(p)"></span>
                                                <span v-if="(p.statut || 'actif') === 'actif'" style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700;">🟢 Actif</span>
                                                <span v-else-if="p.statut === 'en_attente'" style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700;">🟡 En attente</span>
                                                <span v-else-if="p.statut === 'suspendu'" style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700;">🔴 Suspendu</span>
                                            </div>
                                            <div style="font-size:12px; color:#64748b; margin-top:2px;">
                                                <span v-if="p.level > 0 && p.parentName" style="color:#d97706;"><i class="fas fa-level-up-alt"></i> Filleul de {{ p.parentName }} | </span>
                                                <span><i class="fas fa-phone"></i> {{ p.telephone || '-' }}</span>
                                                <span v-if="p.filleulsCount > 0"> | <i class="fas fa-users"></i> {{ p.filleulsCount }} filleul(s)</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:15px;">
                                        <div style="text-align:right;">
                                            <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700;">Solde dispo</div>
                                            <div :style="'font-weight:800; font-size:16px; ' + ((p.soldeDisponible || 0) > 0 ? 'color:#10b981;' : 'color:#94a3b8;')">{{ formatMoney(p.soldeDisponible) }}</div>
                                        </div>
                                        <button v-if="isSuperAdmin" @click.stop="openPartnerModal(p)" title="Modifier la fiche" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;"><i class="fas fa-edit"></i> Modifier</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ============================================== -->
                    <!-- ONGLET: COMMISSIONS -->
                    <!-- ============================================== -->
                    <div v-if="currentTab === 'commissions'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                            <h2 style="margin:0; font-size:18px;"><i class="fas fa-coins text-yellow-500"></i> Commissions générées</h2>
                            <button class="btn btn-outline" @click="exportCommissions" style="color:#059669; border-color:#059669;"><i class="fas fa-file-excel"></i> Exporter CSV</button>
                        </div>

                        <div class="filter-bar">
                            <select v-model="filters.commDate">
                                <option value="all">Toutes les dates</option>
                                <option value="month">Ce mois</option>
                                <option value="last_month">Mois dernier</option>
                                <option value="year">Cette année</option>
                            </select>
                            <select v-model="filters.commPartner">
                                <option value="">Tous les partenaires</option>
                                <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.prenom }} {{ p.nom }}</option>
                            </select>
                            <select v-model="filters.commType">
                                <option value="all">Tous types</option>
                                <option value="direct">Direct</option>
                                <option value="parrainage">Parrainage</option>
                            </select>
                        </div>

                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:15px; margin-bottom:20px;">
                            <div class="stat-box" style="padding: 15px;"><div class="stat-label">Total généré</div><div class="stat-value text-green" style="font-size:20px;">{{ formatMoney(commKpis.totalGenere) }}</div></div>
                            <div class="stat-box" style="padding: 15px;"><div class="stat-label">Part Agence</div><div class="stat-value" style="font-size:20px; color:#3b82f6;">{{ formatMoney(commKpis.partAMT) }}</div></div>
                            <div class="stat-box" style="padding: 15px;"><div class="stat-label">Net Partenaires</div><div class="stat-value text-green" style="font-size:20px;">{{ formatMoney(commKpis.netDemarcheurs) }}</div></div>
                            <div class="stat-box" style="padding: 15px;"><div class="stat-label">Bonus Réseau</div><div class="stat-value text-warning" style="font-size:20px;">{{ formatMoney(commKpis.bonusParrainage) }}</div></div>
                        </div>

                        <div class="table-card table-wrap">
                            <table class="data-table">
                                <thead>
                                    <tr><th>Date</th><th>Partenaire</th><th>Type</th><th>Colis Réf</th><th>Bénéfice Base</th><th>Part (Net)</th><th>Bonus Généré</th><th>Statut</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-if="filteredCommissions.length === 0"><td colspan="8" style="text-align:center;">Aucune commission trouvée.</td></tr>
                                    <tr v-for="c in filteredCommissions" :key="c.id">
                                        <td>{{ formatDate(c.dateCreation) }}</td>
                                        <td><strong>{{ getPartnerName(c.demarcheurId) }}</strong></td>
                                        <td><span :class="['badge', c.type === 'parrainage' ? 'badge-warning' : 'badge-info']">{{ c.type === 'parrainage' ? 'Parrainage' : 'Direct' }}</span></td>
                                        <td style="font-family: monospace;">{{ c.expeditionId || '-' }}</td>
                                        <td>{{ formatMoney(c.montantBrut) }}</td>
                                        <td style="font-weight:700; color:#10b981;">{{ formatMoney(c.montantNet) }}</td>
                                        <td style="color:#d97706;">{{ formatMoney(c.bonusParrainage) }}</td>
                                        <td><span :class="['badge', c.statut === 'retire' ? 'badge-success' : 'badge-warning']">{{ c.statut === 'retire' ? 'Retiré' : 'En attente' }}</span></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- ============================================== -->
                    <!-- ONGLET: DEMANDES DE RETRAIT (app mobile) -->
                    <!-- ============================================== -->
                    <div v-if="currentTab === 'demandes'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                            <h2 style="margin:0; font-size:18px;"><i class="fas fa-inbox" style="color:#f59e0b;"></i> Demandes de retrait (app mobile)</h2>
                            <span style="font-size:13px; color:#64748b;">{{ pendingDemandesCount }} en attente</span>
                        </div>
                        <div style="background:#fffbeb; border:1px solid #fde68a; color:#92400e; padding:12px 16px; border-radius:10px; margin-bottom:18px; font-size:13px;">
                            <i class="fas fa-info-circle"></i> « Payer » crée le paiement réel (déduit du solde du partenaire) ET marque la demande comme traitée. Le partenaire voit alors « Transféré » dans son app.
                        </div>
                        <div class="table-card table-wrap">
                            <table class="data-table">
                                <thead>
                                    <tr><th>Date</th><th>Partenaire</th><th style="text-align:right;">Montant</th><th>Type</th><th>Moyen</th><th>Numéro</th><th>Statut</th><th>Action</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-if="demandesRetrait.length === 0"><td colspan="8" style="text-align:center; color:#94a3b8; padding:24px;">Aucune demande de retrait pour le moment.</td></tr>
                                    <tr v-for="d in demandesRetrait" :key="d.id">
                                        <td>{{ formatDate(d.dateDemande) }}</td>
                                        <td><strong>{{ getPartnerName(d.demarcheurId) }}</strong></td>
                                        <td style="text-align:right; font-weight:800; color:#0f172a;">{{ formatMoney(d.montant) }}</td>
                                        <td>{{ d.type === 'total' ? 'Totalité' : 'Partiel' }}</td>
                                        <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700;">{{ d.moyenPaiement || '-' }}</span></td>
                                        <td style="font-size:12px;">{{ d.numero || '-' }}</td>
                                        <td>
                                            <span v-if="(d.statut||'en_attente')==='en_attente'" class="badge badge-warning">⏳ En attente</span>
                                            <span v-else-if="d.statut==='paye' || d.statut==='traite'" class="badge badge-success">✓ Payé</span>
                                            <span v-else style="background:#fee2e2;color:#991b1b;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;">✕ Refusée</span>
                                        </td>
                                        <td>
                                            <div v-if="(d.statut||'en_attente')==='en_attente'" style="display:flex; gap:6px;">
                                                <button class="btn btn-sm" :disabled="saving" @click="payerDemande(d)" style="background:#10b981; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">Payer</button>
                                                <button class="btn btn-sm" :disabled="saving" @click="refuserDemande(d)" style="background:#fff; color:#ef4444; border:1px solid #ef4444; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">Refuser</button>
                                            </div>
                                            <span v-else style="font-size:12px; color:#94a3b8;">{{ d.traitePar ? ('par ' + d.traitePar) : '—' }}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- ONGLET: RETRAITS -->
                    <!-- ============================================== -->
                    <div v-if="currentTab === 'retraits'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                            <h2 style="margin:0; font-size:18px;"><i class="fas fa-money-bill-wave text-green-500"></i> Paiement des commissions</h2>
                            <button class="btn btn-outline" @click="exportWithdrawals" style="color:#059669; border-color:#059669;"><i class="fas fa-file-excel"></i> Exporter Historique</button>
                        </div>

                        <div class="stat-box" style="margin-bottom:20px;">
                            <label style="font-size:13px; font-weight:700; color:#475569; display:block; margin-bottom:8px;">Sélectionner un partenaire pour le paiement :</label>
                            <select v-model="selectedPartnerForWithdrawal" style="width:100%; max-width:400px; padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1; outline:none;">
                                <option value="">— Sélectionner —</option>
                                <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.prenom }} {{ p.nom }} (Solde: {{ formatMoney(p.soldeDisponible) }})</option>
                            </select>

                            <div v-if="partnerWithdrawalInfo" style="margin-top:20px; padding: 20px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; color: white;">
                                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:16px;">
                                    <div><div style="font-size:11px; color:#94a3b8; text-transform:uppercase;">Total gagné</div><div style="font-size:18px; font-weight:700;">{{ formatMoney(partnerWithdrawalInfo.totalGagne) }}</div></div>
                                    <div><div style="font-size:11px; color:#94a3b8; text-transform:uppercase;">Déjà retiré</div><div style="font-size:18px; font-weight:700;">{{ formatMoney(partnerWithdrawalInfo.totalRetire) }}</div></div>
                                    <div><div style="font-size:11px; color:#fde68a; text-transform:uppercase;">Solde disponible</div><div style="font-size:24px; font-weight:900; color:#fbbf24;">{{ formatMoney(partnerWithdrawalInfo.soldeDisponible) }}</div></div>
                                </div>
                                <button class="btn" style="margin-top:20px; background:#fbbf24; color:#0f172a; font-weight:800; border:none;" @click="openWithdrawalModal">
                                    <i class="fas fa-check-circle"></i> Valider un paiement
                                </button>
                            </div>
                        </div>

                        <div class="table-card table-wrap">
                            <div style="padding: 15px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">Historique des paiements</div>
                            <table class="data-table">
                                <thead>
                                    <tr><th>Date</th><th>Partenaire</th><th style="text-align:right;">Montant</th><th>Période couverte</th><th>Moyen de paiement</th><th>Validé par</th><th>Statut</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-if="filteredWithdrawals.length === 0"><td colspan="7" style="text-align:center;">Aucun paiement enregistré pour cette sélection.</td></tr>
                                    <tr v-for="w in filteredWithdrawals" :key="w.id">
                                        <td>{{ formatDate(w.dateRetrait) }}</td>
                                        <td><strong>{{ getPartnerName(w.demarcheurId) }}</strong></td>
                                        <td style="text-align:right; font-weight:800; color:#10b981;">{{ formatMoney(w.montant) }}</td>
                                        <td>{{ w.periode || '-' }}</td>
                                        <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700;">{{ w.moyenPaiement || 'Espèces' }}</span></td>
                                        <td style="font-size:12px; color:#64748b;">{{ w.validePar || '-' }}</td>
                                        <td><span class="badge badge-success">✓ Payé</span></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- ============================================== -->
                    <!-- ONGLET: ANALYTIQUE -->
                    <!-- ============================================== -->
                    <div v-if="currentTab === 'analytique'">
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(350px,1fr)); gap:20px; margin-bottom:20px;">
                            <div class="chart-container">
                                <h3 style="margin-top:0; font-size:16px;">Distribution des commissions</h3>
                                <canvas id="distributionChart" style="max-height:250px; width:100%;"></canvas>
                            </div>
                            <div class="chart-container">
                                <h3 style="margin-top:0; font-size:16px;">Évolution des performances (CA Partenaires)</h3>
                                <canvas id="evolutionChart" style="max-height:250px; width:100%;"></canvas>
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:16px;">
                            <div class="stat-box"><div class="stat-label">Commission moyenne</div><div class="stat-value text-green">{{ formatMoney(analytics.avgCommission) }}</div></div>
                            <div class="stat-box"><div class="stat-label">Meilleur Mois</div><div class="stat-value text-warning">{{ analytics.bestMonth }}</div><small style="color:#94a3b8;">{{ formatMoney(analytics.bestMonthAmount) }}</small></div>
                            <div class="stat-box"><div class="stat-label">Taux de parrainage actif</div><div class="stat-value">{{ analytics.activeSponsorsRate }}%</div><small style="color:#94a3b8;">Ont au moins un filleul</small></div>
                        </div>
                    </div>

                    <!-- ============================================== -->
                    <!-- ONGLET: PARAMETRES -->
                    <!-- ============================================== -->
                    <div v-if="currentTab === 'parametres' && isSuperAdmin">
                        <div class="stat-box">
                            <h2 style="margin-top:0; font-size:18px;"><i class="fas fa-sliders-h text-slate-500"></i> Répartition des bénéfices</h2>
                            <p style="color:#64748b; font-size:13px; margin-bottom:25px;">Définissez la politique de commissionnement pour l'agence. Le total (Agence + Partenaire) doit faire 100%.</p>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; max-width:600px; margin-bottom:20px;">
                                <div>
                                    <label style="font-size:12px; font-weight:700; color:#475569;">Part Agence (%)</label>
                                    <input type="number" v-model.number="settings.tauxAMT" min="10" max="90" @input="syncRates('amt')" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:8px; font-size:18px; font-weight:800; margin-top:6px; outline:none;">
                                </div>
                                <div>
                                    <label style="font-size:12px; font-weight:700; color:#475569;">Part Partenaire (%)</label>
                                    <input type="number" v-model.number="settings.tauxDemarcheur" min="10" max="90" @input="syncRates('dem')" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:8px; font-size:18px; font-weight:800; margin-top:6px; outline:none;">
                                </div>
                            </div>

                            <div style="max-width:400px; margin-bottom:25px;">
                                <label style="font-size:12px; font-weight:700; color:#475569;">Bonus parrainage (% du bénéfice, versé au Parrain quand un Filleul travaille)</label>
                                <input type="number" v-model.number="settings.tauxBonusParrainage" min="0" max="30" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:8px; font-size:18px; font-weight:800; margin-top:6px; outline:none;">
                                <div style="font-size:11px; color:#94a3b8; margin-top:6px;">
                                    Ce bonus est <b>versé par l'Agence</b> (qui passe de {{ settings.tauxAMT }}% à {{ settings.tauxAMT - settings.tauxBonusParrainage }}% quand un Filleul travaille). Le Filleul garde toujours ses {{ settings.tauxDemarcheur }}%.
                                </div>
                            </div>

                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:25px; max-width:600px;">
                                <div style="font-weight:800; color:#0f172a; margin-bottom:12px;">Simulation sur une base de 100 000 CFA</div>
                                <div style="font-size:13px; line-height:1.8; color:#334155;">
                                    <div style="color:#0369a1; font-weight:700; margin-bottom:2px;"><i class="fas fa-user"></i> Parrain seul (pas de Filleul au-dessous) :</div>
                                    <div style="font-size:11px; color:#94a3b8; padding-left:18px; margin-bottom:6px;">Base = Bénéfice net (= Montant facturé − Charges fixes)</div>
                                    <div style="display:flex; justify-content:space-between; padding-left:15px;"><span>Parrain :</span> <strong>{{ formatMoney(simulation.demBrut) }}</strong></div>
                                    <div style="display:flex; justify-content:space-between; padding-left:15px; border-bottom:1px dashed #cbd5e1; padding-bottom:8px; margin-bottom:12px;"><span>Agence :</span> <strong>{{ formatMoney(simulation.amtBrut) }}</strong></div>

                                    <div style="color:#d97706; font-weight:700; margin-bottom:2px;"><i class="fas fa-code-branch"></i> Filleul (apporté par un Parrain) :</div>
                                    <div style="font-size:11px; color:#94a3b8; padding-left:18px; margin-bottom:6px;">Base = Bénéfice net (= Montant facturé − Charges fixes)</div>
                                    <div style="display:flex; justify-content:space-between; padding-left:15px;"><span>Filleul :</span> <strong>{{ formatMoney(simulation.demNet) }}</strong></div>
                                    <div style="display:flex; justify-content:space-between; padding-left:15px;"><span>Parrain (bonus, payé par l'Agence) :</span> <strong style="color:#d97706;">{{ formatMoney(simulation.bonus) }}</strong></div>
                                    <div style="display:flex; justify-content:space-between; padding-left:15px;"><span>Agence :</span> <strong>{{ formatMoney(simulation.amtNet) }}</strong></div>
                                </div>
                            </div>

                            <button class="btn btn-primary" @click="saveSettings" :disabled="saving">
                                <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                                <span v-else><i class="fas fa-save"></i> Enregistrer la politique</span>
                            </button>
                        </div>

                        <!-- ============================================ -->
                        <!-- CHARGES FIXES PAR ROUTE (M³ maritime / kg aérien) -->
                        <!-- ============================================ -->
                        <div class="stat-box" style="margin-top:25px;">
                            <h2 style="margin-top:0; font-size:18px;"><i class="fas fa-coins text-amber-500"></i> Charges fixes de la route active</h2>
                            <p style="color:#64748b; font-size:13px; margin-bottom:8px;">
                                Toute commission est calculée sur le <b>bénéfice net</b> de l'expédition :
                                <b>Bénéfice = Montant facturé − Charges fixes</b> (par m³ en maritime, par kg en aérien).
                                On ne partage jamais le chiffre d'affaires brut — uniquement le bénéfice.
                            </p>
                            <p style="color:#1d4ed8; font-size:12px; margin-bottom:20px; background:#eff6ff; padding:10px 14px; border-radius:8px; border:1px solid #bfdbfe;">
                                💡 Ces charges sont propres à <b>chaque route</b>. Pour configurer une autre route, basculez-y depuis le menu d'agences en haut.
                            </p>

                            <div v-if="affiliatedRoutes.length === 0" style="padding:20px; text-align:center; color:#94a3b8;">
                                La route active n'est pas une route de départ — basculez sur une route de départ pour configurer ses charges.
                            </div>

                            <div v-for="r in affiliatedRoutes" :key="r.id" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:15px 18px; margin-bottom:12px;">
                                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                                    <span style="font-size:22px;">{{ r.flag || '🏳️' }}</span>
                                    <b style="font-size:15px; color:#0f172a;">{{ r.name }}</b>
                                    <span style="font-family:monospace; font-size:11px; background:#fff; border:1px solid #e2e8f0; padding:2px 6px; border-radius:4px; color:#64748b;">{{ r.id }}</span>
                                </div>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                                    <div>
                                        <label style="font-size:12px; font-weight:700; color:#475569;">🚢 Maritime — Charges par m³ (CFA)</label>
                                        <input type="number" min="0" step="1000"
                                               v-model.number="chargesByRoute[r.id].cbm"
                                               style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font-size:15px; font-weight:700; margin-top:6px; outline:none;"
                                               placeholder="Ex: 150000">
                                    </div>
                                    <div>
                                        <label style="font-size:12px; font-weight:700; color:#475569;">✈️ Aérien — Charges par kg (CFA)</label>
                                        <input type="number" min="0" step="500"
                                               v-model.number="chargesByRoute[r.id].kg"
                                               style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font-size:15px; font-weight:700; margin-top:6px; outline:none;"
                                               placeholder="Ex: 0">
                                    </div>
                                </div>
                            </div>

                            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:14px 16px; margin:18px 0; font-size:13px; color:#1e3a8a;">
                                <b>💡 Exemple :</b> charges 150 000 CFA/m³, expédition 0,8 m³ et facturée 250 000 CFA →
                                charges = 120 000, <b>bénéfice = 130 000</b>.<br>
                                • Démarcheur <b>Parrain seul</b> : Parrain 65 000 · AMT 65 000<br>
                                • Démarcheur <b>Filleul</b> (avec parrain) : Filleul 65 000 · Parrain 13 000 · AMT 52 000
                            </div>

                            <button class="btn btn-primary" @click="saveCharges" :disabled="savingCharges">
                                <span v-if="savingCharges"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                                <span v-else><i class="fas fa-save"></i> Enregistrer les charges fixes</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ============================================== -->
                <!-- MODALS -->
                <!-- ============================================== -->

                <!-- Modal Edition Partenaire -->
                <div v-if="showPartnerModal" class="pm-overlay" @click.self="showPartnerModal = false">
                    <div class="pm-box">
                        <div class="pm-header">
                            <h3 style="margin:0; font-size:18px; color:#0f172a;">{{ partnerForm.id ? 'Modifier le membre' : 'Nouveau membre (Leader/Filleul)' }}</h3>
                            <button style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;" @click="showPartnerModal = false">✕</button>
                        </div>
                        <div class="pm-body">
                            <!-- Photo de profil : upload Firebase Storage avec preview -->
                            <div style="display:flex; align-items:center; gap:15px; margin-bottom:18px; padding:12px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px;">
                                <div style="position:relative; width:72px; height:72px; flex-shrink:0;">
                                    <img v-if="partnerForm.photoUrl || photoPreview" :src="photoPreview || partnerForm.photoUrl" alt="Photo" style="width:72px; height:72px; border-radius:50%; object-fit:cover; border:2px solid #e2e8f0;">
                                    <div v-else style="width:72px; height:72px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:28px;"><i class="fas fa-user"></i></div>
                                </div>
                                <div style="flex:1;">
                                    <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Photo</label>
                                    <input type="file" accept="image/*" @change="onPhotoSelected" style="font-size:12px; color:#64748b;">
                                    <div v-if="photoUploading" style="font-size:11px; color:#0369a1; margin-top:4px;"><i class="fas fa-spinner fa-spin"></i> Upload en cours…</div>
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                                <div><label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Nom *</label><input type="text" v-model="partnerForm.nom" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none;" placeholder="Nom de famille"></div>
                                <div><label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Prénom *</label><input type="text" v-model="partnerForm.prenom" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none;" placeholder="Prénom"></div>
                                <div><label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Téléphone *</label><input type="text" v-model="partnerForm.telephone" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none;" placeholder="Ex: 0700000000"></div>
                                <div><label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Email</label><input type="email" v-model="partnerForm.email" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none;" placeholder="Optionnel"></div>
                                <div style="grid-column:1 / -1;"><label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Adresse</label><input type="text" v-model="partnerForm.adresse" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none;" placeholder="Ex: Cocody, Riviera 3, Abidjan"></div>
                                <div><label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">N° d'identification</label><input type="text" v-model="partnerForm.numId" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none;" placeholder="CNI / Passeport / autre"></div>
                                <div>
                                    <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Statut</label>
                                    <select v-model="partnerForm.statut" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; background:white;">
                                        <option value="actif">🟢 Actif</option>
                                        <option value="en_attente">🟡 En attente</option>
                                        <option value="suspendu">🔴 Suspendu</option>
                                    </select>
                                </div>

                                <div style="grid-column:1 / -1;">
                                    <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Leader parent (Optionnel)</label>
                                    <select v-model="partnerForm.parrainId" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; background:white;">
                                        <option value="">— Aucun (Venu directement - Leader Direct) —</option>
                                        <option v-for="p in availableSponsors" :key="p.id" :value="p.id">{{ p.prenom }} {{ p.nom }}</option>
                                    </select>
                                </div>

                                <div v-if="partnerForm.parrainId" style="grid-column:1 / -1; background:#fffbeb; padding:10px 12px; border-radius:8px; border:1px solid #fde68a; font-size:12px; color:#92400e;">
                                    <i class="fas fa-info-circle"></i>
                                    Quand ce filleul génère une commission, son <b>Leader parent</b> reçoit automatiquement
                                    un bonus de <b>{{ settings.tauxBonusParrainage }}%</b> du bénéfice (versé par l'Agence).
                                </div>
                            </div>
                        </div>
                        <div class="pm-footer">
                            <button class="btn btn-outline" @click="showPartnerModal = false" style="padding:10px 15px; border-radius:8px; background:white; border:1px solid #cbd5e1;">Annuler</button>
                            <button class="btn btn-primary" @click="savePartner" :disabled="saving" style="padding:10px 20px; border-radius:8px; background:#3b82f6; color:white; border:none;">
                                <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                                <span v-else>Enregistrer</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Modal Paiement -->
                <div v-if="showWithdrawalModal" class="pm-overlay" @click.self="showWithdrawalModal = false">
                    <div class="pm-box" style="max-width: 400px;">
                        <div class="pm-header">
                            <h3 style="margin:0; font-size:18px; color:#0f172a;">Valider un paiement</h3>
                            <button style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;" @click="showWithdrawalModal = false">✕</button>
                        </div>
                        <div class="pm-body">
                            <p style="font-weight:700; font-size:16px; margin:0 0 15px 0; color:#1e293b;">Paiement pour {{ partnerWithdrawalInfo.prenom }} {{ partnerWithdrawalInfo.nom }}</p>
                            
                            <div style="margin-bottom:15px;">
                                <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Montant à payer (CFA) *</label>
                                <input type="number" v-model.number="withdrawalForm.montant" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; font-size:18px; font-weight:bold; color:#10b981;">
                                <div style="font-size:11px; color:#10b981; margin-top:4px; font-weight:600;">Maximum autorisé : {{ formatMoney(partnerWithdrawalInfo.soldeDisponible) }}</div>
                            </div>

                            <div style="margin-bottom:15px;">
                                <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Période couverte (Optionnel)</label>
                                <input type="text" v-model="withdrawalForm.periode" placeholder="Ex: Juin 2024" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none;">
                            </div>

                            <div style="margin-bottom:15px;">
                                <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:4px; display:block;">Moyen de paiement</label>
                                <select v-model="withdrawalForm.moyenPaiement" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; background:white;">
                                    <option value="Espèces">Espèces</option>
                                    <option value="Wave">Wave</option>
                                    <option value="Orange Money">Orange Money</option>
                                    <option value="Virement">Virement bancaire</option>
                                </select>
                            </div>
                        </div>
                        <div class="pm-footer">
                            <button class="btn btn-outline" @click="showWithdrawalModal = false" style="padding:10px 15px; border-radius:8px; background:white; border:1px solid #cbd5e1;">Annuler</button>
                            <button class="btn btn-primary" @click="processWithdrawal" :disabled="saving || !isWithdrawalValid" style="padding:10px 20px; border-radius:8px; background:#10b981; color:white; border:none;">
                                <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> Traitement...</span>
                                <span v-else><i class="fas fa-check"></i> Confirmer le paiement</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Modal Détails (Arbre & Simulation) -->
                <div v-if="showDetailModal" class="pm-overlay" @click.self="showDetailModal = false">
                    <div class="pm-box">
                        <div class="pm-header">
                            <h3 style="margin:0; font-size:18px; color:#0f172a; display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
                                Détails : {{ partnerDetail.prenom }} {{ partnerDetail.nom }}
                                <span v-html="getRoleBadge(partnerDetail)"></span>
                            </h3>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <button v-if="isSuperAdmin" @click="showDetailModal = false; openPartnerModal(partnerDetail)" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;"><i class="fas fa-edit"></i> Modifier la fiche</button>
                                <button style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;" @click="showDetailModal = false">✕</button>
                            </div>
                        </div>
                        <div class="pm-body" style="font-size:13px; line-height:1.6; color:#334155;">
                            <!-- Identité : photo + coordonnées + statut -->
                            <div style="display:flex; gap:16px; align-items:center; padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:18px;">
                                <div style="flex-shrink:0;">
                                    <img v-if="partnerDetail.photoUrl" :src="partnerDetail.photoUrl" alt="Photo" style="width:64px; height:64px; border-radius:50%; object-fit:cover; border:2px solid #e2e8f0;">
                                    <div v-else style="width:64px; height:64px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:24px;"><i class="fas fa-user"></i></div>
                                </div>
                                <div style="flex:1; font-size:12px;">
                                    <div style="margin-bottom:3px;"><i class="fas fa-phone" style="color:#64748b; width:14px;"></i> {{ partnerDetail.telephone || '—' }}</div>
                                    <div style="margin-bottom:3px;"><i class="fas fa-envelope" style="color:#64748b; width:14px;"></i> {{ partnerDetail.email || '—' }}</div>
                                    <div style="margin-bottom:3px;"><i class="fas fa-map-marker-alt" style="color:#64748b; width:14px;"></i> {{ partnerDetail.adresse || '—' }}</div>
                                    <div><i class="fas fa-id-card" style="color:#64748b; width:14px;"></i> {{ partnerDetail.numId || '—' }}</div>
                                </div>
                                <div>
                                    <span v-if="(partnerDetail.statut || 'actif') === 'actif'" style="background:#dcfce7; color:#166534; padding:6px 12px; border-radius:20px; font-size:11px; font-weight:700;">🟢 Actif</span>
                                    <span v-else-if="partnerDetail.statut === 'en_attente'" style="background:#fef3c7; color:#92400e; padding:6px 12px; border-radius:20px; font-size:11px; font-weight:700;">🟡 En attente</span>
                                    <span v-else-if="partnerDetail.statut === 'suspendu'" style="background:#fee2e2; color:#991b1b; padding:6px 12px; border-radius:20px; font-size:11px; font-weight:700;">🔴 Suspendu</span>
                                </div>
                            </div>

                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Total généré (Commissions) :</span> <strong style="color:#10b981;">{{ formatMoney(partnerDetail.totalGagne) }}</strong></div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Déjà payé :</span> <strong style="color:#f59e0b;">{{ formatMoney(partnerDetail.totalRetire) }}</strong></div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Disponible (factures payées — à régler) :</span> <strong style="font-size:16px; color:#0f172a;">{{ formatMoney(partnerDetail.soldeDisponible) }}</strong></div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid #e2e8f0;"><span>En attente de solde facture (NON percevable) :</span> <strong style="color:#f59e0b;">{{ formatMoney(partnerDetail.soldePotentiel || 0) }}</strong></div>

                            <div v-if="isSuperAdmin" style="margin-bottom:20px;">
                                <div style="display:flex; gap:8px; margin-bottom:8px;">
                                    <button @click="reconcilerSoldes(null, partnerDetail.id)" :disabled="reconcileBusy" style="flex:1; padding:8px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:12px;">🔄 Recalculer ce partenaire</button>
                                    <button @click="reconcilerSoldes('all')" :disabled="reconcileBusy" style="flex:1; padding:8px; border:1px solid #fca5a5; background:#fef2f2; color:#b91c1c; border-radius:8px; cursor:pointer; font-size:12px;">🔄 Recalculer TOUS (soldes)</button>
                                </div>
                                <button @click="migrerRoutesRdvDevis()" :disabled="reconcileBusy" style="width:100%; padding:8px; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:8px; cursor:pointer; font-size:12px;">🚚 Migrer RDV / Devis vers les routes (P2b — à lancer une fois)</button>
                            </div>

                            <h4 style="margin:0 0 10px 0; color:#1e293b;">Structure du réseau</h4>
                            <div v-if="partnerDetail.parrainId" style="margin-bottom:10px; color:#d97706;">
                                <i class="fas fa-level-up-alt"></i> Filleul du Leader : <strong>{{ getPartnerName(partnerDetail.parrainId) }}</strong>
                            </div>
                            <div v-else style="margin-bottom:10px; color:#64748b; font-style:italic;">👑 Leader Direct (Aucun parent)</div>

                            <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                                <strong>{{ getPartnerFilleuls(partnerDetail.id).length }} filleul(s) direct(s) :</strong>
                                <ul style="margin:8px 0 0 0; padding-left:20px; color:#475569;">
                                    <li v-if="getPartnerFilleuls(partnerDetail.id).length === 0">Aucun</li>
                                    <li v-for="f in getPartnerFilleuls(partnerDetail.id)" :key="f.id">{{ f.prenom }} {{ f.nom }}</li>
                                </ul>
                            </div>

                            <!-- ─── Clients rattachés (avec transfert) ─── -->
                            <h4 style="margin:22px 0 10px 0; color:#1e293b;">
                                Clients rattachés
                                <span style="background:#eff6ff; color:#1e40af; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:700; margin-left:6px;">{{ partnerClients.length }}</span>
                            </h4>
                            <div v-if="partnerClientsLoading" style="color:#64748b; font-style:italic; padding:10px; text-align:center;">
                                <i class="fas fa-spinner fa-spin"></i> Chargement…
                            </div>
                            <div v-else-if="partnerClients.length === 0" style="background:#f8fafc; padding:14px; border-radius:8px; border:1px dashed #cbd5e1; color:#64748b; font-style:italic; text-align:center; font-size:13px;">
                                Aucun client encore rattaché à ce démarcheur.
                            </div>
                            <div v-else style="background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; max-height:240px; overflow-y:auto;">
                                <div v-for="(c, i) in partnerClients" :key="c.id"
                                     :style="'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; ' + (i < partnerClients.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : '')">
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-weight:700; color:#0f172a; font-size:13px;">{{ c.clientName || '(sans nom)' }}</div>
                                        <div style="color:#64748b; font-size:12px; margin-top:2px;">
                                            <i class="fas fa-phone" style="font-size:10px;"></i> {{ c.phone }}
                                            <span v-if="c.lastTransferAt" style="background:#fffbeb; color:#92400e; padding:1px 6px; border-radius:6px; font-size:10px; font-weight:600; margin-left:6px;" title="Ce client a déjà été transféré au moins une fois">🔁 Réaffecté</span>
                                        </div>
                                    </div>
                                    <button v-if="isSuperAdmin" @click="openTransferModal(c)" style="background:#fff7ed; color:#9a3412; border:1px solid #fed7aa; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; gap:5px;">
                                        <i class="fas fa-exchange-alt"></i> Transférer
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div v-if="mobileAccessInfo" style="margin:0 20px 14px; padding:14px; border-radius:10px; font-size:13px;"
                             :style="mobileAccessInfo.error ? 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;' : 'background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;'">
                            <template v-if="mobileAccessInfo.error">⚠️ {{ mobileAccessInfo.error }}</template>
                            <template v-else>
                                ✅ <b>Accès mobile prêt.</b> À transmettre au partenaire (affiché une seule fois) :<br>
                                📧 Email : <b>{{ mobileAccessInfo.email }}</b><br>
                                <span v-if="mobileAccessInfo.password">🔑 Mot de passe : <b style="font-family:monospace;">{{ mobileAccessInfo.password }}</b></span>
                                <span v-else>🔑 Mot de passe : (inchangé / déjà défini)</span>
                            </template>
                        </div>
                        <div class="pm-footer">
                            <button v-if="isSuperAdmin" class="btn btn-primary" @click="createMobileAccess" :disabled="mobileAccessSaving" style="padding:8px 16px; border-radius:8px; margin-right:auto;">
                                <span v-if="mobileAccessSaving"><i class="fas fa-spinner fa-spin"></i> Création…</span>
                                <span v-else>📱 Créer / réinitialiser l'accès mobile</span>
                            </button>
                            <button class="btn btn-outline" @click="showDetailModal = false" style="padding:8px 16px; border-radius:8px; background:white; border:1px solid #cbd5e1;">Fermer</button>
                        </div>
                    </div>
                </div>

                <!-- ════════════════════════════════════════════════════ -->
                <!-- Modal Transfert de client vers un autre démarcheur -->
                <!-- ════════════════════════════════════════════════════ -->
                <div v-if="showTransferModal" class="pm-overlay" @click.self="showTransferModal = false">
                    <div class="pm-box" style="max-width:520px;">
                        <div class="pm-header">
                            <h3 style="margin:0; font-size:18px; color:#0f172a; display:flex; align-items:center; gap:8px;">
                                <i class="fas fa-exchange-alt" style="color:#9a3412;"></i> Transférer le client
                            </h3>
                            <button @click="showTransferModal = false" style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;">✕</button>
                        </div>
                        <div class="pm-body" style="font-size:14px;">
                            <div style="background:#f8fafc; padding:12px 14px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:18px;">
                                <div style="font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">Client à transférer</div>
                                <div style="font-weight:700; font-size:15px; color:#0f172a; margin-top:4px;">{{ transferingClient ? transferingClient.clientName || '(sans nom)' : '' }}</div>
                                <div style="color:#64748b; font-size:12px; margin-top:2px;"><i class="fas fa-phone" style="font-size:10px;"></i> {{ transferingClient ? transferingClient.phone : '' }}</div>
                            </div>

                            <div style="margin-bottom:15px;">
                                <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:6px; display:block;">Démarcheur actuel</label>
                                <div style="padding:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; color:#1e40af; font-weight:700;">
                                    {{ partnerDetail.prenom }} {{ partnerDetail.nom }}
                                </div>
                            </div>

                            <div style="margin-bottom:15px;">
                                <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:6px; display:block;">Nouveau démarcheur *</label>
                                <select v-model="transferTarget" style="width:100%; padding:11px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; background:white; font-size:14px;">
                                    <option value="">— Sélectionner le démarcheur cible —</option>
                                    <option v-for="p in availableTransferTargets" :key="p.id" :value="p.id">
                                        {{ p.prenom }} {{ p.nom }} ({{ p.telephone || 'sans tél.' }})
                                    </option>
                                </select>
                            </div>

                            <div style="margin-bottom:15px;">
                                <label style="font-size:12px; font-weight:700; color:#475569; margin-bottom:6px; display:block;">Motif (optionnel)</label>
                                <input type="text" v-model="transferReason" placeholder="Ex: démarcheur parti, réaffectation interne…" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; font-size:13px;">
                            </div>

                            <div style="background:#fffbeb; border:1px solid #fcd34d; padding:12px 14px; border-radius:10px; font-size:12px; color:#92400e; line-height:1.6;">
                                <b><i class="fas fa-info-circle"></i> Important :</b> les commissions <b>déjà créées</b> restent attribuées à {{ partnerDetail.prenom }} (historique préservé). Seules les <b>commissions futures</b> sur ce client iront au nouveau démarcheur.
                            </div>
                        </div>
                        <div class="pm-footer">
                            <button class="btn btn-outline" @click="showTransferModal = false" style="padding:10px 15px; border-radius:8px; background:white; border:1px solid #cbd5e1;">Annuler</button>
                            <button @click="confirmTransfer" :disabled="!transferTarget || transferBusy" style="padding:10px 20px; border-radius:8px; background:#9a3412; color:white; border:none; cursor:pointer; font-weight:700;" :style="(!transferTarget || transferBusy) ? 'opacity:0.5; cursor:not-allowed;' : ''">
                                <span v-if="transferBusy"><i class="fas fa-spinner fa-spin"></i> Transfert…</span>
                                <span v-else><i class="fas fa-exchange-alt"></i> Confirmer le transfert</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const targetContainer = container || document.getElementById('contentContainer');
        targetContainer.innerHTML = html;
        this.initVue(globalApp);
    },

    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                const activeAgency = ref(sessionStorage.getItem('currentActiveAgency') || 'abidjan');
                // Activation pilotée par flag (settings/menus_<agency>.features.affiliation),
                // défaut sûr = comportement historique Asie. Source unique : affiliation-config.js
                const isAsieAgency = computed(() => isAffiliationActive(activeAgency.value));
                const userRole = sessionStorage.getItem('userRole');
                const isSuperAdmin = computed(() => userRole === 'super_admin' || userRole === 'admin');

                const currentTab = ref('dashboard');
                
                // State
                const partners = ref([]);
                const commissions = ref([]);
                const withdrawals = ref([]);
                const demandesRetrait = ref([]); // demandes de retrait créées par l'app mobile
                const settings = reactive({
                    tauxAMT: 50,
                    tauxDemarcheur: 50,
                    tauxBonusParrainage: 10,
                    quiPaieParrainDefaut: 'demarcheur'
                });

                // Charges fixes par route. Stockées dans agencies_config/<id>
                //   - chargesFixesCbm    : CFA / m³ (maritime)
                //   - chargesFixesKgAerien : CFA / kg (aérien)
                // chargesByRoute est un map réactif { [routeId]: { cbm, kg } }.
                const chargesByRoute = reactive({});
                const savingCharges = ref(false);
                const depRoutes = ref([]);
                // Charges fixes pertinentes uniquement pour les routes où le
                // parrainage est ACTIF (sinon : pas de filleul -> pas de bonus
                // parrain -> pas de bénéfice à calculer, on reste en 50/50 du
                // montant facturé). Cible naturelle : routes Chine.
                // Une seule route à la fois : la route ACTIVE (celle sélectionnée
                // dans le header). Les charges fixes sont propres à chaque route
                // (multi-tenant) — on ne mélange pas les configs.
                const affiliatedRoutes = computed(() => depRoutes.value.filter(r => r.id === activeAgency.value));
                
                // UI State
                const saving = ref(false);
                const showPartnerModal = ref(false);
                const showWithdrawalModal = ref(false);
                const showDetailModal = ref(false);
                const partnerDetail = ref({});

                const filters = reactive({
                    networkSearch: '',
                    networkStatus: 'all',
                    networkSponsor: 'all',
                    commDate: 'month',
                    commPartner: '',
                    commType: 'all'
                });

                const partnerForm = reactive({
                    id: '', nom: '', prenom: '', telephone: '', email: '',
                    adresse: '', numId: '', photoUrl: '',
                    statut: 'actif', // actif | en_attente | suspendu
                    parrainId: '', quiPaieParrain: ''
                });
                // Photo : preview locale (data URL) avant upload, fichier en attente
                // d'envoi vers Firebase Storage lors du clic sur Enregistrer.
                const photoPreview = ref('');
                const photoUploading = ref(false);
                let _pendingPhotoFile = null;
                const onPhotoSelected = (ev) => {
                    const f = ev.target.files && ev.target.files[0];
                    if (!f) { _pendingPhotoFile = null; photoPreview.value = ''; return; }
                    _pendingPhotoFile = f;
                    const reader = new FileReader();
                    reader.onload = (e) => { photoPreview.value = e.target.result; };
                    reader.readAsDataURL(f);
                };

                const selectedPartnerForWithdrawal = ref('');
                const withdrawalForm = reactive({
                    montant: '', periode: '', moyenPaiement: 'Espèces'
                });

                let unsubs = [];

                // Helpers
                const formatMoney = (val) => new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(val || 0).replace(/[\u202F\u00A0]/g, ' ');
                const formatDate = (ts) => ts ? (ts.toDate ? ts.toDate().toLocaleDateString('fr-FR') : new Date(ts).toLocaleDateString('fr-FR')) : '-';

                // --- FIREBASE SYNC ---
                onMounted(() => {
                    if (!isAsieAgency.value) return;

                    // Settings
                    unsubs.push(onSnapshot(doc(db, "parametres", "commissions"), (docSnap) => {
                        if (docSnap.exists()) {
                            const d = docSnap.data();
                            settings.tauxAMT = Math.round(d.tauxAMT * 100) || 50;
                            settings.tauxDemarcheur = Math.round(d.tauxDemarcheur * 100) || 50;
                            settings.tauxBonusParrainage = Math.round(d.tauxBonusParrainage * 100) || 10;
                            settings.quiPaieParrainDefaut = d.quiPaieParrainDefaut || 'demarcheur';
                        }
                    }));

                    // Partners (Démarcheurs)
                    unsubs.push(onSnapshot(query(collection(db, getCollectionName("demarcheurs")), orderBy("dateInscription", "asc")), (snap) => {
                        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        // Calcul filleuls virtuels pour l'UI
                        list.forEach(p => { p.filleulsCount = list.filter(f => f.parrainId === p.id).length; });
                        partners.value = list;
                    }));

                    // Commissions
                    unsubs.push(onSnapshot(query(collection(db, getCollectionName("commissions")), orderBy("dateCreation", "desc")), (snap) => {
                        commissions.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        if (currentTab.value === 'dashboard') drawCharts();
                    }));

                    // Withdrawals
                    unsubs.push(onSnapshot(query(collection(db, getCollectionName("retraits")), orderBy("dateRetrait", "desc")), (snap) => {
                        withdrawals.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    }));

                    // Demandes de retrait (créées par l'app mobile partenaire)
                    unsubs.push(onSnapshot(query(collection(db, getCollectionName("retrait_demandes")), orderBy("dateDemande", "desc")), (snap) => {
                        demandesRetrait.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    }, (err) => { console.warn("retrait_demandes:", err && err.message); }));

                    // Charges fixes par route : liste des départs depuis AGENCIES
                    // (fusion des valeurs par défaut + Firestore), et abonnement
                    // en temps réel sur agencies_config pour rafraîchir les
                    // champs si quelqu'un les modifie ailleurs.
                    const buildDepRoutes = (live) => {
                        const byId = {};
                        Object.values(AGENCIES || {}).forEach(a => { if (a && a.id) byId[a.id] = a; });
                        (live || []).forEach(a => { byId[a.id] = a; });
                        const deps = Object.values(byId).filter(a => a.type === 'departure');
                        depRoutes.value = deps;
                        deps.forEach(d => {
                            if (!chargesByRoute[d.id]) {
                                chargesByRoute[d.id] = {
                                    cbm: Number(d.chargesFixesCbm) || 0,
                                    kg: Number(d.chargesFixesKgAerien) || 0,
                                };
                            } else {
                                // Met à jour seulement si la valeur Firestore a changé
                                // et que l'utilisateur n'a rien tapé entre-temps.
                                if (typeof d.chargesFixesCbm === 'number') chargesByRoute[d.id].cbm = d.chargesFixesCbm;
                                if (typeof d.chargesFixesKgAerien === 'number') chargesByRoute[d.id].kg = d.chargesFixesKgAerien;
                            }
                        });
                    };
                    unsubs.push(onSnapshot(collection(db, "agencies_config"), (snap) => {
                        buildDepRoutes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    }, (err) => { console.warn("agencies_config (charges):", err && err.message); buildDepRoutes([]); }));
                });

                onUnmounted(() => { unsubs.forEach(u => u()); });

                watch(currentTab, (newTab) => {
                    if (newTab === 'dashboard' || newTab === 'analytique') {
                        nextTick(() => drawCharts());
                    }
                });

                // --- COMPUTED PROPERTIES ---
                
                const getRoleBadge = (p) => {
                    if (!p) return '';
                    const hasParent = !!p.parrainId;
                    const hasChildren = p.filleulsCount > 0;

                    if (!hasParent && hasChildren) {
                        return '<span class="badge" style="background:#fef3c7; color:#d97706;" title="Leader ayant des filleuls">👑 Leader</span>';
                    } else if (!hasParent && !hasChildren) {
                        return '<span class="badge" style="background:#fef3c7; color:#d97706;" title="Venu directement à nous">👑 Leader Direct</span>';
                    } else if (hasParent && hasChildren) {
                        return '<span class="badge" style="background:#e0f2fe; color:#0369a1;" title="Filleul devenu Leader">👑/👥 Leader & Filleul</span>';
                    } else {
                        return '<span class="badge" style="background:#f1f5f9; color:#475569;" title="Apporté par un Leader">👥 Filleul</span>';
                    }
                };
                
                // Dashboard KPIs
                const kpis = computed(() => {
                    let tGenere = 0, tPaye = 0, tDette = 0;
                    let debtPartners = 0, inactive = 0, top = 0;
                    
                    partners.value.forEach(p => {
                        tGenere += (p.totalGagne || 0);
                        tPaye += (p.totalRetire || 0);
                        const solde = p.soldeDisponible || 0;
                        tDette += solde;
                        
                        if (solde > 50000) debtPartners++;
                        if (p.statut === 'inactif') inactive++;
                        if ((p.totalGagne || 0) > 100000) top++;
                    });
                    return { totalGenere: tGenere, totalPaye: tPaye, totalDette: tDette, partnersInDebt: debtPartners, inactivePartners: inactive, topPerformers: top };
                });

                const topPartners = computed(() => {
                    return [...partners.value].sort((a,b) => (b.totalGagne || 0) - (a.totalGagne || 0)).slice(0,5);
                });

                // Network
                const filteredNetwork = computed(() => {
                    return partners.value.filter(p => {
                        if (filters.networkStatus !== 'all' && p.statut !== filters.networkStatus) return false;
                        if (filters.networkSponsor === 'avec_parrain' && !p.parrainId) return false;
                        if (filters.networkSponsor === 'sans_parrain' && p.parrainId) return false;
                        if (filters.networkSearch) {
                            const s = filters.networkSearch.toLowerCase();
                            if (!`${p.prenom} ${p.nom} ${p.telephone}`.toLowerCase().includes(s)) return false;
                        }
                        return true;
                    });
                });

                const filteredNetworkTree = computed(() => {
                    // On aplatit l'arbre pour l'affichage
                    let tree = [];
                    const buildTree = (parentId, level) => {
                        const children = filteredNetwork.value.filter(p => p.parrainId === parentId);
                        children.forEach(child => {
                            const parent = partners.value.find(p => p.id === parentId);
                            tree.push({
                                ...child, 
                                level, 
                                indentStyle: level > 0 ? `margin-left: ${Math.min(level * 30, 90)}px; border-left: 3px solid #cbd5e1;` : '',
                                parentName: parent ? `${parent.prenom} ${parent.nom}` : ''
                            });
                            buildTree(child.id, level + 1);
                        });
                    };
                    // Racines (ceux dont le parrain n'est pas dans la liste filtrée ou sans parrain)
                    const roots = filteredNetwork.value.filter(p => !p.parrainId || !filteredNetwork.value.find(f => f.id === p.parrainId));
                    roots.forEach(r => {
                        tree.push({ ...r, level: 0, indentStyle: '' });
                        buildTree(r.id, 1);
                    });
                    return tree;
                });

                // Commissions
                const filteredCommissions = computed(() => {
                    const now = new Date();
                    let dStart, dEnd;
                    if (filters.commDate === 'month') {
                        dStart = new Date(now.getFullYear(), now.getMonth(), 1);
                        dEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                    } else if (filters.commDate === 'last_month') {
                        dStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        dEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                    } else if (filters.commDate === 'year') {
                        dStart = new Date(now.getFullYear(), 0, 1);
                        dEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                    }

                    return commissions.value.filter(c => {
                        if (filters.commType !== 'all' && c.type !== filters.commType) return false;
                        if (filters.commPartner && c.demarcheurId !== filters.commPartner) return false;
                        
                        if (dStart && dEnd) {
                            const cDate = c.dateCreation ? (c.dateCreation.toDate ? c.dateCreation.toDate() : new Date(c.dateCreation)) : new Date();
                            if (cDate < dStart || cDate > dEnd) return false;
                        }
                        return true;
                    });
                });

                const commKpis = computed(() => {
                    let tGenere = 0, pAMT = 0, netDem = 0, bonus = 0;
                    filteredCommissions.value.forEach(c => {
                        if (c.type === 'direct') { tGenere += (c.montantBrut||0); pAMT += (c.montantAMT||0); }
                        if (c.type === 'parrainage') { bonus += (c.bonusParrainage||0); }
                        netDem += (c.montantNet||0);
                    });
                    return { totalGenere: tGenere, partAMT: pAMT, netDemarcheurs: netDem, bonusParrainage: bonus };
                });

                const getPartnerName = (id) => {
                    const p = partners.value.find(x => x.id === id);
                    return p ? `${p.prenom} ${p.nom}` : 'Inconnu';
                };
                const getPartnerFilleuls = (id) => partners.value.filter(x => x.parrainId === id);

                // Withdrawals
                const filteredWithdrawals = computed(() => {
                    if (!selectedPartnerForWithdrawal.value) return [];
                    return withdrawals.value.filter(w => w.demarcheurId === selectedPartnerForWithdrawal.value);
                });
                const partnerWithdrawalInfo = computed(() => {
                    if (!selectedPartnerForWithdrawal.value) return null;
                    return partners.value.find(p => p.id === selectedPartnerForWithdrawal.value);
                });
                const isWithdrawalValid = computed(() => {
                    const amt = parseFloat(withdrawalForm.montant);
                    return amt > 0 && amt <= (partnerWithdrawalInfo.value?.soldeDisponible || 0);
                });

                // Analytics
                const analytics = computed(() => {
                    const totalCom = commissions.value.reduce((sum, c) => sum + (c.montantBrut || 0), 0);
                    const avg = commissions.value.length ? totalCom / commissions.value.length : 0;
                    
                    const mMap = {};
                    commissions.value.forEach(c => {
                        const d = c.dateCreation ? (c.dateCreation.toDate ? c.dateCreation.toDate() : new Date(c.dateCreation)) : null;
                        if (d) {
                            const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                            mMap[k] = (mMap[k] || 0) + (c.montantBrut || 0);
                        }
                    });
                    let bM = '', bA = 0;
                    for(const [k, v] of Object.entries(mMap)) { if (v > bA) { bA = v; bM = k; } }

                    const activeSp = partners.value.filter(p => p.parrainId).length;
                    const rate = partners.value.length ? Math.round((activeSp / partners.value.length)*100) : 0;

                    return { avgCommission: avg, bestMonth: bM || '-', bestMonthAmount: bA, activeSponsorsRate: rate };
                });

                // Settings Simulation
                // Simulation pour 100 000 CFA de bénéfice (= montant facturé
                // − charges fixes déjà retranchées). Applique la règle officielle :
                //   - Démarcheur seul   : tDem du bénéfice / AMT = reste
                //   - Filleul + Parrain : tDem du bénéfice / Parrain = tPar / AMT = reste
                //   AMT paie toujours le bonus parrain.
                const simulation = computed(() => {
                    const benefice = 100000;
                    const tDem = settings.tauxDemarcheur / 100;
                    const tPar = settings.tauxBonusParrainage / 100;
                    const demB = benefice * tDem;     // démarcheur seul -> reçoit demB ; AMT le complément
                    const amtB = benefice - demB;     // = part AMT quand pas de parrain
                    const bon = benefice * tPar;      // bonus parrain (sur le bénéfice, pas sur la commission)
                    const demN = demB;                // filleul garde 100 % de sa part (AMT paie le bonus)
                    const amtN = benefice - demN - bon; // AMT prend ce qui reste après filleul + parrain
                    return { amtBrut: amtB, demBrut: demB, bonus: bon, amtNet: amtN, demNet: demN };
                });

                const syncRates = (mod) => {
                    if (mod === 'amt') settings.tauxDemarcheur = 100 - settings.tauxAMT;
                    if (mod === 'dem') settings.tauxAMT = 100 - settings.tauxDemarcheur;
                };

                // --- ACTIONS ---
                const saveSettings = async () => {
                    if (settings.tauxAMT + settings.tauxDemarcheur !== 100) return globalApp.showToast("La somme doit faire 100%", "error");
                    saving.value = true;
                    try {
                        await setDoc(doc(db, "parametres", "commissions"), {
                            tauxAMT: settings.tauxAMT / 100,
                            tauxDemarcheur: settings.tauxDemarcheur / 100,
                            tauxBonusParrainage: settings.tauxBonusParrainage / 100,
                            quiPaieParrainDefaut: settings.quiPaieParrainDefaut,
                            derniereMaj: serverTimestamp()
                        }, { merge: true });
                        globalApp.showToast("Politique de parrainage enregistrée", "success");
                    } catch(e) { globalApp.showToast("Erreur", "error"); }
                    saving.value = false;
                };

                // Enregistre les charges fixes (par m³ et par kg) sur chaque
                // route de départ. Écrit dans agencies_config/<id>. Met à jour
                // le cache localStorage pour propagation immédiate aux écrans
                // qui lisent AGENCIES sans recharger.
                const saveCharges = async () => {
                    savingCharges.value = true;
                    try {
                        const batch = writeBatch(db);
                        // Sauvegarde UNIQUEMENT les routes où le parrainage est
                        // actif (= celles affichées dans le panneau). Ne touche
                        // pas aux autres routes pour ne pas écraser des configs
                        // d'agence non concernées par les charges fixes.
                        affiliatedRoutes.value.forEach(d => {
                            const c = chargesByRoute[d.id] || { cbm: 0, kg: 0 };
                            batch.set(doc(db, "agencies_config", d.id), {
                                chargesFixesCbm: Number(c.cbm) || 0,
                                chargesFixesKgAerien: Number(c.kg) || 0,
                                updatedAt: new Date().toISOString()
                            }, { merge: true });
                        });
                        await batch.commit();
                        try {
                            const cache = JSON.parse(localStorage.getItem('amt_agencies_config') || '{}');
                            affiliatedRoutes.value.forEach(d => {
                                if (!cache[d.id]) cache[d.id] = {};
                                cache[d.id].chargesFixesCbm = Number((chargesByRoute[d.id] || {}).cbm) || 0;
                                cache[d.id].chargesFixesKgAerien = Number((chargesByRoute[d.id] || {}).kg) || 0;
                            });
                            localStorage.setItem('amt_agencies_config', JSON.stringify(cache));
                        } catch (e) { /* cache illisible : ok */ }
                        globalApp.showToast("Charges fixes enregistrées ✔", "success");
                    } catch (e) {
                        console.error(e); globalApp.showToast("Erreur lors de l'enregistrement.", "error");
                    } finally { savingCharges.value = false; }
                };

                const availableSponsors = computed(() => partners.value.filter(p => p.id !== partnerForm.id)); // Éviter l'auto-parrainage

                const openPartnerModal = (p = null) => {
                    _pendingPhotoFile = null;
                    photoPreview.value = '';
                    if (p) {
                        Object.assign(partnerForm, {
                            id: p.id, nom: p.nom || '', prenom: p.prenom || '',
                            telephone: p.telephone || '', email: p.email || '',
                            adresse: p.adresse || '', numId: p.numId || '',
                            photoUrl: p.photoUrl || '',
                            statut: p.statut || 'actif',
                            parrainId: p.parrainId || '', quiPaieParrain: p.quiPaieParrain || ''
                        });
                    } else {
                        Object.assign(partnerForm, {
                            id: '', nom: '', prenom: '', telephone: '', email: '',
                            adresse: '', numId: '', photoUrl: '',
                            statut: 'actif',
                            parrainId: '', quiPaieParrain: ''
                        });
                    }
                    showPartnerModal.value = true;
                };

                const savePartner = async () => {
                    if (!partnerForm.nom || !partnerForm.prenom || !partnerForm.telephone) return globalApp.showToast("Remplissez les champs obligatoires", "error");
                    saving.value = true;
                    try {
                        // Upload photo (si une nouvelle a été sélectionnée) AVANT
                        // l'écriture du doc : on stocke l'URL Storage finale.
                        let photoUrlFinal = partnerForm.photoUrl || '';
                        if (_pendingPhotoFile) {
                            photoUploading.value = true;
                            try {
                                const storage = getStorage(app);
                                const fileName = `demarcheurs/photo_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
                                const sRef = storageRef(storage, fileName);
                                await uploadBytes(sRef, _pendingPhotoFile);
                                photoUrlFinal = await getDownloadURL(sRef);
                            } catch (e) {
                                console.error('Upload photo échoué:', e);
                                globalApp.showToast("Photo non envoyée (continuons sans).", "error");
                            } finally {
                                photoUploading.value = false;
                            }
                        }
                        const payload = {
                            nom: partnerForm.nom, prenom: partnerForm.prenom,
                            telephone: partnerForm.telephone, email: partnerForm.email,
                            adresse: partnerForm.adresse || '',
                            numId: partnerForm.numId || '',
                            photoUrl: photoUrlFinal,
                            statut: partnerForm.statut || 'actif',
                            parrainId: partnerForm.parrainId || null,
                            quiPaieParrain: partnerForm.quiPaieParrain || null,
                            // agency : route propriétaire du démarcheur. Sert au mobile
                            // (custom claim) et à reconcileOne pour retrouver la fiche.
                            agency: activeAgency.value,
                        };
                        if (partnerForm.id) {
                            await updateDoc(doc(db, getCollectionName("demarcheurs"), partnerForm.id), payload);
                        } else {
                            payload.dateInscription = serverTimestamp();
                            payload.totalGagne = 0; payload.totalRetire = 0; payload.soldeDisponible = 0;
                            await addDoc(collection(db, getCollectionName("demarcheurs")), payload);
                        }
                        _pendingPhotoFile = null;
                        photoPreview.value = '';
                        globalApp.showToast("Partenaire enregistré", "success");
                        showPartnerModal.value = false;
                    } catch(e) { console.error(e); globalApp.showToast("Erreur", "error"); }
                    saving.value = false;
                };

                // --- A2.5 : accès mobile du démarcheur (Cloud Function sécurisée) ---
                const mobileAccessSaving = ref(false);
                const mobileAccessInfo = ref(null); // { email, password, generated } | { error }

                const createMobileAccess = async () => {
                    const p = partnerDetail.value;
                    if (!p || !p.id) return;
                    if (!p.email || !String(p.email).trim()) {
                        globalApp.showToast("Ajoutez d'abord un email à ce partenaire (bouton Modifier).", "error");
                        return;
                    }
                    const label = `${p.prenom || ''} ${p.nom || ''}`.trim();
                    const ok = window.AppModal
                        ? await window.AppModal.confirm(`Créer / réinitialiser l'accès mobile de ${label} ?\nUn mot de passe sera généré et affiché une seule fois.`, "Accès mobile", false)
                        : confirm(`Créer / réinitialiser l'accès mobile de ${label} ?`);
                    if (!ok) return;
                    mobileAccessSaving.value = true;
                    mobileAccessInfo.value = null;
                    try {
                        // S'assure que la session Firebase est bien chargée, puis force un
                        // jeton FRAIS avant d'appeler la fonction. Sans ça, on obtient un 401
                        // "Vous devez être connecté" alors que l'écran semble connecté
                        // (jeton expiré / non rafraîchi = appel envoyé sans authentification).
                        if (auth && typeof auth.authStateReady === 'function') { await auth.authStateReady(); }
                        if (!auth || !auth.currentUser) {
                            throw new Error("Votre session a expiré. Déconnectez-vous, reconnectez-vous, puis réessayez.");
                        }
                        // Jeton FRAIS + diagnostic : c'est exactement ce jeton qui part
                        // vers la fonction. On note qui on est pour comprendre un refus.
                        const idToken = await auth.currentUser.getIdToken(true);
                        console.log('[accès mobile] appel provisionDemarcheurAuth — uid=' + auth.currentUser.uid + ' | email=' + (auth.currentUser.email || '?'));
                        // Appel DIRECT du protocole "callable" v1 en attachant nous-mêmes
                        // le jeton (Authorization: Bearer). L'ancien SDK (9.22.0) ne le
                        // joignait pas => le serveur croyait l'appel anonyme (401).
                        const projectId = (app && app.options && app.options.projectId) || 'caisse-amt-perso';
                        const url = `https://us-central1-${projectId}.cloudfunctions.net/provisionDemarcheurAuth`;
                        const resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`,
                            },
                            body: JSON.stringify({ data: { demarcheurId: p.id, agency: activeAgency.value } }),
                        });
                        const json = await resp.json().catch(() => ({}));
                        if (!resp.ok || (json && json.error)) {
                            const err = (json && json.error) || {};
                            const e2 = new Error(err.message || `Échec serveur (HTTP ${resp.status}).`);
                            e2.code = `functions/${(err.status || resp.status || 'unknown')}`.toLowerCase();
                            throw e2;
                        }
                        const d = (json && json.result) || {};
                        mobileAccessInfo.value = { email: d.email, password: d.password, generated: d.generated };
                        globalApp.showToast("Accès mobile créé ✔", "success");
                    } catch (e) {
                        const code = (e && e.code) ? e.code : 'inconnu';
                        const base = (e && e.message) ? e.message : "Erreur lors de la création de l'accès.";
                        let who = '';
                        try {
                            const u = auth && auth.currentUser;
                            who = u ? ` | connecté: ${u.email || u.uid}` : ' | connecté: NON';
                        } catch (_) { /* ignore */ }
                        const msg = `${base}  (code=${code}${who})`;
                        console.error('[accès mobile] ÉCHEC —', code, e);
                        mobileAccessInfo.value = { error: msg };
                        globalApp.showToast(msg, "error");
                    } finally {
                        mobileAccessSaving.value = false;
                    }
                };

                const openDetails = (p) => {
                    partnerDetail.value = p;
                    mobileAccessInfo.value = null;
                    showDetailModal.value = true;
                    loadPartnerClients(p.id);
                };

                // ── TRANSFERT CLIENT ENTRE DÉMARCHEURS ──────────────────
                // Permet à un super_admin / admin de réaffecter un client
                // (= une affiliation par téléphone) à un autre démarcheur.
                // IMPORTANT : seules les commissions FUTURES vont au nouveau
                // démarcheur. L'historique reste attribué à l'ancien.
                const partnerClients = ref([]);
                const partnerClientsLoading = ref(false);
                const showTransferModal = ref(false);
                const transferingClient = ref(null);
                const transferTarget = ref('');
                const transferReason = ref('');
                const transferBusy = ref(false);

                const loadPartnerClients = async (demId) => {
                    if (!demId) { partnerClients.value = []; return; }
                    partnerClientsLoading.value = true;
                    try {
                        const qSnap = await getDocs(query(
                            collection(db, getCollectionName('client_affiliations')),
                            where('demarcheurId', '==', demId)
                        ));
                        partnerClients.value = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                    } catch (e) {
                        console.warn('clients du partenaire:', e);
                        partnerClients.value = [];
                    } finally { partnerClientsLoading.value = false; }
                };

                const openTransferModal = (client) => {
                    transferingClient.value = client;
                    transferTarget.value = '';
                    transferReason.value = '';
                    showTransferModal.value = true;
                };

                const availableTransferTargets = computed(() => {
                    if (!transferingClient.value) return partners.value;
                    return partners.value.filter(p => p.id !== transferingClient.value.demarcheurId);
                });

                const confirmTransfer = async () => {
                    if (!transferingClient.value || !transferTarget.value) return;
                    if (transferTarget.value === transferingClient.value.demarcheurId) {
                        globalApp.showToast("Le client est déjà rattaché à ce démarcheur.", "error");
                        return;
                    }
                    transferBusy.value = true;
                    try {
                        const cli = transferingClient.value;
                        const newDem = partners.value.find(p => p.id === transferTarget.value);
                        if (!newDem) throw new Error('Démarcheur cible introuvable.');
                        await updateDoc(doc(db, getCollectionName('client_affiliations'), cli.id), {
                            demarcheurId: transferTarget.value,
                            demarcheurName: `${newDem.prenom || ''} ${newDem.nom || ''}`.trim(),
                            // Audit : trace de la dernière réaffectation. On enrichit
                            // au lieu d'écraser pour pouvoir auditer plus tard si besoin.
                            lastTransferAt: serverTimestamp(),
                            lastTransferBy: (auth && auth.currentUser) ? auth.currentUser.uid : '',
                            lastTransferFrom: cli.demarcheurId,
                            lastTransferTo: transferTarget.value,
                            lastTransferReason: transferReason.value || '',
                        });
                        globalApp.showToast(`Client transféré à ${newDem.prenom} ${newDem.nom} ✔`, "success");
                        showTransferModal.value = false;
                        // Recharge la liste du démarcheur courant
                        await loadPartnerClients(partnerDetail.value.id);
                    } catch (e) {
                        console.error(e);
                        globalApp.showToast("Échec du transfert (vérifiez vos permissions).", "error");
                    } finally { transferBusy.value = false; }
                };

                // Recalcule (Cloud Function) le « disponible » (factures payées,
                // au prorata) vs « potentiel ». scope='all' = migration globale ;
                // sinon recalcule un seul partenaire. Même protocole d'appel
                // que createMobileAccess (jeton Bearer attaché à la main).
                const reconcileBusy = ref(false);
                const reconcilerSoldes = async (scope, demId) => {
                    reconcileBusy.value = true;
                    try {
                        if (auth && typeof auth.authStateReady === 'function') { await auth.authStateReady(); }
                        if (!auth || !auth.currentUser) {
                            throw new Error("Session expirée. Reconnectez-vous puis réessayez.");
                        }
                        const idToken = await auth.currentUser.getIdToken(true);
                        const projectId = (app && app.options && app.options.projectId) || 'caisse-amt-perso';
                        const fn = scope === 'all' ? 'reconcileAllPartnersBalances' : 'reconcilePartnerBalances';
                        const url = `https://us-central1-${projectId}.cloudfunctions.net/${fn}`;
                        const payload = scope === 'all'
                            ? { data: { agency: activeAgency.value } }
                            : { data: { demarcheurId: demId, agency: activeAgency.value } };
                        const resp = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                            body: JSON.stringify(payload),
                        });
                        const json = await resp.json().catch(() => ({}));
                        if (!resp.ok || (json && json.error)) {
                            const err = (json && json.error) || {};
                            throw new Error(err.message || `Échec serveur (HTTP ${resp.status}).`);
                        }
                        globalApp.showToast(scope === 'all' ? "Soldes de tous les partenaires recalculés ✔" : "Solde recalculé ✔", "success");
                    } catch (e) {
                        globalApp.showToast((e && e.message) || "Échec du recalcul.", "error");
                    } finally {
                        reconcileBusy.value = false;
                    }
                };

                // P2b — migration unique : déplace les RDV/devis/demandes des
                // routes SaaS depuis les collections communes vers les
                // collections par route (Cloud Function admin migrateSaasRdvDevis).
                const migrerRoutesRdvDevis = async () => {
                    if (!confirm("Migrer les RDV / devis / demandes des routes SaaS vers leurs collections par route ?\n\nÀ lancer UNE fois après le déploiement P2a. Sans risque pour Paris/Abidjan. Rejouable sans danger.")) return;
                    reconcileBusy.value = true;
                    try {
                        if (auth && typeof auth.authStateReady === 'function') { await auth.authStateReady(); }
                        if (!auth || !auth.currentUser) {
                            throw new Error("Session expirée. Reconnectez-vous puis réessayez.");
                        }
                        const idToken = await auth.currentUser.getIdToken(true);
                        const projectId = (app && app.options && app.options.projectId) || 'caisse-amt-perso';
                        const url = `https://us-central1-${projectId}.cloudfunctions.net/migrateSaasRdvDevis`;
                        const resp = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                            body: JSON.stringify({ data: {} }),
                        });
                        const json = await resp.json().catch(() => ({}));
                        if (!resp.ok || (json && json.error)) {
                            const err = (json && json.error) || {};
                            throw new Error(err.message || `Échec serveur (HTTP ${resp.status}).`);
                        }
                        const r = (json && json.result) || {};
                        const summary = (r.results || []).map(x => `${x.collection}: ${x.migrated}/${x.scanned}`).join(' · ');
                        globalApp.showToast(`Migration RDV/Devis terminée ✔ ${summary}`, "success");
                    } catch (e) {
                        globalApp.showToast((e && e.message) || "Échec de la migration.", "error");
                    } finally {
                        reconcileBusy.value = false;
                    }
                };

                const openWithdrawalModal = () => {
                    withdrawalForm.montant = ''; withdrawalForm.periode = ''; withdrawalForm.moyenPaiement = 'Espèces';
                    showWithdrawalModal.value = true;
                };

                const processWithdrawal = async () => {
                    if (!isWithdrawalValid.value) return;
                    saving.value = true;
                    try {
                        const amt = parseFloat(withdrawalForm.montant);
                        const batch = writeBatch(db);
                        
                        const refRetrait = doc(collection(db, getCollectionName("retraits")));
                        batch.set(refRetrait, {
                            demarcheurId: partnerWithdrawalInfo.value.id, montant: amt, periode: withdrawalForm.periode, moyenPaiement: withdrawalForm.moyenPaiement,
                            dateRetrait: serverTimestamp(), validePar: sessionStorage.getItem('userName') || 'Admin', statut: 'paye'
                        });
                        
                        batch.update(doc(db, getCollectionName("demarcheurs"), partnerWithdrawalInfo.value.id), {
                            totalRetire: increment(amt), soldeDisponible: increment(-amt)
                        });
                        
                        await batch.commit();
                        globalApp.showToast("Paiement validé avec succès", "success");
                        showWithdrawalModal.value = false;
                    } catch(e) { globalApp.showToast("Erreur", "error"); }
                    saving.value = false;
                };

                const pendingDemandesCount = computed(() =>
                    demandesRetrait.value.filter(d => (d.statut || 'en_attente') === 'en_attente').length);

                const _whoTreated = () => sessionStorage.getItem('userName') || 'Admin';

                // Payer une demande mobile = créer le paiement réel (déduit du
                // solde, comme processWithdrawal) ET marquer la demande traitée.
                const payerDemande = async (d) => {
                    const p = partners.value.find(x => x.id === d.demarcheurId);
                    if (!p) { globalApp.showToast("Partenaire introuvable.", "error"); return; }
                    const amt = Number(d.montant) || 0;
                    if (amt <= 0) { globalApp.showToast("Montant invalide.", "error"); return; }
                    const solde = Number(p.soldeDisponible) || 0;
                    if (amt > solde) {
                        globalApp.showToast(`Solde insuffisant (${formatMoney(solde)}). Utilisez « Valider un paiement » pour ajuster.`, "error");
                        return;
                    }
                    const label = `${p.prenom || ''} ${p.nom || ''}`.trim();
                    const ok = window.AppModal
                        ? await window.AppModal.confirm(`Confirmer le paiement de ${formatMoney(amt)} à ${label} via ${d.moyenPaiement || '-'} (${d.numero || '-'}) ?`, "Payer la demande", false)
                        : confirm(`Payer ${formatMoney(amt)} à ${label} ?`);
                    if (!ok) return;
                    saving.value = true;
                    try {
                        const batch = writeBatch(db);
                        batch.set(doc(collection(db, getCollectionName("retraits"))), {
                            demarcheurId: d.demarcheurId, montant: amt,
                            periode: d.type === 'total' ? 'Solde total (demande mobile)' : 'Demande mobile',
                            moyenPaiement: d.moyenPaiement || '-', numero: d.numero || '',
                            dateRetrait: serverTimestamp(), validePar: _whoTreated(),
                            statut: 'paye', origine: 'demande_mobile', demandeId: d.id
                        });
                        batch.update(doc(db, getCollectionName("demarcheurs"), d.demarcheurId), {
                            totalRetire: increment(amt), soldeDisponible: increment(-amt)
                        });
                        batch.update(doc(db, getCollectionName("retrait_demandes"), d.id), {
                            statut: 'paye', traitePar: _whoTreated(), dateTraitement: serverTimestamp()
                        });
                        await batch.commit();
                        globalApp.showToast("Paiement enregistré et demande traitée ✔", "success");
                    } catch (e) {
                        globalApp.showToast("Erreur lors du paiement de la demande.", "error");
                    }
                    saving.value = false;
                };

                const refuserDemande = async (d) => {
                    const ok = window.AppModal
                        ? await window.AppModal.confirm("Refuser cette demande ? Le partenaire la verra comme « Refusée » dans son app.", "Refuser la demande", true)
                        : confirm("Refuser cette demande ?");
                    if (!ok) return;
                    saving.value = true;
                    try {
                        await updateDoc(doc(db, getCollectionName("retrait_demandes"), d.id), {
                            statut: 'refuse', traitePar: _whoTreated(), dateTraitement: serverTimestamp()
                        });
                        globalApp.showToast("Demande refusée.", "info");
                    } catch (e) {
                        globalApp.showToast("Erreur lors du refus.", "error");
                    }
                    saving.value = false;
                };

                const exportCommissions = () => globalApp.showToast("Export CSV à implémenter...", "info");
                const exportWithdrawals = () => globalApp.showToast("Export CSV à implémenter...", "info");

                // Charts
                let cMonthly = null, cDist = null, cEvo = null;
                const drawCharts = () => {
                    if (typeof Chart === 'undefined') return;
                    
                    // Monthly Bar Chart
                    const ctxM = document.getElementById('monthlyChart');
                    if (ctxM) {
                        if (cMonthly) cMonthly.destroy();
                        const mMap = {};
                        commissions.value.forEach(c => {
                            const d = c.dateCreation ? (c.dateCreation.toDate ? c.dateCreation.toDate() : new Date(c.dateCreation)) : null;
                            if (d) {
                                const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                                mMap[k] = (mMap[k] || 0) + (c.montantBrut || 0);
                            }
                        });
                        const sorted = Object.entries(mMap).sort().slice(-6);
                        cMonthly = new Chart(ctxM, { type: 'bar', data: { labels: sorted.map(s=>s[0]), datasets: [{ label: 'Commissions', data: sorted.map(s=>s[1]), backgroundColor: '#3b82f6', borderRadius: 6 }] }});
                    }

                    // Distribution Pie Chart
                    const ctxD = document.getElementById('distributionChart');
                    if (ctxD) {
                        if (cDist) cDist.destroy();
                        let dir = 0, par = 0;
                        commissions.value.forEach(c => { if(c.type==='direct') dir+=(c.montantNet||0); else par+=(c.montantNet||0); });
                        cDist = new Chart(ctxD, { type: 'doughnut', data: { labels: ['Vente directe', 'Bonus Parrainage'], datasets: [{ data: [dir, par], backgroundColor: ['#10b981', '#f59e0b'] }] }});
                    }

                    // Evolution Line Chart
                    const ctxE = document.getElementById('evolutionChart');
                    if (ctxE) {
                        if (cEvo) cEvo.destroy();
                        const eMap = {};
                        commissions.value.forEach(c => {
                            const d = c.dateCreation ? (c.dateCreation.toDate ? c.dateCreation.toDate() : new Date(c.dateCreation)) : null;
                            if (d) {
                                const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                                eMap[k] = (eMap[k] || 0) + (c.montantNet || 0);
                            }
                        });
                        const sortedE = Object.entries(eMap).sort();
                        cEvo = new Chart(ctxE, { type: 'line', data: { labels: sortedE.map(s=>s[0]), datasets: [{ label: 'Gains Partenaires', data: sortedE.map(s=>s[1]), borderColor: '#10b981', tension: 0.3, fill: true, backgroundColor: 'rgba(16,185,129,0.1)' }] }});
                    }
                };

                // Exposition globale de la fonction backend (création commission)
                window.app.creerCommissionParrainage = async function(expeditionId, beneficeBrut, partnerId) {
                    if (!partnerId || beneficeBrut <= 0) return;
                    const p = partners.value.find(d => d.id === partnerId);
                    if (!p) return;

                    const tAMT = settings.tauxAMT / 100;
                    const tDem = settings.tauxDemarcheur / 100;
                    const tPar = settings.tauxBonusParrainage / 100;

                    const pDemBrut = beneficeBrut * tDem;
                    const pAMTBrut = beneficeBrut * tAMT;
                    const bonus = p.parrainId ? pDemBrut * tPar : 0;
                    
                    let pDemNet = pDemBrut, pAMTNet = pAMTBrut;
                    const qui = p.quiPaieParrain || settings.quiPaieParrainDefaut;

                    if (p.parrainId && bonus > 0) {
                        if (qui === 'amt') pAMTNet -= bonus;
                        else pDemNet -= bonus;
                    }

                    const batch = writeBatch(db);
                    batch.set(doc(collection(db, getCollectionName("commissions"))), { expeditionId, demarcheurId: partnerId, type: 'direct', montantBrut: beneficeBrut, tauxDemarcheur: tDem, montantDemarcheur: pDemBrut, tauxAMT: tAMT, montantAMT: pAMTNet, bonusParrainage: bonus, quiPaieParrain: qui, montantNet: pDemNet, dateCreation: serverTimestamp(), statut: 'en_attente' });
                    batch.update(doc(db, getCollectionName("demarcheurs"), partnerId), { totalGagne: increment(pDemNet), soldeDisponible: increment(pDemNet) });

                    if (p.parrainId && bonus > 0) {
                        batch.set(doc(collection(db, getCollectionName("commissions"))), { expeditionId, demarcheurId: p.parrainId, type: 'parrainage', filleulId: partnerId, montantBrut: beneficeBrut, bonusParrainage: bonus, montantNet: bonus, dateCreation: serverTimestamp(), statut: 'en_attente' });
                        batch.update(doc(db, getCollectionName("demarcheurs"), p.parrainId), { totalGagne: increment(bonus), soldeDisponible: increment(bonus) });
                    }
                    await batch.commit();
                    globalApp.showToast("Commission parrainage générée.", "success");
                };

                return {
                    isAsieAgency, isSuperAdmin, currentTab, partners, settings, formatMoney, formatDate,
                    kpis, topPartners, filteredNetwork, filteredNetworkTree, filters,
                    commKpis, filteredCommissions, getPartnerName, getPartnerFilleuls,
                    selectedPartnerForWithdrawal, partnerWithdrawalInfo, filteredWithdrawals, withdrawalForm, isWithdrawalValid,
                    analytics, simulation, syncRates, saveSettings,
                    depRoutes, affiliatedRoutes, chargesByRoute, savingCharges, saveCharges,
                    showPartnerModal, partnerForm, availableSponsors, openPartnerModal, savePartner,
                    // Transfert client
                    partnerClients, partnerClientsLoading,
                    showTransferModal, transferingClient, transferTarget, transferReason,
                    transferBusy, availableTransferTargets,
                    openTransferModal, confirmTransfer,
                    photoPreview, photoUploading, onPhotoSelected,
                    showDetailModal, partnerDetail, openDetails,
                    reconcileBusy, reconcilerSoldes, migrerRoutesRdvDevis,
                    mobileAccessSaving, mobileAccessInfo, createMobileAccess,
                    showWithdrawalModal, openWithdrawalModal, processWithdrawal, saving,
                    demandesRetrait, pendingDemandesCount, payerDemande, refuserDemande,
                    exportCommissions, exportWithdrawals, getRoleBadge
                };
            }
        });

        this.vueApp.mount('#vue-parrainage-app');
    }
};