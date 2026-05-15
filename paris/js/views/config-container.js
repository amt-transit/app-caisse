import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { AGENCIES } from '../../../agencies-config.js';

export const ConfigContainerView = {
    docRef: null,
    config: {
        activeContainer: "E15" // Valeur par défaut
    },

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.configContainer = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        this.docRef = doc(db, "settings", `container_config_${activeAgency}`);

        const html = `
            <div class="page" style="max-width: 800px; margin: 0 auto; animation: fadeIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #e0f2fe; color: #0284c7; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;"><i class="fas fa-box-open"></i></div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800;">Conteneur Actif</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Définissez le nom du conteneur en cours de remplissage.</p>
                        </div>
                    </div>
                </div>

                <div class="form-card" style="background: white; border-radius: 16px; padding: 25px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <h3 style="margin-top: 0; color: #1e293b; font-size: 16px; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                        ⚙️ Paramétrage du nom initial
                    </h3>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="font-weight: 600; font-size: 13px; color: #475569; display: block; margin-bottom: 8px;">
                            Nom du Conteneur Actif *
                        </label>
                        <input type="text" id="ccActiveContainer" style="width: 100%; padding: 12px 15px; border: 2px solid #cbd5e1; border-radius: 8px; font-size: 18px; font-weight: bold; color: #0f172a; text-transform: uppercase;" placeholder="Ex: E15, D01...">
                        <div style="margin-top: 8px; font-size: 12px; color: #64748b;">
                            💡 <strong style="color: #3b82f6;">Astuce :</strong> Le 31/12/2026, vous pourrez revenir ici pour changer <b>"E15"</b> en <b>"D01"</b> par exemple. Toutes les nouvelles factures utiliseront ce nouveau nom automatiquement.
                        </div>
                    </div>

                    <div style="padding: 15px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a; font-size: 13px; color: #92400e; display: flex; gap: 12px; margin-bottom: 25px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 20px; margin-top: 2px;"></i>
                        <div>
                            <strong>Attention :</strong> Ce nom de conteneur sera assigné à <b>toutes les nouvelles factures</b> créées depuis le menu "Nouvelle Facture". Le numéro de facture/colis s'incrémentera automatiquement en fonction de ce conteneur.
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end;">
                        <button class="btn btn-primary" id="saveContainerConfigBtn" onclick="window.app.views.configContainer.saveData()" style="padding: 12px 24px; font-size: 15px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 6px rgba(59,130,246,0.3);">
                            <i class="fas fa-save"></i> Mettre à jour le Conteneur Actif
                        </button>
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
            document.getElementById('ccActiveContainer').value = this.config.activeContainer || 'E15';
        } catch (error) {
            console.error("Erreur chargement config conteneur:", error);
        }
    },

    async saveData() {
        const btn = document.getElementById('saveContainerConfigBtn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        try {
            let activeContainerVal = document.getElementById('ccActiveContainer').value.trim().toUpperCase();
            
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const agencyConfig = AGENCIES[activeAgency];
            const prefix = agencyConfig && agencyConfig.prefix ? agencyConfig.prefix : '';
            
            if (prefix && !activeContainerVal.startsWith(prefix)) {
                activeContainerVal = prefix + activeContainerVal;
            }

            if (!activeContainerVal) {
                this.app.showToast("Le nom du conteneur ne peut pas être vide.", "error");
                return;
            }

            this.config.activeContainer = activeContainerVal;
            await setDoc(this.docRef, this.config, { merge: true });
            
            this.app.showToast("Le conteneur actif a été mis à jour avec succès !", "success");
        } catch (error) {
            console.error("Erreur sauvegarde config conteneur:", error);
            this.app.showToast("Erreur lors de la sauvegarde.", "error");
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
};