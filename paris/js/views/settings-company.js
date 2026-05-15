import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const SettingsCompanyView = {
    docRef: null,
    tempLogoBase64: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsCompany = this;

        // On peut rendre ces paramètres globaux ou par agence. Ici par agence comme le reste des paramètres.
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        this.docRef = doc(db, "settings", `company_${activeAgency}`);

        const html = `
            <style>
                .sc-page { max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out; }
                .sc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
                .sc-title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
                
                .sc-card { background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); margin-bottom: 15px; }
                .sc-row { display: flex; flex-wrap: wrap; gap: 15px; align-items: center; }
                .sc-card-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
                .sc-card-sub { font-size: 13px; color: #64748b; }
                
                .sc-logo-row { display: flex; align-items: center; gap: 20px; margin-top: 15px; flex-wrap: wrap; }
                .sc-logo-preview { width: 100px; height: 100px; border-radius: 12px; border: 1px dashed #cbd5e1; background: #f8fafc; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
                .sc-logo-img { max-width: 100%; max-height: 100%; object-fit: contain; }
                
                .sc-params-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-top: 15px; }
                
                .sc-param-card { background: white; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 12px; border-top: 4px solid transparent; transition: 0.2s; }
                .sc-param-card:hover { box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                
                .sc-param-card--color-1 { border-top-color: #3b82f6; }
                .sc-param-card--color-2 { border-top-color: #10b981; }
                .sc-param-card--color-3 { border-top-color: #f59e0b; }
                .sc-param-card--color-4 { border-top-color: #ef4444; }
                .sc-param-card--color-5 { border-top-color: #8b5cf6; }
                .sc-param-card--color-6 { border-top-color: #06b6d4; }
                
                .sc-param-header { display: flex; align-items: center; gap: 10px; }
                .sc-param-icon { font-size: 20px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9; }
                .sc-param-label { font-size: 14px; font-weight: 700; color: #1e293b; }
                
                .sc-input { width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; box-sizing: border-box; font-family: inherit; }
                .sc-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .sc-textarea { resize: vertical; min-height: 80px; }
                
                .sc-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
                .sc-btn--ghost { background: transparent; color: #64748b; border: 1px solid transparent; }
                .sc-btn--ghost:hover { background: #f1f5f9; }
                .sc-btn--primary { background: #3b82f6; color: white; }
                .sc-btn--primary:hover:not(:disabled) { background: #2563eb; }
                .sc-btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
                .sc-btn--save { align-self: flex-end; background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }
                .sc-btn--save:hover { background: #e2e8f0; color: #0f172a; }
            </style>

            <div class="sc-page">
                <div class="sc-header">
                    <h1 class="sc-title">Paramètres entreprise</h1>
                </div>

                <div class="sc-card">
                    <div class="sc-row">
                        <div style="flex: 1;">
                            <div class="sc-card-title">Paramètres de l'entreprise</div>
                            <div class="sc-card-sub">Informations société, logo et coordonnées de contact</div>
                        </div>
                        <button class="sc-btn sc-btn--ghost" onclick="window.app.views.settingsCompany.loadData()" title="Rafraîchir les données">🔄</button>
                    </div>
                </div>

                <div class="sc-card">
                    <div style="font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">🖼️</span> Logo de l'entreprise
                    </div>
                    <div class="sc-logo-row">
                        <div class="sc-logo-preview" id="logoPreviewWrapper">
                            <i class="fas fa-image" style="font-size: 32px; color: #cbd5e1;" id="logoPlaceholder"></i>
                            <img src="" class="sc-logo-img" id="compLogoPreview" style="display: none;">
                        </div>
                        <div style="flex: 1; min-width: 240px;">
                            <input type="file" id="compLogoInput" accept="image/*" class="sc-input" style="padding: 8px;" onchange="window.app.views.settingsCompany.handleLogoSelection(event)">
                            <div style="margin-top: 6px; font-size: 12px; color: #64748b;" id="logoFileName">Aucun fichier sélectionné</div>
                        </div>
                        <button class="sc-btn sc-btn--primary" id="saveLogoBtn" onclick="window.app.views.settingsCompany.saveLogo()" disabled>
                            Enregistrer le logo
                        </button>
                    </div>
                </div>
                <div class="sc-card">
                    <div class="sc-row" style="margin-bottom: 15px;">
                        <div style="flex: 1;">
                            <div class="sc-card-title">🎨 Personnalisation visuelle de l'application</div>
                            <div class="sc-card-sub">Définissez les couleurs globales (Menus, dégradés, fond de page) pour cette agence. L'effet dégradé se crée automatiquement entre la couleur principale et secondaire.</div>
                        </div>
                    </div>
                    <div class="sc-params-grid">
                        <div class="sc-param-card sc-param-card--color-1">
                            <div class="sc-param-header"><div class="sc-param-icon">🎨</div><div class="sc-param-label">Couleur Principale (Bas du dégradé)</div></div>
                            <input type="color" id="appPrimaryColor" class="sc-input" style="height: 40px; cursor: pointer; padding: 5px;" onchange="document.documentElement.style.setProperty('--primary', this.value)">
                            <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('appPrimaryColor', 'appPrimaryColor', this)">✅ Enregistrer</button>
                        </div>
                        
                        <div class="sc-param-card sc-param-card--color-5">
                            <div class="sc-param-header"><div class="sc-param-icon">✨</div><div class="sc-param-label">Couleur Secondaire (Haut du dégradé)</div></div>
                            <input type="color" id="appSecondaryColor" class="sc-input" style="height: 40px; cursor: pointer; padding: 5px;" onchange="document.documentElement.style.setProperty('--secondary', this.value)">
                            <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('appSecondaryColor', 'appSecondaryColor', this)">✅ Enregistrer</button>
                        </div>

                        <div class="sc-param-card sc-param-card--color-6">
                            <div class="sc-param-header"><div class="sc-param-icon">🌆</div><div class="sc-param-label">Couleur d'arrière-plan (Page)</div></div>
                            <input type="color" id="appBgColor" class="sc-input" style="height: 40px; cursor: pointer; padding: 5px;" onchange="document.documentElement.style.setProperty('--bg-body', this.value)">
                            <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('appBgColor', 'appBgColor', this)">✅ Enregistrer</button>
                        </div>
                    </div>
                </div>

                <div class="sc-params-grid">
                    <div class="sc-param-card sc-param-card--color-1">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">🏭</div>
                            <div class="sc-param-label">Nom court</div>
                        </div>
                        <input type="text" id="compName" class="sc-input" placeholder="Nom court de l'entreprise">
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('name', 'compName', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-2">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">📍</div>
                            <div class="sc-param-label">Adresse</div>
                        </div>
                        <textarea id="compAddress" class="sc-input sc-textarea" rows="3" placeholder="Adresse complète"></textarea>
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('address', 'compAddress', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-3">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">🌍</div>
                            <div class="sc-param-label">Département</div>
                        </div>
                        <input type="text" id="compDept" class="sc-input" placeholder="Département ou Région">
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('department', 'compDept', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-4">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">📞</div>
                            <div class="sc-param-label">Téléphone</div>
                        </div>
                        <input type="tel" id="compPhone" class="sc-input" placeholder="Numéro de téléphone">
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('phone', 'compPhone', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-5">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">💼</div>
                            <div class="sc-param-label">SIRET</div>
                        </div>
                        <input type="text" id="compSiret" class="sc-input" placeholder="Numéro SIRET">
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('siret', 'compSiret', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-6">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">✉️</div>
                            <div class="sc-param-label">E-mail</div>
                        </div>
                        <input type="email" id="compEmail" class="sc-input" placeholder="Adresse e-mail">
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('email', 'compEmail', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-1">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">🏛️</div>
                            <div class="sc-param-label">SIRÈNE / RCS</div>
                        </div>
                        <input type="text" id="compRcs" class="sc-input" placeholder="Ex : 929 865 103 RCS Paris">
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('rcs', 'compRcs', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-3">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">🏦</div>
                            <div class="sc-param-label">RIB / Coordonnées bancaires</div>
                        </div>
                        <textarea id="compRib" class="sc-input sc-textarea" rows="3" placeholder="Banque, IBAN, BIC…"></textarea>
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('rib', 'compRib', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-5">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">📋</div>
                            <div class="sc-param-label">Mention TVA</div>
                        </div>
                        <textarea id="compVat" class="sc-input sc-textarea" rows="2" placeholder="Ex : *Exonération de la TVA Article 262-1 DU CGI"></textarea>
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('vat', 'compVat', this)">✅ Enregistrer</button>
                    </div>

                    <div class="sc-param-card sc-param-card--color-2" style="grid-column: 1 / -1;">
                        <div class="sc-param-header">
                            <div class="sc-param-icon">🧾</div>
                            <div class="sc-param-label">Conditions de vente</div>
                        </div>
                        <textarea id="compCgv" class="sc-input sc-textarea" rows="5" placeholder="Acceptez les conditions générales de vente affichées sur la facture"></textarea>
                        <button class="sc-btn sc-btn--save" onclick="window.app.views.settingsCompany.saveField('cgv', 'compCgv', this)">✅ Enregistrer</button>
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
                const data = docSnap.data();
                
                // Remplissage des champs textuels
                if (document.getElementById('compName')) document.getElementById('compName').value = data.name || '';
                if (document.getElementById('compAddress')) document.getElementById('compAddress').value = data.address || '';
                if (document.getElementById('compDept')) document.getElementById('compDept').value = data.department || '';
                if (document.getElementById('compPhone')) document.getElementById('compPhone').value = data.phone || '';
                if (document.getElementById('compSiret')) document.getElementById('compSiret').value = data.siret || '';
                if (document.getElementById('compEmail')) document.getElementById('compEmail').value = data.email || '';
                if (document.getElementById('compRcs')) document.getElementById('compRcs').value = data.rcs || '';
                if (document.getElementById('compRib')) document.getElementById('compRib').value = data.rib || '';
                if (document.getElementById('compVat')) document.getElementById('compVat').value = data.vat || '';
                if (document.getElementById('compCgv')) document.getElementById('compCgv').value = data.cgv || '';

                if (document.getElementById('appPrimaryColor')) document.getElementById('appPrimaryColor').value = data.appPrimaryColor || '#334155';
                if (document.getElementById('appSecondaryColor')) document.getElementById('appSecondaryColor').value = data.appSecondaryColor || '#1e293b';
                if (document.getElementById('appBgColor')) document.getElementById('appBgColor').value = data.appBgColor || '#f8fafc';

                // Remplissage du Logo s'il existe
                if (data.logoBase64) {
                    const imgPreview = document.getElementById('compLogoPreview');
                    const placeholder = document.getElementById('logoPlaceholder');
                    imgPreview.src = data.logoBase64;
                    imgPreview.style.display = 'block';
                    placeholder.style.display = 'none';
                }
            }
        } catch (error) {
            console.error("Erreur chargement des paramètres de l'entreprise:", error);
            this.app.showToast("Erreur lors du chargement des données.", "error");
        }
    },

    async saveField(dbKey, inputId, btnElement) {
        const value = document.getElementById(inputId).value.trim();
        const originalHTML = btnElement.innerHTML;
        
        btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btnElement.disabled = true;

        try {
            await setDoc(this.docRef, { [dbKey]: value }, { merge: true });
            this.app.showToast("Modification enregistrée !", "success");
            
            // Vider le cache de branding pour forcer le rafraîchissement au prochain chargement de page
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            sessionStorage.removeItem('branding_' + activeAgency);

            btnElement.innerHTML = '✅ OK';
            btnElement.style.color = '#10b981';
            setTimeout(() => {
                btnElement.innerHTML = originalHTML;
                btnElement.style.color = '';
                btnElement.disabled = false;
            }, 2000);
        } catch (error) {
            console.error("Erreur lors de la sauvegarde :", error);
            this.app.showToast("Erreur lors de la sauvegarde.", "error");
            btnElement.innerHTML = originalHTML;
            btnElement.disabled = false;
        }
    },

    handleLogoSelection(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        document.getElementById('logoFileName').textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.tempLogoBase64 = e.target.result;
            const imgPreview = document.getElementById('compLogoPreview');
            const placeholder = document.getElementById('logoPlaceholder');
            
            imgPreview.src = this.tempLogoBase64;
            imgPreview.style.display = 'block';
            placeholder.style.display = 'none';
            
            document.getElementById('saveLogoBtn').disabled = false;
        };
        reader.readAsDataURL(file);
    },

    async saveLogo() {
        if (!this.tempLogoBase64) return;
        
        const btn = document.getElementById('saveLogoBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;
        
        try {
            await setDoc(this.docRef, { logoBase64: this.tempLogoBase64 }, { merge: true });
            this.app.showToast("Logo enregistré avec succès !", "success");
            btn.innerHTML = 'Enregistrer le logo';
        } catch (error) {
            console.error("Erreur sauvegarde logo:", error);
            this.app.showToast("Erreur lors de la sauvegarde du logo.", "error");
            btn.innerHTML = 'Réessayer';
            btn.disabled = false;
        }
    }
};