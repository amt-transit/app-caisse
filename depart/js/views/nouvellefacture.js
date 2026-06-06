import { db } from '../../../commun/firebase-config.js';
import { collection, doc, writeBatch, getDocs, query, where, limit, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../../commun/constants.js';
import { createApp, ref, reactive, computed, onMounted, watch, nextTick } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName, AGENCIES } from '../../../commun/agencies-config.js';
import { Autocomplete } from './autocomplete.js';
import { isAffiliationActive } from '../../../commun/affiliation-config.js';
import { getAffiliation, ensureAffiliation, creerCommissionParrainage } from '../../../commun/affiliations.js';
import { toE164Intl, toE164Detect, phoneTail, routePhoneCountries } from '../../../commun/services/phone.js';

export const NouvelleFactureView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.nouvelleFacture = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .nf-item-grid {
                    display: grid;
                    grid-template-columns: 2fr 0.6fr 1fr 1fr auto;
                    gap: 10px;
                }
                @media (max-width: 768px) {
                    .nf-item-grid {
                        grid-template-columns: 1fr 1fr;
                        gap: 15px;
                    }
                    .nf-item-grid .nf-desc-col { grid-column: 1 / -1; }
                    .nf-item-grid .nf-total-col { grid-column: 1; }
                    .nf-item-grid .nf-action-col {
                        grid-column: 2;
                        display: flex;
                        align-items: flex-end;
                    }
                    .nf-item-grid input {
                        padding: 12px !important;
                        font-size: 15px !important;
                    }
                    .nf-item-grid .item-qty { font-size: 18px !important; font-weight: bold; }
                }
            </style>
            <div id="vue-nouvellefacture-app" style="max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;" v-cloak>
                
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 25px; background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">
                            <i class="fas fa-file-invoice"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px;">Nouvelle Facture / Envoi</h2>
                            <p style="margin: 0; color: #64748b; font-size: 13px;">Créer une nouvelle expédition depuis Paris</p>
                        </div>
                    </div>
                    <div id="nfActiveContainerBadge" style="padding: 10px 20px; background: #e0f2fe; color: #0369a1; border: 2px solid #bae6fd; border-radius: 12px; font-weight: 900; font-size: 20px; box-shadow: 0 2px 4px rgba(3,105,161,0.1); display: flex; align-items: center; gap: 10px;" title="Conteneur Actif">
                        <i v-if="!currentContainer && !currentAerienLot" class="fas fa-spinner fa-spin"></i>
                        <span v-else>{{ shippingMode === 'aerien' ? '✈️' : '📦' }} {{ groupingCode }}</span>
                    </div>
                </div>

                <!-- 1. INFO GÉNÉRALES -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-calendar-alt text-blue-500"></i> Informations générales</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" id="nfDate" v-model="form.date">
                        </div>
                        <div class="form-group">
                            <label>Type</label>
                            <select id="nfType" v-model="form.type">
                                <option value="FACTURE">FACTURE</option>
                                <option value="DEVIS">DEVIS</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Agence destination *</label>
                            <select id="nfAgence" v-model="form.agence" required>
                                <option value="">— Choisir une destination —</option>
                                <option v-for="a in destinationAgencies" :key="a.id" :value="a.id">{{ a.flag }} {{ a.name }}</option>
                            </select>
                            <small v-if="destinationAgencies.length === 0" style="color:#ef4444; font-size:11px;">
                                Aucune destination configurée pour cette agence. Ajoutez-en une dans « Gestion des agences ».
                            </small>
                        </div>
                        <div class="form-group" v-if="shippingMode === 'aerien'">
                            <label>Mode d'envoi (aérien) *</label>
                            <select v-model="form.aerienType">
                                <option value="normal">Normal</option>
                                <option value="express">Express</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- 2. CONTACTS -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr)); gap: 20px;">
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-upload text-orange-500"></i> Expéditeur</h3>
                        <div class="form-group">
                            <div style="display:flex; gap:8px; align-items:flex-start;">
                                <div style="position: relative; flex:1;">
                                    <input type="text" id="nfExpediteur" placeholder="Nom, Prénom et Téléphone..." required autocomplete="off"
                                           v-model="form.expediteur"
                                           @input="showExpSugg = true; handleExpediteurChange()"
                                           @focus="showExpSugg = true"
                                           @blur="hideSugg('exp')"
                                           style="width:100%; box-sizing:border-box;">
                                    <ul class="autocomplete-suggestions" v-if="showExpSugg && filteredExpediteurs.length" style="display:block;">
                                        <li v-for="c in filteredExpediteurs" :key="c.nom" @mousedown="selectExp(c)">
                                            <b>{{ c.nom }}</b> <span style="color:#64748b;">— {{ c.tel || 'N/A' }}</span>
                                        </li>
                                    </ul>
                                </div>
                                <button type="button" class="btn btn-outline" @click="openClientModal('exp')" title="Créer un expéditeur" style="padding:10px 14px; white-space:nowrap;"><i class="fas fa-user-plus"></i> Créer</button>
                            </div>
                        </div>
                        <div id="nfExpediteurFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;" v-html="expFeedback"></div>
                    </div>
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-download text-emerald-500"></i> Destinataire</h3>
                        <div class="form-group">
                            <div style="display:flex; gap:8px; align-items:flex-start;">
                                <div style="position: relative; flex:1;">
                                    <input type="text" id="nfDestinataire" placeholder="Nom, Prénom et Téléphone..." required autocomplete="off"
                                           v-model="form.destinataire"
                                           @input="showDestSugg = true; handleDestinataireChange()"
                                           @focus="showDestSugg = true"
                                           @blur="hideSugg('dest')"
                                           style="width:100%; box-sizing:border-box;">
                                    <ul class="autocomplete-suggestions" v-if="showDestSugg && filteredDestinataires.length" style="display:block;">
                                        <li v-for="d in filteredDestinataires" :key="d" @mousedown="selectDest(d)">{{ d }}</li>
                                    </ul>
                                </div>
                                <button type="button" class="btn btn-outline" @click="openClientModal('dest')" title="Créer un destinataire" style="padding:10px 14px; white-space:nowrap;"><i class="fas fa-user-plus"></i> Créer</button>
                            </div>
                        </div>
                        <div id="nfDestinataireFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;" v-html="destFeedback"></div>
                        <div class="form-group" v-if="affiliationActive" style="margin-top: 15px;">
                            <label><i class="fas fa-user-friends" style="color:#d97706;"></i> Parrain (parrainage)</label>
                            <select v-model="form.parrainId" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; background:white;">
                                <option value="">— Aucun parrain —</option>
                                <option v-for="d in demarcheurs" :key="d.id" :value="d.id">{{ d.prenom }} {{ d.nom }}</option>
                            </select>
                            <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Si ce destinataire est déjà affilié, son parrain d'origine est conservé (rattachement permanent).</div>
                        </div>
                        <div class="form-group" style="margin-top: 15px;">
                            <label>Lieu livraison / Adresse complète</label>
                            <div style="position: relative;">
                                <input type="text" id="nfLieu" placeholder="Ex: Cocody Angré 8ème tranche..." autocomplete="off"
                                       v-model="form.lieu"
                                       @focus="showLieuSugg = true"
                                       @blur="hideSugg('lieu')">
                                <ul class="autocomplete-suggestions" v-if="showLieuSugg && filteredLieux.length" style="display:block;">
                                    <li v-for="l in filteredLieux" :key="l" @mousedown="selectLieu(l)">{{ l }}</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. ARTICLES / COLIS -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;"><i class="fas fa-box text-indigo-500"></i> Description colis</h3>
                        <button type="button" class="btn btn-outline btn-small" @click="addRow()"><i class="fas fa-plus"></i> Ajouter ligne</button>
                    </div>

                    <div style="width: 100%;">
                        <div id="nfItemsContainer">
                            <div v-for="(item, idx) in items" :key="item.id" class="nf-item-grid" style="margin-bottom: 12px; align-items: start;">
                                <div class="nf-desc-col" style="position: relative;">
                                    <label v-if="idx === 0" style="font-size:11px; color:#64748b;">Description *</label>
                                    <input type="text" placeholder="Nature du colis / produit..." autocomplete="off"
                                           v-model="item.desc"
                                           @input="item.showSugg = true; updateItem(item, 'desc')"
                                           @focus="item.showSugg = true"
                                           @blur="hideSugg('prod', item)"
                                           style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                                    <ul class="autocomplete-suggestions" v-if="item.showSugg && getFilteredProducts(item.desc).length" style="display:block;">
                                        <li v-for="p in getFilteredProducts(item.desc)" :key="p.desc" @mousedown="selectProduct(item, p)">{{ p.desc }}</li>
                                    </ul>
                                </div>
                                <div>
                                    <label v-if="idx === 0" style="font-size:11px; color:#64748b;">Qté</label>
                                    <input type="number" min="1" class="item-qty"
                                           v-model.number="item.qty"
                                           @input="updateItem(item, 'qty')"
                                           style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; text-align:center;">
                                </div>
                                <div>
                                    <!-- AÉRIEN : poids (kg) par ligne. Paris : type (poids/forfait) + dimensions (poids volume). -->
                                    <template v-if="shippingMode === 'aerien'">
                                        <label v-if="idx === 0" style="font-size:11px; color:#64748b;">{{ isParisAerien ? 'Type / Poids *' : 'Poids (kg) U *' }}</label>
                                        <select v-if="isParisAerien" v-model="item.type" @change="updateItem(item, 'type')"
                                                style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; margin-bottom:4px; font-size:12px; background:#fff;">
                                            <option value="poids">Au poids</option>
                                            <option value="chaussures">Forfait chaussures</option>
                                        </select>
                                        <input v-if="!(isParisAerien && item.type === 'chaussures')" type="number" min="0" step="0.1"
                                               v-model.number="item.poids"
                                               @input="updateItem(item, 'poids')"
                                               placeholder="kg"
                                               style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; text-align:right;">
                                        <div v-if="isParisAerien && item.type !== 'chaussures'" style="display:flex; gap:4px; margin-top:4px;">
                                            <input type="number" min="0" v-model.number="item.lng" @input="updateItem(item, 'dim')" placeholder="L" title="Longueur (cm)" style="width:33%; padding:6px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; text-align:center; font-size:12px;">
                                            <input type="number" min="0" v-model.number="item.lrg" @input="updateItem(item, 'dim')" placeholder="l" title="Largeur (cm)" style="width:33%; padding:6px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; text-align:center; font-size:12px;">
                                            <input type="number" min="0" v-model.number="item.haut" @input="updateItem(item, 'dim')" placeholder="H" title="Hauteur (cm)" style="width:33%; padding:6px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; text-align:center; font-size:12px;">
                                        </div>
                                        <div v-if="isParisAerien && item.type !== 'chaussures' && lineBilledKg(item) > (parseFloat(item.poids) || 0)" style="font-size:10px; color:#c2410c; margin-top:2px; text-align:right;">poids volume : {{ lineBilledKg(item).toFixed(1) }} kg</div>
                                    </template>
                                    <!-- CHINE MARITIME : P.U remplacé par CBM (calcul auto) -->
                                    <template v-else-if="autoPricingActive">
                                        <label v-if="idx === 0" style="font-size:11px; color:#64748b;">CBM U *</label>
                                        <input type="number" min="0" step="0.001"
                                               v-model.number="item.vol"
                                               @input="updateItem(item, 'vol')"
                                               placeholder="m³"
                                               style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; text-align:right;">
                                    </template>
                                    <!-- MODÈLE PARIS : P.U (€) historique -->
                                    <template v-else>
                                        <label v-if="idx === 0" style="font-size:11px; color:#64748b;">P.U (€)</label>
                                        <input type="number" min="0" step="0.01"
                                               v-model.number="item.pu"
                                               @input="updateItem(item, 'pu')"
                                               style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; text-align:right;">
                                    </template>
                                </div>
                                <div class="nf-total-col">
                                    <template v-if="shippingMode === 'aerien'">
                                        <label v-if="idx === 0" style="font-size:11px; color:#64748b;">Total (CFA)</label>
                                        <input type="text" readonly :value="lineTotalCfaAerien(item).toLocaleString('fr-FR')"
                                               style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px; box-sizing:border-box; text-align:right; font-weight:bold; background:#f8fafc;">
                                    </template>
                                    <template v-else-if="autoPricingActive">
                                        <label v-if="idx === 0" style="font-size:11px; color:#64748b;">Total (CFA)</label>
                                        <input type="text" readonly :value="Math.round((parseFloat(item.vol)||0) * (parseFloat(item.qty)||0) * tarifs.cbmChine).toLocaleString('fr-FR')"
                                               style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px; box-sizing:border-box; text-align:right; font-weight:bold; background:#f8fafc;">
                                    </template>
                                    <template v-else>
                                        <label v-if="idx === 0" style="font-size:11px; color:#64748b;">Total (€)</label>
                                        <input type="text" readonly :value="(item.total || 0).toFixed(2)"
                                               style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px; box-sizing:border-box; text-align:right; font-weight:bold; background:#f8fafc;">
                                    </template>
                                </div>
                                <div class="nf-action-col">
                                    <label v-if="idx === 0" style="display:block; height:14px;">&nbsp;</label>
                                    <button type="button" @click="removeRow(item.id)" :disabled="items.length <= 1"
                                            title="Supprimer la ligne"
                                            style="padding:10px 12px; border:1px solid #fecaca; background:#fef2f2; color:#ef4444; border-radius:8px; cursor:pointer;">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- RECONDITIONNEMENT (Paris aérien) : nombre de colis annoncés -->
                <div v-if="isParisAerien" class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 20px;">
                    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                        <label style="font-weight:600; font-size:13px; color:#475569; margin:0;">📦 Nombre de colis expédiés</label>
                        <input type="number" min="0" v-model.number="form.nbColisExpedies" :placeholder="totalColisAuto"
                               style="width:110px; padding:10px; border:1px solid #cbd5e1; border-radius:8px; text-align:center; font-weight:700;">
                        <span style="font-size:12px; color:#94a3b8;">Vide = {{ totalColisAuto }} (somme des quantités). À renseigner si plusieurs colis sont regroupés dans un carton (reconditionnement).</span>
                    </div>
                </div>

                <!-- 4. PAIEMENT & VALIDATION -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr)); gap: 20px;">
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;"><i class="fas fa-credit-card text-purple-500"></i> Paiement</h3>
                        
                        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                            <div class="form-group">
                                <label>Mode paiement *</label>
                                <select id="nfModePay" v-model="form.modePay">
                                    <option value="ESPECES">ESPÈCES</option>
                                    <option value="CB">CARTE BANCAIRE (CB)</option>
                                    <option value="VIREMENTS">VIREMENT</option>
                                    <option value="CHEQUES">CHÈQUE</option>
                                    <option value="BON D ENVOI">BON D'ENVOI</option>
                                    <option value="NON PAYE">NON PAYÉ (À régler à Abidjan)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Valeur déclarée colis (€)</label>
                                <input type="number" id="nfValeur" placeholder="Optionnel" v-model="form.valeur">
                            </div>
                            <div class="form-group">
                                <label>Volume (CBM) <i class="fas fa-info-circle" style="color:#3b82f6;" title="Alimente la jauge globale de l'agence"></i></label>
                                <input type="number" step="0.01" id="nfVolume" placeholder="Ex: 0.5" v-model.number="form.volume">
                            </div>
                        </div>

                        <!-- CHINE MARITIME / AÉRIEN : calcul automatique, modifiable -->
                        <div v-if="autoPricingActive" style="background:#eff6ff; padding:15px; border-radius:8px; border:1px solid #bfdbfe; margin-top:15px;">
                            <div style="font-weight:800; color:#1e40af; font-size:13px; margin-bottom:12px;">
                                <i class="fas" :class="shippingMode === 'aerien' ? 'fa-plane' : 'fa-ship'"></i>
                                {{ shippingMode === 'aerien' ? 'Expédition AÉRIENNE' : 'Expédition MARITIME — Chine' }}
                            </div>

                            <div v-if="shippingMode === 'aerien'" style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
                                <div style="flex:1; min-width:140px;">
                                    <label style="font-size:12px; color:#475569; font-weight:600;">Poids total (kg)</label>
                                    <div style="padding:10px; border:1px dashed #cbd5e1; border-radius:8px; background:#fff; font-weight:700; color:#1e40af;">{{ (parseFloat(form.poids)||0) }} kg</div>
                                    <div style="font-size:11px; color:#94a3b8; margin-top:3px;">Saisi par ligne dans « Description colis ».</div>
                                </div>
                                <div style="flex:1; min-width:160px;">
                                    <label style="font-size:12px; color:#475569; font-weight:600;">Mode d'envoi</label>
                                    <div style="padding:10px; border:1px dashed #cbd5e1; border-radius:8px; background:#fff; font-weight:700; color:#1e40af;">{{ form.aerienType === 'express' ? 'Express' : 'Normal' }}</div>
                                    <div style="font-size:11px; color:#94a3b8; margin-top:3px;">Se choisit dans « Informations générales ».</div>
                                </div>
                            </div>

                            <div style="font-size:12px; color:#475569; margin-bottom:6px;">
                                Calcul :
                                <template v-if="shippingMode === 'aerien' && isParisAerien">
                                    Somme des lignes (poids facturé × tarif + forfaits)
                                </template>
                                <template v-else-if="shippingMode === 'aerien'">
                                    {{ (parseFloat(form.poids)||0) }} kg × {{ (form.aerienType==='express' ? tarifs.kgAerienExpress : tarifs.kgAerienNormal).toLocaleString('fr-FR') }} CFA
                                </template>
                                <template v-else>
                                    {{ (parseFloat(form.volume)||0) }} CBM × {{ tarifs.cbmChine.toLocaleString('fr-FR') }} CFA
                                </template>
                                = <strong>{{ autoTotalCFA.toLocaleString('fr-FR') }} CFA</strong>
                                <a href="#" v-if="userTouchedTotal" @click.prevent="resetAutoTotal()" style="margin-left:8px; color:#2563eb;">↻ recalculer</a>
                            </div>

                            <label style="font-size:12px; color:#475569; font-weight:600;">Total à facturer (CFA) — modifiable</label>
                            <input type="number" min="0" v-model.number="form.totalCfa" @input="userTouchedTotal = true" style="width:100%; padding:12px; border:1px solid #93c5fd; border-radius:8px; box-sizing:border-box; font-size:18px; font-weight:800; color:#1e40af;">

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; flex-wrap:wrap; gap:10px;">
                                <span>Montant Payé (CFA) :</span>
                                <input type="number" min="0" v-model.number="form.montantPaye" style="width:140px; max-width:100%; text-align:right; font-weight:bold; color:#10b981; padding:8px; border:1px solid #cbd5e1; border-radius:8px;">
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:18px; border-top:1px dashed #93c5fd; padding-top:10px; margin-top:10px; flex-wrap:wrap; gap:10px;">
                                <span>Reste à Payer :</span>
                                <strong style="color:#ef4444;">{{ ((parseFloat(form.totalCfa)||0) - (parseFloat(form.montantPaye)||0)).toLocaleString('fr-FR') }} CFA</strong>
                            </div>
                        </div>

                        <div v-if="!autoPricingActive" style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 16px; flex-wrap: wrap; gap: 10px;">
                                <span>Total Fret :</span>
                                <strong id="nfTotalFret">{{ totalFret.toFixed(2) }} €</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
                                <span>Montant Payé (€) :</span>
                                <input type="number" id="nfMontantPaye" v-model.number="form.montantPaye" style="width: 120px; max-width: 100%; text-align: right; font-weight: bold; color: #10b981;">
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 10px; flex-wrap: wrap; gap: 10px;">
                                <span>Reste à Payer :</span>
                                <strong id="nfReste" style="color: #ef4444;">{{ resteAPayer.toFixed(2) }} €</strong>
                            </div>
                        </div>
                    </div>

                    <div class="form-card" style="display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div>
                            <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;"><i class="fas fa-comment-dots text-slate-500"></i> Notes</h3>
                            <textarea id="nfComment" rows="4" placeholder="Instructions spéciales, contenu exact..." v-model="form.comment" style="width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-family: inherit; resize: none;"></textarea>
                        </div>
                        <button id="nfSubmitBtn" class="amt-btn amt-btn-primary amt-btn-lg amt-btn-full" :disabled="saving" @click="submitInvoice()" style="margin-top: 15px;">
                            <i v-if="saving" class="fas fa-spinner fa-spin"></i>
                            <i v-else class="fas fa-check-circle"></i>
                            {{ saving ? 'Enregistrement...' : (form.type === 'DEVIS' ? 'Enregistrer le devis' : 'Enregistrer la facture') }}
                        </button>
                    </div>

                </div>

                <!-- MODALE : Créer un expéditeur / destinataire -->
                <div v-if="clientModal.show" @click.self="closeClientModal()" style="position:fixed; inset:0; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000;">
                    <div style="background:#fff; width:90%; max-width:460px; border-radius:16px; display:flex; flex-direction:column; max-height:90vh; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:18px 20px; border-bottom:1px solid #e2e8f0; background:#f8fafc; border-radius:16px 16px 0 0;">
                            <div>
                                <div style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">{{ clientModal.target === 'exp' ? 'Expéditeur' : 'Destinataire' }}</div>
                                <div style="font-size:17px; font-weight:800; color:#0f172a;">{{ clientModal.target === 'exp' ? 'Créer un expéditeur' : 'Créer un destinataire' }}</div>
                            </div>
                            <button type="button" @click="closeClientModal()" aria-label="Fermer" style="background:none; border:none; font-size:22px; cursor:pointer; color:#64748b;">✕</button>
                        </div>
                        <div style="padding:20px; overflow-y:auto; flex:1; min-height:0;">
                            <div class="form-group" style="margin-bottom:14px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">Nom *</label>
                                <input type="text" v-model="clientModal.nom" placeholder="Nom" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;">
                            </div>
                            <div class="form-group" style="margin-bottom:14px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">Prénom</label>
                                <input type="text" v-model="clientModal.prenom" placeholder="Prénom" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;">
                            </div>
                            <div class="form-group" style="margin-bottom:14px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">Téléphone *</label>
                                <input type="text" v-model="clientModal.telephone" placeholder="Numéro de téléphone" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;">
                            </div>
                            <div class="form-group" style="margin-bottom:14px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">Email</label>
                                <input type="email" v-model="clientModal.email" placeholder="Adresse email" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;">
                            </div>
                            <div class="form-group">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">Adresse</label>
                                <div style="position:relative;">
                                    <input id="nfClientAdresse" type="text" v-model="clientModal.adresse" placeholder="Adresse complète" autocomplete="off" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;">
                                    <ul id="nfClientAdresseSuggestions" style="margin:0; padding:0; list-style:none; display:none;"></ul>
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:10px; padding:15px 20px; border-top:1px solid #e2e8f0;">
                            <button type="button" class="btn btn-outline" @click="closeClientModal()" style="padding:10px 16px; border-radius:8px;">Annuler</button>
                            <button type="button" class="btn btn-primary" @click="saveClientFromModal()" :disabled="clientModal.saving || !clientModal.nom.trim() || !clientModal.telephone.trim()" style="padding:10px 18px; border-radius:8px;">
                                <span v-if="clientModal.saving"><i class="fas fa-spinner fa-spin"></i> Création…</span>
                                <span v-else>Créer</span>
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
            const currentContainer = ref('');
            const currentAerienLot = ref(''); // "lot aérien actif" (équivalent conteneur, mode aérien)
            // Code de regroupement effectif : lot aérien si mode aérien,
            // sinon conteneur maritime. Sépare aérien/maritime partout.
            const groupingCode = computed(() =>
                shippingMode === 'aerien'
                    ? (currentAerienLot.value || 'AERIEN')
                    : (currentContainer.value || 'ATT'));
            const saving = ref(false);
            
            const clientsData = ref(new Map());
            const destMap = ref(new Map());
            const destInfos = ref(new Map());
            const destExpMap = ref(new Map());
            const productsData = ref(new Map());
            const availableDests = ref([]);
            const availableCommunes = ref([]);
            
            // Si on arrive depuis le raccourci « Nouveau Devis », la page
            // s'ouvre pré-réglée sur DEVIS (drapeau posé par NouveauDevisView,
            // consommé une seule fois).
            let _presetType = 'FACTURE';
            try {
                if (sessionStorage.getItem('nf_preset_type') === 'DEVIS') {
                    _presetType = 'DEVIS';
                    sessionStorage.removeItem('nf_preset_type');
                }
            } catch (e) { /* sessionStorage indisponible : on reste sur FACTURE */ }

            // Si on arrive depuis un RDV (bouton « +Récup »), on pré-remplit
            // le client et on garde le lien vers le RDV (consommé une fois ;
            // le RDV sera marqué « Facturé » à l'enregistrement).
            let _prefill = null, _appointmentId = '';
            try {
                const raw = sessionStorage.getItem('nf_prefill');
                if (raw) {
                    _prefill = JSON.parse(raw);
                    _appointmentId = (_prefill && _prefill.appointmentId) || '';
                    sessionStorage.removeItem('nf_prefill');
                }
            } catch (e) { _prefill = null; }

            const form = reactive({
                date: new Date().toISOString().split('T')[0],
                type: _presetType,
                agence: '',
                expediteur: _prefill ? `${_prefill.client || ''}${_prefill.tel ? ' ' + _prefill.tel : ''}`.trim() : '',
                destinataire: '',
                lieu: '',
                modePay: 'ESPECES',
                valeur: '',
                volume: '',
                montantPaye: 0,
                comment: (_prefill && _prefill.adresse) ? `Récupération RDV — ${_prefill.adresse}` : '',
                parrainId: '',
                poids: '',            // Aérien : poids en kg
                aerienType: 'normal', // 'normal' | 'express'
                nbColisExpedies: '',  // Aérien Paris : nb de colis annoncés (reconditionnement)
                totalCfa: 0           // Total facturé (CFA) en mode auto, modifiable
            });

            // Destinations = agences d'ARRIVÉE de la route de l'agence de départ
            // courante (SOURCE UNIQUE : agencies_config / modèle "routes" géré
            // dans « Gestion des agences »). Remplace la liste de villes en dur.
            const destinationAgencies = computed(() => {
                const depId = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const arrivals = Object.values(AGENCIES || {}).filter(a => a && a.type === 'arrival');
                // 1) Agences d'arrivée de la route du départ courant (si identifiables).
                let list = arrivals.filter(a =>
                    (String(a.id).split('_')[1] === depId) || (depId === 'paris' && a.id === 'abidjan'));
                // 2) Repli : si la route ne désigne rien (ex. compte global dont
                //    l'agence active est une arrivée), proposer TOUTES les agences
                //    d'arrivée pour que le champ ne soit jamais vide.
                if (list.length === 0) list = arrivals;
                return list.map(a => ({ id: a.id, name: a.name || a.id, flag: a.flag || '' }));
            });

            // Parrainage : actif selon le flag agence (source unique affiliation-config).
            const affiliationActive = isAffiliationActive(sessionStorage.getItem('currentActiveAgency') || 'paris');

            // --- Mode d'expédition (Maritime/Aérien) + tarifs Chine/Aérien ---
            // Maritime+Chine = Volume(CBM) × coût CBM. Aérien (toutes agences)
            // = Poids(kg) × tarif Normal/Express. Sinon : facturation EUR
            // historique inchangée. Le total auto reste MODIFIABLE.
            const shippingMode = sessionStorage.getItem('shippingMode') || 'maritime';
            const tarifs = reactive({ cbmChine: 250000, kgAerienNormal: 12000, kgAerienExpress: 14000, forfaitChaussuresEur: 23 });

            // Modèle aérien ENRICHI réservé au DÉPART Paris : poids volume +
            // forfait chaussures. Les autres routes aériennes (chine) restent au
            // poids réel (inchangé).
            const activeAgencyNF = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const isParisAerien = shippingMode === 'aerien' && activeAgencyNF === 'paris';
            // Poids facturé d'une ligne = max(poids réel, poids volume) ; le poids
            // volume (L×l×H cm ÷ 5000) n'est pris en compte qu'au départ Paris.
            const lineBilledKg = (item) => {
                let kg = parseFloat(item.poids) || 0;
                if (isParisAerien) {
                    const vol = ((parseFloat(item.lng) || 0) * (parseFloat(item.lrg) || 0) * (parseFloat(item.haut) || 0)) / 5000;
                    if (vol > kg) kg = vol;
                }
                return kg;
            };
            // Total CFA d'une ligne aérienne : forfait chaussures (€→CFA) si la
            // ligne est de ce type (Paris), sinon poids facturé × tarif/kg.
            const lineTotalCfaAerien = (item) => {
                const qty = parseFloat(item.qty) || 0;
                if (isParisAerien && item.type === 'chaussures') {
                    return Math.round((tarifs.forfaitChaussuresEur || 0) * CONSTANTS.TAUX_CONVERSION * qty);
                }
                const rate = form.aerienType === 'express' ? tarifs.kgAerienExpress : tarifs.kgAerienNormal;
                return Math.round(lineBilledKg(item) * qty * (rate || 0));
            };
            // Lignes d'articles (déclaré AVANT autoTotalCFA qui les agrège, sinon
            // "Cannot access 'items' before initialization" via le watch immédiat).
            const items = ref([{ id: Date.now(), desc: '', qty: 1, pu: '', total: 0, vol: '', poids: '', type: 'poids', lng: '', lrg: '', haut: '', showSugg: false }]);
            // Modèle de facturation de l'AGENCE (réglé dans Config Facture).
            // 'paris' = facturation EUR historique ; 'chine' = CBM maritime.
            // Défaut 'paris' (aucun changement pour l'existant). Chargé en
            // onMounted depuis settings/invoice_config_<agence>.
            const factureModel = ref('paris');
            const autoPricingActive = computed(() =>
                shippingMode === 'aerien' || (shippingMode === 'maritime' && factureModel.value === 'chine'));
            const autoTotalCFA = computed(() => {
                if (shippingMode === 'aerien') {
                    // Somme des totaux par ligne (gère poids volume + forfait
                    // chaussures côté Paris ; identique au calcul poids×tarif
                    // pour les autres routes aériennes).
                    return items.value.reduce((s, i) => s + lineTotalCfaAerien(i), 0);
                }
                if (shippingMode === 'maritime' && factureModel.value === 'chine') {
                    const cbm = parseFloat(form.volume) || 0;
                    return Math.round(cbm * (tarifs.cbmChine || 0));
                }
                return 0;
            });
            const userTouchedTotal = ref(false);
            const resetAutoTotal = () => { userTouchedTotal.value = false; form.totalCfa = autoTotalCFA.value; };
            watch(autoTotalCFA, (v) => { if (!userTouchedTotal.value) form.totalCfa = v; }, { immediate: true });
            const demarcheurs = ref([]);
            if (affiliationActive) {
                getDocs(collection(db, getCollectionName('demarcheurs'))).then(s => {
                    demarcheurs.value = s.docs.map(d => ({ id: d.id, ...d.data() }));
                }).catch(e => console.warn('Chargement démarcheurs:', e));
            }

            // Feedback states
            const expFeedback = ref('');
            const destFeedback = ref('');
            
            // UI states for suggestions
            const showExpSugg = ref(false);
            const showDestSugg = ref(false);
            const showLieuSugg = ref(false);

            // Loading Data
            const loadAutocompleteData = async () => {
                try {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const clientsSnap = await getDocs(query(collection(db, getCollectionName("clients")), where("agency", "==", activeAgency)));
                    const cd = new Map();
                    clientsSnap.forEach(doc => {
                        const data = doc.data();
                        // Isolation Maritime/Aerien « par construction » :
                        // getCollectionName('clients') -> clients_aerien en aérien.
                        // L'autocomplétion EXPÉDITEUR ne doit proposer QUE des
                        // expéditeurs : on exclut les clients type='destinataire'.
                        if (data.nom && data.type !== 'destinataire') cd.set(data.nom.trim(), data);
                    });
                    clientsData.value = cd;

                    const livSnap = await getDocs(query(collection(db, getCollectionName("livraisons")), where("agency", "==", activeAgency)));
                    const communesSet = new Set(['ABOBO', 'ADJAME', 'ATTECOUBE', 'BINGERVILLE', 'COCODY', 'KOUMASSI', 'MARCORY', 'PLATEAU', 'PORT-BOUET', 'YOPOUGON', 'PAS DE LIVRAISON (Retrait Entrepôt)']);
                    const destSet = new Set();
                    const dMap = new Map();
                    const dInfos = new Map();
                    const dExpMap = new Map();

                    livSnap.forEach(doc => {
                        const data = doc.data();
                        if (data.lieuLivraison && data.lieuLivraison.trim() !== '') {
                            communesSet.add(data.lieuLivraison.trim());
                        }
                        if (data.destinataire && data.destinataire.trim() !== '') {
                            const destName = data.destinataire.trim();
                            destSet.add(destName);
                            if (data.lieuLivraison && !dMap.has(destName)) dMap.set(destName, data.lieuLivraison.trim());
                            if (data.expediteur && !dExpMap.has(destName)) dExpMap.set(destName, data.expediteur.trim());
                        }
                    });

                    availableCommunes.value = Array.from(communesSet).sort();
                    availableDests.value = Array.from(destSet).sort();
                    destMap.value = dMap;
                    destInfos.value = dInfos;
                    destExpMap.value = dExpMap;

                    const prodSnap = await getDocs(collection(db, getCollectionName("products")));
                    const pd = new Map();
                    prodSnap.forEach(doc => {
                        const data = doc.data();
                        // Isolation Maritime/Aerien « par construction » :
                        // getCollectionName('products') -> products_aerien en aérien.
                        if (data.desc) pd.set(data.desc.trim(), data);
                    });
                    productsData.value = pd;
                    
                    const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                    const configSnap = await getDoc(fsDoc(db, "settings", `container_config_${activeAgency}`));
                    const cfg = configSnap.exists() ? (configSnap.data() || {}) : {};
                    currentContainer.value = (cfg.activeContainer ? String(cfg.activeContainer).trim().toUpperCase() : 'ATT');
                    currentAerienLot.value = (cfg.activeAerienLot ? String(cfg.activeAerienLot).trim().toUpperCase() : 'AERIEN');
                } catch (e) {
                    console.error("Erreur de chargement :", e);
                }
            };

            onMounted(async () => {
                await loadAutocompleteData();

                // Tarifs Chine/Aérien (parametres/tarifs). Tolérant : si la
                // règle n'est pas déployée ou doc absent, on garde les défauts.
                try {
                    const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                    const tSnap = await getDoc(fsDoc(db, 'parametres', 'tarifs'));
                    if (tSnap.exists()) {
                        const t = tSnap.data();
                        if (t.cbmChine != null) tarifs.cbmChine = Number(t.cbmChine) || tarifs.cbmChine;
                        if (t.kgAerienNormal != null) tarifs.kgAerienNormal = Number(t.kgAerienNormal) || tarifs.kgAerienNormal;
                        if (t.kgAerienExpress != null) tarifs.kgAerienExpress = Number(t.kgAerienExpress) || tarifs.kgAerienExpress;
                        if (t.forfaitChaussuresEur != null) tarifs.forfaitChaussuresEur = Number(t.forfaitChaussuresEur) || tarifs.forfaitChaussuresEur;
                    }
                    // Modele de facturation + tarifs aerien PAR ROUTE
                    // (settings/invoice_config_<dep>). Les valeurs saisies dans
                    // Gestion des agences ecrasent les defauts et l'eventuel
                    // parametres/tarifs global.
                    const _ag = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const icSnap = await getDoc(fsDoc(db, 'settings', `invoice_config_${_ag}`));
                    if (icSnap.exists()) {
                        const ic = icSnap.data();
                        if (ic.factureModel) factureModel.value = ic.factureModel;
                        if (typeof ic.kgStdEur === 'number') tarifs.kgStdEur = ic.kgStdEur;
                        if (typeof ic.kgParfumEur === 'number') tarifs.kgParfumEur = ic.kgParfumEur;
                        if (typeof ic.forfaitChaussuresEur === 'number') tarifs.forfaitChaussuresEur = ic.forfaitChaussuresEur;
                        if (typeof ic.kgAerienNormal === 'number') tarifs.kgAerienNormal = ic.kgAerienNormal;
                        if (typeof ic.kgAerienExpress === 'number') tarifs.kgAerienExpress = ic.kgAerienExpress;
                    }
                    if (!userTouchedTotal.value) form.totalCfa = autoTotalCFA.value;
                } catch (e) { console.warn('Tarifs/modèle (lecture):', e && e.message); }

                const reuseExp = sessionStorage.getItem('reuseExpediteur');
                if (reuseExp) {
                    form.expediteur = reuseExp;
                    handleExpediteurChange();
                    sessionStorage.removeItem('reuseExpediteur');
                }
            });

            // Computed suggestions
            const expQuery = computed(() => form.expediteur.toLowerCase().trim());
            const filteredExpediteurs = computed(() => {
                if (expQuery.value.length < 2) return [];
                return Array.from(clientsData.value.values())
                    .filter(c => (c.nom && c.nom.toLowerCase().includes(expQuery.value)) || (c.tel && c.tel.includes(expQuery.value)))
                    .slice(0, 8);
            });

            const destQuery = computed(() => form.destinataire.toLowerCase().trim());
            const filteredDestinataires = computed(() => {
                if (destQuery.value.length < 2) return [];
                let matches = Array.from(destMap.value.keys()).filter(d => d.toLowerCase().includes(destQuery.value));
                if (matches.length < 5) {
                    const globalMatches = availableDests.value.filter(d => d.toLowerCase().includes(destQuery.value));
                    matches = [...new Set([...matches, ...globalMatches])];
                }
                return matches.slice(0, 8);
            });

            const lieuQuery = computed(() => form.lieu.toLowerCase().trim());
            const filteredLieux = computed(() => {
                if (lieuQuery.value.length < 2) return [];
                return availableCommunes.value.filter(c => c.toLowerCase().includes(lieuQuery.value)).slice(0, 8);
            });

            const getFilteredProducts = (queryText) => {
                if (!queryText || queryText.length < 2) return [];
                const q = queryText.toLowerCase();
                return Array.from(productsData.value.values()).filter(p => p.desc && p.desc.toLowerCase().includes(q)).slice(0, 8);
            };

            // Selection handlers
            const selectExp = (c) => { form.expediteur = c.nom; showExpSugg.value = false; handleExpediteurChange(true); };
            const selectDest = (d) => { form.destinataire = d; showDestSugg.value = false; handleDestinataireChange(); };
            const selectLieu = (l) => { form.lieu = l; showLieuSugg.value = false; };
            const selectProduct = (item, p) => { item.desc = p.desc; item.showSugg = false; updateItem(item, 'desc'); };

            const hideSugg = (type, item = null) => {
                setTimeout(() => {
                    if (type === 'exp') showExpSugg.value = false;
                    if (type === 'dest') showDestSugg.value = false;
                    if (type === 'lieu') showLieuSugg.value = false;
                    if (type === 'prod' && item) item.showSugg = false;
                }, 200);
            };

            // Logic handlers
            // Recherche RÉSEAU des destinataires d'un expéditeur (livraisons
            // passées + carnet lié). Coûteuse : on la débounce (voir plus bas)
            // pour ne PAS la lancer à chaque frappe clavier.
            let _expLookupTimer = null;
            const lookupDestinatairesForExp = async (exp) => {
                try {
                    const qLiv = query(collection(db, getCollectionName("livraisons")), where("expediteur", "==", exp));
                    const livSnap = await getDocs(qLiv);

                    const localDestMap = new Map();
                    livSnap.forEach(doc => {
                        const data = doc.data();
                        if (data.destinataire && data.destinataire.trim()) {
                            const destName = data.destinataire.trim();
                            localDestMap.set(destName, data.lieuLivraison || '');
                            destMap.value.set(destName, data.lieuLivraison || '');
                            destInfos.value.set(destName, data.numero || '');
                        }
                    });

                    // Destinataires du CARNET liés à cet expéditeur (créés via
                    // la modale, AVANT toute livraison). array-contains seul =
                    // pas d'index composite requis.
                    try {
                        const qDestLies = query(collection(db, getCollectionName("clients")),
                            where("expediteurs", "array-contains", exp));
                        const destLiesSnap = await getDocs(qDestLies);
                        destLiesSnap.forEach(d => {
                            const data = d.data();
                            const destName = (data.nom || '').trim();
                            if (destName) {
                                if (!localDestMap.has(destName)) localDestMap.set(destName, data.adresse || '');
                                if (!destMap.value.has(destName)) destMap.value.set(destName, data.adresse || '');
                                destInfos.value.set(destName, data.tel || '');
                            }
                        });
                    } catch (e) { console.warn('Destinataires liés (carnet) :', e && e.message); }

                    const uniqueDests = Array.from(localDestMap.keys());
                    if (uniqueDests.length > 0) {
                        if (uniqueDests.length === 1) {
                            if (!form.destinataire || form.destinataire !== uniqueDests[0]) {
                                form.destinataire = uniqueDests[0];
                                handleDestinataireChange();
                            }
                        } else if (!/destinataires trouvés/.test(expFeedback.value)) {
                            expFeedback.value += `<br><span style="color:#3b82f6;"><i class="fas fa-info-circle"></i> ${uniqueDests.length} destinataires trouvés. Utilisez la flèche pour choisir.</span>`;
                        }
                    }
                } catch (error) {
                    console.error("Erreur de recherche des destinataires :", error);
                }
            };
            const handleExpediteurChange = (immediate = false) => {
                const exp = form.expediteur.trim();
                if (!exp) { expFeedback.value = ''; return; }

                // Feedback INSTANTANÉ (local, aucune requête réseau).
                if (clientsData.value.has(exp)) {
                    const info = clientsData.value.get(exp);
                    expFeedback.value = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${info.tel || 'N/A'} | <b>Adresse:</b> ${info.adresse || 'N/A'}</span>`;
                } else {
                    expFeedback.value = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau client expéditeur</span>`;
                }

                // Recherche destinataires : immédiate si sélection explicite,
                // sinon débouncée (450 ms) pour ne pas requêter à chaque touche.
                if (_expLookupTimer) clearTimeout(_expLookupTimer);
                if (immediate) { lookupDestinatairesForExp(exp); return; }
                _expLookupTimer = setTimeout(() => lookupDestinatairesForExp(exp), 450);
            };

            const handleDestinataireChange = async () => {
                const dest = form.destinataire.trim();
                if (!dest) {
                    destFeedback.value = '';
                    form.lieu = '';
                    return;
                }

                let lieu = '', num = '', exp = '', isFound = false;
                
                if (destMap.value.has(dest)) {
                    lieu = destMap.value.get(dest);
                    num = destInfos.value.get(dest);
                    isFound = true;
                } else {
                    const qLiv = query(collection(db, getCollectionName("livraisons")), where("destinataire", "==", dest), limit(1));
                    const snap = await getDocs(qLiv);
                    if (!snap.empty) {
                        const data = snap.docs[0].data();
                        lieu = data.lieuLivraison || data.commune || '';
                        num = data.numero || '';
                        exp = data.expediteur || '';
                        isFound = true;
                    }
                }
                
                if (!exp && destExpMap.value.has(dest)) exp = destExpMap.value.get(dest);

                if (isFound && exp && !form.expediteur) {
                    form.expediteur = exp;
                    handleExpediteurChange();
                }

                if (isFound && !form.lieu) form.lieu = lieu;

                if (isFound) destFeedback.value = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${num || 'N/A'}</span>`;
                else destFeedback.value = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau destinataire</span>`;
            };

            // --- Modale "Créer un expéditeur / destinataire" ---
            const clientModal = reactive({
                show: false, target: 'exp',
                nom: '', prenom: '', telephone: '', email: '', adresse: '', saving: false
            });
            const openClientModal = (target) => {
                clientModal.target = target;
                clientModal.nom = ''; clientModal.prenom = ''; clientModal.telephone = '';
                clientModal.email = ''; clientModal.adresse = '';
                clientModal.saving = false; clientModal.show = true;
                // Autocomplete BAN sur l'adresse expéditeur (France) uniquement.
                // Activée pour les routes à devise EUR (Paris historique ou SaaS basée en France).
                if (target === 'exp') {
                    const _ag = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const _agObj = AGENCIES[_ag];
                    const _french = (_ag === 'paris') || (_agObj && _agObj.currency === 'EUR');
                    if (_french) {
                        nextTick(() => Autocomplete.initAddress('nfClientAdresse', 'nfClientAdresseSuggestions'));
                    }
                }
            };
            const closeClientModal = () => { clientModal.show = false; };
            const saveClientFromModal = async () => {
                const nom = clientModal.nom.trim();
                const tel = clientModal.telephone.trim();
                if (!nom || !tel) { globalApp.showToast("Renseignez le nom et le téléphone.", "error"); return; }
                clientModal.saving = true;
                try {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const isDest = clientModal.target === 'dest';
                    // Expéditeur = client de l'agence de DÉPART (active).
                    // Destinataire = client de l'agence d'ARRIVÉE (= la
                    // destination choisie sur la facture ; repli sur l'agence
                    // active si non encore sélectionnée).
                    const clientType = isDest ? 'destinataire' : 'expediteur';
                    const clientAgency = isDest ? (form.agence || activeAgency) : activeAgency;
                    const fullName = `${nom} ${clientModal.prenom.trim()}`.trim();
                    const adresse = clientModal.adresse.trim();
                    // Même structure que la page Clients (sinon n'apparaît pas
                    // dans les listes / l'autocomplétion).
                    // Lien destinataire -> expéditeur(s) (un destinataire peut
                    // être lié à plusieurs expéditeurs : tableau cumulable).
                    const expLink = (isDest && form.expediteur && form.expediteur.trim())
                        ? [form.expediteur.trim()] : [];
                    await addDoc(collection(db, getCollectionName("clients")), {
                        nom: fullName, tel, email: clientModal.email.trim(), adresse,
                        type: clientType, expediteurs: expLink,
                        dateAjout: new Date().toISOString(), agency: clientAgency,
                        risque: 'low', segment: 'nouveau', taille: 'petit', ca: 0, factures: 0,
                        modeExpedition: sessionStorage.getItem('shippingMode') || 'maritime'
                    });
                    // Intègre immédiatement dans l'autocomplétion (sans recharger).
                    clientsData.value.set(fullName, { nom: fullName, tel, adresse, email: clientModal.email.trim() });
                    if (clientModal.target === 'exp') {
                        form.expediteur = fullName;
                        handleExpediteurChange();
                    } else {
                        form.destinataire = fullName;
                        destMap.value.set(fullName, adresse);
                        destInfos.value.set(fullName, tel);
                        handleDestinataireChange();
                    }
                    globalApp.showToast("Client créé ✔", "success");
                    clientModal.show = false;
                } catch (e) {
                    console.error("Création client (Nouvelle Facture) :", e);
                    globalApp.showToast("Erreur lors de la création du client.", "error");
                } finally {
                    clientModal.saving = false;
                }
            };

            const addRow = () => items.value.push({ id: Date.now(), desc: '', qty: 1, pu: '', total: 0, vol: '', poids: '', type: 'poids', lng: '', lrg: '', haut: '', showSugg: false });
            const removeRow = (id) => { if (items.value.length > 1) items.value = items.value.filter(i => i.id !== id); };

            const updateItem = (item, field) => {
                if (field === 'desc' && productsData.value.has(item.desc)) {
                    const prod = productsData.value.get(item.desc);
                    item.pu = parseFloat(prod.price) || 0;
                    item.vol = parseFloat(prod.dim) || 0;
                }
                item.total = (parseFloat(item.qty) || 0) * (parseFloat(item.pu) || 0);
                const totalVol = items.value.reduce((sum, i) => sum + ((parseFloat(i.vol) || 0) * (parseFloat(i.qty) || 0)), 0);
                if (autoPricingActive.value && shippingMode === 'maritime') {
                    // Chine maritime : la somme des CBM par ligne FAIT FOI et
                    // doit pouvoir redescendre à 0 (sinon montant figé/fantôme).
                    form.volume = parseFloat((totalVol || 0).toFixed(2));
                } else if (totalVol > 0) {
                    // Autres modèles : ne pas écraser une saisie manuelle par 0.
                    form.volume = parseFloat(totalVol.toFixed(2));
                }
                // Aérien : poids total = somme du poids FACTURÉ (max réel/volume)
                // par ligne × qté. Les lignes "forfait chaussures" (Paris) ne
                // comptent pas de poids.
                form.poids = items.value.reduce((sum, i) => {
                    if (isParisAerien && i.type === 'chaussures') return sum;
                    return sum + (lineBilledKg(i) * (parseFloat(i.qty) || 0));
                }, 0);
            };

            const totalFret = computed(() => items.value.reduce((sum, item) => sum + item.total, 0));
            const resteAPayer = computed(() => totalFret.value - (parseFloat(form.montantPaye) || 0));
            // Nb de colis "par défaut" = somme des quantités (avant reconditionnement).
            const totalColisAuto = computed(() => items.value.reduce((s, i) => s + (parseInt(i.qty) || 0), 0));

            const submitInvoice = async () => {
                if (!form.expediteur || !form.destinataire || !form.agence || items.value[0].desc === '') {
                    globalApp.showToast("Veuillez remplir l'Expéditeur, le Destinataire, l'Agence destination et au moins une Description d'article.", "error");
                    return;
                }

                // ── CHEMIN DEVIS (isolé) ─────────────────────────────────────
                // Un devis n'est PAS payé : on enregistre uniquement un
                // document dans `quotes`. AUCUNE transaction, AUCUN encaissement
                // caisse, AUCUNE commission. Format identique à l'ancienne page
                // « Nouveau Devis » pour que la liste des devis reste cohérente.
                if (form.type === 'DEVIS') {
                    saving.value = true;
                    try {
                        const totalDevis = autoPricingActive.value
                            ? Math.round(parseFloat(form.totalCfa) || 0)
                            : totalFret.value;
                        const refDevis = "DEV-" + Date.now().toString().slice(-6);
                        const quoteData = {
                            reference: refDevis,
                            client: form.expediteur,
                            destinataire: form.destinataire,
                            date: form.date,
                            dateValidite: '',
                            volume: parseFloat(form.volume) || 0,
                            devise: autoPricingActive.value ? 'XOF' : 'EUR',
                            agence: form.agence,
                            lieuLivraison: form.lieu,
                            conditions: form.comment || '',
                            items: items.value,
                            totalHT: totalDevis,
                            remise: 0,
                            totalNet: totalDevis,
                            status: "ENVOYÉ",
                            agency: sessionStorage.getItem('currentActiveAgency') || 'paris',
                            saisiPar: sessionStorage.getItem('userName') || 'Agent',
                            createdAt: new Date().toISOString(),
                        };
                        await addDoc(collection(db, getCollectionName('quotes')), quoteData);
                        globalApp.showToast(`Devis ${refDevis} généré avec succès !`, "success");
                        globalApp.renderPage('quotes-list');
                    } catch (e) {
                        console.error('[nouvellefacture] enregistrement DEVIS échec —', e);
                        globalApp.showToast("Erreur lors de l'enregistrement du devis.", "error");
                    } finally {
                        saving.value = false;
                    }
                    return; // ← stop : on ne touche à RIEN du flux facture
                }
                // ─────────────────────────────────────────────────────────────

                saving.value = true;

                const TAUX = CONSTANTS.TAUX_CONVERSION;
                const totalEUR = totalFret.value;
                const payeEUR = parseFloat(form.montantPaye) || 0;
                const resteEUR = totalEUR - payeEUR;

                let totalCFA, payeCFA, resteCFA;
                if (autoPricingActive.value) {
                    // Chine maritime / Aérien : montants déjà saisis en CFA
                    // (total modifiable par l'agent). Pas de conversion ×TAUX.
                    totalCFA = Math.round(parseFloat(form.totalCfa) || 0);
                    payeCFA = Math.round(parseFloat(form.montantPaye) || 0);
                    resteCFA = totalCFA - payeCFA;
                } else {
                    // Facturation EUR historique — INCHANGÉE.
                    totalCFA = Math.round(totalEUR * TAUX);
                    payeCFA = Math.round(payeEUR * TAUX);
                    resteCFA = Math.round(resteEUR * TAUX);
                }

                const batch = writeBatch(db);
                const dateIso = form.date || new Date().toISOString().split('T')[0];
                const volumeCBM = parseFloat(form.volume) || 0;
                
                let expPhone = '', expAddr = '';
                const expMatch = form.expediteur.match(/(.*?)\s*((?:\+|00)?\d{8,})/);
                let finalExpName = form.expediteur;
                if (expMatch) { finalExpName = expMatch[1].trim(); expPhone = expMatch[2].trim(); }
                if (clientsData.value.has(finalExpName)) {
                    const cData = clientsData.value.get(finalExpName);
                    if (!expPhone) expPhone = cData.tel || '';
                    if (!expAddr) expAddr = cData.adresse || '';
                }

                let destPhone = '';
                const destMatch = form.destinataire.match(/(.*?)\s*((?:\+|00)?\d{8,})/);
                let finalDestName = form.destinataire;
                if (destMatch) { finalDestName = destMatch[1].trim(); destPhone = destMatch[2].trim(); }
                if (!destPhone && destInfos.value.has(finalDestName)) destPhone = destInfos.value.get(finalDestName) || '';

                const lieuLivraison = form.lieu.trim();
                const userName = sessionStorage.getItem('userName') || 'Agent Paris';
                let initials = sessionStorage.getItem('userInitials');

                if (!initials) {
                    const initialsMatch = userName.match(/\b\w/g) || ['A', 'P'];
                    initials = initialsMatch.join('').substring(0, 2).toUpperCase();
                }

                // Mode aérien -> regroupe sous le LOT AÉRIEN actif (séparé du
                // conteneur maritime) ; sinon conteneur maritime classique.
                const conteneurCode = groupingCode.value;
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const qContainer = query(collection(db, getCollectionName("transactions")), where("conteneur", "==", conteneurCode), where("agency", "==", activeAgency));
                const containerSnap = await getDocs(qContainer);
                const orderNum = (containerSnap.size + 1).toString().padStart(3, '0');
                const ref = `${initials}-${orderNum}-${conteneurCode}`;

                // --- AFFILIATION (parrainage) : lien persistant destinataire ↔ démarcheur ---
                // Non bloquant : toute erreur ici ne doit pas empêcher la facture.
                let affiliationDemarcheurId = null;
                if (affiliationActive) {
                    try {
                        if (destPhone) {
                            const existing = await getAffiliation(destPhone);
                            if (existing && existing.demarcheurId) {
                                affiliationDemarcheurId = existing.demarcheurId; // rattachement permanent : 1er gagnant
                            } else if (form.parrainId) {
                                const dem = demarcheurs.value.find(d => d.id === form.parrainId);
                                await ensureAffiliation({
                                    phone: destPhone,
                                    clientName: finalDestName,
                                    demarcheurId: form.parrainId,
                                    demarcheurName: dem ? `${dem.prenom || ''} ${dem.nom || ''}`.trim() : '',
                                    agency: activeAgency,
                                    createdBy: userName
                                });
                                affiliationDemarcheurId = form.parrainId;
                            }
                        } else if (form.parrainId) {
                            // Pas de téléphone destinataire : on rattache quand
                            // même la commission au parrain choisi (sans lien
                            // permanent client_affiliations, qui nécessite un tél).
                            affiliationDemarcheurId = form.parrainId;
                        }
                    } catch (e) { console.warn('Affiliation (non bloquant):', e); }
                }

                const totalColis = items.value.reduce((sum, item) => sum + item.qty, 0);
                // Reconditionnement : nb de colis annoncés (si saisi), sinon = somme des quantités.
                const nbColisExp = (parseInt(form.nbColisExpedies) > 0) ? parseInt(form.nbColisExpedies) : totalColis;
                const generatedLabels = [];
                const printLabelsData = [];
                let labelIndex = 1;

                items.value.forEach(item => {
                    for (let i = 0; i < item.qty; i++) {
                        const uniqueId = Math.floor(10 + Math.random() * 90);
                        const sousRef = `${ref}_${labelIndex}_${uniqueId}`;
                        generatedLabels.push(sousRef);
                        printLabelsData.push({ sousRef: sousRef, desc: item.desc, index: labelIndex, total: totalColis });
                        labelIndex++;
                    }
                });

                const livRef = doc(collection(db, getCollectionName("livraisons")));
                batch.set(livRef, {
                    demarcheurId: affiliationDemarcheurId,
                    appointmentId: _appointmentId || null,
                    ref: ref, labels: generatedLabels, conteneur: conteneurCode, volumeCBM: volumeCBM,
                    expediteur: finalExpName, destinataire: finalDestName, numero: destPhone, lieuLivraison: lieuLivraison,
                    description: items.value.map(i => `${i.qty}x ${i.desc}`).join(', '),
                    quantite: totalColis, nbColisExpedies: nbColisExp, montant: resteCFA + " CFA", prixOriginal: totalCFA + " CFA",
                    status: "EN_ATTENTE", containerStatus: "PARIS", agency: activeAgency, dateAjout: new Date(dateIso).toISOString(),
                    modeExpedition: shippingMode,
                    poids: shippingMode === 'aerien' ? (parseFloat(form.poids) || 0) : null,
                    aerienType: shippingMode === 'aerien' ? form.aerienType : null
                });

                // App AMT Clients : liaison client<->factures par phoneTail (les
                // 9 derniers chiffres, insensible au pays). E.164 = affichage.
                const _pc = routePhoneCountries(activeAgency);
                const expPhoneE164 = _pc.exp ? toE164Intl(expPhone, _pc.exp) : toE164Detect(expPhone);
                const destPhoneE164 = _pc.dest ? toE164Intl(destPhone, _pc.dest) : toE164Detect(destPhone);
                const expPhoneTail = phoneTail(expPhone);
                const destPhoneTail = phoneTail(destPhone);

                const transRef = doc(collection(db, getCollectionName("transactions")));
                batch.set(transRef, {
                    demarcheurId: affiliationDemarcheurId,
                    appointmentId: _appointmentId || null,
                    reference: ref, nom: finalExpName, nomDestinataire: finalDestName, numero: destPhone, tel: expPhone,
                    departureAgency: activeAgency, // agence de DÉPART (= ici l'agence active) pour l'app Clients
                    expPhoneE164, destPhoneE164, expPhoneTail, destPhoneTail,
                    adresseDestinataire: lieuLivraison, conteneur: conteneurCode, volumeCBM: volumeCBM, date: dateIso,
                    prix: totalCFA, montantParis: payeCFA, montantAbidjan: 0, reste: -resteCFA,
                    modePaiement: form.modePay, description: items.value.map(i => `${i.qty}x ${i.desc}`).join(', '),
                    items: items.value, quantite: totalColis, nbColisExpedies: nbColisExp, agency: activeAgency, isDeleted: false,
                    saisiPar: userName,
                    modeExpedition: shippingMode,
                    poids: shippingMode === 'aerien' ? (parseFloat(form.poids) || 0) : null,
                    aerienType: shippingMode === 'aerien' ? form.aerienType : null,
                    paymentHistory: payeCFA > 0 ? [{ date: dateIso, montantParis: payeCFA, montantAbidjan: 0, modePaiement: form.modePay, saisiPar: userName }] : []
                });

                if (conteneurCode && conteneurCode !== 'ATT') {
                    const _destAg = destinationAgencies.value.find(a => a.id === form.agence);
                    const destinationName = _destAg ? _destAg.name : (form.agence || 'ABIDJAN');
                    const containerRef = doc(db, getCollectionName("containers"), conteneurCode);
                    batch.set(containerRef, { number: conteneurCode, status: 'EN_CHARGEMENT', destination: destinationName, destinationAgency: form.agence || '', agency: activeAgency, modeExpedition: shippingMode, createdAt: new Date(dateIso).toISOString() }, { merge: true });
                }

                // MODÈLE CHINE : on enrichit la « Liste des Produits » avec les
                // descriptifs saisis (auto-complétion future) MAIS SANS le CBM
                // (dim vide), car le volume change à chaque envoi pour un même
                // produit. On ne touche jamais un produit déjà existant.
                if (factureModel.value === 'chine') {
                    const seenDesc = new Set();
                    items.value.forEach(it => {
                        const d = (it.desc || '').trim();
                        if (!d) return;
                        const key = d.toLowerCase();
                        if (seenDesc.has(key)) return;
                        seenDesc.add(key);
                        if (productsData.value.has(d)) return; // déjà au catalogue
                        const pRef = doc(collection(db, getCollectionName("products")));
                        batch.set(pRef, {
                            category: 'COLIS', desc: d, price: 0, dim: '',
                            agency: activeAgency, createdAt: new Date().toISOString(), auto: true,
                            modeExpedition: shippingMode
                        });
                    });
                }

                try {
                    await batch.commit();

                    // Génère la commission du démarcheur (autonome, idempotent,
                    // non bloquant). La formule applique :
                    //   bénéfice = montantFacture − (chargesParCbm × volume) maritime
                    //                              ou (chargesParKg × poids) aérien
                    //   répartition : 50% Démarcheur ; +10% Parrain (si parrainId) ; AMT = reste.
                    if (affiliationDemarcheurId) {
                        try {
                            await creerCommissionParrainage({
                                expeditionId: ref,
                                montantFacture: totalCFA,
                                volumeCbm: parseFloat(form.volume) || 0,
                                poidsKg: parseFloat(form.poids) || 0,
                                shippingMode: shippingMode,
                                demarcheurId: affiliationDemarcheurId,
                                agency: activeAgency,
                                clientNom: finalDestName,
                                clientPhone: destPhone,
                                description: items.value.map(i => `${i.qty}x ${i.desc}`).join(', '),
                            });
                        } catch (e) { console.warn('Commission (non bloquant):', e); }
                    }

                    // Lien RDV → facture : on marque le RDV « Facturé » (trace
                    // écrite, traçable des deux côtés). Non bloquant.
                    if (_appointmentId) {
                        try {
                            await updateDoc(doc(db, getCollectionName('appointments'), _appointmentId), {
                                status: 'facturé',
                                factureRef: ref,
                                facturedAt: new Date().toISOString(),
                            });
                        } catch (e) { console.warn('Lien RDV (non bloquant):', e); }
                    }

                    globalApp.showToast(
                        affiliationDemarcheurId
                            ? "Facture créée + commission partenaire générée ✔"
                            : "Facture créée et synchronisée vers Abidjan !",
                        "success");
                    
                    const now = new Date();
                    const formattedDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
                    
                    globalApp.printLabels({ ref: ref, date: formattedDate, destName: finalDestName, destPhone: destPhone, destAddress: lieuLivraison, expName: finalExpName, expAddress: expAddr, labels: printLabelsData });

                    // On RESTE sur Nouvelle Facture (plus pratique pour
                    // enchaîner). Réinitialisation rapide du formulaire sans
                    // recharger la page : données déjà chargées conservées.
                    form.expediteur = ''; form.destinataire = ''; form.lieu = '';
                    form.montantPaye = 0; form.comment = ''; form.valeur = '';
                    form.poids = ''; form.totalCfa = 0; form.parrainId = ''; form.nbColisExpedies = '';
                    form.date = new Date().toISOString().split('T')[0];
                    items.value = [{ id: Date.now(), desc: '', qty: 1, pu: '', total: 0, vol: '', poids: '', type: 'poids', lng: '', lrg: '', haut: '', showSugg: false }];
                    expFeedback.value = ''; destFeedback.value = '';
                    userTouchedTotal.value = false;
                    showExpSugg.value = false; showDestSugg.value = false; showLieuSugg.value = false;
                    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
                } catch(e) {
                    console.error(e);
                    globalApp.showToast("Erreur lors de l'enregistrement", "error");
                } finally {
                    saving.value = false;
                }
            };

            return {
                form, items, currentContainer, saving,
                expFeedback, destFeedback,
                showExpSugg, showDestSugg, showLieuSugg,
                filteredExpediteurs, filteredDestinataires, filteredLieux, getFilteredProducts,
                handleExpediteurChange, handleDestinataireChange,
                selectExp, selectDest, selectLieu, selectProduct, hideSugg,
                addRow, removeRow, updateItem, totalFret, resteAPayer, submitInvoice,
                destinationAgencies, affiliationActive, demarcheurs,
                clientModal, openClientModal, closeClientModal, saveClientFromModal,
                shippingMode, autoPricingActive, autoTotalCFA, userTouchedTotal, resetAutoTotal, tarifs,
                isParisAerien, lineBilledKg, lineTotalCfaAerien, totalColisAuto,
                currentAerienLot, groupingCode
            };
        }
    });

    this.vueApp.mount('#vue-nouvellefacture-app');
}
};