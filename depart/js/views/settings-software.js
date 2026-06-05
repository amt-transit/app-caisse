import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const SettingsSoftwareView = {
    docRef: null,

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsSoftware = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        this.docRef = doc(db, "settings", `software_${activeAgency}`);

        const html = `
            <style>
                .sw-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .sw-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; }
                .sw-header__icon { background: #f8fafc; font-size: 28px; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
                .sw-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .sw-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }

                .sw-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 20px; }
                
                .sw-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; display: flex; flex-direction: column; }
                .sw-card__header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px; background: #f8fafc; }
                .sw-card__icon { font-size: 24px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
                .sw-card__title { font-size: 16px; font-weight: 800; color: #1e293b; margin-bottom: 2px; }
                .sw-card__sub { font-size: 12px; color: #64748b; }

                /* Colors per service */
                .sw-card--health .sw-card__icon { background: #fef2f2; color: #ef4444; }
                .sw-card--sms .sw-card__icon { background: #eff6ff; color: #3b82f6; }
                .sw-card--orange .sw-card__icon { background: #fff7ed; color: #ea580c; }
                .sw-card--whatsapp .sw-card__icon { background: #dcfce7; color: #16a34a; }
                .sw-card--mail .sw-card__icon { background: #f1f5f9; color: #475569; }
                .sw-card--fne .sw-card__icon { background: #f3e8ff; color: #9333ea; }

                .sw-fields { padding: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; flex: 1; }
                @media (max-width: 640px) { .sw-fields { grid-template-columns: 1fr; } }
                .sw-field { display: flex; flex-direction: column; gap: 6px; }
                .sw-field--full { grid-column: 1 / -1; }
                .sw-label { font-size: 12px; font-weight: 700; color: #475569; }
                
                .sw-input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; transition: 0.2s; width: 100%; box-sizing: border-box; background: #fff; }
                .sw-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                
                .sw-secret { position: relative; display: flex; align-items: center; }
                .sw-reveal { position: absolute; right: 10px; background: none; border: none; cursor: pointer; font-size: 16px; color: #64748b; padding: 0; }
                .sw-check { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; user-select: none; }
                .sw-check input { width: 16px; height: 16px; accent-color: #3b82f6; cursor: pointer; }
                .sw-check--enable { background: #f8fafc; padding: 10px 15px; border-radius: 8px; border: 1px solid #e2e8f0; display: inline-flex; width: fit-content; }

                .sw-actions { padding: 15px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
                .sw-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; display: flex; align-items: center; justify-content: center; gap: 6px; }
                .sw-btn--save { background: #3b82f6; color: white; box-shadow: 0 2px 4px rgba(59,130,246,0.2); }
                .sw-btn--save:hover { background: #2563eb; }
                .sw-btn--test { background: white; border-color: #cbd5e1; color: #475569; }
                .sw-btn--test:hover { background: #f1f5f9; color: #0f172a; }
                .sw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            </style>

            <div class="sw-page">
                <div class="sw-header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div class="sw-header__icon">⚙️</div>
                        <div>
                            <h1 class="sw-header__title">Paramètres logiciel</h1>
                            <p class="sw-header__subtitle">Configuration centralisée des services et API de l'entreprise.</p>
                        </div>
                    </div>
                    <button class="sw-btn sw-btn--test" onclick="window.app.views.settingsSoftware.loadData()">🔄 Rafraîchir</button>
                </div>

                <!-- DIAGNOSTIC SMS -->
                <div class="sw-card sw-card--health" style="margin-bottom: 20px;">
                    <div class="sw-card__header">
                        <div class="sw-card__icon">🩺</div>
                        <div>
                            <div class="sw-card__title">Diagnostic SMS</div>
                            <div class="sw-card__sub">Vérifiez la configuration et testez l'envoi vers un numéro mobile.</div>
                        </div>
                    </div>
                    <div class="sw-fields" style="display: flex; gap: 15px; align-items: flex-end; flex-wrap: wrap;">
                        <div class="sw-field" style="flex: 1; min-width: 200px;">
                            <label class="sw-label">Modèle de test (Template)</label>
                            <select class="sw-input">
                                <option value="SMSFACT">SMSFACT - Alerte Facture</option>
                                <option value="SMSPAIE">SMSPAIE - Alerte Paiement</option>
                                <option value="SMSRDV">SMSRDV - Alerte Rendez-vous</option>
                            </select>
                        </div>
                        <div class="sw-field" style="flex: 2; min-width: 200px;">
                            <label class="sw-label">Numéro cible</label>
                            <input type="tel" class="sw-input" placeholder="+336XXXXXXXX ou 07XXXXXXXX">
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button class="sw-btn sw-btn--test" onclick="window.app.showToast('Vérification OK', 'success')">🔎 Vérifier</button>
                            <button class="sw-btn sw-btn--save" onclick="window.app.showToast('Simulation envoyée', 'info')">📤 Tester l'envoi</button>
                        </div>
                    </div>
                </div>

                <div class="sw-grid">
                    <!-- SMS ENVOI -->
                    <div class="sw-card sw-card--sms">
                        <div class="sw-card__header">
                            <div class="sw-card__icon">💬</div>
                            <div>
                                <div class="sw-card__title">SMSenvoi</div>
                                <div class="sw-card__sub">API REST pour envoi SMS international</div>
                            </div>
                        </div>
                        <div class="sw-fields">
                            <div class="sw-field"><label class="sw-label">Base URL</label><input class="sw-input cfg-smsenvoi" data-field="baseUrl" placeholder="https://api.smsenvoi.com/..."></div>
                            <div class="sw-field"><label class="sw-label">User Key</label><input class="sw-input cfg-smsenvoi" data-field="userKey" placeholder="Clé utilisateur"></div>
                            <div class="sw-field sw-field--full">
                                <label class="sw-label">Access Token</label>
                                <div class="sw-secret">
                                    <input class="sw-input cfg-smsenvoi" data-field="accessToken" type="password" id="pwd_smsenvoi" placeholder="Token d'accès">
                                    <button class="sw-reveal" onclick="window.app.views.settingsSoftware.togglePwd('pwd_smsenvoi')">👁️</button>
                                </div>
                            </div>
                            <div class="sw-field"><label class="sw-label">Sender (TPOA)</label><input class="sw-input cfg-smsenvoi" data-field="sender" placeholder="AMT TRANSIT"></div>
                            <div class="sw-field"><label class="sw-label">Message HQ</label><input class="sw-input cfg-smsenvoi" data-field="msgHq" placeholder="PRM"></div>
                            <div class="sw-field"><label class="sw-label">Message MQ</label><input class="sw-input cfg-smsenvoi" data-field="msgMq" placeholder="--"></div>
                            <div class="sw-field"><label class="sw-check"><input type="checkbox" class="cfg-smsenvoi" data-field="verifyTls"> Vérifier TLS</label></div>
                        </div>
                        <div class="sw-actions">
                            <button class="sw-btn sw-btn--save" id="btn_save_smsenvoi" onclick="window.app.views.settingsSoftware.saveService('smsenvoi')">✅ Enregistrer</button>
                        </div>
                    </div>

                    <!-- SMS ORANGE -->
                    <div class="sw-card sw-card--orange">
                        <div class="sw-card__header">
                            <div class="sw-card__icon">🍊</div>
                            <div>
                                <div class="sw-card__title">SMS Orange Côte d'Ivoire</div>
                                <div class="sw-card__sub">API Orange Developer pour SMS CI</div>
                            </div>
                        </div>
                        <div class="sw-fields">
                            <div class="sw-field"><label class="sw-label">Base URL</label><input class="sw-input cfg-orange" data-field="baseUrl" placeholder="https://api.orange.com"></div>
                            <div class="sw-field"><label class="sw-label">Client ID</label><input class="sw-input cfg-orange" data-field="clientId" placeholder="OAuth Client ID"></div>
                            <div class="sw-field sw-field--full">
                                <label class="sw-label">Client Secret</label>
                                <div class="sw-secret">
                                    <input class="sw-input cfg-orange" data-field="clientSecret" type="password" id="pwd_orange" placeholder="OAuth Client Secret">
                                    <button class="sw-reveal" onclick="window.app.views.settingsSoftware.togglePwd('pwd_orange')">👁️</button>
                                </div>
                            </div>
                            <div class="sw-field"><label class="sw-label">Sender MSISDN</label><input class="sw-input cfg-orange" data-field="senderMsisdn" placeholder="+225XXXXXXXXXX"></div>
                            <div class="sw-field"><label class="sw-label">Sender Name</label><input class="sw-input cfg-orange" data-field="senderName" placeholder="YAKRI"></div>
                            <div class="sw-field sw-field--full"><label class="sw-label">Delivery Receipt URL</label><input class="sw-input cfg-orange" data-field="drUrl" placeholder="https://..."></div>
                            <div class="sw-field"><label class="sw-label">DR Token</label><input class="sw-input cfg-orange" data-field="drToken" placeholder="Token DR"></div>
                            <div class="sw-field"><label class="sw-check"><input type="checkbox" class="cfg-orange" data-field="verifyTls"> Vérifier TLS</label></div>
                        </div>
                        <div class="sw-actions">
                            <button class="sw-btn sw-btn--save" id="btn_save_orange" onclick="window.app.views.settingsSoftware.saveService('orange')">✅ Enregistrer</button>
                        </div>
                    </div>

                    <!-- API WHATSAPP -->
                    <div class="sw-card sw-card--whatsapp">
                        <div class="sw-card__header">
                            <div class="sw-card__icon">💚</div>
                            <div>
                                <div class="sw-card__title">API WhatsApp</div>
                                <div class="sw-card__sub">Meta Graph API pour messagerie WhatsApp Business</div>
                            </div>
                        </div>
                        <div class="sw-fields">
                            <div class="sw-field sw-field--full"><label class="sw-check sw-check--enable"><input type="checkbox" class="cfg-whatsapp" data-field="enabled"> Service activé</label></div>
                            <div class="sw-field sw-field--full">
                                <label class="sw-label">Token</label>
                                <div class="sw-secret">
                                    <input class="sw-input cfg-whatsapp" data-field="token" type="password" id="pwd_wa" placeholder="Bearer token">
                                    <button class="sw-reveal" onclick="window.app.views.settingsSoftware.togglePwd('pwd_wa')">👁️</button>
                                </div>
                            </div>
                            <div class="sw-field"><label class="sw-label">Phone Number ID</label><input class="sw-input cfg-whatsapp" data-field="phoneId" placeholder="ID numéro"></div>
                            <div class="sw-field"><label class="sw-label">API Version</label><input class="sw-input cfg-whatsapp" data-field="apiVersion" placeholder="v18.0"></div>
                            <div class="sw-field"><label class="sw-label">Template Fallback</label><input class="sw-input cfg-whatsapp" data-field="templateFallback" placeholder="Nom template"></div>
                            <div class="sw-field"><label class="sw-label">Langue Fallback</label><input class="sw-input cfg-whatsapp" data-field="langFallback" placeholder="fr"></div>
                            <div class="sw-field"><label class="sw-check"><input type="checkbox" class="cfg-whatsapp" data-field="verifySsl"> Vérifier SSL</label></div>
                        </div>
                        <div class="sw-actions">
                            <button class="sw-btn sw-btn--save" id="btn_save_whatsapp" onclick="window.app.views.settingsSoftware.saveService('whatsapp')">✅ Enregistrer</button>
                        </div>
                    </div>

                    <!-- SERVICE CLIENT MAIL -->
                    <div class="sw-card sw-card--mail">
                        <div class="sw-card__header">
                            <div class="sw-card__icon">✉️</div>
                            <div>
                                <div class="sw-card__title">Service Client Mail</div>
                                <div class="sw-card__sub">Configuration SMTP pour envoi de mails</div>
                            </div>
                        </div>
                        <div class="sw-fields">
                            <div class="sw-field sw-field--full"><label class="sw-check sw-check--enable"><input type="checkbox" class="cfg-smtp" data-field="enabled"> Service activé</label></div>
                            <div class="sw-field"><label class="sw-label">Mailer</label><input class="sw-input cfg-smtp" data-field="mailer" placeholder="smtp"></div>
                            <div class="sw-field"><label class="sw-label">Host</label><input class="sw-input cfg-smtp" data-field="host" placeholder="smtp.exemple.com"></div>
                            <div class="sw-field"><label class="sw-label">Port</label><input class="sw-input cfg-smtp" data-field="port" placeholder="587"></div>
                            <div class="sw-field"><label class="sw-label">Encryption</label><input class="sw-input cfg-smtp" data-field="encryption" placeholder="tls / ssl"></div>
                            <div class="sw-field"><label class="sw-label">Username</label><input class="sw-input cfg-smtp" data-field="username" placeholder="Identifiant SMTP"></div>
                            <div class="sw-field">
                                <label class="sw-label">Password</label>
                                <div class="sw-secret">
                                    <input class="sw-input cfg-smtp" data-field="password" type="password" id="pwd_smtp" placeholder="Mot de passe SMTP">
                                    <button class="sw-reveal" onclick="window.app.views.settingsSoftware.togglePwd('pwd_smtp')">👁️</button>
                                </div>
                            </div>
                            <div class="sw-field"><label class="sw-label">From Address</label><input class="sw-input cfg-smtp" data-field="fromAddress" placeholder="noreply@exemple.com"></div>
                            <div class="sw-field"><label class="sw-label">From Name</label><input class="sw-input cfg-smtp" data-field="fromName" placeholder="Yakri Support"></div>
                            <div class="sw-field sw-field--full"><label class="sw-label">Email support client</label><input class="sw-input cfg-smtp" data-field="supportEmail" placeholder="support@exemple.com"></div>
                        </div>
                        <div class="sw-actions">
                            <button class="sw-btn sw-btn--save" id="btn_save_smtp" onclick="window.app.views.settingsSoftware.saveService('smtp')">✅ Enregistrer</button>
                        </div>
                    </div>

                    <!-- CERTIFIER FNE -->
                    <div class="sw-card sw-card--fne">
                        <div class="sw-card__header">
                            <div class="sw-card__icon">🏛️</div>
                            <div>
                                <div class="sw-card__title">Certifier FNE</div>
                                <div class="sw-card__sub">Facture Normalisée Électronique — DGI Côte d'Ivoire</div>
                            </div>
                        </div>
                        <div class="sw-fields">
                            <div class="sw-field sw-field--full"><label class="sw-check sw-check--enable"><input type="checkbox" class="cfg-fne" data-field="enabled"> Service activé</label></div>
                            <div class="sw-field sw-field--full"><label class="sw-label">Base URL</label><input class="sw-input cfg-fne" data-field="baseUrl" placeholder="http://54.247.95.108/ws"></div>
                            <div class="sw-field sw-field--full">
                                <label class="sw-label">Clé API (Bearer Token)</label>
                                <div class="sw-secret">
                                    <input class="sw-input cfg-fne" data-field="token" type="password" id="pwd_fne" placeholder="Clé API FNE">
                                    <button class="sw-reveal" onclick="window.app.views.settingsSoftware.togglePwd('pwd_fne')">👁️</button>
                                </div>
                            </div>
                            <div class="sw-field"><label class="sw-label">NCC (N° Contribuable)</label><input class="sw-input cfg-fne" data-field="ncc" placeholder="9606123E"></div>
                            <div class="sw-field"><label class="sw-label">Point de vente</label><input class="sw-input cfg-fne" data-field="pointVente" placeholder="Nom / N° point de vente"></div>
                            <div class="sw-field"><label class="sw-label">Établissement</label><input class="sw-input cfg-fne" data-field="etablissement" placeholder="Nom de l'établissement"></div>
                            <div class="sw-field"><label class="sw-label">Message commercial</label><input class="sw-input cfg-fne" data-field="msgCommercial" placeholder="Optionnel"></div>
                            <div class="sw-field sw-field--full"><label class="sw-label">Footer / Message personnel</label><input class="sw-input cfg-fne" data-field="msgFooter" placeholder="Optionnel"></div>
                            <div class="sw-field"><label class="sw-check"><input type="checkbox" class="cfg-fne" data-field="verifyTls"> Vérifier TLS</label></div>
                        </div>
                        <div class="sw-actions">
                            <button class="sw-btn sw-btn--save" id="btn_save_fne" onclick="window.app.views.settingsSoftware.saveService('fne')">✅ Enregistrer</button>
                        </div>
                    </div>

                </div>
            </div>
        `;

        const targetContainer = container || document.getElementById('contentContainer');
        targetContainer.innerHTML = html;
        this.loadData();
    },

    togglePwd(id) {
        const input = document.getElementById(id);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    },

    async loadData() {
        try {
            const docSnap = await getDoc(this.docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                Object.keys(data).forEach(service => {
                    const serviceData = data[service];
                    Object.keys(serviceData).forEach(field => {
                        const input = document.querySelector(`.cfg-${service}[data-field="${field}"]`);
                        if (input) {
                            if (input.type === 'checkbox') input.checked = serviceData[field];
                            else input.value = serviceData[field];
                        }
                    });
                });
            }
        } catch (e) {
            console.error("Erreur chargement paramètres API:", e);
        }
    },

    async saveService(service) {
        const btn = document.getElementById(`btn_save_${service}`);
        if (!btn) return;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const data = {};
        document.querySelectorAll(`.cfg-${service}`).forEach(input => {
            const field = input.dataset.field;
            if (input.type === 'checkbox') data[field] = input.checked;
            else data[field] = input.value.trim();
        });

        try {
            await setDoc(this.docRef, { [service]: data }, { merge: true });
            if(this.app && this.app.showToast) {
                this.app.showToast("Paramètres enregistrés avec succès !", "success");
            } else {
                alert("Paramètres enregistrés avec succès !");
            }
        } catch (e) {
            console.error("Erreur sauvegarde service :", e);
            if(this.app && this.app.showToast) this.app.showToast("Erreur lors de l'enregistrement.", "error");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};