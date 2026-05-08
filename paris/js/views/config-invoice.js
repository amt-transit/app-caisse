import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ConfigInvoiceView = {
    docRef: null,
    config: {
        companyName: "AMT TRANS'IT",
        footer: "81 AVENUE ARISTIDE BRIAND 93240 STAINS | Tel. 0186900380 | amt.transit@gmail.com",
        cgv: "1- Les temps et les délais de transports sont donnés à titre indicatifs par AMT TRANS'IT. Les retards des navires et les delais rallongés de dedouannement et de manutentiuons au port ne sauraient être imputés a AMT TRANS'IT.\n2- Les enlèvements à domicile sont gratuits dans la limite géographique définie par AMT TRANS'IT.\n3- Tous les colis et ou marchandises devront être intégralement payés avant la remise au destinataire.\n4- En cas de litige, une solution amiable est privilégiée avant toute procédure contentieuse.",
        accentColor: "#3b82f6" // Bleu par défaut (Facture)
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
                    <button class="btn btn-primary" id="saveInvoiceConfigBtn" onclick="window.app.views.configInvoice.saveData()" style="padding: 10px 20px; display: flex; align-items: center; gap: 8px;">
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
                                    <div style="font-size: 16px; font-weight: bold;" id="prevCompany">AMT TRANS'IT</div>
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
                                            <div style="font-weight: bold; margin-bottom: 5px; font-size: 8px;">FACTURÉ À :</div>
                                            <div style="color: #334155; line-height: 1.4; font-weight: bold;">Client Démo</div>
                                            <div style="color: #475569; line-height: 1.4;">01 23 45 67 89<br>${isParis ? '75001, Paris' : 'Cocody Angré, Abidjan'}</div>
                                        </div>
                                    </div>

                                    <table class="pdf-preview__table">
                                        <thead>
                                            <tr id="pdfTableHeader">
                                                <th>Description / Nature du Colis</th>
                                                <th style="text-align: center; width: 40px;">Qté</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>Carton Effets Personnels (Demo)</td>
                                                <td style="text-align: center;">2</td>
                                            </tr>
                                            <tr>
                                                <td>Télévision 55"</td>
                                                <td style="text-align: center;">1</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
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
            
            this.updatePreview();
        } catch (error) {
            console.error("Erreur chargement config facture:", error);
            this.app.showToast("Erreur de chargement.", "error");
        }
    },

    updatePreview() {
        // Récupération des valeurs
        const template = document.getElementById('ciTemplate').value;
        const company = document.getElementById('ciCompany').value || "AMT TRANS'IT";
        const footer = document.getElementById('ciFooter').value;
        const cgv = document.getElementById('ciCgv').value;

        // Style dynamique selon le modèle
        const wrapper = document.getElementById('pdfPreviewWrapper');
        const header = document.getElementById('pdfHeader');
        const docType = document.getElementById('prevDocType');
        const tableHeader = document.getElementById('pdfTableHeader');

        if (template === 'bl') {
            wrapper.style.setProperty('--pdf-accent', '#10b981'); // Vert pour le BL
            docType.textContent = "BON DE LIVRAISON";
        } else {
            wrapper.style.setProperty('--pdf-accent', '#3b82f6'); // Bleu pour la Facture
            docType.textContent = "FACTURE";
        }

        // Application des textes
        document.getElementById('prevCompany').textContent = company;
        document.getElementById('prevFooter').textContent = footer;
        document.getElementById('prevCgv').textContent = cgv;
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
            
            await setDoc(this.docRef, this.config);
            this.app.showToast("Modèle de facture enregistré avec succès !", "success");
        } catch (error) {
            console.error("Erreur sauvegarde facture:", error);
            this.app.showToast("Erreur lors de la sauvegarde.", "error");
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
};