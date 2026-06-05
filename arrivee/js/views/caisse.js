import { db } from '../../../firebase-config.js';
import { collection, doc, addDoc, updateDoc, getDocs, query, where, orderBy, limit, onSnapshot, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';
import { matchesShippingMode, isAerienMode, getShippingMode } from '../../../shipping-mode.js';
import { calculateStorageFee } from '../../../commun/services/storageFee.js';
import { formatMoney } from '../../../commun/services/format.js';
import { createApp, ref, reactive, computed, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const CaisseView = {
    vueApp: null,

    render(app, container) {
        this.app = app;
        
        container.innerHTML = `
            <style>
                [v-cloak] { display: none; }
                .desktop-view-container { display: block; }
                .mobile-view-container { display: none; }
                @media (max-width: 768px) {
                    .desktop-view-container { display: none; }
                    .mobile-view-container { display: block; }
                }

                /* ===== Charte AMT — page Saisie Caisse (Bleu de Prusse · Or · Rouge) ===== */
                #vue-caisse-app {
                    --c-blue:#1A3553; --c-blue-soft:#2C4E76; --c-gold:#F2A312;
                    --c-gold-deep:#B8780A; --c-gold-warm:#FDF1DA;
                    --c-red:#E51F21; --c-red-deep:#B5181A; --c-line:rgba(11,37,64,0.10);
                }
                /* Panneaux en cartes premium */
                #vue-caisse-app #caisseForm {
                    border-radius: 16px;
                    box-shadow: 0 8px 22px -12px rgba(11,37,64,0.22);
                    padding: 22px 24px; margin-bottom: 18px;
                }
                #vue-caisse-app #caisseForm[class*="mobile-step"] {
                    background:#fff !important; border:1px solid var(--c-line) !important;
                    border-left:4px solid var(--c-gold) !important;
                }
                #vue-caisse-app #caisseForm[style*="fff3e0"] {
                    border:1px solid rgba(229,31,33,0.18) !important;
                    border-left:4px solid var(--c-red) !important;
                }
                /* Titres */
                #vue-caisse-app .desktop-only-title { color: var(--c-blue) !important; font-weight: 800; letter-spacing:-0.3px; }
                #vue-caisse-app #caisseForm[style*="fff3e0"] > h3 { color: var(--c-red) !important; font-weight: 800; }
                /* Barre de progression */
                #vue-caisse-app .step-indicator.active {
                    background: linear-gradient(135deg,var(--c-blue-soft),var(--c-blue)) !important;
                    color:#fff !important; border-color:var(--c-blue) !important;
                }
                #vue-caisse-app .step-indicator.completed {
                    background: var(--c-gold-warm) !important; color: var(--c-gold-deep) !important; border-color: var(--c-gold) !important;
                }
                /* Champs */
                #vue-caisse-app input, #vue-caisse-app select { border-radius: 9px; }
                #vue-caisse-app input:focus, #vue-caisse-app select:focus {
                    border-color: var(--c-gold) !important; box-shadow: 0 0 0 3px rgba(242,163,18,0.18) !important; outline: none;
                }
                /* Boutons wizard */
                #vue-caisse-app .btn-next {
                    background: linear-gradient(135deg,var(--c-blue-soft),var(--c-blue)) !important;
                    color:#fff !important; border:none !important; border-radius:10px; font-weight:700;
                    box-shadow:0 6px 14px -6px rgba(26,53,83,0.5);
                }
                #vue-caisse-app .btn-prev {
                    background:#fff !important; color:var(--c-blue) !important;
                    border:1px solid var(--c-line) !important; border-radius:10px; font-weight:600;
                }
                /* Boutons ENREGISTRER + Valider la journée (or marigold) */
                #vue-caisse-app .form-buttons button, #vue-caisse-app button.primary {
                    background: linear-gradient(135deg,var(--c-gold),var(--c-gold-deep)) !important;
                    color:#1a0c08 !important; border:none !important; border-radius:12px; font-weight:800;
                    box-shadow:0 9px 20px -7px rgba(242,163,18,0.55);
                }
                /* Carte résumé étape 3 */
                #vue-caisse-app .summary-card {
                    background:#fff !important; border:1px solid var(--c-line) !important;
                    border-radius:14px; box-shadow:0 6px 14px -10px rgba(11,37,64,0.18);
                }
                /* Bandeaux résumé / NET À VERSER */
                #vue-caisse-app .daily-summary {
                    background:#fff !important; border:1px solid var(--c-line) !important;
                    border-top:4px solid var(--c-gold) !important; border-radius:16px !important;
                    box-shadow:0 8px 20px -12px rgba(11,37,64,0.20);
                }
                #vue-caisse-app .daily-summary h2 { color: var(--c-blue) !important; }
                /* Tables */
                #vue-caisse-app table.table thead th { background: var(--c-blue) !important; color:#fff !important; border:none !important; }
                #vue-caisse-app .deleteBtn {
                    background: linear-gradient(135deg,var(--c-red),var(--c-red-deep)) !important;
                    color:#fff !important; border:none !important; border-radius:8px;
                }
                /* Bouton « Ajouter Dépense » (rouge) + « + » nouvel agent (bleu) */
                #vue-caisse-app #caisseForm[style*="fff3e0"] .form-grid button {
                    background: linear-gradient(135deg,var(--c-red),var(--c-red-deep)) !important;
                    color:#fff !important; border:none !important; border-radius:10px; font-weight:700;
                }
                #vue-caisse-app button[title="Ajouter un nouvel agent"] {
                    background: linear-gradient(135deg,var(--c-blue-soft),var(--c-blue)) !important;
                    color:#fff !important; border:none !important; border-radius:8px;
                }
                /* Sélection d'agents — liste déroulante à cocher */
                #vue-caisse-app .agent-select { width:100%; position:relative; }
                #vue-caisse-app .agent-picker-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
                #vue-caisse-app .agent-picker-label { font-size:12px; font-weight:700; color:var(--c-blue); text-transform:uppercase; letter-spacing:0.5px; display:flex; align-items:center; gap:6px; }
                #vue-caisse-app .agent-count {
                    background:var(--c-gold); color:#1a0c08; font-size:11px; font-weight:800;
                    min-width:18px; height:18px; padding:0 5px; border-radius:9px; display:inline-flex; align-items:center; justify-content:center;
                }
                #vue-caisse-app .agent-add-btn {
                    background: linear-gradient(135deg,var(--c-blue-soft),var(--c-blue));
                    color:#fff; border:none; border-radius:8px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer;
                }
                #vue-caisse-app .agent-add-btn:hover { filter:brightness(1.08); }
                /* Champ fermé */
                #vue-caisse-app .agent-select-control {
                    display:flex; align-items:center; justify-content:space-between;
                    background:#fff; border:1.5px solid var(--c-line); border-radius:10px;
                    padding:10px 14px; cursor:pointer; user-select:none; transition: border-color 0.15s;
                }
                #vue-caisse-app .agent-select-control:hover { border-color:var(--c-gold); }
                #vue-caisse-app .agent-select-control.open { border-color:var(--c-gold); box-shadow:0 0 0 3px rgba(242,163,18,0.18); }
                #vue-caisse-app .agent-select-text { font-size:13.5px; color:#94a3b8; }
                #vue-caisse-app .agent-select-text.filled { color:var(--c-blue); font-weight:700; }
                #vue-caisse-app .agent-select-arrow { color:var(--c-blue); font-weight:900; transition: transform 0.2s; }
                #vue-caisse-app .agent-select-control.open .agent-select-arrow { transform: rotate(180deg); }
                /* Panneau ouvert */
                #vue-caisse-app .agent-select-panel {
                    position:absolute; left:0; right:0; top:100%; margin-top:6px; z-index:30;
                    background:#fff; border:1px solid var(--c-line); border-radius:12px;
                    box-shadow:0 14px 30px -10px rgba(11,37,64,0.30);
                    max-height:230px; overflow-y:auto; padding:6px;
                }
                #vue-caisse-app .agent-option {
                    display:flex; align-items:center; gap:10px;
                    padding:9px 12px; border-radius:8px; cursor:pointer; font-size:13.5px; color:var(--c-blue);
                    transition: background 0.12s;
                }
                #vue-caisse-app .agent-option:hover { background:#f1f5f9; }
                #vue-caisse-app .agent-option.selected { background:var(--c-gold-warm); font-weight:700; }
                #vue-caisse-app .agent-option input[type="checkbox"] {
                    width:17px; height:17px; accent-color:var(--c-gold); cursor:pointer; margin:0; flex-shrink:0;
                }
                #vue-caisse-app .agent-empty { color:#94a3b8; font-size:13px; padding:10px 12px; }
                /* Mobile — actions principales */
                #vue-caisse-app .mob-top-tab.active { background: var(--c-blue) !important; color:#fff !important; }
                #vue-caisse-app .mob-btn-primary, #vue-caisse-app .mob-btn-success {
                    background: linear-gradient(135deg,var(--c-gold),var(--c-gold-deep)) !important; color:#1a0c08 !important;
                }
                #vue-caisse-app .mob-btn-danger {
                    background: linear-gradient(135deg,var(--c-red),var(--c-red-deep)) !important; color:#fff !important;
                }
            </style>
            <div id="vue-caisse-app" v-cloak>
            <div class="desktop-view-container" v-show="!isMobile">
                <!-- ONGLET 1 : SAISIE CAISSE -->
                <div id="saisie" class="tab-panel active">
                    <div id="caisseForm" :class="'mobile-step-' + desktopStep">
                        <h3 class="desktop-only-title" style="margin-top:0; color:#28a745;">Encaissement Colis</h3>
                        
                        <div class="mobile-progress-bar">
                            <div class="step-indicator" :class="{active: desktopStep === 1, completed: desktopStep > 1}">1. Colis</div>
                            <div class="step-indicator" :class="{active: desktopStep === 2, completed: desktopStep > 2}">2. Finances</div>
                            <div class="step-indicator" :class="{active: desktopStep === 3}">3. Validation</div>
                        </div>

                        <!-- ETAPE 1 -->
                        <div class="wizard-step step-1">
                            <div class="form-grid">
                            <input type="date" v-model="dForm.date" required>
                            <div style="width: 100%;">
                                <input type="text" v-model="dForm.reference" @change="onDesktopRefChange" placeholder="Référence / Client (Recherche)" required list="referenceList">
                                <button type="button" class="btn-scan">📸 Scanner la Référence</button>
                            </div>
                            <datalist id="referenceList">
                                <option v-for="ref in uniqueReferences" :key="ref" :value="ref"></option>
                            </datalist>
                            
                            <input type="text" v-model="dForm.nom" placeholder="Nom du Client">
                            <input type="text" v-model="dForm.conteneur" placeholder="Conteneur (ex: D35)">
                            </div>
                            <div class="step-nav" style="justify-content: flex-end;">
                                <button type="button" class="btn btn-next" style="background:#28a745; color:white; border:none;" @click="goToDesktopStep(2)">Suivant ➔</button>
                            </div>
                        </div>

                        <!-- ETAPE 2 -->
                        <div class="wizard-step step-2">
                            <div class="form-grid">
                            <div class="prix-container">
                                <input type="number" v-model.number="dForm.prix" placeholder="Prix">
                                <span class="cfa-label">CFA</span>
                            </div>
                            
                            <div style="display: flex; flex-direction: column; width: 100%;">
                                <span style="font-size: 12px; font-weight: bold; margin-bottom: 4px; color: #1e40af;">PARIS</span>
                                <input type="number" v-model.number="dForm.montantParis" :placeholder="dFormReste < 0 ? 'Reste: ' + formatCFA(Math.abs(dFormReste)) : 'Soldé Paris'">
                            </div>
                            <div style="display: flex; flex-direction: column; width: 100%;">
                                <span style="font-size: 12px; font-weight: bold; margin-bottom: 4px; color: #9a3412;">ABIDJAN</span>
                                <input type="number" v-model.number="dForm.montantAbidjan" :placeholder="dFormReste < 0 ? 'Reste: ' + formatCFA(Math.abs(dFormReste)) : 'Soldé Abidjan'">
                            </div>

                            <select v-model="dForm.modePaiement" style="font-weight: bold; color: #0d47a1;">
                                <option value="Espèce" selected>Espèce</option>
                                <option value="Chèque">Chèque</option>
                                <option value="OM">Orange Money</option>
                                <option value="Wave">Wave</option>
                                <option value="Virement">Virement</option>
                            </select>

                            <select v-model="dForm.banque" v-show="dForm.modePaiement === 'Virement' || dForm.modePaiement === 'Chèque'">
                                <option value="" disabled>Choisir la Banque...</option>
                                <option value="BICICI BANK">BICICI BANK</option>
                                <option value="BRIDGE BANK">BRIDGE BANK</option>
                                <option value="ORANGE BANK">ORANGE BANK</option>
                            </select>

                            <input type="number" :value="dFormReste" :class="dFormReste >= 0 ? 'reste-positif' : 'reste-negatif'" placeholder="Reste" readonly>
                            </div>
                            <div class="step-nav" style="justify-content: space-between;">
                                <button type="button" class="btn btn-prev" style="background:#e2e8f0; color:#333; border:none;" @click="goToDesktopStep(1)">⬅ Retour</button>
                                <button type="button" class="btn btn-next" style="background:#28a745; color:white; border:none;" @click="goToDesktopStep(3)">Suivant ➔</button>
                            </div>
                        </div>

                        <!-- ETAPE 3 -->
                        <div class="wizard-step step-3">
                            <div class="summary-card">
                                <h3 style="margin: 0 0 10px 0; color: #475569; font-size: 16px;">Référence : {{ dForm.reference || 'N/A' }}</h3>
                                <h2 v-if="dFormReste <= 0" style="color:#10b981; margin: 10px 0; font-size: 22px;">✅ COLIS SOLDÉ</h2>
                                <h2 v-else style="color:#ef4444; margin: 10px 0; font-size: 22px;">RESTE À PAYER : {{ formatCFA(Math.abs(dFormReste)) }}</h2>
                            </div>

                        <div style="text-align: center; margin: 5px 0;">
                            <span @click="showAdvanced = !showAdvanced" style="cursor:pointer; color:#4f46e5; font-size:12px; font-weight:bold; user-select: none;">{{ showAdvanced ? '▲ Masquer les options' : '▼ Plus d\\'options (Agents, Commune, Ajustements)' }}</span>
                        </div>

                        <div v-show="showAdvanced" class="form-grid" style="margin-top:5px; padding:10px; background:#f1f5f9; border-radius:8px;">
                            <input type="text" v-model="dForm.agentMobileMoney" placeholder="Info Paiement" v-show="dForm.modePaiement !== 'Virement' && dForm.modePaiement !== 'Chèque'">
                            <select v-model="dForm.commune">
                                <option value="">-- Commune --</option>
                                <option value="Abobo">Abobo</option><option value="Anyama">Anyama</option><option value="Autres Communes">Autres Communes</option>
                                <option value="Cocody">Cocody</option><option value="Entrepôt">Entrepôt</option><option value="Yopougon">Yopougon</option>
                            </select>
                            
                            <div class="agent-select">
                                <div class="agent-picker-head">
                                    <span class="agent-picker-label">Agents <span v-if="dForm.agents.length" class="agent-count">{{ dForm.agents.length }}</span></span>
                                    <button type="button" @click="addNewAgent" class="agent-add-btn" title="Ajouter un nouvel agent">+ Agent</button>
                                </div>
                                <div class="agent-select-control" :class="{ open: agentDropdownOpen }" @click="agentDropdownOpen = !agentDropdownOpen">
                                    <span class="agent-select-text" v-if="!dForm.agents.length">Sélectionner des agents…</span>
                                    <span class="agent-select-text filled" v-else>{{ dForm.agents.length }} agent{{ dForm.agents.length > 1 ? 's' : '' }} sélectionné{{ dForm.agents.length > 1 ? 's' : '' }}</span>
                                    <span class="agent-select-arrow">⌄</span>
                                </div>
                                <div class="agent-select-panel" v-show="agentDropdownOpen">
                                    <div v-if="!dbAgents.length" class="agent-empty">Aucun agent — cliquez « + Agent ».</div>
                                    <label v-for="ag in dbAgents" :key="ag.id" class="agent-option" :class="{ selected: dForm.agents.includes(ag.name) }">
                                        <input type="checkbox" :value="ag.name" v-model="dForm.agents">
                                        <span>{{ ag.name }}</span>
                                    </label>
                                </div>
                            </div>
                            
                            <select v-model="dForm.adjustmentType">
                                <option value="">-- Ajustement (Aucun) --</option>
                                <option value="reduction">Réduction ⬇️</option>
                                <option value="augmentation">Augmentation ⬆️</option>
                            </select>
                            <input type="number" v-model.number="dForm.adjustmentVal" placeholder="Montant Ajustement">
                        </div>

                            <div class="step-nav" style="justify-content: space-between; margin-bottom:10px;">
                                <button type="button" class="btn btn-prev" style="background:#e2e8f0; color:#333; border:none;" @click="goToDesktopStep(2)">⬅ Retour</button>
                            </div>

                        <div class="form-buttons" id="finalSubmitWrapper">
                            <button type="button" @click="addDesktopTransaction">✅ ENREGISTRER</button> 
                        </div>
                        </div>
                    </div>

                        <div id="caisseForm" style="background-color: #fff3e0; border: 1px solid #ffe0b2;">
                        <h3 style="margin-top:0; color:#d32f2f;">Dépenses du Livreur (Carburant, etc.)</h3>
                        <div class="form-grid" style="grid-template-columns: 2fr 1.5fr 1fr 1fr;">
                            <input type="text" v-model="dExpForm.desc" placeholder="Motif (ex: Carburant, Réparation...)">
                            <select v-model="dExpForm.vehicleId" style="border-color: #fca5a5;">
                                <option value="">-- Véhicule (Optionnel) --</option>
                                <option v-for="v in dbVehicles" :key="v.id" :value="v.id">{{ v.name }} ({{ v.plate }})</option>
                            </select>
                            <input type="number" v-model.number="dExpForm.amount" placeholder="Montant">
                            <button @click="addDesktopExpense" style="background-color: #d32f2f; color: white; border: none; border-radius: 6px; cursor: pointer;">Ajouter Dépense</button>
                        </div>
                    </div>

                        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                        <div style="flex: 2; min-width: 300px; overflow-x: auto;">
                            <h3>Encaissements (<span>{{ dailyTransactions.length }}</span>)</h3>
                            <table class="table">
                                <thead><tr><th>Réf</th><th>Nom</th><th>Prix</th><th>Mode</th><th>Reste</th><th>Action</th></tr></thead>
                                <tbody>
                                    <tr v-for="(t, idx) in dailyTransactions" :key="idx">
                                        <td>{{ t.reference }}</td><td>{{ t.nom || '-' }}</td>
                                        <td>{{ formatCFA(t.prix) }} {{ t.adjustmentType === 'reduction' ? '⬇️' : (t.adjustmentType === 'augmentation' ? '⬆️' : '') }}</td>
                                        <td>{{ t.modePaiement }}</td>
                                        <td :class="t.reste < 0 ? 'reste-negatif' : 'reste-positif'">{{ formatCFA(t.reste) }}</td>
                                        <td><button class="deleteBtn" @click="removeDesktopTransaction(idx)">X</button></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div style="flex: 1; min-width: 300px; overflow-x: auto;">
                            <h3>Dépenses Saisies</h3>
                            <table class="table">
                                <thead><tr><th>Motif</th><th>Montant</th><th>Action</th></tr></thead>
                                <tbody>
                                    <tr v-for="(exp, idx) in dailyExpenses" :key="idx">
                                        <td>{{ exp.description }} <span v-if="exp.vehicleName" class="tag" style="background:#3b82f6; font-size:10px;">🚗 {{ exp.vehicleName }}</span></td>
                                        <td>{{ formatCFA(exp.montant) }}</td>
                                        <td><button class="deleteBtn" @click="removeDesktopExpense(idx)">X</button></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                        <div class="daily-summary" style="flex-direction: column; align-items: center; background-color: #e8f5e9; border: 2px solid #4caf50;">
                        <div style="display: flex; justify-content: space-around; width: 100%; margin-bottom: 15px;">
                            <div class="summary-item"><h4>Total Encaissement (Espèces)</h4><span style="color: #28a745;">{{ formatCFA(dTotals.abidjanEsp) }}</span></div>
                            <div class="summary-item"><h4>- Total Dépenses</h4><span style="color: #d32f2f;">{{ formatCFA(dTotals.expenses) }}</span></div>
                        </div>
                        
                        <div style="text-align: center; border-top: 2px solid #ccc; padding-top: 10px; width: 100%;">
                            <h2 style="margin:0; font-size: 16px; color: #555;">NET À VERSER (ESPECES)</h2>
                            <span :style="{ fontSize: '32px', fontWeight: 'bold', color: dTotals.netToPay < 0 ? '#d32f2f' : '#000' }">{{ formatCFA(dTotals.netToPay) }}</span>
                        </div>

                        <div style="width: 100%; display: flex; justify-content: center; margin-top: 20px;">
                            <button @click="saveDay('desktop')" class="primary" style="font-size: 18px; padding: 15px 40px;" :disabled="saving">
                                <span v-if="saving">⏳ Enregistrement...</span>
                                <span v-else>✅ Valider et Enregistrer la Journée</span>
                            </button>
                        </div>
                    </div>

                        <div class="daily-summary" style="margin-top: 10px; padding: 10px; opacity: 0.8; flex-wrap: wrap;">
                        <div class="summary-item" style="font-size: 0.8em;"><h4>Total Paris</h4><span>{{ formatCFA(dTotals.paris) }}</span></div>
                        <div class="summary-item" style="font-size: 0.8em;"><h4>Reste Total</h4><span>{{ formatCFA(dTotals.reste) }}</span></div>
                        <div style="width: 100%; display: flex; justify-content: space-around; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px; flex-wrap: wrap; gap: 10px;">
                            <div class="summary-item" style="font-size: 0.8em;" v-for="(amount, mode) in dTotals.breakdown" :key="mode" v-show="amount > 0">
                                <h4>{{ mode }}</h4><span style="color:#0d47a1; font-weight:bold;">{{ formatCFA(amount) }}</span>
                            </div>
                        </div>
                    </div>
                </div> <!-- Fin du tab-panel saisie -->
            </div>
            
            <!-- VUE MOBILE (SPA Livreur) -->
            <div class="mobile-view-container" v-show="isMobile">
                <div class="mob-summary">
                    <div class="mob-stat"><span>Encaissements</span><b style="color:#10b981;">{{ formatCFA(mTotals.totalIn) }}</b></div>
                    <div class="mob-stat"><span>Dépenses</span><b style="color:#ef4444;">{{ formatCFA(mTotals.totalOut) }}</b></div>
                    <div class="mob-stat"><span>Net à verser</span><b>{{ formatCFA(mTotals.net) }}</b></div>
                </div>

                <div class="mob-top-tabs">
                    <button class="mob-top-tab" :class="{active: mobileTab === 'saisie'}" @click="mobileTab = 'saisie'">📦 Saisie</button>
                    <button class="mob-top-tab" :class="{active: mobileTab === 'depenses'}" @click="mobileTab = 'depenses'">⛽ Dépenses</button>
                </div>

                <div class="mob-card" v-show="mobileTab === 'saisie'">
                    <h3>📦 Nouvel Encaissement</h3>
                    <input type="text" v-model="mForm.reference" @change="onMobileRefChange" placeholder="Référence du colis (ex: MD-123)" list="mob-referenceList">
                    <datalist id="mob-referenceList">
                        <option v-for="ref in uniqueReferences" :key="ref" :value="ref"></option>
                    </datalist>
                    
                    <input type="text" v-model="mForm.nom" placeholder="Nom du Client" readonly style="background-color: #e2e8f0; color: #475569;">
                    <div style="display:flex; gap:10px; margin-bottom:12px;">
                        <input type="text" v-model="mForm.conteneur" placeholder="Conteneur" readonly style="background-color: #e2e8f0; color: #475569; margin-bottom:0; flex:1;">
                        <input type="number" v-model.number="mForm.prix" placeholder="Prix" readonly style="background-color: #e2e8f0; color: #475569; margin-bottom:0; flex:1;">
                    </div>

                    <input type="number" v-model.number="mForm.montant" placeholder="Montant encaissé (CFA)">
                    
                    <div style="display:flex; gap:10px; margin-bottom:12px;">
                        <select v-model="mForm.mode" style="margin-bottom:0; flex:1;">
                            <option value="Espèce">💵 Espèce</option>
                            <option value="Wave">🌊 Wave</option>
                            <option value="OM">🟠 Orange Money</option>
                        </select>
                        <input type="number" :value="mFormReste" placeholder="Reste" readonly style="background-color: #e2e8f0; color: #475569; font-weight: bold; margin-bottom:0; flex:1;">
                    </div>

                    <select v-model="mForm.agentRecepteur" v-show="mForm.mode !== 'Espèce'" style="margin-bottom:12px; width:100%;">
                        <option value="">-- Agent ayant reçu le dépôt --</option>
                        <option v-for="ag in dbAgents" :key="ag.id" :value="ag.name">{{ ag.name }}</option>
                    </select>

                    <button @click="addMobileTransaction" class="mob-btn mob-btn-primary">Ajouter Encaissement</button>
                </div>

                <div class="mob-card" v-show="mobileTab === 'depenses'">
                    <h3>⛽ Nouvelle Dépense</h3>
                    <input type="text" v-model="mExpForm.motif" placeholder="Motif (ex: Carburant, Péage...)">
                    <input type="number" v-model.number="mExpForm.montant" placeholder="Montant (CFA)">
                    <button @click="addMobileExpense" class="mob-btn mob-btn-danger">Ajouter Dépense</button>
                </div>

                <div>
                    <h3 style="margin: 20px 0 10px 15px; font-size: 14px; color: #64748b; text-transform: uppercase;">Opérations du jour</h3>
                    
                    <div v-if="mobileTransactions.length === 0 && mobileExpenses.length === 0" style="text-align:center; padding:20px; color:#94a3b8; font-size:14px;">Aucune opération enregistrée.</div>
                    
                    <div v-for="(t, idx) in mobileTransactions" :key="'mt'+idx" class="mob-list-item">
                        <div>
                            <strong>{{ t.reference }}</strong> <span class="tag" style="background:#e2e8f0; color:#333; font-size:10px;">{{ t.mode }}</span>
                            <span v-if="t.agentRecepteur" class="tag" style="background:#dbeafe; color:#1e40af; font-size:10px; margin-left:5px;">👤 {{ t.agentRecepteur }}</span><br>
                            <span style="color:#10b981; font-weight:bold;">+ {{ formatCFA(t.montant) }}</span>
                        </div>
                        <div class="mob-list-item-actions">
                            <button @click="editMobileTransaction(idx)" title="Modifier">✏️</button>
                            <button @click="removeMobileTransaction(idx)" title="Supprimer">❌</button>
                        </div>
                    </div>
                    
                    <div v-for="(e, idx) in mobileExpenses" :key="'me'+idx" class="mob-list-item">
                        <div>
                            <strong>{{ e.motif }}</strong><br>
                            <span style="color:#ef4444; font-weight:bold;">- {{ formatCFA(e.montant) }}</span>
                        </div>
                        <div class="mob-list-item-actions">
                            <button @click="removeMobileExpense(idx)" title="Supprimer">❌</button>
                        </div>
                    </div>
                    
                    <button @click="saveDay('mobile')" class="mob-btn mob-btn-success" style="margin: 15px; width: calc(100% - 30px); box-shadow: 0 4px 6px rgba(16,185,129,0.3);" :disabled="saving">
                        <span v-if="saving">⏳ Validation...</span>
                        <span v-else>✅ Valider la journée</span>
                    </button>
                </div>

            </div>
            </div>
        `;
        
        this.initVue();
    },

    initVue() {
        if (this.vueApp) this.vueApp.unmount();
        const globalApp = this.app;

        this.vueApp = createApp({
            setup() {
                const isMobile = ref(window.innerWidth <= 768);
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
                const currentUserName = sessionStorage.getItem('userName') || 'Utilisateur';

                // UI State
                const desktopStep = ref(1);
                const mobileTab = ref('saisie');
                const showAdvanced = ref(false);
                const agentDropdownOpen = ref(false);
                const saving = ref(false);

                // Data State
                const dbAgents = ref([]);
                const dbVehicles = ref([]);
                const uniqueReferences = ref([]);
                const pendingCount = ref(0);
                
                // Local Storage State
                const dailyTransactions = ref(JSON.parse(localStorage.getItem('dailyTransactions')) || []);
                const dailyExpenses = ref(JSON.parse(localStorage.getItem('dailyExpenses')) || []);
                const mobileTransactions = ref(JSON.parse(localStorage.getItem('mobile_dailyTransactions')) || []);
                const mobileExpenses = ref(JSON.parse(localStorage.getItem('mobile_dailyDepenses')) || []);

                // Forms
                const defaultDate = new Date().toISOString().split('T')[0];
                const dForm = reactive({
                    date: defaultDate, reference: '', nom: '', conteneur: '', prix: null,
                    montantParis: null, montantAbidjan: null, modePaiement: 'Espèce',
                    agentMobileMoney: '', banque: '', commune: '', agents: [],
                    adjustmentType: '', adjustmentVal: null, waiveStorageFee: false, isNewAdjustment: false
                });
                
                const dExpForm = reactive({ desc: '', vehicleId: '', amount: null });
                
                const mForm = reactive({
                    reference: '', nom: '', conteneur: '', prix: null,
                    montant: null, mode: 'Espèce', agentRecepteur: '',
                    baseReste: 0, waiveStorageFee: false, adjustmentType: '', adjustmentVal: null, isNewAdjustment: false
                });
                
                const mExpForm = reactive({ motif: '', montant: null });

                let unsubs = [];

                // Helper: Format CFA
                const formatCFA = (n) => formatMoney(n, true);

                // Magasinage : calcul centralisé importé (services/storageFee.js).

                // --- COMPUTED ---
                const dFormReste = computed(() => {
                    let p = dForm.prix || 0;
                    if (dForm.adjustmentType === 'reduction' && dForm.adjustmentVal > 0) p -= dForm.adjustmentVal;
                    else if (dForm.adjustmentType === 'augmentation' && dForm.adjustmentVal > 0) p += dForm.adjustmentVal;
                    return (dForm.montantParis || 0) + (dForm.montantAbidjan || 0) - p;
                });

                const mFormReste = computed(() => {
                    return (mForm.baseReste || 0) + (mForm.montant || 0);
                });

                const dTotals = computed(() => {
                    let abidjanEsp = 0, paris = 0, reste = 0, expenses = 0;
                    const breakdown = {};
                    dailyTransactions.value.forEach(t => {
                        const mode = t.modePaiement || 'Espèce';
                        const amt = (t.montantAbidjan || 0) + (t.montantParis || 0);
                        breakdown[mode] = (breakdown[mode] || 0) + amt;
                        if (mode === 'Espèce') abidjanEsp += (t.montantAbidjan || 0);
                        paris += (t.montantParis || 0);
                        reste += (t.reste || 0);
                    });
                    dailyExpenses.value.forEach(e => expenses += e.montant);
                    return { abidjanEsp, paris, reste, expenses, netToPay: abidjanEsp - expenses, breakdown };
                });

                const mTotals = computed(() => {
                    let tIn = 0, tOut = 0;
                    mobileTransactions.value.forEach(t => tIn += t.montant);
                    mobileExpenses.value.forEach(e => tOut += e.montant);
                    return { totalIn: tIn, totalOut: tOut, net: tIn - tOut };
                });

                // Ferme la liste déroulante des agents si on clique en dehors.
                const onDocClickAgents = (e) => { if (!e.target.closest('.agent-select')) agentDropdownOpen.value = false; };

                // --- FIREBASE LISTENERS ---
                onMounted(() => {
                    window.addEventListener('resize', () => isMobile.value = window.innerWidth <= 768);
                    document.addEventListener('click', onDocClickAgents);

                    // Agents
                    unsubs.push(onSnapshot(query(collection(db, "agents"), orderBy("name")), snap => {
                        if (snap.empty) {
                            const defaults = ["Adboul Paris", "Ali Paris", "AZIZ", "Bakary Paris", "Cesar", "Cheick Paris", "Lauraine", "Demba Paris", "Drissa Paris", "JB", "Julien"];
                            const batch = writeBatch(db);
                            defaults.forEach(name => batch.set(doc(collection(db, "agents")), { name }));
                            batch.commit();
                        } else {
                            dbAgents.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        }
                    }));

                    // Vehicules
                    unsubs.push(onSnapshot(query(collection(db, "fleet_vehicles"), where("isDeleted", "!=", true)), snap => {
                        dbVehicles.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    }));

                    // (Badge "sessions non confirmées" géré globalement par app.js
                    //  initPendingSessionsBadge — visible sur « Confirmation » et le
                    //  titre « Entrées Caisse », quelle que soit la page ouverte.)

                    // Unique references for datalist
                    unsubs.push(onSnapshot(query(collection(db, getCollectionName("transactions")), where("isDeleted", "!=", true), orderBy("isDeleted"), orderBy("date", "desc")), snap => {
                        const refs = new Set();
                        snap.forEach(d => { const dd = d.data(); if (dd.reference && matchesShippingMode(dd)) refs.add(dd.reference); });
                        uniqueReferences.value = Array.from(refs);
                    }));
                    
                    // Restauration du bouton retour en haut
                    if (typeof window.initBackToTopButton === 'function') window.initBackToTopButton();
                });

                onUnmounted(() => { unsubs.forEach(u => u()); document.removeEventListener('click', onDocClickAgents); });

                // --- LOGIC: DESKTOP ---
                const goToDesktopStep = (step) => {
                    if (step === 2 && (!dForm.date || !dForm.reference.trim())) {
                        return window.AppModal ? window.AppModal.error("Veuillez saisir la Date et la Référence.") : alert("Veuillez saisir la Date et la Référence.");
                    }
                    desktopStep.value = step;
                };

                const addNewAgent = async () => {
                    const newName = window.AppModal ? await window.AppModal.prompt("Nom du nouvel agent :", "", "Nouvel Agent") : prompt("Nom du nouvel agent :");
                    if (newName && newName.trim()) {
                        await addDoc(collection(db, "agents"), { name: newName.trim() });
                        if (!dForm.agents.includes(newName.trim())) dForm.agents.push(newName.trim());
                        if (window.AppModal) window.AppModal.success("Agent ajouté !");
                    }
                };

                const onDesktopRefChange = async () => {
                    const ref = dForm.reference.trim().toUpperCase();
                    dForm.waiveStorageFee = false; dForm.isNewAdjustment = false;
                    if (!ref) { resetDesktopForm(true); return; }

                    const localItem = dailyTransactions.value.filter(t => t.reference === ref).reduce((prev, curr) => (prev && prev.prix > curr.prix) ? prev : curr, null);
                    if (localItem) {
                        const tPaid = dailyTransactions.value.filter(t => t.reference === ref).reduce((sum, t) => sum + t.montantParis + t.montantAbidjan, 0);
                        dForm.nom = localItem.nom; dForm.conteneur = localItem.conteneur;
                        // On facture le RELIQUAT restant (prix - déjà saisi dans la
                        // journée). Mettre 0 affichait "soldé" à tort et bloquait la
                        // 2e saisie ("Trop perçu"). saveDay agrège via le prix de la
                        // transaction, donc ce prix "reliquat" ne fausse pas le total.
                        dForm.prix = Math.max(0, (localItem.prix || 0) - tPaid); dForm.baseReste = 0;
                        return;
                    }

                    let qT = await getDocs(query(collection(db, getCollectionName("transactions")), where("reference", "==", ref)));
                    if (qT.empty) qT = await getDocs(query(collection(db, getCollectionName("transactions")), where("nom", "==", ref)));
                    
                    if (!qT.empty) {
                        if (qT.size > 1) { if(window.AppModal) window.AppModal.error("Plusieurs résultats."); return; }
                        const data = qT.docs[0].data();
                        if (!matchesShippingMode(data)) {
                            if (window.AppModal) window.AppModal.error(isAerienMode() ? "Ce colis est MARITIME — basculez en mode 🚢 pour l'encaisser." : "Ce colis est AÉRIEN — basculez en mode ✈️ pour l'encaisser.");
                            dForm.reference = '';
                            return;
                        }
                        let effectivePrix = data.prix || 0;
                        if (data.adjustmentType === 'reduction') effectivePrix -= (data.adjustmentVal || 0);
                        const reste = ((data.montantParis || 0) + (data.montantAbidjan || 0)) - effectivePrix;

                        if (reste < 0 && !data.storageFeeWaived && data.adjustmentType !== 'augmentation') {
                            // Magasinage basé sur la livraison liée (date d'ENTRÉE
                            // EN ENTREPÔT + quantité de colis), comme Livraison/
                            // facture/Magasinage — pas la date/quantité de la transaction.
                            let feeDate = data.date;
                            let livData = null;
                            try {
                                const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", ref), limit(1)));
                                if (!livQ.empty) { livData = livQ.docs[0].data(); if (livData.dateAjout) feeDate = livData.dateAjout; }
                            } catch (e) {}
                            const { fee } = calculateStorageFee(feeDate, livData || data);
                            if (fee > 0) {
                                const res = window.AppModal ? await window.AppModal.prompt(`⚠️ MAGASINAGE : ${formatCFA(fee)}. Montant à appliquer (0 pour offrir) :`, fee) : prompt(`Magasinage ${fee}. Appliquer :`, fee);
                                if (res === null) { dForm.reference = ''; return; }
                                const amt = parseFloat(res);
                                if (amt === 0) { dForm.waiveStorageFee = true; }
                                else if (amt > 0) { dForm.adjustmentType = 'augmentation'; dForm.adjustmentVal = amt; dForm.isNewAdjustment = true; effectivePrix += amt; }
                            }
                        }
                        dForm.nom = data.nomDestinataire || data.nom || ''; dForm.conteneur = data.conteneur || '';
                        // On affiche/valide le RELIQUAT (prix attendu − déjà payé sur ce
                        // colis lors d'une session précédente). Sinon une 2e saisie cross-
                        // session affichait le prix plein au lieu du reste dû. saveDay
                        // ignore ce prix pour une transaction existante (il agrège via
                        // oldData.prix), donc ce reliquat ne fausse pas le total.
                        const paidBefore = (data.montantParis || 0) + (data.montantAbidjan || 0);
                        if (dForm.isNewAdjustment && dForm.adjustmentType === 'augmentation') {
                            // Magasinage ajouté à l'instant : le prix exclut le magasinage
                            // (réappliqué par dFormReste/addDesktop via l'ajustement).
                            dForm.prix = Math.max(0, effectivePrix - (dForm.adjustmentVal || 0) - paidBefore);
                        } else {
                            dForm.prix = Math.max(0, effectivePrix - paidBefore);
                        }
                        dForm.modePaiement = data.modePaiement || 'Espèce';
                        if (data.agentMobileMoney && ['Virement', 'Chèque'].includes(dForm.modePaiement)) dForm.banque = data.agentMobileMoney;
                    } else {
                        const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", ref), limit(1)));
                        if (!livQ.empty) {
                            const lData = livQ.docs[0].data();
                            if (!matchesShippingMode(lData)) {
                                if (window.AppModal) window.AppModal.error(isAerienMode() ? "Ce colis est MARITIME — basculez en mode 🚢." : "Ce colis est AÉRIEN — basculez en mode ✈️.");
                                dForm.reference = '';
                                return;
                            }
                            dForm.nom = lData.destinataire || lData.expediteur || '';
                            dForm.conteneur = lData.conteneur || '';
                            dForm.prix = parseFloat(String(lData.prixOriginal || lData.montant || '0').replace(/[^\d]/g, '')) || 0;
                        }
                    }
                };

                const addDesktopTransaction = () => {
                    if (!dForm.date || !dForm.reference) return window.AppModal ? window.AppModal.error("Date et Réf obligatoires.") : alert("Erreur");
                    
                    let info = dForm.agentMobileMoney;
                    if (['Virement', 'Chèque'].includes(dForm.modePaiement)) {
                        info = dForm.banque;
                        if (!info) return window.AppModal ? window.AppModal.error("Sélectionnez une Banque.") : alert("Banque obligatoire.");
                    }

                    let effective = dForm.prix || 0;
                    if (dForm.adjustmentType === 'reduction') effective -= (dForm.adjustmentVal || 0);
                    else if (dForm.adjustmentType === 'augmentation' && dForm.isNewAdjustment) effective += (dForm.adjustmentVal || 0);
                    
                    const totPaye = (dForm.montantParis || 0) + (dForm.montantAbidjan || 0);
                    if (totPaye > effective) return window.AppModal ? window.AppModal.error("Trop perçu.") : alert("Trop perçu.");

                    dailyTransactions.value.push({
                        date: dForm.date, reference: dForm.reference, nom: dForm.nom, conteneur: dForm.conteneur.toUpperCase(),
                        prix: dForm.prix || 0, montantParis: dForm.montantParis || 0, montantAbidjan: dForm.montantAbidjan || 0,
                        modePaiement: dForm.modePaiement, agentMobileMoney: info, commune: dForm.commune, agent: dForm.agents.join(', '),
                        adjustmentType: dForm.adjustmentType, adjustmentVal: dForm.adjustmentVal || 0,
                        waiveStorageFee: dForm.waiveStorageFee, isNewAdjustment: dForm.isNewAdjustment,
                        reste: totPaye - effective
                    });

                    saveLocalStorage();
                    resetDesktopForm(false);
                    goToDesktopStep(1);
                };

                const removeDesktopTransaction = (idx) => { dailyTransactions.value.splice(idx, 1); saveLocalStorage(); };
                
                const addDesktopExpense = () => {
                    if (!dExpForm.desc || !dExpForm.amount) return;
                    const selV = dbVehicles.value.find(v => v.id === dExpForm.vehicleId);
                    dailyExpenses.value.push({
                        date: dForm.date, description: dExpForm.desc, montant: dExpForm.amount,
                        conteneur: '', vehicleId: dExpForm.vehicleId, vehicleName: selV ? `${selV.name} (${selV.plate})` : ''
                    });
                    dExpForm.desc = ''; dExpForm.amount = null; dExpForm.vehicleId = '';
                    saveLocalStorage();
                };

                const removeDesktopExpense = (idx) => { dailyExpenses.value.splice(idx, 1); saveLocalStorage(); };

                const resetDesktopForm = (keepRef) => {
                    if (!keepRef) dForm.reference = '';
                    dForm.nom = ''; dForm.conteneur = ''; dForm.prix = null; dForm.montantParis = null; dForm.montantAbidjan = null;
                    dForm.agentMobileMoney = ''; dForm.banque = ''; dForm.commune = ''; dForm.agents = [];
                    dForm.adjustmentType = ''; dForm.adjustmentVal = null; dForm.waiveStorageFee = false; dForm.isNewAdjustment = false;
                };

                // --- LOGIC: MOBILE ---
                const onMobileRefChange = async () => {
                    const ref = mForm.reference.trim().toUpperCase();
                    mForm.waiveStorageFee = false; mForm.isNewAdjustment = false; mForm.adjustmentType = ''; mForm.adjustmentVal = 0;
                    if (!ref) { mForm.nom = ''; mForm.conteneur = ''; mForm.prix = null; mForm.baseReste = 0; mForm.montant = null; return; }

                    const localItem = mobileTransactions.value.filter(t => t.reference === ref).reduce((prev, curr) => (prev && prev.prix > curr.prix) ? prev : curr, null);
                    if (localItem) {
                        const tPaid = mobileTransactions.value.filter(t => t.reference === ref).reduce((sum, t) => sum + t.montant, 0);
                        mForm.nom = localItem.nom; mForm.conteneur = localItem.conteneur; mForm.prix = localItem.prix;
                        mForm.baseReste = localItem.baseReste + tPaid;
                        mForm.montant = Math.abs(mForm.baseReste);
                        return;
                    }

                    let qT = await getDocs(query(collection(db, getCollectionName("transactions")), where("reference", "==", ref)));
                    if (!qT.empty) {
                        const data = qT.docs[0].data();
                        if (!matchesShippingMode(data)) {
                            if (window.AppModal) window.AppModal.error(isAerienMode() ? "Ce colis est MARITIME — basculez en mode 🚢 pour l'encaisser." : "Ce colis est AÉRIEN — basculez en mode ✈️ pour l'encaisser.");
                            mForm.reference = '';
                            return;
                        }
                        let effectivePrix = data.prix || 0;
                        if (data.adjustmentType === 'reduction') effectivePrix -= (data.adjustmentVal || 0);
                        let reste = ((data.montantParis || 0) + (data.montantAbidjan || 0)) - effectivePrix;

                        if (reste < 0 && !data.storageFeeWaived && data.adjustmentType !== 'augmentation') {
                            // Magasinage basé sur la livraison liée (date d'ENTRÉE
                            // EN ENTREPÔT + quantité de colis), comme Livraison/facture.
                            let feeDate = data.date;
                            let livData = null;
                            try {
                                const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", ref), limit(1)));
                                if (!livQ.empty) { livData = livQ.docs[0].data(); if (livData.dateAjout) feeDate = livData.dateAjout; }
                            } catch (e) {}
                            const { fee } = calculateStorageFee(feeDate, livData || data);
                            if (fee > 0) {
                                const res = window.AppModal ? await window.AppModal.prompt(`⚠️ MAGASINAGE : ${fee} CFA\nMontant à appliquer (0 pour offrir) :`, fee) : prompt(`Magasinage ${fee}. Appliquer :`, fee);
                                if (res !== null) {
                                    const amt = parseFloat(res) || 0;
                                    if (amt > 0) { mForm.adjustmentType = 'augmentation'; mForm.adjustmentVal = amt; mForm.isNewAdjustment = true; effectivePrix += amt; reste -= amt; }
                                    else if (amt === 0) { mForm.waiveStorageFee = true; }
                                }
                            }
                        }
                        mForm.nom = data.nomDestinataire || data.nom || ''; mForm.conteneur = data.conteneur || '';
                        mForm.prix = effectivePrix; mForm.baseReste = reste; mForm.montant = Math.abs(reste);
                    } else {
                        const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", ref), limit(1)));
                        if (!livQ.empty) {
                            const lData = livQ.docs[0].data();
                            if (!matchesShippingMode(lData)) {
                                if (window.AppModal) window.AppModal.error(isAerienMode() ? "Ce colis est MARITIME — basculez en mode 🚢." : "Ce colis est AÉRIEN — basculez en mode ✈️.");
                                mForm.reference = '';
                                return;
                            }
                            mForm.nom = lData.destinataire || lData.expediteur || ''; mForm.conteneur = lData.conteneur || '';
                            let price = parseFloat(String(lData.prixOriginal || lData.montant || '0').replace(/[^\d]/g, '')) || 0;
                            mForm.prix = price; mForm.baseReste = -price; mForm.montant = price;
                        }
                    }
                };

                const addMobileTransaction = () => {
                    if (!mForm.reference || !mForm.montant || mForm.montant < 0) return window.AppModal ? window.AppModal.error("Réf et Montant valides requis.") : alert("Erreur");
                    if (mForm.mode !== 'Espèce' && !mForm.agentRecepteur) return window.AppModal ? window.AppModal.error("Agent requis pour ce mode.") : alert("Agent requis.");
                    
                    mobileTransactions.value.push({
                        reference: mForm.reference.toUpperCase(), montant: mForm.montant, mode: mForm.mode,
                        nom: mForm.nom || 'Client', conteneur: mForm.conteneur, prix: mForm.prix || mForm.montant,
                        baseReste: mForm.baseReste, agentRecepteur: mForm.mode !== 'Espèce' ? mForm.agentRecepteur : '',
                        adjustmentType: mForm.adjustmentType, adjustmentVal: mForm.adjustmentVal, isNewAdjustment: mForm.isNewAdjustment,
                        waiveStorageFee: mForm.waiveStorageFee
                    });
                    mForm.reference = ''; mForm.nom = ''; mForm.conteneur = ''; mForm.prix = null; mForm.montant = null; mForm.baseReste = 0; mForm.agentRecepteur = '';
                    saveLocalStorage();
                };

                const removeMobileTransaction = (idx) => { mobileTransactions.value.splice(idx, 1); saveLocalStorage(); };
                const editMobileTransaction = (idx) => {
                    const t = mobileTransactions.value[idx];
                    mForm.reference = t.reference; mForm.nom = t.nom; mForm.conteneur = t.conteneur; mForm.prix = t.prix;
                    mForm.montant = t.montant; mForm.mode = t.mode; mForm.agentRecepteur = t.agentRecepteur;
                    mForm.baseReste = t.baseReste; mForm.adjustmentType = t.adjustmentType; mForm.adjustmentVal = t.adjustmentVal;
                    mForm.isNewAdjustment = t.isNewAdjustment; mForm.waiveStorageFee = t.waiveStorageFee;
                    mobileTransactions.value.splice(idx, 1);
                    mobileTab.value = 'saisie';
                    saveLocalStorage();
                };
                const addMobileExpense = () => {
                    if (!mExpForm.motif || !mExpForm.montant) return;
                    mobileExpenses.value.push({ motif: mExpForm.motif, montant: mExpForm.montant });
                    mExpForm.motif = ''; mExpForm.montant = null;
                    saveLocalStorage();
                };
                const removeMobileExpense = (idx) => { mobileExpenses.value.splice(idx, 1); saveLocalStorage(); };

                const saveLocalStorage = () => {
                    localStorage.setItem('dailyTransactions', JSON.stringify(dailyTransactions.value));
                    localStorage.setItem('dailyExpenses', JSON.stringify(dailyExpenses.value));
                    localStorage.setItem('mobile_dailyTransactions', JSON.stringify(mobileTransactions.value));
                    localStorage.setItem('mobile_dailyDepenses', JSON.stringify(mobileExpenses.value));
                };

                // --- BATCH SAVING (Desktop & Mobile) ---
                const saveDay = async (source) => {
                    const isMob = source === 'mobile';
                    const transList = isMob ? mobileTransactions.value : dailyTransactions.value;
                    const expList = isMob ? mobileExpenses.value : dailyExpenses.value;
                    
                    if (transList.length === 0 && expList.length === 0) return window.AppModal ? window.AppModal.error("Rien à valider.") : alert("Vide");
                    if (window.AppModal) { if (!await window.AppModal.confirm("Valider la journée et envoyer à la base de données ?")) return; }
                    else { if (!confirm("Valider ?")) return; }

                    saving.value = true;
                    const dateStr = dForm.date || new Date().toISOString().split('T')[0];
                    
                    try {
                        const batch = writeBatch(db);
                        const auditRef = doc(collection(db, "audit_logs"));
                        const sessionId = auditRef.id;
                        const touchedTransIds = []; const touchedExpIds = [];
                        
                        let totalIn = 0, totalOut = 0, espIn = 0;
                        const grpTrans = {};
                        
                        transList.forEach(t => {
                            const amt = isMob ? t.montant : (t.montantParis + t.montantAbidjan);
                            totalIn += amt;
                            if (isMob ? t.mode === 'Espèce' : t.modePaiement === 'Espèce') espIn += isMob ? t.montant : t.montantAbidjan;
                            if (!grpTrans[t.reference]) grpTrans[t.reference] = [];
                            grpTrans[t.reference].push(t);
                        });
                        
                        for (const ref of Object.keys(grpTrans)) {
                            const group = grpTrans[ref];
                            const baseT = group[0];
                            const gAbidjan = group.reduce((sum, t) => sum + (isMob ? t.montant : t.montantAbidjan), 0);
                            const gParis = isMob ? 0 : group.reduce((sum, t) => sum + t.montantParis, 0);
                            
                            const newPayments = group.map(t => ({
                                date: dateStr, montantParis: isMob ? 0 : t.montantParis, montantAbidjan: isMob ? t.montant : t.montantAbidjan,
                                agent: isMob ? currentUserName : t.agent, saisiPar: currentUserName, modePaiement: isMob ? t.mode : t.modePaiement,
                                agentMobileMoney: isMob ? t.agentRecepteur : t.agentMobileMoney, sessionId: sessionId
                            }));

                            const qT = await getDocs(query(collection(db, getCollectionName("transactions")), where("reference", "==", ref)));
                            if (!qT.empty) {
                                const docRef = qT.docs[0].ref;
                                const oldData = qT.docs[0].data();
                                const lastT = group[group.length - 1];
                                
                                let finalPrix = oldData.prix || 0;
                                let fAdjType = lastT.adjustmentType || oldData.adjustmentType;
                                let fAdjVal = lastT.adjustmentVal || oldData.adjustmentVal || 0;
                                
                                const augmItem = group.find(t => t.isNewAdjustment && t.adjustmentType === 'augmentation');
                                if (augmItem) finalPrix += augmItem.adjustmentVal;
                                let effective = finalPrix;
                                if (fAdjType === 'reduction') effective -= fAdjVal;
                                
                                const nParis = (oldData.montantParis || 0) + gParis;
                                const nAbj = (oldData.montantAbidjan || 0) + gAbidjan;
                                
                                const updates = { montantParis: nParis, montantAbidjan: nAbj, reste: nParis + nAbj - effective, paymentHistory: arrayUnion(...newPayments), lastPaymentDate: dateStr, saisiPar: currentUserName, isDeleted: false, modePaiement: isMob ? baseT.mode : baseT.modePaiement };
                                
                                if (augmItem) { updates.prix = finalPrix; updates.adjustmentType = 'augmentation'; updates.adjustmentVal = augmItem.adjustmentVal; }
                                else if (lastT.adjustmentType) { updates.adjustmentType = fAdjType; updates.adjustmentVal = fAdjVal; }
                                
                                if (!isMob) {
                                    const combAgents = [...new Set([...(oldData.agent||"").split(','), ...group.map(t=>t.agent).join(',').split(',')])].map(a=>a.trim()).filter(Boolean).join(', ');
                                    updates.agent = combAgents;
                                    if (lastT.commune) updates.commune = lastT.commune;
                                    if (lastT.agentMobileMoney) updates.agentMobileMoney = lastT.agentMobileMoney;
                                } else {
                                    if (baseT.agentRecepteur) updates.agentMobileMoney = baseT.agentRecepteur;
                                }
                                if (group.some(t => t.waiveStorageFee)) updates.storageFeeWaived = true;
                                
                                batch.update(docRef, updates);
                                touchedTransIds.push(docRef.id);
                            } else {
                                // FILET DE SÉCURITÉ : aucune facture pour cette référence.
                                // Normalement TOUTE facture naît dans « Nouvelle facture ».
                                // On crée donc une transaction « de secours » (encaissement
                                // d'un colis sans facture) MARQUÉE source:'caisse_secours'
                                // pour pouvoir la repérer/auditer. (Cas voué à disparaître
                                // quand l'agence de départ créera toutes les factures.)
                                const docRef = doc(collection(db, getCollectionName("transactions")));
                                let effective = baseT.prix;
                                if (baseT.adjustmentType === 'reduction') effective -= baseT.adjustmentVal;

                                batch.set(docRef, {
                                    date: dateStr, reference: ref, nom: baseT.nom || 'Client', conteneur: baseT.conteneur || '',
                                    prix: baseT.prix, montantParis: gParis, montantAbidjan: gAbidjan, reste: gParis + gAbidjan - effective,
                                    agency: activeAgency, agent: isMob ? currentUserName : [...new Set(group.map(t=>t.agent).join(',').split(',').map(a=>a.trim()).filter(Boolean))].join(', '),
                                    isDeleted: false, saisiPar: currentUserName, modePaiement: isMob ? baseT.mode : baseT.modePaiement,
                                    agentMobileMoney: isMob ? baseT.agentRecepteur : baseT.agentMobileMoney, paymentHistory: newPayments, lastPaymentDate: dateStr,
                                    storageFeeWaived: group.some(t => t.waiveStorageFee),
                                    source: 'caisse_secours'
                                });
                                touchedTransIds.push(docRef.id);
                            }

                            // Sync Livraisons
                            const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", ref), limit(1)));
                            if (!livQ.empty) {
                                const lData = livQ.docs[0].data();
                                const lUpdates = {};
                                if (baseT.conteneur && baseT.conteneur !== lData.conteneur) lUpdates.conteneur = baseT.conteneur;
                                if (baseT.nom && baseT.nom !== lData.destinataire) lUpdates.destinataire = baseT.nom;
                                if (Object.keys(lUpdates).length > 0) batch.update(livQ.docs[0].ref, lUpdates);
                            } else {
                                batch.set(doc(collection(db, getCollectionName("livraisons"))), {
                                    ref, agency: activeAgency, destinataire: baseT.nom || 'Client', expediteur: '', conteneur: baseT.conteneur || '',
                                    containerStatus: 'EN_COURS', status: 'EN_ATTENTE', dateAjout: dateStr, quantite: 1, montant: (baseT.prix||0)+' CFA', numero: baseT.numero||'', description: 'Créé via Caisse'
                                });
                            }
                        }
                        
                        expList.forEach(e => {
                            totalOut += e.montant;
                            const docRef = doc(collection(db, getCollectionName("expenses")));
                            batch.set(docRef, {
                                date: dateStr, description: `${isMob ? e.motif : e.description} (${currentUserName})`, montant: e.montant,
                                agency: activeAgency, type: (!isMob && e.conteneur) ? 'Conteneur' : 'Mensuelle', mode: 'Espèce', isDeleted: false, sessionId,
                                conteneur: isMob ? '' : (e.conteneur||''), vehicleId: isMob ? '' : (e.vehicleId||''), vehicleName: isMob ? '' : (e.vehicleName||'')
                            });
                            touchedExpIds.push(docRef.id);
                        });
                        
                        const agentsStr = isMob ? currentUserName : Array.from(new Set(transList.flatMap(t => t.agent.split(',').map(a => a.trim()).filter(Boolean)))).join(', ');
                        const dls = isMob ? `Mobile | Enc: ${transList.length}, Dep: ${expList.length}` : `Desktop | Enc: ${transList.length}, Dep: ${expList.length} | Esp: ${espIn}`;
                        
                        batch.set(auditRef, {
                            date: new Date().toISOString(), entryDate: dateStr, user: currentUserName, agency: activeAgency, action: "VALIDATION_JOURNEE",
                            details: dls, targetId: isMob ? "BATCH_MOBILE" : "BATCH", status: "PENDING", transactionIds: touchedTransIds, expenseIds: touchedExpIds,
                            agents: agentsStr, totalIn: espIn, totalGlobalIn: totalIn, totalOut: totalOut, result: espIn - totalOut,
                            // Tag mode d'expedition (Maritime/Aerien). Anciens
                            // logs sans ce champ = maritime (regle legacy).
                            modeExpedition: getShippingMode()
                        });
                        
                        await batch.commit();
                        
                        // WhatsApp Message Builder
                        let waMsg = `*BILAN ${isMob ? 'LIVREUR' : 'JOURNÉE'} DU ${dateStr.split('-').reverse().join('/')}*\n👤 *${currentUserName}*\n\n`;
                        if (transList.length > 0) {
                            waMsg += `📦 *ENCAISSEMENTS :*\n`;
                            transList.forEach(t => {
                                const refNom = `${t.reference} ${t.nom ? '('+t.nom+')' : ''}`;
                                if (isMob) waMsg += `- ${refNom} : ${formatCFA(t.montant)} [${t.mode}]${t.agentRecepteur ? ' (Reçu par: '+t.agentRecepteur+')' : ''}\n`;
                                else waMsg += `🔹 ${refNom}\n   ${t.commune ? '📍 '+t.commune+'\n' : ''}   💰 ${t.montantAbidjan>0 ? formatCFA(t.montantAbidjan) : '0 F'} [${t.modePaiement}]${t.montantParis>0 ? ' (+ Paris: '+formatCFA(t.montantParis)+')' : ''} ${t.agentMobileMoney ? 'ℹ️ '+t.agentMobileMoney : ''}\n`;
                            });
                        }
                        if (expList.length > 0) {
                            waMsg += `\n📉 *DÉPENSES (${formatCFA(totalOut)}) :*\n`;
                            expList.forEach(e => { waMsg += `- ${isMob ? e.motif : e.description} : ${formatCFA(e.montant)}\n`; });
                        }
                        waMsg += `\n💵 *NET À VERSER : ${formatCFA(espIn - totalOut)}*`;
                        
                        if (isMob) { mobileTransactions.value = []; mobileExpenses.value = []; }
                        else { dailyTransactions.value = []; dailyExpenses.value = []; }
                        saveLocalStorage();
                        
                        if (window.AppModal) await window.AppModal.success("Journée validée !"); else alert("Validé !");
                        if (window.AppModal ? await window.AppModal.confirm("Envoyer le bilan WhatsApp ?") : confirm("Envoyer WhatsApp ?")) {
                            window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, '_blank');
                        }
                        
                    } catch(e) {
                        console.error(e);
                        if (window.AppModal) window.AppModal.error(e.code === 'resource-exhausted' ? "Quota Firebase atteint." : e.message); else alert(e.message);
                    } finally {
                        saving.value = false;
                    }
                };
                
                // --- RESTAURATION : Utilitaire de réparation des calculs ---
                window.reparerCalculsFinanciers = async function() {
                    if (!confirm("Voulez-vous recalculer tous les montants et restes de la base de données pour corriger les doublons ?")) return;
                    
                    try {
                        const _trCol = getCollectionName("transactions");
                        const _trConstraints = [where("isDeleted", "!=", true)];
                        if (_trCol === "transactions") _trConstraints.push(where("agency", "==", activeAgency));
                        const transSnap = await getDocs(query(collection(db, _trCol), ..._trConstraints));
                        let batch = writeBatch(db);
                        let count = 0;
                        
                        transSnap.forEach(docSnap => {
                            const t = docSnap.data();
                            if (t.paymentHistory && t.paymentHistory.length > 0) {
                                const vraiAbidjan = t.paymentHistory.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                                const vraiParis = t.paymentHistory.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                                
                                let effectivePrix = t.prix || 0;
                                if (t.adjustmentType === 'reduction') effectivePrix -= (t.adjustmentVal || 0);
                                if (t.adjustmentType === 'augmentation') effectivePrix += (t.adjustmentVal || 0);
                                
                                const vraiReste = (vraiAbidjan + vraiParis) - effectivePrix;
                                
                                if (t.montantAbidjan !== vraiAbidjan || t.reste !== vraiReste) {
                                    batch.update(docSnap.ref, { montantAbidjan: vraiAbidjan, montantParis: vraiParis, reste: vraiReste });
                                    count++;
                                }
                            }
                        });
                        
                        if (count > 0) {
                            await batch.commit();
                            alert(`✅ Réparation terminée : ${count} transactions ont été corrigées (Montants doublés effacés).`);
                        } else {
                            alert("👍 Tout est déjà correct, aucune erreur trouvée.");
                        }
                    } catch (e) {
                        console.error(e);
                        alert("Erreur lors de la réparation : " + e.message);
                    }
                };

                return {
                    isMobile, desktopStep, mobileTab, showAdvanced, saving, pendingCount,
                    dForm, dExpForm, mForm, mExpForm, dbAgents, dbVehicles, uniqueReferences,
                    dailyTransactions, dailyExpenses, mobileTransactions, mobileExpenses,
                    dFormReste, mFormReste, dTotals, mTotals, formatCFA,
                    goToDesktopStep, addNewAgent, agentDropdownOpen, onDesktopRefChange, addDesktopTransaction, removeDesktopTransaction, addDesktopExpense, removeDesktopExpense,
                    onMobileRefChange, addMobileTransaction, removeMobileTransaction, editMobileTransaction, addMobileExpense, removeMobileExpense,
                    saveDay
                };
            }
        });
        
        this.vueApp.mount('#vue-caisse-app');
    }
};
