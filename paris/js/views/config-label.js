import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ConfigLabelView = {
    docRef: null,
    config: {
        paperSize: "A6",
        showPhone: true,
        showPrice: false,
        autoPrint: true
    },

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.configLabel = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        this.docRef = doc(db, "settings", `label_config_${activeAgency}`);

        const html = `
            <style>
                .cl-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out; }
                .cl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px; }
                .cl-header__left { display: flex; align-items: center; gap: 15px; }
                .cl-icon-wrap { background: #fdf4ff; color: #db2777; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px; }
                .cl-title { margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; }
                .cl-subtitle { margin: 4px 0 0 0; color: #64748b; font-size: 13px; }
                
                .cl-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
                @media (max-width: 992px) { .cl-layout { grid-template-columns: 1fr; } }

                .cl-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); padding: 20px; }
                .cl-card-title { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }

                /* Aperçu Étiquette */
                .label-preview-container {
                    background: #f1f5f9; padding: 30px; border-radius: 8px; display: flex; justify-content: center; align-items: center;
                }
                .label-preview {
                    background: white; border: 2px dashed #cbd5e1; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); 
                    width: 100%; max-width: 400px; aspect-ratio: 1.5; /* Ratio typique 10x15 cm */
                    font-family: 'Helvetica', 'Arial', sans-serif; position: relative; overflow: hidden;
                    display: flex; flex-direction: column; justify-content: space-between; padding: 20px; box-sizing: border-box;
                }
                .toggle-switch {
                    position: relative; display: inline-block; width: 44px; height: 24px;
                }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .slider {
                    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; border-radius: 24px;
                }
                .slider:before {
                    position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                }
                input:checked + .slider { background-color: #10b981; }
                input:checked + .slider:before { transform: translateX(20px); }
            </style>

            <div class="cl-page">
                <div class="cl-header">
                    <div class="cl-header__left">
                        <div class="cl-icon-wrap"><i class="fas fa-tag"></i></div>
                        <div>
                            <h1 class="cl-title">Paramètres d'Étiquettes</h1>
                            <p class="cl-subtitle">Configurez le format et les informations visibles sur les étiquettes colis</p>
                        </div>
                    </div>
                    <button class="btn btn-primary" id="saveLabelConfigBtn" onclick="window.app.views.configLabel.saveData()" style="padding: 10px 20px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                </div>

                <div class="cl-layout">
                    <!-- Formulaire de Configuration -->
                    <div class="cl-card" style="align-self: start;">
                        <div class="cl-card-title"><i class="fas fa-sliders-h text-pink-500"></i> Paramètres d'impression</div>
                        
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #475569; margin-bottom: 6px; display: block;">Format du papier</label>
                            <select id="clPaperSize" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;" onchange="window.app.views.configLabel.updatePreview()">
                                <option value="A6" selected>A6 (10x15 cm) - Imprimante thermique</option>
                                <option value="A4_4">A4 (4 étiquettes par page) - Imprimante classique</option>
                            </select>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <div>
                                <div style="font-weight: 600; color: #1e293b; font-size: 14px;">Afficher le téléphone</div>
                                <div style="font-size: 11px; color: #64748b;">Affiche le numéro du destinataire sur l'étiquette</div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="clShowPhone" onchange="window.app.views.configLabel.updatePreview()">
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                            <div>
                                <div style="font-weight: 600; color: #1e293b; font-size: 14px;">Impression automatique</div>
                                <div style="font-size: 11px; color: #64748b;">Proposer l'impression dès la création de la facture</div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="clAutoPrint" onchange="window.app.views.configLabel.updatePreview()">
                                <span class="slider"></span>
                            </label>
                        </div>
                        
                        <div style="padding: 15px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe; font-size: 12px; color: #1e40af; display: flex; gap: 10px; margin-top: 20px;">
                            <i class="fas fa-info-circle" style="font-size: 16px;"></i>
                            <div>La référence du colis (ex: <b>KA-018-E10_1_71</b>) contient les initiales de l'agent, l'ordre du jour, le conteneur, le numéro du colis et une clé unique anti-doublon.</div>
                        </div>
                    </div>

                    <!-- Aperçu Visuel -->
                    <div class="cl-card">
                        <div class="cl-card-title"><i class="fas fa-eye text-indigo-500"></i> Aperçu en temps réel</div>
                        <div class="label-preview-container">
                            
                            <div class="label-preview" id="labelPreviewCard">
                                <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 10px;">
                                    <div>
                                        <strong style="font-size: 18px; color: #0f172a;">AMT TRANS'IT</strong><br>
                                        <span style="font-size: 12px; color: #475569;">Destination: <b style="color: #0f172a;">ABIDJAN</b></span>
                                    </div>
                                    <div style="text-align: right;">
                                        <strong style="font-size: 20px; color: #0f172a;">KA-018-E10</strong><br>
                                        <span style="font-size: 12px; background: #0f172a; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold; display: inline-block; margin-top: 4px;">Colis 1 / 3</span>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-top: 15px;">
                                    <div style="flex: 1;">
                                        <div style="font-size: 10px; color: #64748b; font-weight: bold;">EXPÉDITEUR</div>
                                        <div style="font-weight: bold; font-size: 14px; color: #0f172a;">Jean Dupont</div>
                                    </div>
                                    <div style="flex: 1; text-align: right;">
                                        <div style="font-size: 10px; color: #64748b; font-weight: bold;">DESTINATAIRE</div>
                                        <div style="font-weight: bold; font-size: 14px; color: #0f172a;">Marie Koné</div>
                                        <div id="prevLabelPhone" style="font-size: 13px; color: #0f172a; font-weight: 600; margin-top: 2px;">01 23 45 67 89</div>
                                    </div>
                                </div>
                                <div style="text-align: center; margin-top: auto; padding-top: 15px;">
                                    <div style="height: 50px; background: repeating-linear-gradient(90deg, #0f172a, #0f172a 2px, transparent 2px, transparent 4px, #0f172a 4px, #0f172a 8px, transparent 8px, transparent 10px); width: 80%; margin: 0 auto; opacity: 0.8;"></div>
                                    <div style="font-family: monospace; font-size: 16px; margin-top: 5px; font-weight: bold; letter-spacing: 1px; color: #0f172a;">KA-018-E10_1_71</div>
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

            document.getElementById('clPaperSize').value = this.config.paperSize || 'A6';
            document.getElementById('clShowPhone').checked = this.config.showPhone !== false;
            document.getElementById('clAutoPrint').checked = this.config.autoPrint !== false;
            
            this.updatePreview();
        } catch (error) {
            console.error("Erreur chargement config étiquette:", error);
        }
    },

    updatePreview() {
        const showPhone = document.getElementById('clShowPhone').checked;
        document.getElementById('prevLabelPhone').style.display = showPhone ? 'block' : 'none';
    },

    async saveData() {
        const btn = document.getElementById('saveLabelConfigBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        try {
            this.config.paperSize = document.getElementById('clPaperSize').value;
            this.config.showPhone = document.getElementById('clShowPhone').checked;
            this.config.autoPrint = document.getElementById('clAutoPrint').checked;
            
            await setDoc(this.docRef, this.config);
            this.app.showToast("Paramètres d'étiquette enregistrés avec succès !", "success");
        } catch (error) {
            this.app.showToast("Erreur lors de la sauvegarde.", "error");
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
};