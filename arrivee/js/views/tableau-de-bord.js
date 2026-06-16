import { db } from '../../../commun/firebase-config.js';
import { collection, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../../commun/constants.js';
import { getCollectionName } from '../../../commun/agencies-config.js';
import { filterByShippingMode } from '../../../commun/shipping-mode.js';
import { calculateStorageFee } from '../../../commun/services/storageFee.js';
import { loadJsPdf } from '../../../commun/services/pdf-common.js';

import { formatMoney } from '../../../commun/services/format.js';

export const DashboardView = {
    render(app, container) {
        this.app = app;
        // Repli mobile réinitialisé à chaque ouverture (le détail démarre fermé).
        document.body.classList.remove('dash-show-details');

        container.innerHTML = `
            <style>
                /* Fiches (tablette + pliable + mobile ≤1024px) : tous les tableaux
                   du tableau de bord deviennent des fiches (sans libellés). */
                @media (max-width: 1024px) {
                    .modern-dashboard table thead { display:none; }
                    .modern-dashboard table, .modern-dashboard table tbody, .modern-dashboard table tr { display:block; width:100%; }
                    .modern-dashboard table tbody tr { box-sizing:border-box; border:1px solid #e8edf3; border-radius:11px; margin-bottom:10px; padding:9px 13px; background:#fff; display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; box-shadow:0 1px 2px rgba(15,23,42,.04); }
                    .modern-dashboard table tbody td { box-sizing:border-box; border:none !important; padding:0 !important; width:auto; max-width:100%; font-size:12.5px; color:#475569; white-space:normal !important; overflow-wrap:anywhere; text-align:left !important; }
                    .modern-dashboard table tbody td:first-child { width:100%; color:#94a3b8; font-size:11px; }
                    /* Carte de stats sur 2 colonnes -> pleine largeur (ne déborde plus). */
                    .modern-dashboard .span-2 { grid-column: 1 / -1 !important; box-sizing: border-box; min-width: 0; }
                    /* Graphiques : 1 colonne, et les cartes/toiles peuvent rétrécir. */
                    .modern-dashboard .charts-grid { grid-template-columns: 1fr !important; }
                    .modern-dashboard .charts-grid > * { min-width: 0 !important; box-sizing: border-box; }
                    .modern-dashboard canvas { max-width: 100% !important; }
                }
            </style>
            <div class="dashboard-container modern-dashboard">
                <!-- HEADER & FILTRES MODERNES -->
                <div class="dashboard-header-modern">
                    <div class="header-titles">
                        <h2>Vue d'Ensemble</h2>
                        <p>Suivez vos indicateurs de performance clés (KPIs) en temps réel.</p>
                    </div>
                    <div class="filter-controls-modern">
                        <div class="date-filter-modern">
                            <span>Du</span>
                            <input type="date" id="startDate" title="Date de début">
                            <span>au</span>
                            <input type="date" id="endDate" title="Date de fin">
                        </div>
                        <button id="clearFilterBtn" class="btn-modern-reset" title="Réinitialiser les filtres">✖</button>
                    </div>
                </div>

                <!-- 1. PERFORMANCE FINANCIÈRE -->
                <h3 class="kpi-section-title"><span class="icon-bg">📈</span> Performance Financière</h3>
                <div class="totals-container" style="margin-bottom: 30px;">
                    <div class="total-card colored-card span-2" id="card-percu" onclick="app.renderPage('livraison')" style="cursor: pointer;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 15px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 150px;">
                                <h3>Total Conteneurs (A)</h3>
                                <p id="grandTotalPercu">0 CFA</p>
                                <span id="grandTotalParisHidden" class="card-subtext">Dont Paris: 0 CFA</span>
                            </div>
                            <div style="flex: 1.2; min-width: 180px; border-left: 1px solid rgba(255,255,255,0.2); padding-left: 15px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                    <span style="opacity: 0.85; font-size: 12px;">Encaissements Cash :</span>
                                    <span id="percuBreakdownCash" style="font-weight: 700; font-size: 13px;">0 CFA</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                    <span style="opacity: 0.85; font-size: 12px;">Chèques Reçus :</span>
                                    <span id="percuBreakdownCheques" style="font-weight: 700; font-size: 13px;">0 CFA</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="opacity: 0.85; font-size: 12px;">Virements Reçus :</span>
                                    <span id="percuBreakdownVirements" style="font-weight: 700; font-size: 13px;">0 CFA</span>
                                </div>
                            </div>
                        </div>
                        <div class="card-watermark">📦</div>
                    </div>
                    <div class="total-card colored-card" id="card-other" onclick="app.renderPage('other-income')" style="cursor: pointer;">
                        <h3>Autres Entrées</h3>
                        <p id="grandTotalOtherIncome">0 CFA</p>
                        <div class="card-watermark">💵</div>
                    </div>
                    <div class="total-card colored-card span-2" id="card-depenses" onclick="app.renderPage('expenses')" style="cursor: pointer;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 15px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 150px;">
                                <h3>Dépenses Totales</h3>
                                <p id="grandTotalDepenses">0 CFA</p>
                                <span id="detailDepensesConteneur" class="card-subtext">Conteneurs: 0 CFA</span>
                                <span id="detailDepensesMensuelles" class="card-subtext">Mensuelles: 0 CFA</span>
                            </div>
                            <div style="flex: 1.2; min-width: 180px; border-left: 1px solid rgba(255,255,255,0.2); padding-left: 15px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                    <span style="opacity: 0.85; font-size: 12px;">Dépenses Cash :</span>
                                    <span id="depensesBreakdownCash" style="font-weight: 700; font-size: 13px;">0 CFA</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="opacity: 0.85; font-size: 12px;">Dépenses Banque :</span>
                                    <span id="depensesBreakdownBanque" style="font-weight: 700; font-size: 13px;">0 CFA</span>
                                </div>
                            </div>
                        </div>
                        <div class="card-watermark">📉</div>
                    </div>
                    <div class="total-card" id="card-benefice" onclick="app.renderPage('audit')" style="cursor: pointer;">
                        <h3>Bénéfice Total</h3>
                        <p id="grandTotalBenefice">0 CFA</p>
                        <div class="card-watermark">🏆</div>
                    </div>
                </div>

                <!-- Diagnostic : transactions au mode atypique (auto-masqué si liste vide) -->
                <div id="atypicalModesWrap" style="display:none; background:#ffffff; border:2px solid #fde68a; border-radius:14px; padding:16px 18px; margin: 0 0 20px 0;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                        <span style="background:#fef3c7; color:#92400e; padding:6px 10px; border-radius:10px; font-size:16px;">🔎</span>
                        <h3 style="margin:0; font-size:15px; font-weight:800; color:#0f172a;">Transactions au mode de paiement atypique</h3>
                    </div>
                    <p style="font-size:12px; color:#64748b; margin:0 0 12px 44px; line-height:1.4;">
                        <span id="atypicalModesCount" style="color:#b45309; font-weight:800;">0</span> transaction(s) ont un mode <b>non reconnu</b> par le système (ni Espèce/Wave/OM/MM, ni Chèque, ni Virement). Total : <b id="atypicalModesTotal" style="color:#b45309;">0 F CFA</b>. Ce montant alimente la ligne « autres encaissements non-cash » de l'écart. Corrigez les modes (saisie atypique, faute de frappe…) pour faire disparaître l'écart.
                    </p>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                                    <th style="padding:10px; text-align:left; font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Date</th>
                                    <th style="padding:10px; text-align:left; font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Référence</th>
                                    <th style="padding:10px; text-align:left; font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Client</th>
                                    <th style="padding:10px; text-align:left; font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Mode saisi</th>
                                    <th style="padding:10px; text-align:right; font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Montant Abidjan</th>
                                </tr>
                            </thead>
                            <tbody id="atypicalModesBody"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Mobile : bouton pour déplier le détail (trésorerie, tableaux, graphiques).
                     Masqué sur ordinateur (tout est affiché). -->
                <button type="button" class="dash-more-btn" onclick="document.body.classList.toggle('dash-show-details'); this.classList.toggle('on'); this.textContent = document.body.classList.contains('dash-show-details') ? '▴ Masquer le détail' : '▾ Afficher le détail complet'; setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 60);">▾ Afficher le détail complet</button>

                <div class="dash-secondary">
                <!-- 3. TRÉSORERIE, FLUX BANCAIRES & ACTIVITÉ -->
                <h3 class="kpi-section-title"><span class="icon-bg">🏦</span> Trésorerie, Flux Bancaires & Activité</h3>
                
                <!-- Ligne 1 : Détail Entrées Caisse -->
                <div class="totals-container" style="margin-bottom: 20px;">
                    <div class="total-card colored-card" id="card-other-cash" onclick="app.renderPage('other-income')" style="cursor: pointer;">
                        <h3>Autres Entrées Cash</h3>
                        <p id="grandTotalOtherCash">0 CFA</p>
                        <div class="card-watermark">💵</div>
                    </div>
                    <div class="total-card colored-card" id="card-retraits" onclick="app.renderPage('bank')" style="cursor: pointer;">
                        <h3>Retraits (Banque ➔ Caisse)</h3>
                        <p id="grandTotalRetraits">0 CFA</p>
                        <div class="card-watermark">🏧</div>
                    </div>
                </div>

                <!-- Ligne 2 : Détail Sorties & Solde Caisse -->
                <div class="totals-container" style="margin-bottom: 20px;">
                    <div class="total-card colored-card span-2" id="card-sorties-cash" onclick="app.renderPage('expenses')" style="cursor: pointer;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 15px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 150px;">
                                <h3>Décaissements Cash</h3>
                                <p id="grandTotalSortiesCash">0 CFA</p>
                            </div>
                            <div style="flex: 1.2; min-width: 180px; border-left: 1px solid rgba(255,255,255,0.2); padding-left: 15px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                    <span style="opacity: 0.85; font-size: 12px;">Dépenses Cash :</span>
                                    <span id="sortiesBreakdownDepenses" style="font-weight: 700; font-size: 13px;">0 CFA</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="opacity: 0.85; font-size: 12px;">Dépôts (➔ Banque) :</span>
                                    <span id="sortiesBreakdownDepots" style="font-weight: 700; font-size: 13px;">0 CFA</span>
                                </div>
                            </div>
                        </div>
                        <div class="card-watermark">💸</div>
                    </div>
                    <div class="total-card colored-card card-positif" id="card-caisse-especes" onclick="app.renderPage('index')" style="cursor: pointer; border: 2px solid #059669 !important; transform: scale(1.02);" title="CFA réellement en caisse. Les CFA retirés pour constituer des € sont déjà déduits (voir la carte Caisse €).">
                        <h3>Solde Caisse (Espèces + MM)</h3>
                        <p id="grandTotalCaisse">0 CFA</p>
                        <div class="card-watermark">🪙</div>
                    </div>
                </div>

                <!-- Ligne 3 : Banque, Dettes, Opérations -->
                <div class="totals-container">
                    <div class="total-card colored-card" id="card-solde-banque" onclick="app.renderPage('bank')" style="cursor: pointer;">
                        <h3>Solde Banque</h3>
                        <p id="grandTotalSoldeBanque">0 CFA</p>
                        <div class="card-watermark">💳</div>
                    </div>
                    <div class="total-card colored-card" id="card-caisse-euros" onclick="app.renderPage('bank')" style="cursor: pointer;" title="Espèces en euros détenues (reçues en retirant des CFA de la caisse). Déjà déduit de la caisse CFA.">
                        <h3>Caisse € (espèces en euros)</h3>
                        <p id="grandTotalEurosEur">0,00 €</p>
                        <div style="font-size:12px; opacity:0.85;" id="grandTotalEuros">≈ 0 CFA</div>
                        <div class="card-watermark">💶</div>
                    </div>
                    <div class="total-card colored-card" id="card-reste" onclick="app.renderPage('clients')" style="cursor: pointer;">
                        <h3>Dettes Clients (Reste Total)</h3>
                        <p id="grandTotalReste">0 CFA</p>
                        <div class="card-watermark">⚠️</div>
                    </div>
                    <div class="total-card colored-card" id="card-operations" onclick="app.renderPage('history')" style="cursor: pointer;">
                        <h3>Opérations Totales</h3>
                        <p id="grandTotalCount">0</p>
                        <div class="card-watermark">📊</div>
                    </div>
                </div> 
                
                <div class="sub-nav">
                    <a href="#panel-conteneurs" class="active">Par Conteneur</a>
                    <a href="#panel-clients">Top 100 Clients</a>
                    <a href="#panel-agents">Par Agent</a>
                    <a href="#panel-ventes">Ventes (par Mois)</a>
                    <a href="#panel-depenses">Dépenses (Mensuelles)</a>
                    <a href="#panel-banque">Mouvements Banque</a>
                    <a href="#panel-impayes" style="color: #dc3545;">⚠️ Impayés</a>
                    <a href="#panel-adjustments">Ajustements</a>
                </div>

                <div id="panel-conteneurs" class="tab-panel active">
                    <h2 style="margin-top: 30px;">Récapitulatif Mensuel (Conteneurs)</h2>
                    <table id="containerSummaryTable" class="table">
                        <thead>
                            <tr>
                                <th>Mois</th><th>Nb. Conteneurs</th><th>Chiffre d'Affaires (CA)</th><th>Total Dépenses (%)</th><th>BÉNÉFICE Total (%)</th>
                            </tr>
                        </thead>
                        <tbody id="containerSummaryTableBody"></tbody>
                    </table>
                </div>

                <div id="panel-clients" class="tab-panel">
                    <h2 style="margin-top: 30px;">Top 100 Clients</h2>
                    <table id="topClientsTable" class="table">
                        <thead><tr><th>Rang</th><th>Client (Nom)</th><th>Destinataire</th><th>Nb. Opérations</th><th>Chiffre d'Affaires</th></tr></thead>
                        <tbody id="topClientsTableBody"></tbody>
                    </table>
                </div>

                <div id="panel-agents" class="tab-panel">
                    <h2 style="margin-top: 30px;">Récapitulatif par Agent</h2>
                    <table id="agentSummaryTable" class="table">
                        <thead><tr><th>Agent</th><th>Nombre d'Opérations</th><th>Chiffre d'Affaires</th></tr></thead>
                        <tbody id="agentSummaryTableBody"></tbody>
                    </table>
                </div>

                <div id="panel-ventes" class="tab-panel">
                    <h2 style="margin-top: 30px;">Récapitulatif par Mois (Ventes)</h2>
                    <table id="summaryTable" class="table">
                        <thead><tr><th>Mois</th><th>Nombre d'Opérations</th><th>Total des Prix</th></tr></thead>
                        <tbody id="summaryTableBody"></tbody>
                    </table>
                </div>

                <div id="panel-depenses" class="tab-panel">
                    <h2 style="margin-top: 30px;">Récapitulatif des Dépenses Mensuelles</h2>
                    <table id="monthlyExpensesTable" class="table">
                        <thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
                        <tbody id="monthlyExpensesTableBody"></tbody>
                    </table>
                </div>

                <div id="panel-banque" class="tab-panel">
                    <h2 style="margin-top: 30px;">Récapitulatif des Mouvements de Banque</h2>
                    <table id="bankMovementsTable" class="table">
                        <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Montant</th></tr></thead>
                        <tbody id="bankMovementsTableBody"></tbody>
                    </table>
                </div>

                <div id="panel-impayes" class="tab-panel">
                    <h2 style="margin-top: 30px; color: #dc3545;">Liste des Colis Impayés (Dettes)</h2>
                    <table id="unpaidTable" class="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Conteneur</th>
                                <th>Référence</th>
                                <th>Client / Destinataire</th>
                                <th>Prix Total</th>
                                <th>Déjà Payé</th>
                                <th>Reste à Payer</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="unpaidTableBody"></tbody>
                    </table>
                </div>

                <div id="panel-adjustments" class="tab-panel">
                    <h2 style="margin-top: 30px;">Liste des Réductions & Augmentations</h2>
                    <table id="adjustmentsTable" class="table">
                        <thead>
                            <tr>
                                <th>Date</th><th>Client / Destinataire</th><th>Référence</th><th>Type</th><th>Montant</th>
                            </tr>
                        </thead>
                        <tbody id="adjustmentsTableBody"></tbody>
                    </table>
                </div>
                </div> <!-- /.dash-secondary (trésorerie + tableaux) -->

            </div>

            <!-- NOUVELLE SECTION GRAPHIQUES -->
            <div class="dashboard-container dash-secondary" style="margin-top: 20px;">
                <h2 style="margin-top:0;">📈 Évolution & Statistiques</h2>
                <div class="charts-grid" style="grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
                    <div class="chart-card">
                        <h3>Dépenses : Mensuelles vs Conteneurs</h3>
                        <canvas id="expenseEvolutionChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>Activité Conteneurs (Arrivées & CA)</h3>
                        <canvas id="containerEvolutionChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>Répartition des Paiements</h3>
                        <canvas id="paymentModeChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>Top 10 Conteneurs (Rentabilité)</h3>
                        <canvas id="topContainerProfitChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>Ratio Dettes vs Encaissé</h3>
                        <canvas id="debtVsCollectedChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>Performance par Agent</h3>
                        <canvas id="agentPerformanceChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- SECTION ANALYSES STRATÉGIQUES -->
            <div id="analyticsContainer" class="dashboard-container" style="margin-top: 20px;">
                <h2 style="margin-top:0;">📊 Analyses Stratégiques</h2>
                <div class="charts-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <!-- Balance Âgée -->
                    <div class="chart-card">
                        <h3>⏳ Balance Âgée (Dettes)</h3>
                        <table class="table">
                            <thead><tr><th>Ancienneté</th><th>Reste à Payer</th></tr></thead>
                            <tbody id="agedBalanceBody"></tbody>
                        </table>
                    </div>
                    
                    <!-- Performance Logistique -->
                    <div class="chart-card">
                        <h3>✈️ Performance Logistique</h3>
                        <div style="text-align:center; padding: 20px;">
                            <div style="font-size: 12px; color: #64748b;">Délai Moyen (Paris -> Abidjan)</div>
                            <div id="avgLeadTime" style="font-size: 32px; font-weight: bold; color: #4f46e5;">-</div>
                            <div style="font-size: 11px; color: #64748b; margin-top:5px;">Basé sur les dates réelles</div>
                        </div>
                    </div>

                    <!-- Clients Dormants -->
                    <div class="chart-card" style="grid-column: span 2;">
                        <h3>💤 Clients à Relancer (Inactifs > 3 mois)</h3>
                        <div style="max-height: 200px; overflow-y: auto;">
                            <table class="table">
                                <thead><tr><th>Client</th><th>Dernier Envoi</th><th>CA Perdu Potentiel</th></tr></thead>
                                <tbody id="dormantClientsBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div id="containerDetailsModal" class="modal amt-modal" style="z-index: 1050;">
                <div class="modal-content modal-lg" style="display: flex; flex-direction: column; overflow: hidden; padding: 0; max-height: 90vh;">
                    <div style="flex-shrink: 0;">
                        <div class="modal-header" style="position: static; margin: 0;">
                            <h2 id="modalContainerTitle" style="margin:0;">Détails du Conteneur</h2>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <button id="downloadContainerExcelBtn" style="background:rgba(255,255,255,.16); color:#fff; border:0; padding:7px 12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:5px;">📊 Excel</button>
                                <button id="downloadContainerPdfBtn" style="background:rgba(255,255,255,.16); color:#fff; border:0; padding:7px 12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:5px;">📄 PDF</button>
                                <span class="close-modal" id="closeContainerModal">&times;</span>
                            </div>
                        </div>
                        <div style="padding: 15px 25px;">
                            <div id="containerStats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                <div style="text-align:center;"><div style="font-size:11px; color:#64748b; text-transform:uppercase;">Total Prix</div><div id="topTotalPrix" style="font-weight:bold; font-size:1.2em; color:#0f172a;">0</div></div>
                                <div style="text-align:center;"><div style="font-size:11px; color:#64748b; text-transform:uppercase;">Total Abidjan</div><div id="topTotalPayeAbj" style="font-weight:bold; font-size:1.2em; color:#d97706;">0</div></div>
                                <div style="text-align:center;"><div style="font-size:11px; color:#64748b; text-transform:uppercase;">Total Paris</div><div id="topTotalPayePar" style="font-weight:bold; font-size:1.2em; color:#2563eb;">0</div></div>
                                <div style="text-align:center;"><div style="font-size:11px; color:#64748b; text-transform:uppercase;">Total Reste</div><div id="topTotalReste" style="font-weight:bold; font-size:1.2em;">0</div></div>
                                <div style="text-align:center;"><div style="font-size:11px; color:#64748b; text-transform:uppercase;">Dépenses</div><div id="topTotalDep" style="font-weight:bold; font-size:1.2em; color:#ef4444;">0</div></div>
                                <div style="text-align:center;"><div style="font-size:11px; color:#64748b; text-transform:uppercase;">Bénéfice</div><div id="topTotalBen" style="font-weight:bold; font-size:1.2em; color:#10b981;">0</div></div>
                            </div>
                        </div>
                    </div>

                    <div style="overflow-y: auto; padding: 0 25px 25px 25px; flex-grow: 1;">
                        <div style="overflow-x: auto;">
                        <table id="containerDetailsTable" class="table"> 
                            <thead style="position: sticky; top: 0; z-index: 10;">
                                <tr>
                                    <th>Date</th>
                                    <th>Client / Destinataire</th>
                                    <th>REF</th>
                                    <th>Prix</th>
                                    <th>Payé ABJ (%)</th>
                                    <th>Payé PAR (%)</th>
                                    <th>Reste (%)</th>
                                </tr>
                            </thead>
                            <tbody id="containerDetailsTableBody">
                            </tbody>
                        </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODAL DÉTAILS MOIS (LISTE CONTENEURS) -->
            <div id="monthDetailsModal" class="modal amt-modal">
                <div class="modal-content modal-lg" style="width: 95% !important; max-width: 1200px !important;">
                    <div class="modal-header">
                        <h2 id="modalMonthTitle">Détails du Mois</h2>
                        <span class="close-modal" onclick="document.getElementById('monthDetailsModal').style.display='none'">&times;</span>
                    </div>
                    <div style="overflow-x: auto;">
                        <table id="monthContainersTable" class="table">
                            <thead>
                                <tr>
                                    <th>Conteneur</th><th>Op.</th><th>Non Payés</th><th>CA</th><th>Paris</th><th>Abidjan</th>
                                    <th>Perçu</th><th>Reste</th><th>Dépenses</th><th>BÉNÉFICE</th>
                                </tr>
                            </thead>
                            <tbody id="modalMonthBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => this.initLogic(), 50);
    },

    initLogic() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';

        // SERVICE TRANSACTION
        const transactionService = {
            getCleanTransactions(transactions, validatedSessions) {
                return transactions.reduce((acc, t) => {
                    let effectivePrix = t.prix || 0;
                    if (t.adjustmentType && String(t.adjustmentType).toLowerCase() === 'reduction') {
                        effectivePrix -= (t.adjustmentVal || 0);
                    }

                    if (!t.paymentHistory || !Array.isArray(t.paymentHistory) || t.paymentHistory.length === 0) {
                        acc.push({
                            ...t,
                            prix: effectivePrix,
                            reste: ((t.montantParis || 0) + (t.montantAbidjan || 0)) - effectivePrix
                        });
                        return acc;
                    }
                    const validPayments = t.paymentHistory.filter(p => !p.sessionId || validatedSessions.has(p.sessionId));
                    const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                    const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                    const tClean = {
                        ...t,
                        prix: effectivePrix,
                        paymentHistory: validPayments,
                        montantParis: newParis,
                        montantAbidjan: newAbidjan,
                        reste: (newParis + newAbidjan) - effectivePrix
                    };
                    acc.push(tClean);
                    return acc;
                }, []);
            },
            async calculateAvailableBalance(db, unconfirmedSessions) {
                const transBalCol = getCollectionName("transactions");
                const transBalConstraints = [where("isDeleted", "!=", true)];
                if (transBalCol === "transactions") transBalConstraints.unshift(where("agency", "==", activeAgency));
                const transBalQuery = query(collection(db, transBalCol), ...transBalConstraints);
                const transSnap = await getDocs(transBalQuery);
                let totalVentes = 0;
                transSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.paymentHistory && d.paymentHistory.length > 0) {
                        d.paymentHistory.forEach(pay => {
                            if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;
                            if (pay.modePaiement !== 'Chèque' && pay.modePaiement !== 'Virement') {
                                totalVentes += (pay.montantAbidjan || 0);
                            }
                        });
                    } else {
                        if (d.modePaiement !== 'Chèque' && d.modePaiement !== 'Virement') {
                            totalVentes += (d.montantAbidjan || 0);
                        }
                    }
                });
                const incSnap = await getDocs(query(collection(db, "other_income"), where("isDeleted", "!=", true), where("agency", "==", activeAgency)));
                let totalAutres = 0;
                incSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                        totalAutres += (d.montant || 0);
                    }
                });
                const expBalCol = getCollectionName("expenses");
                const expBalConstraints = [where("isDeleted", "!=", true)];
                if (expBalCol === "expenses") expBalConstraints.unshift(where("agency", "==", activeAgency));
                const expBalQuery = query(collection(db, expBalCol), ...expBalConstraints);
                const expSnap = await getDocs(expBalQuery);
                let totalDepenses = 0;
                expSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.sessionId && unconfirmedSessions.has(d.sessionId)) return;
                    if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                        totalDepenses += (d.montant || 0);
                    }
                });
                const bankSnap = await getDocs(query(collection(db, "bank_movements"), where("isDeleted", "!=", true), where("agency", "==", activeAgency)));
                let totalRetraits = 0;
                let totalDepots = 0;
                bankSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
                    if (d.type === 'Depot' && d.source !== 'Remise Chèques' && d.source !== 'Solde Initial') totalDepots += (d.montant || 0);
                });
                // Caisse € : une Entrée (€ reçu) = des CFA RETIRÉS de la caisse -> on les déduit.
                let totalEurEntreesCfa = 0;
                try {
                    const eurSnap = await getDocs(query(collection(db, 'caisse_euros'), where('agency', '==', activeAgency)));
                    eurSnap.forEach(doc => { const m = doc.data(); if (m.isDeleted || m.type === 'Sortie') return; totalEurEntreesCfa += Number(m.montantCfa) || (Number(m.montant) || 0) * 656; });
                } catch (_) { /* tolérant */ }
                return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots + totalEurEntreesCfa);
            },
            // Calcul centralisé (source unique : services/storageFee.js).
            calculateStorageFee
        };

        // --- 1. DOM ELEMENTS & CONFIG ---
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        const clearFilterBtn = document.getElementById('clearFilterBtn');

        // --- Caisse Euros : solde live + DÉDUCTION de la caisse CFA. Une ENTRÉE
        // (€ reçu) = des CFA retirés de la caisse -> ces CFA sont déduits de la
        // caisse CFA (dans calculateTotals / calculateAvailableBalance). ---
        let allCaisseEuros = [];
        (() => {
            const _ag = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
            const _taux = 656; // 656 CFA = 1 € (cohérent avec la Caisse Euros de la page Banque)
            onSnapshot(query(collection(db, 'caisse_euros'), where('agency', '==', _ag)), s => {
                allCaisseEuros = s.docs.map(d => ({ id: d.id, ...d.data() }));
                let soldeCfa = 0;
                s.docs.forEach(d => { const m = d.data(); if (m.isDeleted) return; const cfa = Number(m.montantCfa) || (Number(m.montant) || 0) * _taux; soldeCfa += (m.type === 'Sortie' ? -1 : 1) * cfa; });
                const elCfa = document.getElementById('grandTotalEuros');
                if (elCfa) elCfa.textContent = '≈ ' + Math.round(soldeCfa).toLocaleString('fr-FR') + ' CFA';
                const elEur = document.getElementById('grandTotalEurosEur');
                if (elEur) elEur.textContent = (soldeCfa / _taux).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
                try { updateDashboard(); } catch (_) {} // recalcule la caisse CFA (déduction des Entrées €)
            });
        })();

        // --- GESTION DES ONGLETS ---
        const tabs = document.querySelectorAll('.sub-nav a');
        const panels = document.querySelectorAll('.tab-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = tab.getAttribute('href');
                const targetPanel = document.querySelector(targetId);
                
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                if (targetPanel) targetPanel.classList.add('active');
            });
        });
        
        // Tableaux
        const containerSummaryBody = document.getElementById('containerSummaryTableBody');
        const topClientsBody = document.getElementById('topClientsTableBody');
        const agentSummaryBody = document.getElementById('agentSummaryTableBody');
        const monthlySummaryBody = document.getElementById('summaryTableBody');
        const monthlyExpensesBody = document.getElementById('monthlyExpensesTableBody');
        const bankMovementsBody = document.getElementById('bankMovementsTableBody');
        const unpaidBody = document.getElementById('unpaidTableBody');
        const adjustmentsBody = document.getElementById('adjustmentsTableBody');

        // Totaux Généraux (Cartes)
        const els = {
            percu: document.getElementById('grandTotalPercu'),
            parisHidden: document.getElementById('grandTotalParisHidden'),
            other: document.getElementById('grandTotalOtherIncome'),
            depenses: document.getElementById('grandTotalDepenses'),
            benefice: document.getElementById('grandTotalBenefice'),
            caisse: document.getElementById('grandTotalCaisse'),
            otherCash: document.getElementById('grandTotalOtherCash'),
            banque: document.getElementById('grandTotalSoldeBanque'),
            count: document.getElementById('grandTotalCount'),
            reste: document.getElementById('grandTotalReste'),
            retraits: document.getElementById('grandTotalRetraits'),
            depots: document.getElementById('grandTotalDepots'),
            depContainer: document.getElementById('detailDepensesConteneur'),
            depMensuelle: document.getElementById('detailDepensesMensuelles'),
            depBreakdownCash: document.getElementById('depensesBreakdownCash'),
            depBreakdownBanque: document.getElementById('depensesBreakdownBanque'),
            sortiesCash: document.getElementById('grandTotalSortiesCash'),
            sortiesBreakdownDepenses: document.getElementById('sortiesBreakdownDepenses'),
            sortiesBreakdownDepots: document.getElementById('sortiesBreakdownDepots'),
            percuBreakdownCash: document.getElementById('percuBreakdownCash'),
            percuBreakdownCheques: document.getElementById('percuBreakdownCheques'),
            percuBreakdownVirements: document.getElementById('percuBreakdownVirements')
        };

        // Gestion Rôle Saisie Full (Masquage)
        const userRole = sessionStorage.getItem('userRole');
        if (userRole === 'saisie_full') {
            document.querySelectorAll('.total-card, canvas, #summaryTableBody, #agentSummaryTableBody, #monthlyExpensesTableBody, #bankMovementsTableBody, #agedBalanceBody, #dormantClientsBody, #avgLeadTime').forEach(el => {
                const container = el.closest('.card') || el.closest('.chart-card') || el.closest('section') || el.parentElement;
                if (container) container.style.display = 'none';
            });
        }

        // --- 2. STATE MANAGEMENT ---
        let allTransactions = [];
        let allExpenses = [];
        let allOtherIncome = [];
        let allBankMovements = [];
        let validatedSessions = new Set(); 
        
        let charts = {}; 

        // --- 3. CORE LOGIC : NETTOYAGE & SÉCURITÉ ---

        function getCleanTransactions(transactions) {
            return transactionService.getCleanTransactions(transactions, validatedSessions);
        }

        function updateDashboard() {
            // Transactions et dépenses : isolation Maritime/Aérien « par
            // construction » (getCollectionName -> *_aerien en aérien). Pas
            // besoin de filtrer par champ ici.
            const cleanTransactions = getCleanTransactions(allTransactions);
            const cleanExpenses = allExpenses.filter(e => !e.sessionId || validatedSessions.has(e.sessionId));
            // other_income et bank_movements restent en table de base (non
            // routées) : on les isole par le champ modeExpedition. Anciens
            // documents sans ce champ = maritime (règle legacy).
            const modeOtherIncome = filterByShippingMode(allOtherIncome);
            const modeBankMovements = filterByShippingMode(allBankMovements);

            const start = startDateInput.value;
            const end = endDateInput.value;

            const filteredTrans = filterByDate(cleanTransactions, start, end);
            const filteredExp = filterByDate(cleanExpenses, start, end);
            const filteredInc = filterByDate(modeOtherIncome, start, end);
            const filteredBank = filterByDate(modeBankMovements, start, end);
            // Caisse € : Entrées (€ reçus) filtrées par date = CFA retirés de la caisse.
            const filteredEur = filterByDate(allCaisseEuros.filter(m => !m.isDeleted), start, end);
            const eurEntreesCfa = filteredEur.filter(m => m.type !== 'Sortie').reduce((s, m) => s + (Number(m.montantCfa) || (Number(m.montant) || 0) * 656), 0);

            calculateTotals(filteredTrans, filteredExp, filteredInc, filteredBank, eurEntreesCfa);
            
            renderContainerSummary(filteredTrans, filteredExp, cleanTransactions);
            renderTopClients(filteredTrans);
            renderAgentSummary(filteredTrans);
            renderMonthlySales(filteredTrans);
            renderMonthlyExpenses(filteredExp);
            renderBankMovements(filteredBank);
            renderUnpaid(cleanTransactions); 
            renderAdjustments(filteredTrans);
            
            renderCharts(filteredTrans, filteredExp);
            renderAdvancedAnalytics(cleanTransactions);
        }

        function filterByDate(items, start, end) {
            if (!start && !end) return items;
            return items.filter(item => {
                if ((!start || item.date >= start) && (!end || item.date <= end)) return true;
                if (item.paymentHistory) {
                    return item.paymentHistory.some(p => (!start || p.date >= start) && (!end || p.date <= end));
                }
                return false;
            });
        }

        // --- 4. CALCULS FINANCIERS ---

        function calculateTotals(transactions, expenses, incomes, bank, eurEntreesCfa = 0) {
            let totalAbidjan = 0, totalParis = 0, totalCheques = 0, totalVirements = 0;
            let totalVentesCash = 0;
            let abidjanCheques = 0, abidjanVirements = 0;
            // Liste des paiements ayant un mode NON RECONNU et contribuant au
            // totalAbidjan : utilisee par le bloc diagnostic « modes atypiques »
            // pour expliquer les ecarts du tableau de bord.
            const atypicalPayments = [];
            const STANDARD_MODES = ['Espèce', 'Wave', 'OM', 'Mobile Money', 'Chèque', 'Virement'];

            transactions.forEach(t => {
                const payments = t.paymentHistory || [{ ...t, date: t.date }];
                payments.forEach(p => {
                    if (p.sessionId && !validatedSessions.has(p.sessionId)) return;

                    if (isInDateRange(p.date)) {
                        totalAbidjan += (p.montantAbidjan || 0);
                        totalParis += (p.montantParis || 0);

                        const mode = p.modePaiement || t.modePaiement || 'Espèce';
                        if (['Espèce', 'Wave', 'OM', 'Mobile Money'].includes(mode)) {
                            totalVentesCash += (p.montantAbidjan || 0);
                        }
                        if (mode === 'Chèque') {
                            totalCheques += ((p.montantAbidjan || 0) + (p.montantParis || 0));
                            abidjanCheques += (p.montantAbidjan || 0);
                        }
                        if (mode === 'Virement') {
                            totalVirements += ((p.montantAbidjan || 0) + (p.montantParis || 0));
                            abidjanVirements += (p.montantAbidjan || 0);
                        }
                        // Mode atypique (non standard) avec un encaissement Abidjan -> on garde la trace
                        // pour le bloc diagnostic. C'est ce qui crée les écarts du tableau.
                        const montantAbjOnly = (p.montantAbidjan || 0);
                        if (montantAbjOnly !== 0 && !STANDARD_MODES.includes(mode)) {
                            atypicalPayments.push({
                                date: p.date || t.date || '',
                                reference: t.reference || t.ref || '-',
                                client: t.nomDestinataire || t.nom || t.destinataire || t.expediteur || '-',
                                mode: mode || '(vide)',
                                montant: montantAbjOnly
                            });
                        }
                    }
                });
            });

            const totalOther = incomes.reduce((sum, i) => sum + (i.montant || 0), 0);
            const totalOtherCash = incomes.filter(i => i.mode !== 'Chèque' && i.mode !== 'Virement').reduce((sum, i) => sum + (i.montant || 0), 0);

            const realExpenses = expenses.filter(e => e.action !== 'Allocation'); 
            const totalDep = realExpenses.reduce((sum, e) => sum + (e.montant || 0), 0);
            const totalDepCash = realExpenses.filter(e => e.mode !== 'Chèque' && e.mode !== 'Virement').reduce((sum, e) => sum + (e.montant || 0), 0);
            const totalDepBanque = totalDep - totalDepCash;

            const depConteneur = realExpenses.filter(e => {
                return e.conteneur && e.conteneur.trim() !== '';
            }).reduce((sum, e) => sum + e.montant, 0);
            const depMensuelle = totalDep - depConteneur;

            const depots = bank.filter(m => m.type === 'Depot' && m.source !== 'Remise Chèques' && m.source !== 'Solde Initial').reduce((sum, m) => sum + m.montant, 0); 
            const depotsAll = bank.filter(m => m.type === 'Depot').reduce((sum, m) => sum + m.montant, 0);
            const retraitsEspeces = bank.filter(m => m.type === 'Retrait').reduce((sum, m) => sum + m.montant, 0);
            const totalSortiesBanque = bank.filter(m => m.type === 'Retrait' || m.type === 'Paiement').reduce((sum, m) => sum + m.montant, 0);
            
            const benefice = (totalAbidjan + totalOther) - totalDep;
            const soldeCaisse = (totalVentesCash + totalOtherCash + retraitsEspeces) - (totalDepCash + depots + eurEntreesCfa);
            const soldeBanque = depotsAll + totalVirements + totalCheques - totalSortiesBanque;
            
            const resteTotal = transactions.reduce((sum, t) => sum + (t.reste || 0), 0);

            if(els.percu) els.percu.textContent = formatCFA(totalAbidjan);
            if(els.parisHidden) els.parisHidden.textContent = `Dont Paris: ${formatCFA(totalParis)}`;
            if(els.percuBreakdownCash) els.percuBreakdownCash.textContent = formatCFA(totalVentesCash);
            if(els.percuBreakdownCheques) els.percuBreakdownCheques.textContent = formatCFA(abidjanCheques);
            if(els.percuBreakdownVirements) els.percuBreakdownVirements.textContent = formatCFA(abidjanVirements);
            if(els.other) els.other.textContent = formatCFA(totalOther);
            if(els.depenses) els.depenses.textContent = formatCFA(totalDep);
            if(els.benefice) {
                els.benefice.textContent = formatCFA(benefice);
                els.benefice.parentElement.className = `total-card ${benefice >= 0 ? 'card-positif' : 'card-negatif'}`;
            }
            if(els.caisse) els.caisse.textContent = formatCFA(soldeCaisse);
            if(els.otherCash) els.otherCash.textContent = formatCFA(totalOtherCash);
            if(els.sortiesCash) els.sortiesCash.textContent = formatCFA(totalDepCash + depots);
            if(els.sortiesBreakdownDepenses) els.sortiesBreakdownDepenses.textContent = formatCFA(totalDepCash);
            if(els.sortiesBreakdownDepots) els.sortiesBreakdownDepots.textContent = formatCFA(depots);
            if(els.banque) els.banque.textContent = formatCFA(soldeBanque);
            if(els.retraits) els.retraits.textContent = formatCFA(retraitsEspeces);
            if(els.count) els.count.textContent = transactions.length;
            if(els.reste) els.reste.textContent = formatCFA(resteTotal);
            if(els.depContainer) els.depContainer.textContent = `Conteneurs: ${formatCFA(depConteneur)}`;
            if(els.depMensuelle) els.depMensuelle.textContent = `Mensuelles: ${formatCFA(depMensuelle)}`;
            if(els.depBreakdownCash) els.depBreakdownCash.textContent = formatCFA(totalDepCash);
            if(els.depBreakdownBanque) els.depBreakdownBanque.textContent = formatCFA(totalDepBanque);

            // Diagnostic : transactions au mode non standard (créent l'écart « modes non standard »).
            renderAtypicalModes(atypicalPayments);
        }

        function renderAtypicalModes(list) {
            const wrap = document.getElementById('atypicalModesWrap');
            const tbody = document.getElementById('atypicalModesBody');
            const totalEl = document.getElementById('atypicalModesTotal');
            const countEl = document.getElementById('atypicalModesCount');
            if (!wrap || !tbody) return;
            if (!list || list.length === 0) {
                wrap.style.display = 'none';
                return;
            }
            wrap.style.display = 'block';
            // Tri date descendante
            list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const total = list.reduce((s, x) => s + (x.montant || 0), 0);
            if (totalEl) totalEl.textContent = formatCFA(total);
            if (countEl) countEl.textContent = list.length;
            tbody.innerHTML = list.map(x => {
                const d = x.date ? new Date(x.date).toLocaleDateString('fr-FR') : '-';
                return `<tr>
                    <td style="padding:8px 10px; font-size:12px; color:#475569;">${d}</td>
                    <td style="padding:8px 10px; font-size:12px; font-family:monospace; color:#0f172a;">${x.reference}</td>
                    <td style="padding:8px 10px; font-size:12px; color:#1e293b;">${x.client}</td>
                    <td style="padding:8px 10px; font-size:12px;"><span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:6px; font-weight:700;">${x.mode}</span></td>
                    <td style="padding:8px 10px; font-size:12px; text-align:right; font-weight:700; color:#b45309;">${formatCFA(x.montant)}</td>
                </tr>`;
            }).join('');
        }

        function isInDateRange(dateStr) {
            const start = startDateInput.value;
            const end = endDateInput.value;
            return (!start || dateStr >= start) && (!end || dateStr <= end);
        }

        // --- 5. RENDUS TABLEAUX ---

        function renderContainerSummary(transactions, expenses, allCleanTransactions) {
            if (!containerSummaryBody) return;
            containerSummaryBody.innerHTML = '<tr><td colspan="5">Calcul en cours...</td></tr>';

            const containerOrigins = {};
            if (allCleanTransactions) {
                allCleanTransactions.forEach(t => {
                    if (!t.conteneur) return;
                    const cName = t.conteneur.trim().toUpperCase();
                    if (!containerOrigins[cName] || t.date < containerOrigins[cName]) {
                        containerOrigins[cName] = t.date;
                    }
                });
            }

            const months = {};
            const getMonthKey = (dateStr) => (dateStr && typeof dateStr === 'string' && dateStr.length >= 7) ? dateStr.substring(0, 7) : '0000-00';
            const getMonthLabel = (dateStr) => {
                if(!dateStr) return 'Indéfini';
                const d = new Date(dateStr);
                return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
            };

            transactions.forEach(t => {
                const cName = (t.conteneur || "Non spécifié").trim().toUpperCase();

                let refDate = String(t.date || '');
                const originDate = containerOrigins[cName];
                if (cName !== "NON SPÉCIFIÉ" && originDate) {
                    refDate = String(originDate);
                }

                const mKey = getMonthKey(refDate);
                const mLabel = getMonthLabel(refDate);

                if (!months[mKey]) months[mKey] = { key: mKey, label: mLabel, containers: {}, stats: { ca: 0, dep: 0, count: 0 } };
                if (!months[mKey].containers[cName]) {
                    months[mKey].containers[cName] = { name: cName, ca: 0, paris: 0, abidjan: 0, reste: 0, count: 0, unpaid: 0, dep: 0 };
                }
                
                const c = months[mKey].containers[cName];
                c.ca += (t.prix || 0);
                c.paris += (t.montantParis || 0);
                c.abidjan += (t.montantAbidjan || 0);
                c.reste += (t.reste || 0);
                c.count++;
                if ((t.reste || 0) < -1) c.unpaid++;

                months[mKey].stats.ca += (t.prix || 0);
            });

            expenses.forEach(e => {
                const cName = (e.conteneur || "").trim().toUpperCase();
                if (cName !== "") {

                    let refDate = String(e.date || '');
                    const originDate = containerOrigins[cName];
                    if (originDate) {
                        refDate = String(originDate);
                    }

                    const mKey = getMonthKey(refDate);
                    const mLabel = getMonthLabel(refDate);

                    if (!months[mKey]) months[mKey] = { key: mKey, label: mLabel, containers: {}, stats: { ca: 0, dep: 0, count: 0 } };
                    if (!months[mKey].containers[cName]) {
                        months[mKey].containers[cName] = { name: cName, ca: 0, paris: 0, abidjan: 0, reste: 0, count: 0, unpaid: 0, dep: 0 };
                    }
                    
                    months[mKey].containers[cName].dep += (e.montant || 0);
                    months[mKey].stats.dep += (e.montant || 0);
                }
            });

            const sortedMonths = Object.values(months).sort((a, b) => b.key.localeCompare(a.key));
            
            containerSummaryBody.innerHTML = '';
            if (sortedMonths.length === 0) { containerSummaryBody.innerHTML = '<tr><td colspan="5">Aucune donnée.</td></tr>'; return; }

            sortedMonths.forEach(m => {
                const benef = m.stats.ca - m.stats.dep;
                const nbConteneurs = Object.keys(m.containers).length;
                
                const pctDep = m.stats.ca ? Math.round((m.stats.dep / m.stats.ca) * 100) : 0;
                const pctBen = m.stats.ca ? Math.round((benef / m.stats.ca) * 100) : 0;

                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.onclick = () => window.openMonthDetails(m.key);
                tr.title = "Cliquez pour voir les détails du mois";
                
                tr.innerHTML = `
                    <td><b>${m.label}</b></td>
                    <td><span class="tag" style="background:#64748b;">${nbConteneurs} Conteneurs</span></td>
                    <td>${formatCFA(m.stats.ca)}</td>
                    <td style="color:#ef4444;">${formatCFA(m.stats.dep)} <span style="font-size:0.8em">(${pctDep}%)</span></td>
                    <td style="font-weight:bold; color:${benef >= 0 ? '#10b981' : '#ef4444'}">${formatCFA(benef)} <span style="font-size:0.8em">(${pctBen}%)</span></td>
                `;
                containerSummaryBody.appendChild(tr);
            });
            
            window.monthlyData = months;
        }

        window.openMonthDetails = function(monthKey) {
            const m = window.monthlyData && window.monthlyData[monthKey];
            if (!m) return;
            
            const modal = document.getElementById('monthDetailsModal');
            const title = document.getElementById('modalMonthTitle');
            const tbody = document.getElementById('modalMonthBody');
            
            title.textContent = `Détails du Mois : ${m.label}`;
            tbody.innerHTML = '';
            
            Object.values(m.containers).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
                const benef = c.ca - c.dep;
                const percu = c.paris + c.abidjan;
                
                const pctReste = c.ca ? Math.round((c.reste / c.ca) * 100) : 0;
                const pctBenef = c.ca ? Math.round((benef / c.ca) * 100) : 0;
                
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.onclick = () => window.openContainerDetails(c.name); 
                
                tr.innerHTML = `
                    <td><b>${c.name}</b></td>
                    <td>${c.count}</td>
                    <td style="color:${c.unpaid > 0 ? 'red' : 'green'}">${c.unpaid}</td>
                    <td>${formatCFA(c.ca)}</td>
                    <td>${formatCFA(c.paris)}</td>
                    <td>${formatCFA(c.abidjan)}</td>
                    <td style="font-weight:bold">${formatCFA(percu)}</td>
                    <td class="${c.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(c.reste)} <span style="font-size:0.8em">(${pctReste}%)</span></td>
                    <td>${formatCFA(c.dep)}</td>
                    <td class="${benef < 0 ? 'reste-negatif' : 'reste-positif'}"><b>${formatCFA(benef)}</b> <span style="font-size:0.8em; font-weight:normal;">(${pctBenef}%)</span></td>
                `;
                tbody.appendChild(tr);
            });
            
            modal.style.display = 'flex';
        }

        function renderTopClients(transactions) {
            if (!topClientsBody) return;
            const clients = {};
            transactions.forEach(t => {
                const name = t.nom || "Inconnu";
                if (!clients[name]) clients[name] = { count: 0, ca: 0, dest: t.nomDestinataire || '' };
                clients[name].count++;
                clients[name].ca += (t.prix || 0);
            });

            const sorted = Object.entries(clients).sort((a, b) => b[1].ca - a[1].ca).slice(0, 100);
            topClientsBody.innerHTML = sorted.map(([name, d], i) => `
                <tr><td>#${i+1}</td><td>${name}</td><td>${d.dest}</td><td>${d.count}</td><td>${formatCFA(d.ca)}</td></tr>
            `).join('');
        }

        function renderAgentSummary(transactions) {
            if (!agentSummaryBody) return;
            const agents = {};
            transactions.forEach(t => {
                if (!t.agent) return;
                t.agent.split(',').forEach(a => {
                    const name = a.trim();
                    if (!agents[name]) agents[name] = { count: 0, ca: 0 };
                    agents[name].count++;
                    if (name.toLowerCase().includes('paris')) agents[name].ca += (t.montantParis || 0);
                    else agents[name].ca += (t.montantAbidjan || 0);
                });
            });
            const sorted = Object.entries(agents).sort((a, b) => b[1].ca - a[1].ca);
            agentSummaryBody.innerHTML = sorted.map(([n, d]) => `<tr><td>${n}</td><td>${d.count}</td><td>${formatCFA(d.ca)}</td></tr>`).join('');
        }

        function renderMonthlySales(transactions) {
            if (!monthlySummaryBody) return;
            const months = {};
            transactions.forEach(t => {
                const dateStr = String(t.date || '');
                if (dateStr.length < 7) return;
                const m = dateStr.substring(0, 7);
                if (!months[m]) months[m] = { count: 0, ca: 0 };
                months[m].count++;
                months[m].ca += (t.prix || 0);
            });
            const sorted = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0]));
            monthlySummaryBody.innerHTML = sorted.map(([m, d]) => `<tr><td>${m}</td><td>${d.count}</td><td>${formatCFA(d.ca)}</td></tr>`).join('');
        }

        function renderMonthlyExpenses(expenses) {
            if (!monthlyExpensesBody) return;
            const monthly = expenses.filter(e => e.type === 'Mensuelle' && e.action !== 'Allocation' && e.date);
            monthly.sort((a, b) => new Date(b.date) - new Date(a.date));
            monthlyExpensesBody.innerHTML = monthly.map(e => `<tr><td>${e.date}</td><td>${e.description}</td><td>${formatCFA(e.montant)}</td></tr>`).join('');
        }

        function renderBankMovements(movements) {
            if (!bankMovementsBody) return;
            const sorted = movements.filter(m => m.date).sort((a, b) => new Date(b.date) - new Date(a.date));
            bankMovementsBody.innerHTML = sorted.map(m => {
                const isNegativeDisplay = (m.type === 'Depot' && m.source === 'Saisie Manuelle') || m.type === 'Paiement';
                const amountClass = isNegativeDisplay ? 'reste-negatif' : 'reste-positif';
                return `
                    <tr><td>${m.date}</td><td>${m.description}</td><td>${m.type}</td><td class="${amountClass}">${formatCFA(m.montant)}</td></tr>
                `;
            }).join('');
        }

        function renderUnpaid(transactions) {
            if (!unpaidBody) return;
            const unpaid = transactions.filter(t => (t.reste || 0) < -1);
            unpaid.sort((a, b) => a.reste - b.reste); 

            unpaidBody.innerHTML = unpaid.map(t => {
                const paid = (t.montantParis || 0) + (t.montantAbidjan || 0);
                const waLink = `https://wa.me/?text=${encodeURIComponent(`Bonjour ${t.nom}, solde restant pour ${t.reference}: ${formatCFA(Math.abs(t.reste))}`)}`;
                return `
                    <tr>
                        <td>${t.date}</td><td>${t.conteneur}</td><td><b>${t.reference}</b></td>
                        <td>${t.nom}<br><small>${t.nomDestinataire||''}</small></td>
                        <td>${formatCFA(t.prix)}</td><td>${formatCFA(paid)}</td>
                        <td class="reste-negatif"><b>${formatCFA(t.reste)}</b></td>
                        <td><a href="${waLink}" target="_blank" style="color:green;text-decoration:none;">📱 Relancer</a></td>
                    </tr>
                `;
            }).join('');
        }

        function renderAdjustments(transactions) {
            if (!adjustmentsBody) return;
            const adj = transactions.filter(t => t.adjustmentVal > 0);
            adjustmentsBody.innerHTML = adj.map(t => `
                <tr>
                    <td>${t.date}</td><td>${t.nom}</td><td>${t.reference}</td>
                    <td><span class="tag" style="background:${t.adjustmentType && String(t.adjustmentType).toLowerCase()==='reduction'?'#10b981':'#ef4444'}">${t.adjustmentType}</span></td>
                    <td>${formatCFA(t.adjustmentVal)}</td>
                </tr>
            `).join('');
        }

        // --- 6. GRAPHIQUES & ANALYSES ---

        function renderCharts(transactions, expenses) {
            if (userRole === 'saisie_full') return;
            if (typeof Chart === 'undefined') return console.warn("Chart.js non chargé");
            
            try {
                const ctx = document.getElementById('expenseEvolutionChart');
                if (ctx) {
                    if (charts.expense) charts.expense.destroy();
                    
                    const months = {};
                    expenses.forEach(e => {
                        const dateStr = String(e.date || '');
                        if (dateStr.length < 7) return;
                        const m = dateStr.substring(0, 7);
                        if (!months[m]) months[m] = { mens: 0, cont: 0 };
                        if (e.type === 'Conteneur') months[m].cont += e.montant;
                        else if (e.action !== 'Allocation') months[m].mens += e.montant;
                    });
                    const labels = Object.keys(months).sort();
                    
                    charts.expense = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [
                                { label: 'Mensuelles', data: labels.map(l => months[l].mens), borderColor: '#ef4444', fill: false },
                                { label: 'Conteneurs', data: labels.map(l => months[l].cont), borderColor: '#3b82f6', fill: false }
                            ]
                        }
                    });
                }

                const ctxActivity = document.getElementById('containerEvolutionChart');
                if (ctxActivity) {
                    if (charts.activity) charts.activity.destroy();
                    
                    const activityData = {};
                    transactions.forEach(t => {
                        const dateStr = String(t.date || '');
                        if (dateStr.length < 7) return;
                        const m = dateStr.substring(0, 7);
                        if (!activityData[m]) activityData[m] = { ca: 0, count: 0 };
                        activityData[m].ca += (t.prix || 0);
                        activityData[m].count++;
                    });
                    const labels = Object.keys(activityData).sort();
                    
                    charts.activity = new Chart(ctxActivity, {
                        type: 'bar',
                        data: {
                            labels: labels,
                            datasets: [
                                { label: 'Chiffre d\'Affaires', data: labels.map(l => activityData[l].ca), backgroundColor: '#4f46e5', yAxisID: 'y' },
                                { label: 'Nombre Colis', data: labels.map(l => activityData[l].count), type: 'line', borderColor: '#f59e0b', yAxisID: 'y1' }
                            ]
                        },
                        options: {
                            responsive: true,
                            scales: {
                                y: { type: 'linear', display: true, position: 'left' },
                                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
                            }
                        }
                    });
                }

                const ctxPayments = document.getElementById('paymentModeChart');
                if (ctxPayments) {
                    if (charts.payments) charts.payments.destroy();
                    const paymentStats = {};
                    transactions.forEach(t => {
                        if (t.paymentHistory) {
                            t.paymentHistory.forEach(p => {
                                const mode = p.modePaiement || 'Espèce';
                                if (!paymentStats[mode]) paymentStats[mode] = 0;
                                paymentStats[mode] += (p.montantAbidjan || 0) + (p.montantParis || 0);
                            });
                        } else {
                            const mode = t.modePaiement || 'Espèce';
                            if (!paymentStats[mode]) paymentStats[mode] = 0;
                            paymentStats[mode] += (t.montantAbidjan || 0) + (t.montantParis || 0);
                        }
                    });
                    
                    charts.payments = new Chart(ctxPayments, {
                        type: 'doughnut',
                        data: {
                            labels: Object.keys(paymentStats),
                            datasets: [{
                                data: Object.values(paymentStats),
                                backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b']
                            }]
                        }
                    });
                }

                const ctxTopContainers = document.getElementById('topContainerProfitChart');
                if (ctxTopContainers) {
                    if (charts.topContainers) charts.topContainers.destroy();
                    const containerStats = {};
                    
                    transactions.forEach(t => {
                        const c = (t.conteneur || "Inconnu").trim().toUpperCase();
                        if (!containerStats[c]) containerStats[c] = { ca: 0, dep: 0 };
                        containerStats[c].ca += (t.prix || 0);
                    });
                    
                    expenses.forEach(e => {
                        const c = (e.conteneur || "").trim().toUpperCase();
                        if (c !== "") {
                            if (!containerStats[c]) containerStats[c] = { ca: 0, dep: 0 };
                            containerStats[c].dep += (e.montant || 0);
                        }
                    });

                    const sortedContainers = Object.entries(containerStats)
                        .map(([name, stats]) => ({ name, profit: stats.ca - stats.dep }))
                        .sort((a, b) => b.profit - a.profit)
                        .slice(0, 10);

                    charts.topContainers = new Chart(ctxTopContainers, {
                        type: 'bar',
                        data: {
                            labels: sortedContainers.map(c => c.name),
                            datasets: [{
                                label: 'Marge Bénéficiaire',
                                data: sortedContainers.map(c => c.profit),
                                backgroundColor: sortedContainers.map(c => c.profit >= 0 ? '#10b981' : '#ef4444')
                            }]
                        },
                        options: { indexAxis: 'y' }
                    });
                }

                const ctxDebt = document.getElementById('debtVsCollectedChart');
                if (ctxDebt) {
                    if (charts.debt) charts.debt.destroy();
                    let totalPaid = 0;
                    let totalDebt = 0;
                    
                    transactions.forEach(t => {
                        totalPaid += (t.montantParis || 0) + (t.montantAbidjan || 0);
                        if ((t.reste || 0) < -1) totalDebt += Math.abs(t.reste);
                    });

                    charts.debt = new Chart(ctxDebt, {
                        type: 'pie',
                        data: {
                            labels: ['Encaissé', 'Dettes (Reste à percevoir)'],
                            datasets: [{
                                data: [totalPaid, totalDebt],
                                backgroundColor: ['#10b981', '#ef4444']
                            }]
                        }
                    });
                }

                const ctxAgents = document.getElementById('agentPerformanceChart');
                if (ctxAgents) {
                    if (charts.agents) charts.agents.destroy();
                    const agentStats = {};
                    
                    transactions.forEach(t => {
                        if (t.agent) {
                            t.agent.split(',').forEach(a => {
                                const name = a.trim();
                                if (!agentStats[name]) agentStats[name] = 0;
                                agentStats[name] += (t.prix || 0);
                            });
                        }
                    });

                    const sortedAgents = Object.entries(agentStats)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10);

                    charts.agents = new Chart(ctxAgents, {
                        type: 'bar',
                        data: {
                            labels: sortedAgents.map(a => a[0]),
                            datasets: [{
                                label: 'Chiffre d\'Affaires Généré',
                                data: sortedAgents.map(a => a[1]),
                                backgroundColor: '#8b5cf6'
                            }]
                        }
                    });
                }

                let ctxAbidjanParis = document.getElementById('abidjanVsParisChart');
                if (!ctxAbidjanParis) {
                    const firstChartCard = document.querySelector('.chart-card');
                    if (firstChartCard && firstChartCard.parentNode) {
                        const newCard = document.createElement('div');
                        newCard.className = 'chart-card';
                        newCard.innerHTML = '<h3>Évolution Encaissements (Abidjan vs Paris)</h3><canvas id="abidjanVsParisChart"></canvas>';
                        firstChartCard.parentNode.appendChild(newCard);
                        ctxAbidjanParis = document.getElementById('abidjanVsParisChart');
                    }
                }

                if (ctxAbidjanParis) {
                    if (charts.abidjanParis) charts.abidjanParis.destroy();
                    const abidjanParisStats = {};
                    
                    transactions.forEach(t => {
                        const payments = t.paymentHistory || [{ date: t.date, montantAbidjan: t.montantAbidjan, montantParis: t.montantParis }];
                        payments.forEach(p => {
                            const dateStr = String(p.date || '');
                            if (dateStr.length < 7) return;
                            const m = dateStr.substring(0, 7);
                            if (!abidjanParisStats[m]) abidjanParisStats[m] = { abidjan: 0, paris: 0 };
                            abidjanParisStats[m].abidjan += (p.montantAbidjan || 0);
                            abidjanParisStats[m].paris += (p.montantParis || 0);
                        });
                    });

                    const labels = Object.keys(abidjanParisStats).sort();
                    
                    charts.abidjanParis = new Chart(ctxAbidjanParis, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [
                                { label: 'Abidjan (Arrivée)', data: labels.map(l => abidjanParisStats[l].abidjan), borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', tension: 0.4, fill: true, pointRadius: 4 },
                                { label: 'Paris (Départ)', data: labels.map(l => abidjanParisStats[l].paris), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true, pointRadius: 4 }
                            ]
                        },
                        options: {
                            responsive: true,
                            interaction: { mode: 'index', intersect: false },
                            plugins: { legend: { position: 'top' } },
                            scales: { y: { beginAtZero: true } }
                        }
                    });
                }
            } catch (e) {
                console.error("Erreur lors de l'affichage des graphiques :", e);
            }
        }

        function renderAdvancedAnalytics(transactions) {
            const now = new Date();
            const buckets = { '0-30j': 0, '31-60j': 0, '61-90j': 0, '+90j': 0 };
            transactions.forEach(t => {
                if ((t.reste || 0) < -1) {
                    const dateStr = String(t.date || '');
                    if (dateStr.length < 10) return;
                    const days = (now - new Date(dateStr)) / (1000 * 60 * 60 * 24);
                    if (days <= 30) buckets['0-30j'] += Math.abs(t.reste);
                    else if (days <= 60) buckets['31-60j'] += Math.abs(t.reste);
                    else if (days <= 90) buckets['61-90j'] += Math.abs(t.reste);
                    else buckets['+90j'] += Math.abs(t.reste);
                }
            });
            const agedBody = document.getElementById('agedBalanceBody');
            if (agedBody) {
                agedBody.innerHTML = Object.entries(buckets).map(([k, v]) => `<tr><td>${k}</td><td class="reste-negatif">${formatCFA(v)}</td></tr>`).join('');
            }
        }

        // --- 7. MODAL DÉTAILS CONTENEUR ---
        window.openContainerDetails = function(containerName) {
            const modal = document.getElementById('containerDetailsModal');
            const tbody = document.getElementById('containerDetailsTableBody');
            const title = document.getElementById('modalContainerTitle');
            
            title.textContent = `Détails : ${containerName}`;
            tbody.innerHTML = '';

            const cleanTrans = getCleanTransactions(allTransactions).filter(t => {
                const cName = (t.conteneur || "Non spécifié").trim().toUpperCase();
                return cName === containerName;
            });
            const cleanExp = allExpenses.filter(e => {
                const cName = (e.conteneur || "").trim().toUpperCase();
                if (cName === "") return false;
                return cName === containerName && (!e.sessionId || validatedSessions.has(e.sessionId));
            });

            cleanTrans.sort((a, b) => {
                const refA = (a.reference || "").trim();
                const refB = (b.reference || "").trim();
                
                const partsA = refA.split('-');
                const partsB = refB.split('-');
                
                if (partsA.length >= 3 && partsB.length >= 3) {
                    const suffixA = partsA[partsA.length - 1];
                    const suffixB = partsB[partsB.length - 1];
                    const suffixComp = suffixA.localeCompare(suffixB, undefined, { numeric: true, sensitivity: 'base' });
                    if (suffixComp !== 0) return suffixComp;
                    
                    const numA = parseInt(partsA[partsA.length - 2], 10);
                    const numB = parseInt(partsB[partsB.length - 2], 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                }
                
                return refA.localeCompare(refB, undefined, { numeric: true });
            });

            let totalPrix = 0, totalAbj = 0, totalPar = 0, totalReste = 0;

            cleanTrans.forEach(t => {
                totalPrix += (t.prix || 0);
                totalAbj += (t.montantAbidjan || 0);
                totalPar += (t.montantParis || 0);
                totalReste += (t.reste || 0);

                tbody.innerHTML += `
                    <tr>
                        <td>${t.date}</td>
                        <td>${t.nom} <small>(${t.reference})</small></td>
                        <td>${t.reference}</td>
                        <td>${formatCFA(t.prix)}</td>
                        <td>${formatCFA(t.montantAbidjan)}</td>
                        <td>${formatCFA(t.montantParis)}</td>
                        <td class="${t.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(t.reste)}</td>
                    </tr>
                `;
            });

            cleanExp.forEach(e => {
                tbody.innerHTML += `
                    <tr style="background:#fff1f2; color:#991b1b;">
                        <td>${e.date}</td>
                        <td colspan="2">DÉPENSE : ${e.description}</td>
                        <td>-</td><td>-</td><td>-</td>
                        <td>-${formatCFA(e.montant)}</td>
                    </tr>
                `;
            });

            const totalDep = cleanExp.reduce((sum, e) => sum + (e.montant || 0), 0);
            const benefice = totalPrix - totalDep;

            const pctAbjTotal = totalPrix ? Math.round((totalAbj / totalPrix) * 100) : 0;
            const pctParTotal = totalPrix ? Math.round((totalPar / totalPrix) * 100) : 0;
            const pctResteTotal = totalPrix ? Math.round((totalReste / totalPrix) * 100) : 0;

            document.getElementById('topTotalPrix').textContent = formatCFA(totalPrix);
            document.getElementById('topTotalPayeAbj').innerHTML = `${formatCFA(totalAbj)} <span style="font-size:0.8em">(${pctAbjTotal}%)</span>`;
            document.getElementById('topTotalPayePar').innerHTML = `${formatCFA(totalPar)} <span style="font-size:0.8em">(${pctParTotal}%)</span>`;
            document.getElementById('topTotalReste').innerHTML = `${formatCFA(totalReste)} <span style="font-size:0.8em">(${pctResteTotal}%)</span>`;
            document.getElementById('topTotalDep').textContent = formatCFA(totalDep);
            document.getElementById('topTotalBen').textContent = formatCFA(benefice);
            document.getElementById('topTotalBen').style.color = benefice >= 0 ? '#10b981' : '#ef4444';

            const btnExcel = document.getElementById('downloadContainerExcelBtn');
            if(btnExcel) {
                btnExcel.onclick = () => {
                    const wb = XLSX.utils.table_to_book(document.getElementById('containerDetailsTable'));
                    XLSX.writeFile(wb, `Details_${containerName}.xlsx`);
                };
            }

            const btnPdf = document.getElementById('downloadContainerPdfBtn');
            if(btnPdf) {
                btnPdf.onclick = async () => {
                    try {
                        // Chargement jsPDF + autotable (versions figées, source unique).
                        await loadJsPdf();
                        const { jsPDF } = window.jspdf;
                        const doc = new jsPDF({ orientation: 'landscape' });
                        doc.text(`Détails conteneur : ${containerName}`, 14, 16);
                        doc.autoTable({
                            html: '#containerDetailsTable',
                            startY: 22,
                            theme: 'grid',
                            styles: { fontSize: 7 },
                            headStyles: { fillColor: [211, 47, 47] },
                        });
                        doc.save(`Details_${containerName}.pdf`);
                    } catch (e) {
                        console.error('[dashboard abidjan] export PDF conteneur échec —', e);
                        if (typeof showToast === 'function') showToast("Export PDF impossible.", "error");
                        else alert("Export PDF impossible.");
                    }
                };
            }

            modal.style.display = 'block';
            document.getElementById('closeContainerModal').onclick = () => modal.style.display = 'none';
            window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };
        };

        // --- 8. DATA LOADING (LISTENERS) ---
        
        onSnapshot(query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("agency", "==", activeAgency)), snap => {
            validatedSessions.clear();
            snap.forEach(doc => {
                if (doc.data().status === "VALIDATED") validatedSessions.add(doc.id);
            });
            if (allTransactions.length > 0) updateDashboard();
        });

        const transListCol = getCollectionName("transactions");
        const transListConstraints = [where("isDeleted", "!=", true)];
        if (transListCol === "transactions") transListConstraints.unshift(where("agency", "==", activeAgency));
        const transListQuery = query(collection(db, transListCol), ...transListConstraints);
        onSnapshot(transListQuery, snap => {
            allTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateDashboard();
        });
        const expListCol = getCollectionName("expenses");
        const expListConstraints = [where("isDeleted", "!=", true)];
        if (expListCol === "expenses") expListConstraints.unshift(where("agency", "==", activeAgency));
        const expListQuery = query(collection(db, expListCol), ...expListConstraints);
        onSnapshot(expListQuery, snap => {
            allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateDashboard();
        });
        onSnapshot(query(collection(db, "other_income"), where("isDeleted", "!=", true), where("agency", "==", activeAgency)), snap => {
            allOtherIncome = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateDashboard();
        });
        onSnapshot(query(collection(db, "bank_movements"), where("isDeleted", "!=", true), where("agency", "==", activeAgency)), snap => {
            allBankMovements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateDashboard();
        });

        function formatCFA(n) { return formatMoney(n, true); }

        startDateInput.addEventListener('change', updateDashboard);
        endDateInput.addEventListener('change', updateDashboard);
        clearFilterBtn.addEventListener('click', () => {
            startDateInput.value = ''; endDateInput.value = ''; updateDashboard();
        });
        
        if (typeof initBackToTopButton === 'function') initBackToTopButton();
    }
};