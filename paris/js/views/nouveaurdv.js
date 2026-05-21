import { db } from '../../../firebase-config.js';
import { collection, addDoc, getDocs, query, where, limit, onSnapshot, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { Autocomplete } from './autocomplete.js';
import { getCollectionName } from '../../../agencies-config.js';

export const NouveauRdvView = {
    unsubTodayRdv: null,
    clientsMap: new Map(),
    todayRdv: [],
    isNewClient: false,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.nouveauRdv = this; // Exposer la vue
        this.clientsMap.clear();

        const html = `
            <style>
                /* --- MODAL ET STYLES FOURNIS --- */
                .availability-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 10px; }
                .availability-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 11px; font-weight: bold; color: #64748b; margin-top: 10px; }
                .av-day { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px; text-align: center; min-height: 45px; display: flex; flex-direction: column; justify-content: center; background: white; }
                .av-day--empty { background: transparent; border: none; }
                .av-day--disabled { opacity: 0.5; background: #f8fafc; }
                .av-day--ok { border-color: #10b981; color: #10b981; cursor: pointer; }
                .av-day--off { border-color: #ef4444; color: #ef4444; }
                .av-day--selected { background: #10b981; color: white; border-color: #10b981; }
                .av-day--selected .av-day__meta { color: white; }
                .av-day__num { font-weight: bold; font-size: 14px; }
                .av-day__meta { font-size: 9px; margin-top: 2px; }
                .creneaux-grid { display: flex; gap: 10px; }
                .creneau-btn { flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; color: #64748b; cursor: pointer; font-weight: 600; transition: 0.2s; }
                .creneau-btn--active { background: #eff6ff; color: #3b82f6; border-color: #3b82f6; }
                .availability-selected { margin-top: 10px; padding: 10px; background: #f8fafc; border-radius: 8px; display: flex; justify-content: space-between; font-size: 12px; }
                
                .modal-box { background: white; border-radius: 16px; display: flex; flex-direction: column; max-height: 90vh; width: 90%; max-width: 800px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #e2e8f0; }
                .modal-header__title { font-size: 18px; font-weight: 800; color: #0f172a; }
                .modal-body { padding: 20px; overflow-y: auto; }
                .modal-footer { padding: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; border-radius: 0 0 16px 16px; }
                .form-section-title { font-size: 16px; font-weight: 700; margin: 0 0 15px 0; color: #1e293b; }
                .control { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
                .control:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
                /* Suggestions client : en FLUX normal (pas en superposition
                   absolue) pour qu'elles ne soient jamais rognées ni cachées
                   par la fenêtre qui défile — elles poussent le contenu. */
                #rdvClientSuggestions { position: static !important; box-shadow: none !important; margin-top: 6px; max-height: 220px; overflow-y: auto; }

                .nouveau-rdv-header {
                    background: white;
                    border-radius: 16px;
                    margin-bottom: 24px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                }
                .nouveau-rdv-header__content {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    padding: 20px 24px;
                    flex-wrap: wrap;
                }
                .nouveau-rdv-header__icon {
                    font-size: 32px;
                    background: #fdf2f8;
                    width: 56px;
                    height: 56px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 14px;
                    color: #e11d48;
                }
                .nouveau-rdv-header__info {
                    flex: 1;
                }
                .nouveau-rdv-header__title {
                    margin: 0;
                    font-size: 22px;
                    font-weight: 700;
                    color: #0f172a;
                }
                .nouveau-rdv-header__subtitle {
                    margin: 4px 0 0;
                    font-size: 13px;
                    color: #64748b;
                }
                .rdv-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                }
                
                /* --- STYLES DES CARTES RDV DU JOUR --- */
                .rdv-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; transition: transform 0.2s; }
                .rdv-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .rdv-card__header { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; }
                .rdv-type-badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; }
                .badge-depot { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
                .badge-recup { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
                .rdv-time { font-weight: 800; color: #0f172a; font-size: 14px; }
                .rdv-card__body { padding: 15px; flex: 1; }
                .rdv-client { display: flex; gap: 12px; margin-bottom: 15px; align-items: center; }
                .rdv-client-icon { font-size: 20px; color: #94a3b8; background: #f1f5f9; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
                .rdv-client-info { flex: 1; }
                .rdv-client-name { font-weight: 800; color: #1e293b; font-size: 14px; text-transform: uppercase; margin-bottom: 2px; }
                .rdv-client-phone { color: #64748b; font-size: 12px; font-weight: 600; }
                .rdv-address { display: flex; gap: 10px; align-items: flex-start; background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 12px; color: #475569; line-height: 1.4; border: 1px solid #e2e8f0; }
                .rdv-address-icon { font-size: 14px; }
                .rdv-card__footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-top: 1px solid #e2e8f0; background: #fff; }
                .rdv-status { font-size: 12px; font-weight: 700; }
                .rdv-status--validated { color: #10b981; }
                .rdv-status--pending { color: #f59e0b; }
                .rdv-status--cancelled { color: #ef4444; }
                .rdv-card__actions { display: flex; gap: 6px; }
                .btn-action { padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; background: white; transition: 0.2s; }
                .btn-action--depot { border-color: #bae6fd; color: #0284c7; background: #f0f9ff; }
                .btn-action--depot:hover { background: #e0f2fe; }
                .btn-action--recup { border-color: #e9d5ff; color: #7e22ce; background: #faf5ff; }
                .btn-action--recup:hover { background: #f3e8ff; }
                .btn-action--edit { border-color: #cbd5e1; color: #475569; background: #f8fafc; }
                .btn-action--edit:hover { background: #e2e8f0; }
            </style>
            
            <div style="max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;">
                
                <div class="nouveau-rdv-header">
                    <div class="nouveau-rdv-header__content">
                        <div class="nouveau-rdv-header__icon">📅</div>
                        <div class="nouveau-rdv-header__info">
                            <h1 class="nouveau-rdv-header__title">Prise de Rendez-vous</h1>
                            <p class="nouveau-rdv-header__subtitle">Gérez et planifiez les collectes et livraisons</p>
                        </div>
                    <button class="amt-btn amt-btn-primary amt-btn-lg" onclick="window.app.views.nouveauRdv.openModal()">
                        <i class="fas fa-plus"></i> Nouveau Rendez-vous
                    </button>
                        
                    </div>
                    
                </div>

                <!-- Section RDV du jour sélectionné -->
                <div class="today-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
                        <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0;">
                            <span style="background: #fdf2f8; padding: 6px 10px; border-radius: 8px; margin-right: 10px;">📆</span>
                            RDV pour le <span id="todayRdvDate">${new Date().toLocaleDateString('fr-FR')}</span>
                            <span class="today-count" id="rdvTodayCount" style="background: #e11d48; color: white; padding: 4px 10px; border-radius: 12px; margin-left: 10px; font-size: 14px;">0</span>
                        </h2>
                        <div>
                            <input type="date" id="rdvDateFilter" value="${new Date().toISOString().split('T')[0]}" class="control" style="width: auto; padding: 8px; font-weight: 600;">
                        </div>
                    </div>
                    <div class="rdv-cards" id="rdvTodayCards">
                        <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: #64748b;">
                            <i class="fas fa-spinner fa-spin"></i> Chargement des RDVs...
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODAL NOUVEAU RDV -->
            <div id="nouveauRdvModal" class="modal" style="display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center;">
                <div class="modal-box">
                    <div class="modal-header">
                        <div class="modal-header__title">➕ Nouveau Rendez-vous</div>
                        <button class="icon-btn" aria-label="Close" onclick="window.app.views.nouveauRdv.closeModal()" style="background:none; border:none; font-size:20px; cursor:pointer; color:#64748b;">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-section" style="margin-bottom: 25px;">
                            <h3 class="form-section-title">🔍 Rechercher un prospect / client</h3>
                            <div id="prospectSearchWrapper" class="prospect-search-wrapper" style="display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 60;">
                                <div style="position: relative;">
                                    <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; pointer-events:none;">🔍</span>
                                    <input id="rdvClient" class="control" placeholder="Rechercher : nom ou téléphone du prospect / client…" autocomplete="off" style="padding-left:34px;">
                                    <div id="rdvClientSuggestions" style="display:none; margin-top:6px; border:1px solid #e2e8f0; border-radius:10px; max-height:230px; overflow-y:auto; background:#fff; box-shadow:0 4px 10px rgba(0,0,0,0.06);"></div>
                                </div>
                                <button class="btn-create-prospect" type="button" onclick="window.app.views.nouveauRdv.toggleNewClientForm(true)" style="width:100%; padding:11px 15px; border:1px dashed #93c5fd; border-radius:10px; background:#eff6ff; color:#1d4ed8; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">➕ Créer un nouveau prospect</button>
                            </div>
                            <div id="rdvClientFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;"></div>
                            
                            <div class="prospect-form" id="prospectFormWrapper" style="display: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-top: 15px;">
                                <div class="prospect-form__header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="prospect-form__icon" style="background: #e0f2fe; color: #0284c7; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 16px;">➕</span>
                                        <span class="prospect-form__title" style="font-weight: 700; color: #0f172a;">Créer un nouveau prospect</span>
                                    </div>
                                    <button type="button" class="btn btn-outline btn-small" onclick="window.app.views.nouveauRdv.toggleNewClientForm(false)" style="padding: 6px 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; cursor: pointer;">Annuler</button>
                                </div>
                                <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                    <div class="form-field"><label class="label">Nom *</label><input id="newClientNom" class="control" placeholder="Nom du prospect"></div>
                                    <div class="form-field"><label class="label">Prénom</label><input id="newClientPrenom" class="control" placeholder="Prénom"></div>
                                    <div class="form-field"><label class="label">Téléphone *</label><input id="newClientTel" class="control" placeholder="Téléphone"></div>
                                    <div class="form-field"><label class="label">Email</label><input id="newClientEmail" class="control" type="email" placeholder="Email"></div>
                                    <div class="form-field form-field--full" style="grid-column: 1 / -1;"><label class="label">Adresse</label>
                                        <div class="address-autocomplete" style="position: relative;">
                                            <input id="newClientAdresse" class="control" placeholder="Adresse complète" autocomplete="off">
                                        <ul id="newClientAdresseSuggestions" class="autocomplete-suggestions autocomplete-up"></ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-section">
                            <h3 class="form-section-title">📋 Détails du RDV</h3>
                            
                            <!-- Calendrier Visuel Statique -->
                            <div class="availability-box" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                                <div class="availability-box__header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                    <div>
                                        <div class="availability-box__title" style="font-weight: 700; color: #0f172a; font-size: 14px;">Calendrier des places disponibles</div>
                                        <div class="availability-box__subtitle" style="font-size: 12px; color: #64748b;">Base: 4 camion(s) × 20 RDV</div>
                                    </div>
                                    <div class="availability-box__actions" style="display: flex; gap: 5px;">
                                        <input class="availability-month control" type="month" style="width: auto; padding: 4px 8px;">
                                        <button class="availability-refresh btn btn-outline" type="button" style="padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; cursor: pointer;">↻</button>
                                    </div>
                                </div>
                                <div class="availability-month-label" style="font-weight: bold; text-align: center; color: #1e293b; margin-bottom: 5px;">mai 2026</div>
                                <div class="availability-weekdays">
                                    <span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span>
                                </div>
                                <div class="availability-grid">
                                    <div class="av-day av-day--empty"></div>
                                    <div class="av-day av-day--empty"></div>
                                    <div class="av-day av-day--empty"></div>
                                    <div class="av-day av-day--empty"></div>
                                    <div class="av-day av-day--past av-day--disabled"><div class="av-day__num">1</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--past av-day--disabled"><div class="av-day__num">2</div><div class="av-day__meta">Dispo: 21</div></div>
                                    <div class="av-day av-day--past av-day--disabled"><div class="av-day__num">3</div><div class="av-day__meta">Dispo: 0</div></div>
                                    <div class="av-day av-day--past av-day--disabled"><div class="av-day__num">4</div><div class="av-day__meta">Dispo: 39</div></div>
                                    <div class="av-day av-day--past av-day--disabled"><div class="av-day__num">5</div><div class="av-day__meta">Dispo: 37</div></div>
                                    <div class="av-day av-day--past av-day--disabled"><div class="av-day__num">6</div><div class="av-day__meta">Dispo: 34</div></div>
                                    <div class="av-day av-day--past av-day--disabled"><div class="av-day__num">7</div><div class="av-day__meta">Dispo: 32</div></div>
                                    <div class="av-day av-day--ok av-day--selected"><div class="av-day__num">8</div><div class="av-day__meta">Dispo: 27</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">9</div><div class="av-day__meta">Dispo: 37</div></div>
                                    <div class="av-day av-day--off av-day--disabled"><div class="av-day__num">10</div><div class="av-day__meta">Dispo: 0</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">11</div><div class="av-day__meta">Dispo: 55</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">12</div><div class="av-day__meta">Dispo: 75</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">13</div><div class="av-day__meta">Dispo: 74</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">14</div><div class="av-day__meta">Dispo: 76</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">15</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">16</div><div class="av-day__meta">Dispo: 77</div></div>
                                    <div class="av-day av-day--off av-day--disabled"><div class="av-day__num">17</div><div class="av-day__meta">Dispo: 0</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">18</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">19</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">20</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">21</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">22</div><div class="av-day__meta">Dispo: 78</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">23</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--off av-day--disabled"><div class="av-day__num">24</div><div class="av-day__meta">Dispo: 0</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">25</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">26</div><div class="av-day__meta">Dispo: 78</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">27</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">28</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">29</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--ok"><div class="av-day__num">30</div><div class="av-day__meta">Dispo: 80</div></div>
                                    <div class="av-day av-day--off av-day--disabled"><div class="av-day__num">31</div><div class="av-day__meta">Dispo: 0</div></div>
                                </div>
                                <div class="availability-selected">
                                    <span>Date sélectionnée: <strong>2026-05-08</strong></span>
                                    <span>Programmés: <strong>53</strong></span>
                                    <span>Disponibles: <strong>27</strong></span>
                                </div>
                            </div>

                            <!-- Champs Formulaire -->
                            <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="form-field">
                                    <label class="label">Type *</label>
                                    <select id="rdvType" class="control">
                                        <option disabled value="">Sélectionner…</option>
                                        <option value="DEPOT">Dépôt</option>
                                        <option value="RECUPERATION" selected>Récupération</option>
                                    </select>
                                </div>
                                <div class="form-field">
                                    <label class="label">Date *</label>
                                    <input id="rdvDate" class="control" type="date" value="${new Date().toISOString().split('T')[0]}">
                                </div>
                                <div class="form-field form-field--full" style="grid-column: 1 / -1;">
                                    <label class="label">Créneaux</label>
                                    <div class="creneaux-grid">
                                        <button type="button" id="btnCreneauMatin" class="creneau-btn creneau-btn--active" onclick="window.app.views.nouveauRdv.selectCreneau('Matin (10H-12H)')">Matin (10H-12H)</button>
                                        <button type="button" id="btnCreneauAprem" class="creneau-btn" onclick="window.app.views.nouveauRdv.selectCreneau('Après-midi (12H-18H)')">Après-midi (12H-18H)</button>
                                    </div>
                                    <input type="hidden" id="rdvTime" value="Matin (10H-12H)">
                                </div>
                                <div class="form-field">
                                    <label class="label">Téléphone</label>
                                    <input id="rdvTel" class="control" placeholder="Téléphone de contact">
                                </div>
                                <div class="form-field">
                                    <label class="label">Adresse</label>
                                    <div class="address-autocomplete" style="position: relative;">
                                        <input id="rdvAdresse" class="control" placeholder="Adresse du RDV" autocomplete="off">
                                    <ul id="rdvAdresseSuggestions" class="autocomplete-suggestions autocomplete-up"></ul>
                                    </div>
                                </div>
                                <div class="form-field form-field--full" style="grid-column: 1 / -1;">
                                    <label class="label">Commentaire</label>
                                    <textarea id="rdvNotes" class="control control--textarea" placeholder="Notes ou instructions..." rows="3" style="resize: vertical; font-family: inherit;"></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn--ghost" type="button" onclick="window.app.views.nouveauRdv.closeModal()" style="padding: 10px 20px; background: white; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; font-weight: 600; color: #475569;">Annuler</button>
                        <button id="rdvSubmitBtn" class="btn btn--primary" type="button" onclick="window.app.views.nouveauRdv.submitRdv()" style="padding: 10px 20px; background: #3b82f6; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; color: white;">✅ Créer le RDV</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        
        this.loadAutocompleteData();
        this.loadTodayRdv();

        document.getElementById('rdvDateFilter').addEventListener('change', () => this.loadTodayRdv());

        // Recherche client AUTONOME : liste rendue EN FLUX NORMAL (elle pousse
        // le contenu vers le bas) — jamais masquée ni rognée, sans dépendre du
        // composant partagé Autocomplete (fragile dans une modale qui défile).
        const _rdvClientInput = document.getElementById('rdvClient');
        if (_rdvClientInput) {
            _rdvClientInput.addEventListener('input', (e) => this.searchClients(e.target.value));
            _rdvClientInput.addEventListener('focus', (e) => this.searchClients(e.target.value));
        }

        // Initialiser l'auto-complétion des adresses via l'API Gouvernementale
        Autocomplete.initAddress('newClientAdresse', 'newClientAdresseSuggestions');
        Autocomplete.initAddress('rdvAdresse', 'rdvAdresseSuggestions');
    },

    openModal() {
        const modal = document.getElementById('nouveauRdvModal');
        if (modal) {
            document.getElementById('rdvDate').value = new Date().toISOString().split('T')[0];
            this.toggleNewClientForm(false);
            modal.style.display = 'flex';
        }
    },

    closeModal() {
        const modal = document.getElementById('nouveauRdvModal');
        if (modal) modal.style.display = 'none';
    },

    selectCreneau(creneau) {
        document.getElementById('rdvTime').value = creneau;
        document.getElementById('btnCreneauMatin').classList.remove('creneau-btn--active');
        document.getElementById('btnCreneauAprem').classList.remove('creneau-btn--active');
        const targetId = creneau.includes('Matin') ? 'btnCreneauMatin' : 'btnCreneauAprem';
        document.getElementById(targetId).classList.add('creneau-btn--active');
    },

    toggleNewClientForm(show) {
        this.isNewClient = show;
        const searchWrapper = document.getElementById('prospectSearchWrapper');
        const formWrapper = document.getElementById('prospectFormWrapper');
        const feedback = document.getElementById('rdvClientFeedback');
        
        if (searchWrapper) searchWrapper.style.display = show ? 'none' : 'flex';
        if (feedback) feedback.style.display = show ? 'none' : 'block';
        if (formWrapper) formWrapper.style.display = show ? 'block' : 'none';
        
        if (!show) {
            if (document.getElementById('newClientNom')) document.getElementById('newClientNom').value = '';
            if (document.getElementById('newClientPrenom')) document.getElementById('newClientPrenom').value = '';
            if (document.getElementById('newClientTel')) document.getElementById('newClientTel').value = '';
            if (document.getElementById('newClientEmail')) document.getElementById('newClientEmail').value = '';
            if (document.getElementById('newClientAdresse')) document.getElementById('newClientAdresse').value = '';
        }
    },

    async loadAutocompleteData() {
        try {
            // Même source que Nouvelle Facture (route-aware + filtre agence) :
            // garantit que le nom saisi au RDV correspond EXACTEMENT au client
            // de la facture → rattachement RDV ↔ facture fiable.
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const clientsSnap = await getDocs(query(collection(db, getCollectionName("clients")), where("agency", "==", activeAgency)));
            this.clientsMap.clear();
            clientsSnap.forEach(doc => {
                const data = doc.data();
                if (data.nom) this.clientsMap.set(data.nom.trim(), data);
            });
            
        } catch (e) {
            console.error("Erreur chargement auto-complétion :", e);
        }
    },

    handleClientChange() {
        const clientName = document.getElementById('rdvClient').value.trim();
        const telInput = document.getElementById('rdvTel');
        const adresseInput = document.getElementById('rdvAdresse');
        const feedback = document.getElementById('rdvClientFeedback');

        if (!clientName) {
            if (telInput) telInput.value = '';
            if (adresseInput) adresseInput.value = '';
            if (feedback) feedback.innerHTML = '';
            return;
        }

        if (this.clientsMap.has(clientName)) {
            const clientData = this.clientsMap.get(clientName);
            if (telInput) telInput.value = clientData.tel || '';
            if (adresseInput) adresseInput.value = clientData.adresse || '';
            if (feedback) feedback.innerHTML = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> Client reconnu</span>`;
        } else {
            if (telInput) telInput.value = '';
            if (adresseInput) adresseInput.value = '';
            if (feedback) feedback.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-info-circle"></i> Nouveau client</span>`;
        }
    },

    // Recherche client AUTONOME : rend une liste cliquable EN FLUX NORMAL
    // dans #rdvClientSuggestions (pousse le contenu vers le bas). Aucune
    // dépendance au composant partagé, aucun positionnement absolu → la liste
    // est TOUJOURS entièrement visible, jamais masquée ni rognée.
    searchClients(rawQuery) {
        const box = document.getElementById('rdvClientSuggestions');
        this.handleClientChange();
        if (!box) return;
        const q = (rawQuery || '').toLowerCase().trim();
        if (q.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
        const matches = [];
        for (const [nom, data] of this.clientsMap.entries()) {
            if (nom.toLowerCase().includes(q) || (data.tel && String(data.tel).includes(q))) matches.push(data);
            if (matches.length >= 12) break;
        }
        if (matches.length === 0) {
            box.innerHTML = '<div style="padding:10px 12px; color:#64748b; font-size:13px;">Aucun client trouvé — utilisez « Créer un nouveau prospect ».</div>';
            box.style.display = 'block';
            return;
        }
        box.innerHTML = matches.map((c) => `
            <div class="rdv-cli-item" data-nom="${String(c.nom || '').replace(/"/g, '&quot;')}" style="padding:10px 12px; cursor:pointer; border-bottom:1px solid #f1f5f9;">
                <div style="font-weight:600; color:#1e293b;">${c.nom || ''}</div>
                <div style="font-size:11px; color:#64748b;">📞 ${c.tel || 'Non renseigné'}</div>
            </div>`).join('');
        box.style.display = 'block';
        box.querySelectorAll('.rdv-cli-item').forEach((el) => {
            el.addEventListener('click', () => this.selectClientResult(el.getAttribute('data-nom')));
        });
    },

    selectClientResult(nom) {
        const input = document.getElementById('rdvClient');
        if (input) input.value = nom || '';
        const box = document.getElementById('rdvClientSuggestions');
        if (box) { box.style.display = 'none'; box.innerHTML = ''; }
        this.handleClientChange();
    },

    loadTodayRdv() {
        if (this.unsubTodayRdv) this.unsubTodayRdv();
        
        const dateFilter = document.getElementById('rdvDateFilter');
        const selectedDate = dateFilter ? dateFilter.value : new Date().toISOString().split('T')[0];
        
        const dateLabel = document.getElementById('todayRdvDate');
        if (dateLabel) {
            dateLabel.textContent = new Date(selectedDate).toLocaleDateString('fr-FR');
        }

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const q = query(
            collection(db, getCollectionName("appointments")), 
            where("agency", "==", activeAgency),
            where("date", "==", selectedDate)
        );

        this.unsubTodayRdv = onSnapshot(q, (snapshot) => {
            this.todayRdv = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            this.todayRdv.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
            this.renderTodayRdv();
        }, (error) => {
            console.error("Erreur lors du chargement des RDV du jour :", error);
        });
    },

    renderTodayRdv() {
        const container = document.getElementById('rdvTodayCards');
        const countEl = document.getElementById('rdvTodayCount');
        
        if (countEl) countEl.textContent = this.todayRdv.length;
        if (!container) return;

        if (this.todayRdv.length === 0) {
            container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: #64748b;">Aucun rendez-vous prévu pour cette date.</div>';
            return;
        }

        container.innerHTML = this.todayRdv.map(rdv => {
            const isDepot = rdv.rdvType === 'DEPOT';
            const typeLabel = isDepot ? 'DÉPÔT' : 'RÉCUPÉRATION';
            const typeClass = isDepot ? 'badge-depot' : 'badge-recup';

            let statusClass = 'rdv-status--validated';
            let statusText = '✅ Validé';
            if (rdv.status === 'en_attente') {
                statusClass = 'rdv-status--pending';
                statusText = '⏳ En attente';
            } else if (rdv.status === 'annulé') {
                statusClass = 'rdv-status--cancelled';
                statusText = '❌ Annulé';
            }

            let validateBtn = '';
            if (rdv.status === 'en_attente' || rdv.status === 'annulé') {
                validateBtn = `<button class="btn-action" title="Valider ce RDV" onclick="window.app.views.nouveauRdv.changeStatus('${rdv.id}', 'confirmé')" style="border-color: #86efac; color: #16a34a; background: #f0fdf4;">✅ Valider</button>`;
            }

            return `
                <div class="rdv-card">
                    <div class="rdv-card__header">
                        <span class="rdv-type-badge ${typeClass}">${typeLabel}</span>
                        <span class="rdv-time">${rdv.time || '--:--'}</span>
                    </div>
                    <div class="rdv-card__body">
                        <div class="rdv-client">
                            <div class="rdv-client-icon">👤</div>
                            <div class="rdv-client-info">
                                <div class="rdv-client-name">${rdv.client || 'Client'}</div>
                                <div class="rdv-client-phone">📞 ${rdv.tel || 'Non renseigné'}</div>
                                <div class="rdv-client-phone">👷 Pris par : ${rdv.saisiPar || '—'}</div>
                            </div>
                        </div>
                        <div class="rdv-address">
                            <span class="rdv-address-icon">📍</span>
                            <span>${rdv.adresse || 'Adresse non spécifiée'}</span>
                        </div>
                    </div>
                    <div class="rdv-card__footer">
                        <span class="rdv-status ${statusClass}">${statusText}</span>
                        <div class="rdv-card__actions">
                            ${validateBtn}
                            <button class="btn-action btn-action--depot" title="Dépôt en attente de récupération (pas de facture à ce stade)" onclick="window.app.views.nouveauRdv.depotInfo()">+Dépôt</button>
                            <button class="btn-action btn-action--recup" title="Créer la facture de récupération (pré-remplie)" onclick="window.app.views.nouveauRdv.toFacture('${rdv.id}')">+Récup</button>
                            <button class="btn-action btn-action--edit" title="Modifier ce RDV" onclick="window.app.renderPage('appointments-list')">✏️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async submitRdv() {
        const date = document.getElementById('rdvDate').value;
        let clientName = "";
        let clientTel = "";
        let clientAdresse = "";

        if (this.isNewClient) {
            const nom = document.getElementById('newClientNom') ? document.getElementById('newClientNom').value.trim() : '';
            const prenom = document.getElementById('newClientPrenom') ? document.getElementById('newClientPrenom').value.trim() : '';
            clientName = `${nom} ${prenom}`.trim();
            clientTel = document.getElementById('newClientTel') ? document.getElementById('newClientTel').value.trim() : '';
            clientAdresse = document.getElementById('newClientAdresse') ? document.getElementById('newClientAdresse').value.trim() : '';
            const email = document.getElementById('newClientEmail') ? document.getElementById('newClientEmail').value.trim() : '';

            if (!nom || !clientTel || !date) {
                this.app.showToast("Veuillez remplir le nom, le téléphone et la date.", "error");
                return;
            }

            try {
                await addDoc(collection(db, getCollectionName("clients")), {
                    nom: clientName,
                    tel: clientTel,
                    email: email,
                    adresse: clientAdresse,
                    dateAjout: new Date().toISOString(),
                    agency: sessionStorage.getItem('currentActiveAgency') || 'paris',
                    risque: 'low',
                    segment: 'nouveau',
                    taille: 'petit',
                    ca: 0,
                    factures: 0
                });
                this.app.showToast("Nouveau client créé !", "success");
            } catch(e) {
                console.error("Erreur création client:", e);
                this.app.showToast("Erreur lors de la création du client", "error");
                return;
            }
        } else {
            clientName = document.getElementById('rdvClient').value.trim();
            clientTel = document.getElementById('rdvTel').value.trim();
            clientAdresse = document.getElementById('rdvAdresse').value.trim();

            if (!clientName || !date) {
                this.app.showToast("Veuillez remplir le nom du client et la date.", "error");
                return;
            }
        }

        const btn = document.getElementById('rdvSubmitBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        const rdvData = {
            client: clientName, 
            tel: clientTel, 
            adresse: clientAdresse,
            date: date, time: document.getElementById('rdvTime').value, 
            notes: document.getElementById('rdvNotes').value.trim(),
            rdvType: document.getElementById('rdvType').value,
            status: "en_attente", agency: sessionStorage.getItem('currentActiveAgency') || 'paris', createdAt: new Date().toISOString(), saisiPar: sessionStorage.getItem('userName') || 'Agent'
        };

        try {
            await addDoc(collection(db, getCollectionName("appointments")), rdvData);
            this.app.showToast("Rendez-vous enregistré avec succès !", "success");
            this.closeModal();
            
            // Rafraîchir la vue si la date du RDV correspond au filtre
            const currentFilterDate = document.getElementById('rdvDateFilter')?.value;
            if (date === currentFilterDate) {
                this.loadTodayRdv();
            }
        } catch(e) {
            this.app.showToast("Erreur lors de l'enregistrement", "error");
        } finally {
            btn.innerHTML = '✅ Créer le RDV';
            btn.disabled = false;
        }
    },

    // RÉCUPÉRATION : ouvre Nouvelle Facture pré-remplie avec le client du RDV
    // et garde le lien RDV↔facture (la facture, à l'enregistrement, marquera
    // ce RDV « Facturé »). Le chauffeur n'a qu'un geste.
    toFacture(rdvId) {
        const rdv = (this.todayRdv || []).find(r => r.id === rdvId);
        if (!rdv) { this.app.showToast("RDV introuvable.", "error"); return; }
        try {
            sessionStorage.setItem('nf_prefill', JSON.stringify({
                appointmentId: rdv.id,
                client: rdv.client || '',
                tel: rdv.tel || '',
                adresse: rdv.adresse || '',
            }));
        } catch (e) { /* sessionStorage indisponible : on ouvre la facture vide */ }
        window.app.renderPage('invoice-new');
    },

    // DÉPÔT : pas de facture à ce stade (choix métier validé). Le RDV
    // lui-même est la trace écrite « en attente de récupération ».
    depotInfo() {
        this.app.showToast("Dépôt enregistré — en attente de récupération. La facture sera créée lors de la récupération.", "info");
    },

    async changeStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, getCollectionName("appointments"), id), { status: newStatus });
            this.app.showToast(`Rendez-vous ${newStatus === 'confirmé' ? 'validé' : newStatus} !`, newStatus === 'confirmé' ? 'success' : 'info');
        } catch(e) {
            this.app.showToast("Erreur de mise à jour", "error");
        }
    }
};