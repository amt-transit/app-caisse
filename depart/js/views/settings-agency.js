import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const SettingsAgencyView = {
    params: {},
    docRef: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsAgency = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        this.docRef = doc(db, "settings", `agency_${activeAgency}`);

        const html = `
            <style>
                .params-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-top: 20px; }
                .param-card { background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; }
                .param-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .param-card__header { display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center; }
                .param-card__icon { font-size: 20px; background: #f8fafc; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 8px; }
                .param-card__id { font-size: 11px; color: #94a3b8; font-family: monospace; font-weight: bold; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; }
                .param-card__name { font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 10px; letter-spacing: 0.5px; word-break: break-all; }
                .param-card__value { font-size: 13px; color: #475569; flex: 1; word-break: break-word; line-height: 1.5; white-space: pre-wrap; }
                .param-card__footer { margin-top: 20px; display: flex; justify-content: flex-end; padding-top: 15px; border-top: 1px solid #f1f5f9; }
                
                .param-card--color-0 { border-top: 4px solid #3b82f6; }
                .param-card--color-1 { border-top: 4px solid #10b981; }
                .param-card--color-2 { border-top: 4px solid #f59e0b; }
                .param-card--color-3 { border-top: 4px solid #ef4444; }
                .param-card--color-4 { border-top: 4px solid #8b5cf6; }
            </style>

            <div class="page" style="animation: fadeIn 0.3s ease-in-out; max-width: 1200px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;"><i class="fas fa-building"></i></div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800;">Paramètres de l'agence</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Configuration et personnalisation globale · <span id="paramCount">0</span> paramètre(s)</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="amt-btn amt-btn-primary" onclick="window.app.views.settingsAgency.openModal()" style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-plus"></i> Nouveau paramètre</button>
                        <button class="amt-btn amt-btn-outline" onclick="window.app.views.settingsAgency.loadData()" title="Rafraîchir"><i class="fas fa-sync-alt"></i></button>
                    </div>
                </div>

                <div class="params-grid" id="paramsGrid">
                    <div style="grid-column: 1 / -1; text-align: center; padding: 50px; color: #64748b;">
                        <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Chargement des paramètres...
                    </div>
                </div>
            </div>

            <!-- MODAL AJOUT/MODIF PARAMÈTRE -->
            <div id="paramModal" class="modal" style="display:none; position:fixed; z-index:2000; left:0; top:0; width:100%; height:100%; background-color:rgba(15, 23, 42, 0.6); align-items:center; justify-content:center; backdrop-filter: blur(4px);">
                <div class="modal-content" style="background:#fff; padding:25px; width:90%; max-width:550px; border-radius:16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">
                        <h3 id="paramModalTitle" style="margin: 0; font-size: 18px; color: #0f172a; font-weight: 800;">Modifier paramètre</h3>
                        <span class="close-modal" onclick="window.app.views.settingsAgency.closeModal()" style="cursor:pointer; font-size:24px; color: #64748b;">&times;</span>
                    </div>
                    
                    <input type="hidden" id="paramOldKey">
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 8px; display: block;">Clé du paramètre <small style="color:#94a3b8; font-weight:normal;">(ex: LOCALISATION)</small></label>
                        <input type="text" id="paramKey" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-family: monospace; text-transform: uppercase;" placeholder="CLE_SANS_ESPACE">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 25px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 8px; display: block;">Valeur</label>
                        <textarea id="paramValue" rows="5" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; resize: vertical;" placeholder="Valeur du paramètre..."></textarea>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <button id="paramDeleteBtn" class="btn" style="background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; display: none; padding: 10px 15px;" onclick="window.app.views.settingsAgency.deleteParam()"><i class="fas fa-trash"></i> Supprimer</button>
                        <div style="display: flex; gap: 10px; margin-left: auto;">
                            <button class="amt-btn amt-btn-outline" style="padding: 10px 15px;" onclick="window.app.views.settingsAgency.closeModal()">Annuler</button>
                            <button class="amt-btn amt-btn-primary" style="padding: 10px 20px; box-shadow: 0 4px 6px rgba(59,130,246,0.2);" onclick="window.app.views.settingsAgency.saveParam()"><i class="fas fa-save"></i> Enregistrer</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    async loadData() {
        try {
            const docSnap = await getDoc(this.docRef);
            if (docSnap.exists()) {
                this.params = docSnap.data();
            } else {
                // Valeurs par défaut comme dans votre maquette HTML
                this.params = {
                    "CONDITIONDEVENTE": "A LIRE ATTENTIVEMENT: LES TEMPS ET LES DELAIS DE TRANSPORTS SONT DONNES A TITRE INDICATIFS PAR AMT TRANSIT...",
                    "LOCALISATION": "STAINS",
                    "RESPONSABLE": "DOUCOURE BAKARY",
                    "RIB": "IBAN: FR7616958000010189313450863  BIC: QNTOFRP1XXX   SWIFT: TRWIBEB3XXX",
                    "TELEPHONE": "01 86 90 03 80"
                };
                await setDoc(this.docRef, this.params);
            }
            this.renderCards();
        } catch (error) {
            console.error("Erreur chargement paramètres: ", error);
            this.app.showToast("Erreur lors du chargement des paramètres.", "error");
        }
    },

    renderCards() {
        const grid = document.getElementById('paramsGrid');
        const entries = Object.entries(this.params).sort((a, b) => a[0].localeCompare(b[0]));
        
        document.getElementById('paramCount').textContent = entries.length;

        if (entries.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: #64748b;">Aucun paramètre configuré.</div>';
            return;
        }

        grid.innerHTML = entries.map(([key, value], index) => `
            <div class="param-card param-card--color-${index % 5}">
                <div class="param-card__header">
                    <div class="param-card__icon">⚙️</div>
                    <div class="param-card__id"># PARAM</div>
                </div>
                <div class="param-card__name">${key}</div>
                <div class="param-card__value">${(value || '').length > 150 ? (value || '').substring(0, 150) + '...' : (value || '')}</div>
                <div class="param-card__footer">
                    <button class="amt-btn amt-btn-outline amt-btn-sm" onclick="window.app.views.settingsAgency.openModal('${key}')">✏️ Modifier</button>
                </div>
            </div>
        `).join('');
    },

    openModal(key = null) {
        document.getElementById('paramOldKey').value = key || '';
        document.getElementById('paramKey').value = key || '';
        document.getElementById('paramValue').value = key ? (this.params[key] || '') : '';
        document.getElementById('paramModalTitle').textContent = key ? 'Modifier le paramètre' : 'Nouveau paramètre';
        document.getElementById('paramDeleteBtn').style.display = key ? 'block' : 'none';
        document.getElementById('paramModal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('paramModal').style.display = 'none';
    },

    async saveParam() {
        const oldKey = document.getElementById('paramOldKey').value;
        let newKey = document.getElementById('paramKey').value.trim().toUpperCase().replace(/\s+/g, '_');
        const newValue = document.getElementById('paramValue').value;

        if (!newKey) return this.app.showToast("La clé du paramètre est obligatoire.", "error");

        try {
            const updates = { [newKey]: newValue };
            if (oldKey && oldKey !== newKey) updates[oldKey] = deleteField();
            await updateDoc(this.docRef, updates);
            
            this.app.showToast("Paramètre enregistré avec succès !", "success");
            this.closeModal();
            this.loadData();
        } catch (e) {
            this.app.showToast("Erreur lors de l'enregistrement.", "error");
        }
    },

    async deleteParam() {
        const key = document.getElementById('paramOldKey').value;
        if (!key || !confirm(`Voulez-vous vraiment supprimer le paramètre ${key} ?`)) return;
        await updateDoc(this.docRef, { [key]: deleteField() });
        this.app.showToast("Paramètre supprimé.", "success");
        this.closeModal();
        this.loadData();
    }
};