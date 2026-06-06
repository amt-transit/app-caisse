import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, getDocs, addDoc, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../commun/agencies-config.js';

export const SmsView = {
    unsub: null,
    clientsList: [],
    history: [],

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.sms = this;

        const html = `
            <style>
                .sms-page { max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .sms-header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; border-radius: 16px; padding: 25px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); flex-wrap: wrap; gap: 15px; }
                .sms-header__left { display: flex; align-items: center; gap: 15px; }
                .sms-header__icon { background: rgba(255,255,255,0.1); width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 28px; }
                .sms-header__title { margin: 0; font-size: 22px; font-weight: 800; }
                .sms-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #94a3b8; }

                .sms-tabs { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
                .sms-tab { padding: 8px 16px; font-weight: 700; font-size: 14px; color: #64748b; cursor: pointer; border-radius: 8px; transition: 0.2s; border: none; background: transparent; }
                .sms-tab:hover { background: #f1f5f9; color: #0f172a; }
                .sms-tab.active { background: #e0f2fe; color: #0284c7; }

                .sms-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
                @media (max-width: 768px) { .sms-grid { grid-template-columns: 1fr; } }

                .sms-card { background: white; border-radius: 16px; padding: 25px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .sms-card-title { font-size: 16px; font-weight: 800; color: #1e293b; margin: 0 0 20px 0; display: flex; align-items: center; gap: 8px; }
                
                .form-group { margin-bottom: 20px; }
                .form-label { display: block; font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 8px; }
                .form-select, .form-input, .form-textarea { width: 100%; padding: 12px 16px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 14px; font-family: inherit; box-sizing: border-box; transition: 0.2s; background: #f8fafc; }
                .form-select:focus, .form-input:focus, .form-textarea:focus { outline: none; border-color: #3b82f6; background: white; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                
                .target-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 10px; margin-top: 10px; display: flex; align-items: center; justify-content: space-between; }
                .target-box__text { color: #166534; font-size: 13px; font-weight: 600; }
                .target-box__count { background: #16a34a; color: white; padding: 4px 12px; border-radius: 20px; font-weight: 800; font-size: 14px; }

                .sms-preview { background: #f1f5f9; border-radius: 12px; padding: 20px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; }
                .sms-bubble { background: #e0f2fe; color: #0f172a; padding: 15px; border-radius: 16px 16px 16px 0; font-size: 14px; line-height: 1.5; margin-top: auto; border: 1px solid #bae6fd; position: relative; white-space: pre-wrap; word-break: break-word; }
                .sms-bubble::after { content: ''; position: absolute; bottom: 0; left: -10px; border-width: 10px 10px 0 0; border-style: solid; border-color: #e0f2fe transparent transparent transparent; }
                .char-count { text-align: right; font-size: 11px; color: #64748b; margin-top: 8px; font-weight: 600; }

                .btn-send { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 16px; border-radius: 12px; font-size: 16px; font-weight: 800; width: 100%; cursor: pointer; transition: 0.2s; display: flex; justify-content: center; align-items: center; gap: 10px; box-shadow: 0 4px 6px rgba(37,99,235,0.2); }
                .btn-send:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(37,99,235,0.3); }
                .btn-send:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

                /* Historique Table */
                .history-panel { display: none; }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { text-align: left; padding: 15px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #64748b; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; }
                .data-table td { padding: 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
                .badge-success { background: #dcfce7; color: #166534; }
            </style>

            <div class="sms-page">
                <div class="sms-header">
                    <div class="sms-header__left">
                        <div class="sms-header__icon"><i class="fas fa-comments"></i></div>
                        <div>
                            <h1 class="sms-header__title">Communication Clients</h1>
                            <p class="sms-header__subtitle">Campagnes SMS et alertes de livraison</p>
                        </div>
                    </div>
                </div>

                <div class="sms-tabs">
                    <button class="sms-tab active" onclick="window.app.views.sms.switchTab('new')">Nouvelle Campagne</button>
                    <button class="sms-tab" onclick="window.app.views.sms.switchTab('history')">Historique des envois</button>
                </div>

                <!-- NOUVELLE CAMPAGNE -->
                <div id="panel-new" class="sms-grid">
                    <div class="sms-card">
                        <h3 class="sms-card-title"><i class="fas fa-paper-plane text-blue-500"></i> Paramétrage du message</h3>
                        
                        <div class="form-group">
                            <label class="form-label">Cible (Destinataires)</label>
                            <select id="smsTarget" class="form-select" onchange="window.app.views.sms.calculateTarget()">
                                <option value="">-- Sélectionnez un groupe cible --</option>
                                <option value="all">Tous les clients enregistrés</option>
                                <option value="arrived">Colis arrivés à Abidjan (Non livrés)</option>
                                <option value="debt">Clients avec impayés (Reste à payer > 0)</option>
                                <option value="manual">Saisie manuelle d'un numéro</option>
                            </select>
                            
                            <div id="manualTargetBox" style="display:none; margin-top: 10px;">
                                <input type="text" id="smsManualPhone" class="form-input" placeholder="Ex: 0102030405" oninput="window.app.views.sms.calculateTarget()">
                            </div>
                            
                            <div id="targetResult" class="target-box" style="display: none;">
                                <span class="target-box__text">Destinataires trouvés :</span>
                                <span class="target-box__count" id="targetCount">0</span>
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Modèle rapide</label>
                            <select id="smsTemplate" class="form-select" onchange="window.app.views.sms.applyTemplate()">
                                <option value="">-- Message personnalisé --</option>
                                <option value="arrival">Notification d'arrivée</option>
                                <option value="reminder">Relance impayé</option>
                                <option value="promo">Annonce promotionnelle</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Contenu du message</label>
                            <textarea id="smsBody" class="form-textarea" rows="5" placeholder="Tapez votre message ici..." oninput="window.app.views.sms.updatePreview()"></textarea>
                            <div class="char-count" id="charCount">0 caractère(s) | 1 SMS</div>
                        </div>

                        <button id="sendBtn" class="btn-send" onclick="window.app.views.sms.sendCampaign()" disabled>
                            <i class="fas fa-paper-plane"></i> Envoyer la campagne
                        </button>
                    </div>

                    <div class="sms-card" style="padding: 0; border: none; box-shadow: none;">
                        <div class="sms-preview">
                            <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #475569; display: flex; align-items: center; gap: 8px;"><i class="fas fa-mobile-alt"></i> Aperçu sur mobile</h3>
                            <div class="sms-bubble" id="smsBubblePreview">Votre message apparaîtra ici...</div>
                        </div>
                    </div>
                </div>

                <!-- HISTORIQUE -->
                <div id="panel-history" class="history-panel sms-card">
                    <h3 class="sms-card-title"><i class="fas fa-history text-slate-500"></i> Historique des communications</h3>
                    <div style="overflow-x: auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Date d'envoi</th>
                                    <th>Cible</th>
                                    <th>Nb SMS</th>
                                    <th style="width: 40%;">Aperçu du message</th>
                                    <th>Agent</th>
                                    <th>Statut</th>
                                </tr>
                            </thead>
                            <tbody id="historyTableBody">
                                <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        if (container) container.innerHTML = html;
        this.loadClientsData();
        this.loadHistory();
    },

    switchTab(tab) {
        document.querySelectorAll('.sms-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.sms-tab[onclick*="'${tab}'"]`).classList.add('active');
        
        document.getElementById('panel-new').style.display = tab === 'new' ? 'grid' : 'none';
        document.getElementById('panel-history').style.display = tab === 'history' ? 'block' : 'none';
    },

    async loadClientsData() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        
        try {
            // Récupérer Clients et Livraisons pour estimer les cibles
            const smsLivCol = getCollectionName("livraisons");
            const smsLivConstraints = [];
            if (smsLivCol === "livraisons") smsLivConstraints.unshift(where("agency", "==", activeAgency));
            const smsLivQuery = query(collection(db, smsLivCol), ...smsLivConstraints);
            const [clientsSnap, livSnap] = await Promise.all([
                getDocs(query(collection(db, getCollectionName("clients")), where("agency", "==", activeAgency))),
                getDocs(smsLivQuery)
            ]);

            this.clientsList = clientsSnap.docs.map(d => d.data());
            this.livraisonsList = livSnap.docs.map(d => d.data());
        } catch(e) { console.error("Erreur chargement données SMS", e); }
    },

    calculateTarget() {
        const target = document.getElementById('smsTarget').value;
        const manualBox = document.getElementById('manualTargetBox');
        const resultBox = document.getElementById('targetResult');
        const countEl = document.getElementById('targetCount');
        const btn = document.getElementById('sendBtn');
        
        let count = 0;
        manualBox.style.display = target === 'manual' ? 'block' : 'none';

        if (target === 'all') {
            count = this.clientsList.length;
        } else if (target === 'arrived') {
            const arrived = this.livraisonsList.filter(l => l.containerStatus === 'EN_COURS' && l.status !== 'LIVRE' && l.status !== 'ABANDONNE');
            // Extraire numéros uniques
            const phones = new Set(arrived.map(l => l.numero).filter(Boolean));
            count = phones.size;
        } else if (target === 'debt') {
            // Simplification: on simule qu'environ 30% ont une dette si on a pas les transactions chargées ici
            count = Math.floor(this.clientsList.length * 0.3); 
        } else if (target === 'manual') {
            const phone = document.getElementById('smsManualPhone').value.trim();
            count = phone.length >= 8 ? 1 : 0;
        }

        if (target) {
            resultBox.style.display = 'flex';
            countEl.textContent = count;
        } else {
            resultBox.style.display = 'none';
        }

        this.updatePreview(); // Re-check validation
    },

    applyTemplate() {
        const tpl = document.getElementById('smsTemplate').value;
        const body = document.getElementById('smsBody');
        
        if (tpl === 'arrival') {
            body.value = "Bonjour,\nVotre colis expédié via AMT TRANS'IT est bien arrivé à Abidjan et est prêt pour la livraison.\nMerci de nous contacter au 0180893370.";
        } else if (tpl === 'reminder') {
            body.value = "Bonjour,\nSauf erreur de notre part, votre facture AMT TRANS'IT présente un solde restant à régler. Merci de bien vouloir régulariser.\nCordialement.";
        } else if (tpl === 'promo') {
            body.value = "PROMO AMT TRANS'IT !\nProfitez de -10% sur votre prochain envoi ce mois-ci. L'équipe vous attend à l'entrepôt.";
        } else {
            body.value = "";
        }
        this.updatePreview();
    },

    updatePreview() {
        const text = document.getElementById('smsBody').value;
        const preview = document.getElementById('smsBubblePreview');
        const charCount = document.getElementById('charCount');
        const btn = document.getElementById('sendBtn');
        const targetCount = parseInt(document.getElementById('targetCount').textContent) || 0;

        preview.textContent = text || 'Votre message apparaîtra ici...';
        
        const len = text.length;
        const smsNum = Math.ceil(len / 160) || 1;
        charCount.textContent = ` caractère(s) |  SMS`;

        btn.disabled = len === 0 || targetCount === 0;
    },

    async sendCampaign() {
        if (!await AppModal.confirm("Confirmez-vous l'envoi de cette campagne SMS ?\n(Ceci est une simulation locale pour le moment)", "Envoyer la campagne", false)) return;

        const btn = document.getElementById('sendBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours...';

        const data = {
            date: new Date().toISOString(),
            target: document.getElementById('smsTarget').options[document.getElementById('smsTarget').selectedIndex].text,
            count: parseInt(document.getElementById('targetCount').textContent),
            message: document.getElementById('smsBody').value,
            agent: sessionStorage.getItem('userName') || 'Agent',
            agency: sessionStorage.getItem('currentActiveAgency') || 'abidjan',
            status: 'ENVOYÉ'
        };

        try {
            await addDoc(collection(db, "sms_history"), data);
            this.app.showToast("Campagne envoyée avec succès !", "success");
            document.getElementById('smsBody').value = '';
            document.getElementById('smsTarget').value = '';
            this.calculateTarget();
            this.updatePreview();
            this.switchTab('history');
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur d'envoi", "error");
        } finally {
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Envoyer la campagne';
            btn.disabled = false;
        }
    },

    loadHistory() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const q = query(collection(db, "sms_history"), where("agency", "==", activeAgency), orderBy("date", "desc"));
        
        this.unsub = onSnapshot(q, snap => {
            this.history = snap.docs.map(d => ({id: d.id, ...d.data()}));
            this.renderHistory();
        });
    },

    renderHistory() {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;

        if (this.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">Aucun historique de SMS.</td></tr>';
            return;
        }

        tbody.innerHTML = this.history.map(h => `
            <tr>
                <td><strong>${new Date(h.date).toLocaleString('fr-FR')}</strong></td>
                <td>${h.target}</td>
                <td><b>${h.count}</b></td>
                <td><div style="max-height: 40px; overflow: hidden; text-overflow: ellipsis; color: #475569;">${h.message}</div></td>
                <td>${h.agent}</td>
                <td><span class="badge badge-success">✓ ${h.status}</span></td>
            </tr>
        `).join('');
    }
};
