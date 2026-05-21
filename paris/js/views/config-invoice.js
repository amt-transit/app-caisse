import { db, app as firebaseApp } from '../../../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { CONSTANTS } from '../../../constants.js';

export const ConfigInvoiceView = {
    docRef: null,
    tempLogoFile: null,
    config: {
        companyName: "AMT TRANS'IT",
        footer: "81 AVENUE ARISTIDE BRIAND 93240 STAINS | Tel. 0186900380 | amt.transit@gmail.com",
        cgv: "1- Les temps et les délais de transports sont donnés à titre indicatifs par AMT TRANS'IT. Les retards des navires et les delais rallongés de dedouannement et de manutentiuons au port ne sauraient être imputés a AMT TRANS'IT.\n2- Les enlèvements à domicile sont gratuits dans la limite géographique définie par AMT TRANS'IT.\n3- Tous les colis et ou marchandises devront être intégralement payés avant la remise au destinataire.\n4- En cas de litige, une solution amiable est privilégiée avant toute procédure contentieuse.",
        primaryColor: "[59, 130, 246]",
        primaryColorHex: "#3b82f6",
        secondaryColorHex: "#1e293b",
        bgColorHex: "#f8fafc",
        logoUrl: null,
        factureModel: "paris" // 'paris' (€ historique) | 'chine' (CBM maritime)
    },

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.configInvoice = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        const isParis = activeAgency === 'paris';
        const currencySym = isParis ? '€' : 'CFA';
        const dummyFret = isParis ? '150,00' : '150 000';
        const dummyPaye = isParis ? '50,00' : '50 000';
        const dummyReste = isParis ? '100,00' : '100 000';
        const locName = isParis ? 'Paris' : 'Abidjan';
        
        this.docRef = doc(db, "settings", `invoice_config_${activeAgency}`);

        // Palette de couleurs élégantes
        const colorPalette = [
            { hex: '#3b82f6', rgb: '[59, 130, 246]', name: 'Bleu Standard' },
            { hex: '#0f172a', rgb: '[15, 23, 42]', name: 'Bleu Nuit' },
            { hex: '#0284c7', rgb: '[2, 132, 199]', name: 'Bleu Océan' },
            { hex: '#0d9488', rgb: '[13, 148, 136]', name: 'Sarcelle' },
            { hex: '#10b981', rgb: '[16, 185, 129]', name: 'Émeraude' },
            { hex: '#059669', rgb: '[5, 150, 105]', name: 'Vert Forêt' },
            { hex: '#65a30d', rgb: '[101, 163, 13]', name: 'Lime' },
            { hex: '#ca8a04', rgb: '[202, 138, 4]', name: 'Jaune Or' },
            { hex: '#d97706', rgb: '[217, 119, 6]', name: 'Ambre' },
            { hex: '#ea580c', rgb: '[234, 88, 12]', name: 'Orange' },
            { hex: '#ef4444', rgb: '[239, 68, 68]', name: 'Rouge' },
            { hex: '#dc2626', rgb: '[220, 38, 38]', name: 'Rouge Vif' },
            { hex: '#be123c', rgb: '[190, 18, 60]', name: 'Rose Foncé' },
            { hex: '#8b5cf6', rgb: '[139, 92, 246]', name: 'Violet' },
            { hex: '#7e22ce', rgb: '[126, 34, 206]', name: 'Pourpre' },
            { hex: '#475569', rgb: '[71, 85, 105]', name: 'Ardoise' }
        ];

        let colorGridHtml = colorPalette.map(c => `
            <div class="color-swatch" data-hex="${c.hex}" data-rgb="${c.rgb}" title="${c.name}" style="background-color: ${c.hex};" onclick="window.app.views.configInvoice.selectColor('${c.hex}', '${c.rgb}', this)"></div>
        `).join('');

        const html = `
            <style>
                .ci-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out; }
                .ci-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px; }
                .ci-header__left { display: flex; align-items: center; gap: 15px; }
                .ci-icon-wrap { background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px; }
                .ci-title { margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; }
                .ci-subtitle { margin: 4px 0 0 0; color: #64748b; font-size: 13px; }
                
                .ci-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
                @media (max-width: 992px) { .ci-layout { grid-template-columns: 1fr; } }

                .ci-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); padding: 20px; }
                .ci-card-title { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }

                /* UI Upload et Couleurs */
                .color-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(36px, 1fr)); gap: 12px; margin-top: 10px; }
                .color-swatch { width: 36px; height: 36px; border-radius: 50%; cursor: pointer; border: 3px solid transparent; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; }
                .color-swatch:hover { transform: scale(1.15) translateY(-2px); box-shadow: 0 6px 12px rgba(0,0,0,0.15); }
                .color-swatch.selected { border-color: #fff; box-shadow: 0 0 0 3px #0f172a, 0 4px 6px rgba(0,0,0,0.2); transform: scale(1.1); }
                .color-swatch.selected::after { content: '✓'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 14px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
                
                .logo-upload-area { display: flex; gap: 20px; align-items: center; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px dashed #cbd5e1; transition: 0.3s; flex-wrap: wrap; }
                .logo-upload-area:hover { border-color: #3b82f6; background: #eff6ff; }
                .logo-preview-box { width: 80px; height: 80px; background: white; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); flex-shrink: 0;}
                .logo-preview-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
                .logo-actions { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 200px; }

                /* Aperçu PDF */
                .pdf-preview {
                    background: white; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); 
                    width: 100%; aspect-ratio: 1 / 1.414; /* Ratio A4 */
                    font-family: 'Helvetica', 'Arial', sans-serif; position: relative; overflow: hidden;
                    display: flex; flex-direction: column; font-size: 10px;
                }
                .pdf-preview__header { background: #1e293b; padding: 15px; color: white; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid var(--pdf-accent, #3b82f6); }
                .pdf-preview__content { padding: 15px; flex: 1; display: flex; flex-direction: column; }
                .pdf-preview__box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px; }
                .pdf-preview__table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                .pdf-preview__table th { background: var(--pdf-accent, #3b82f6); color: white; text-align: left; padding: 6px; border: 1px solid #e2e8f0; }
                .pdf-preview__table td { padding: 6px; border: 1px solid #e2e8f0; color: #334155; }
                .pdf-preview__footer { margin-top: auto; font-size: 6px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; }
            </style>

            <div class="ci-page">
                <div class="ci-header">
                    <div class="ci-header__left">
                        <div class="ci-icon-wrap"><i class="fas fa-file-invoice"></i></div>
                        <div>
                            <h1 class="ci-title">Modèle de Facture</h1>
                            <p class="ci-subtitle">Configurez le design et les conditions générales de vos documents PDF</p>
                        </div>
                    </div>
                    <button class="amt-btn amt-btn-primary" id="saveInvoiceConfigBtn" onclick="window.app.views.configInvoice.saveData()" style="padding: 10px 20px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-save"></i> Enregistrer le modèle
                    </button>
                </div>

                <div class="ci-layout">
                    <!-- Formulaire de Configuration -->
                    <div class="ci-card" style="align-self: start;">
                        <div class="ci-card-title"><i class="fas fa-sliders-h text-blue-500"></i> Paramètres du document</div>
                        
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #475569; margin-bottom: 6px; display: block;">Modèle de base</label>
                            <select id="ciTemplate" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;" onchange="window.app.views.configInvoice.updatePreview()">
                                <option value="facture" selected>Facture Standard (Bleu - ${locName})</option>
                                <option value="bl">Bon de Livraison (Vert - ${locName})</option>
                            </select>
                        </div>

                        <div class="form-group" style="margin-bottom: 25px;">
                            <label style="font-weight: 600; font-size: 13px; color: #475569; margin-bottom: 10px; display: block;">🖼️ Logo de la facture</label>
                            <div class="logo-upload-area">
                                <div class="logo-preview-box">
                                    <i class="fas fa-image" style="font-size: 28px; color: #cbd5e1;" id="ciLogoPlaceholder"></i>
                                    <img src="" id="ciLogoImg" style="display: none;">
                                </div>
                                <div class="logo-actions">
                                    <input type="file" id="ciLogoInput" accept="image/*" style="width: 100%; font-size: 12px; padding: 8px; background: white; border: 1px solid #cbd5e1; border-radius: 6px;" onchange="window.app.views.configInvoice.handleLogoSelect(event)">
                                    <button class="amt-btn amt-btn-outline amt-btn-sm" id="ciUploadBtn" onclick="window.app.views.configInvoice.uploadLogo()" disabled style="width: fit-content; border-color: #3b82f6; color: #3b82f6; font-weight: bold;">
                                        <i class="fas fa-cloud-upload-alt"></i> Importer vers Firebase
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 25px;">
                            <label style="font-weight: 600; font-size: 13px; color: #475569; margin-bottom: 10px; display: block;">🎨 Couleur principale (Modèle de base)</label>
                            <div class="color-grid" id="colorGrid">${colorGridHtml}</div>
                            <input type="hidden" id="ciPrimaryColor" value="[59, 130, 246]">
                            <input type="hidden" id="ciHexColor" value="#3b82f6">
                        </div>

                        <div class="form-group" style="margin-bottom: 25px;">
                            <label style="font-weight: 600; font-size: 13px; color: #475569; margin-bottom: 10px; display: block;">🎨 Couleurs de l'interface (Menu & Fond)</label>
                            <div style="display: flex; gap: 15px;">
                                <div style="flex: 1;">
                                    <label style="font-size: 11px; color: #64748b; margin-bottom: 4px; display: block;">Menu latéral (Haut)</label>
                                    <input type="color" id="ciSecondaryColor" style="width: 100%; height: 40px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; background: white;">
                                </div>
                                <div style="flex: 1;">
                                    <label style="font-size: 11px; color: #64748b; margin-bottom: 4px; display: block;">Fond de page</label>
                                    <input type="color" id="ciBgColor" style="width: 100%; height: 40px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; background: white;">
                                </div>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #475569; margin-bottom: 6px; display: block;">Nom de l'entreprise (En-tête)</label>
                            <input type="text" id="ciCompany" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;" oninput="window.app.views.configInvoice.updatePreview()">
                        </div>

                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #475569; margin-bottom: 6px; display: block;">Pied de page (Contact, Adresse, Siret)</label>
                            <input type="text" id="ciFooter" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;" oninput="window.app.views.configInvoice.updatePreview()">
                        </div>

                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #475569; margin-bottom: 6px; display: block;">Conditions Générales de Vente (CGV)</label>
                            <textarea id="ciCgv" rows="8" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; resize: vertical; font-size: 12px; line-height: 1.4;" oninput="window.app.views.configInvoice.updatePreview()"></textarea>
                        </div>
                        
                        <div style="padding: 15px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; font-size: 12px; color: #166534; display: flex; gap: 10px; margin-top: 20px;">
                            <i class="fas fa-info-circle" style="font-size: 16px;"></i>
                            <div>Ces paramètres seront appliqués automatiquement à tous les nouveaux PDF (Factures, Bons de livraison, Devis) générés par les agents.</div>
                        </div>
                    </div>

                    <!-- Aperçu Visuel -->
                    <div class="ci-card">
                        <div class="ci-card-title"><i class="fas fa-eye text-indigo-500"></i> Aperçu en temps réel</div>
                        <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; display: flex; justify-content: center;">
                            
                            <div class="pdf-preview" id="pdfPreviewWrapper">
                                <div class="pdf-preview__header" id="pdfHeader">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <img id="prevLogo" src="" style="max-height: 30px; max-width: 80px; object-fit: contain; display: none;">
                                        <div style="font-size: 16px; font-weight: bold;" id="prevCompany">AMT TRANS'IT</div>
                                    </div>
                                    <div style="font-size: 14px; font-weight: bold;" id="prevDocType">FACTURE</div>
                                </div>
                                
                                <div class="pdf-preview__content">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                                        <div style="width: 48%;">
                                            <div style="font-weight: bold; margin-bottom: 5px; font-size: 8px;">DÉTAILS DE L'EXPÉDITION :</div>
                                            <div style="color: #475569; line-height: 1.4;">
                                                Référence : FAC-DEMO-123<br>
                                                Date : ${new Date().toLocaleDateString('fr-FR')}<br>
                                                Conteneur : MD-01<br>
                                                Expéditeur : Jean Dupont
                                            </div>
                                        </div>
                                        <div class="pdf-preview__box" style="width: 48%;">
                                            <div id="prevFactureTo" style="font-weight: bold; margin-bottom: 5px; font-size: 8px;">FACTURÉ À :</div>
                                            <div style="color: #334155; line-height: 1.4; font-weight: bold;">Client Démo</div>
                                            <div style="color: #475569; line-height: 1.4;">01 23 45 67 89<br>${isParis ? '75001, Paris' : 'Cocody Angré, Abidjan'}</div>
                                        </div>
                                    </div>

                                    <table class="pdf-preview__table">
                                        <thead>
                                            <tr id="pdfTableHeader">
                                                <th>Description / Nature du Colis</th>
                                                <th style="text-align: center; width: 30px;">Qté</th>
                                                <th id="prevThPu" style="text-align: right; width: 45px;">P.U</th>
                                                <th id="prevThTotal" style="text-align: right; width: 45px;">Total</th>
                                                <th id="prevThStatut" style="text-align: center; width: 45px; display: none;">Statut</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>Carton Effets Personnels (Demo)</td>
                                                <td style="text-align: center;">2</td>
                                                <td class="prev-td-pu" style="text-align: right;">${isParis ? '50,00' : '50 000'} ${currencySym}</td>
                                                <td class="prev-td-total" style="text-align: right; font-weight: bold;">${isParis ? '100,00' : '100 000'} ${currencySym}</td>
                                                <td class="prev-td-statut" style="text-align: center; display: none;"><span class="badge" style="background:#e2e8f0; color:#475569; font-size: 8px;">À LIVRER</span></td>
                                            </tr>
                                            <tr>
                                                <td>Télévision 55"</td>
                                                <td style="text-align: center;">1</td>
                                                <td class="prev-td-pu" style="text-align: right;">${isParis ? '50,00' : '50 000'} ${currencySym}</td>
                                                <td class="prev-td-total" style="text-align: right; font-weight: bold;">${isParis ? '50,00' : '50 000'} ${currencySym}</td>
                                                <td class="prev-td-statut" style="text-align: center; display: none;"><span class="badge" style="background:#e2e8f0; color:#475569; font-size: 8px;">À LIVRER</span></td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <div id="previewFinancialRecap" style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
                                        <div style="width: 150px;">
                                            <div style="font-weight: bold; margin-bottom: 5px; font-size: 8px;">RÉCAPITULATIF FINANCIER</div>
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #475569;"><span>Total Fret :</span> <span>${dummyFret} ${currencySym}</span></div>
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #475569;"><span>Montant Payé :</span> <span>${dummyPaye} ${currencySym}</span></div>
                                            <div style="display: flex; justify-content: space-between; font-weight: bold; background: #fef2f2; color: #dc2626; padding: 4px; border: 1px solid #fecaca; margin-top: 3px;"><span>RESTE À PAYER :</span> <span>${dummyReste} ${currencySym}</span></div>
                                        </div>
                                    </div>

                                    <div class="pdf-preview__footer">
                                        <div style="font-weight: bold; margin-bottom: 3px;">CONDITIONS GÉNÉRALES DE VENTE</div>
                                        <div id="prevCgv" style="white-space: pre-wrap; text-align: justify; line-height: 1.3; overflow: hidden; max-height: 80px;"></div>
                                        <div id="prevFooter" style="margin-top: 8px; font-weight: bold; color: #0f172a;"></div>
                                    </div>
                                </div>
                            </div>
                            
                        </div>
                    </div>
                </div>

                <div class="ci-card" style="margin-top: 25px;">
                    <div class="ci-card-title"><i class="fas fa-ship text-blue-500"></i> Tarifs d'expédition (globaux — toutes agences)</div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px;">
                        <div class="form-group">
                            <label style="font-weight:600; font-size:13px; color:#475569; margin-bottom:6px; display:block;">🚢 Coût CBM — Chine (CFA / m³)</label>
                            <input type="number" id="ciTarifCbmChine" min="0" step="1000" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px;" placeholder="250000">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:600; font-size:13px; color:#475569; margin-bottom:6px; display:block;">✈️ Aérien Normal (CFA / kg)</label>
                            <input type="number" id="ciTarifAerienNormal" min="0" step="500" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px;" placeholder="12000">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:600; font-size:13px; color:#475569; margin-bottom:6px; display:block;">✈️ Aérien Express (CFA / kg)</label>
                            <input type="number" id="ciTarifAerienExpress" min="0" step="500" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px;" placeholder="14000">
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-top:18px;">
                        <div style="font-size:12px; color:#64748b;"><i class="fas fa-info-circle"></i> Maritime Chine = Volume (CBM) × Coût CBM. Aérien = Poids (kg) × tarif Normal/Express. Modifiable à tout moment.</div>
                        <button class="amt-btn amt-btn-primary" onclick="window.app.views.configInvoice.saveTarifs()" style="padding:10px 20px; display:flex; align-items:center; gap:8px;"><i class="fas fa-save"></i> Enregistrer les tarifs</button>
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
                this.config = { ...this.config, ...docSnap.data() };
            }

            // Remplir les champs
            document.getElementById('ciCompany').value = this.config.companyName || '';
            document.getElementById('ciFooter').value = this.config.footer || '';
            document.getElementById('ciCgv').value = this.config.cgv || '';
                document.getElementById('ciSecondaryColor').value = this.config.secondaryColorHex || '#1e293b';
                document.getElementById('ciBgColor').value = this.config.bgColorHex || '#f8fafc';

            if (this.config.primaryColor && this.config.primaryColorHex) {
                this.selectColor(this.config.primaryColorHex, this.config.primaryColor);
            } else if (this.config.primaryColor) {
                this.selectColor('#3b82f6', '[59, 130, 246]');
            } else {
                this.selectColor('#3b82f6', '[59, 130, 246]');
            }

            if (this.config.logoUrl) {
                const imgPreview = document.getElementById('ciLogoImg');
                const placeholder = document.getElementById('ciLogoPlaceholder');
                const prevLogo = document.getElementById('prevLogo');

                imgPreview.src = this.config.logoUrl;
                prevLogo.src = this.config.logoUrl;

                imgPreview.style.display = 'block';
                prevLogo.style.display = 'block';
                placeholder.style.display = 'none';
            }
            
            try {
                const tSnap = await getDoc(doc(db, 'parametres', 'tarifs'));
                const t = tSnap.exists() ? tSnap.data() : {};
                const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
                setVal('ciTarifCbmChine', t.cbmChine != null ? t.cbmChine : 250000);
                setVal('ciTarifAerienNormal', t.kgAerienNormal != null ? t.kgAerienNormal : 12000);
                setVal('ciTarifAerienExpress', t.kgAerienExpress != null ? t.kgAerienExpress : 14000);
            } catch (e) { console.warn('Tarifs (lecture):', e && e.message); }

            this.updatePreview();
        } catch (error) {
            console.error("Erreur chargement config facture:", error);
            this.app.showToast("Erreur de chargement.", "error");
        }
    },

    selectColor(hex, rgb, el) {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        if(el) el.classList.add('selected');
        else {
            const match = document.querySelector(`.color-swatch[data-hex="${hex}"]`);
            if(match) match.classList.add('selected');
        }
        document.getElementById('ciPrimaryColor').value = rgb;
        document.getElementById('ciHexColor').value = hex;
        this.updatePreview();
    },

    handleLogoSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        this.tempLogoFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            const imgPreview = document.getElementById('ciLogoImg');
            const placeholder = document.getElementById('ciLogoPlaceholder');
            const prevLogo = document.getElementById('prevLogo');

            imgPreview.src = e.target.result;
            prevLogo.src = e.target.result;

            imgPreview.style.display = 'block';
            prevLogo.style.display = 'block';
            placeholder.style.display = 'none';

            document.getElementById('ciUploadBtn').disabled = false;
        };
        reader.readAsDataURL(file);
    },

    updatePreview() {
        // Récupération des valeurs
        const template = document.getElementById('ciTemplate').value;
        const company = document.getElementById('ciCompany').value || "AMT TRANS'IT";
        const footer = document.getElementById('ciFooter').value;
        const cgv = document.getElementById('ciCgv').value;
        const hexColor = document.getElementById('ciHexColor').value || '#3b82f6';

        // Style dynamique selon le modèle
        const wrapper = document.getElementById('pdfPreviewWrapper');
        const header = document.getElementById('pdfHeader');
        const docType = document.getElementById('prevDocType');
        const tableHeader = document.getElementById('pdfTableHeader');

        if (template === 'bl') {
            wrapper.style.setProperty('--pdf-accent', '#10b981'); // Vert pour le BL
            docType.textContent = "BON DE LIVRAISON";
            document.getElementById('prevFactureTo').textContent = "LIVRÉ À :";
            document.getElementById('prevThPu').style.display = 'none';
            document.getElementById('prevThTotal').style.display = 'none';
            document.getElementById('prevThStatut').style.display = 'table-cell';
            document.querySelectorAll('.prev-td-pu').forEach(td => td.style.display = 'none');
            document.querySelectorAll('.prev-td-total').forEach(td => td.style.display = 'none');
            document.querySelectorAll('.prev-td-statut').forEach(td => td.style.display = 'table-cell');
            document.getElementById('previewFinancialRecap').style.display = 'none';
        } else {
            wrapper.style.setProperty('--pdf-accent', hexColor); // Couleur sélectionnée
            docType.textContent = "FACTURE";
            document.getElementById('prevFactureTo').textContent = "FACTURÉ À :";
            document.getElementById('prevThPu').style.display = 'table-cell';
            document.getElementById('prevThTotal').style.display = 'table-cell';
            document.getElementById('prevThStatut').style.display = 'none';
            document.querySelectorAll('.prev-td-pu').forEach(td => td.style.display = 'table-cell');
            document.querySelectorAll('.prev-td-total').forEach(td => td.style.display = 'table-cell');
            document.querySelectorAll('.prev-td-statut').forEach(td => td.style.display = 'none');
            document.getElementById('previewFinancialRecap').style.display = 'flex';
        }

        // Application des textes
        document.getElementById('prevCompany').textContent = company;
        document.getElementById('prevFooter').textContent = footer;
        document.getElementById('prevCgv').textContent = cgv;
    },

    async uploadLogo() {
        if (!this.tempLogoFile) return;

        const btn = document.getElementById('ciUploadBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Upload...';
        btn.disabled = true;

        try {
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const fileExtension = this.tempLogoFile.name.split('.').pop();
            const fileName = `invoice_logos/${activeAgency}_logo_${Date.now()}.${fileExtension}`;
            const storageRefInstance = storageRef(getStorage(firebaseApp), fileName);

            await uploadBytes(storageRefInstance, this.tempLogoFile);
            const downloadUrl = await getDownloadURL(storageRefInstance);

            this.config.logoUrl = downloadUrl;
            
            // Sauvegarde immédiate du lien dans Firestore pour qu'il ne disparaisse pas au rechargement
            await setDoc(this.docRef, { logoUrl: downloadUrl }, { merge: true });

            this.app.showToast("Logo importé sur Storage avec succès !", "success");
            btn.innerHTML = '<i class="fas fa-check"></i> Importé';
            this.tempLogoFile = null;
        } catch (error) {
            console.error("Erreur upload logo:", error);
            this.app.showToast("Erreur lors de l'upload du logo sur Firebase.", "error");
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Réessayer';
            btn.disabled = false;
        }
    },

    async saveData() {
        const btn = document.getElementById('saveInvoiceConfigBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        try {
            this.config.companyName = document.getElementById('ciCompany').value.trim();
            this.config.footer = document.getElementById('ciFooter').value.trim();
            this.config.cgv = document.getElementById('ciCgv').value.trim();
            // Note : le « modèle de facturation » (paris/chine) est désormais
            // géré dans Gestion des agences → ⚙️ Devise & modèle (par route).
            this.config.primaryColor = document.getElementById('ciPrimaryColor').value;
            this.config.primaryColorHex = document.getElementById('ciHexColor').value;
            this.config.secondaryColorHex = document.getElementById('ciSecondaryColor').value;
            this.config.bgColorHex = document.getElementById('ciBgColor').value;
            
            await setDoc(this.docRef, this.config, { merge: true });
            this.app.showToast("Modèle de facture enregistré avec succès !", "success");
        } catch (error) {
            console.error("Erreur sauvegarde facture:", error);
            this.app.showToast("Erreur lors de la sauvegarde.", "error");
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    },

    async saveTarifs() {
        try {
            const num = (id, d) => {
                const v = parseFloat(document.getElementById(id).value);
                return isNaN(v) || v < 0 ? d : v;
            };
            const payload = {
                cbmChine: num('ciTarifCbmChine', 250000),
                kgAerienNormal: num('ciTarifAerienNormal', 12000),
                kgAerienExpress: num('ciTarifAerienExpress', 14000),
            };
            await setDoc(doc(db, 'parametres', 'tarifs'), payload, { merge: true });
            this.app.showToast("Tarifs d'expédition enregistrés ✔", "success");
        } catch (error) {
            console.error("Erreur sauvegarde tarifs:", error);
            this.app.showToast("Erreur lors de l'enregistrement des tarifs.", "error");
        }
    }
};