import { db } from '../../../firebase-config.js';
import { collection, addDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const NouveauRdvView = {
    clientsMap: new Map(),

    render(app) {
        this.app = app;
        this.clientsMap.clear();

        const html = `
            <div style="max-width: 800px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;">
                
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px; background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <div style="background: #fdf2f8; color: #e11d48; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">
                        <i class="fas fa-calendar-plus"></i>
                    </div>
                    <div>
                        <h2 style="margin: 0; color: #0f172a; font-size: 22px;">Nouveau Rendez-vous</h2>
                        <p style="margin: 0; color: #64748b; font-size: 13px;">Planifier un enlèvement ou une livraison</p>
                    </div>
                </div>

                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-user text-blue-500"></i> Informations Client</h3>
                    <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
                        <div class="form-group full-width">
                            <label>Nom du Client *</label>
                            <input type="text" id="rdvClient" placeholder="Rechercher ou saisir un nom..." required list="rdvClientsList">
                            <datalist id="rdvClientsList"></datalist>
                            <div id="rdvClientFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;"></div>
                        </div>
                        <div class="form-group">
                            <label>Téléphone</label>
                            <input type="text" id="rdvTel" placeholder="Ex: 06 12 34 56 78">
                        </div>
                        <div class="form-group">
                            <label>Adresse complète</label>
                            <input type="text" id="rdvAdresse" placeholder="Ex: 10 Rue de Paris, 75001 Paris">
                        </div>
                    </div>
                </div>

                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-clock text-orange-500"></i> Planification</h3>
                    <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
                        <div class="form-group">
                            <label>Date prévue *</label>
                            <input type="date" id="rdvDate" value="${new Date().toISOString().split('T')[0]}" required>
                        </div>
                        <div class="form-group">
                            <label>Heure approximative</label>
                            <input type="time" id="rdvTime" value="10:00">
                        </div>
                        <div class="form-group full-width">
                            <label>Objet / Notes</label>
                            <textarea id="rdvNotes" rows="3" placeholder="Ex: 3 cartons à récupérer au 2ème étage sans ascenseur..." style="width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-family: inherit; resize: none;"></textarea>
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 15px; justify-content: flex-end; margin-top: 20px;">
                    <button class="btn btn-outline" onclick="app.renderPage('appointments-list')">Annuler</button>
                    <button id="rdvSubmitBtn" class="btn btn-primary" style="padding: 12px 24px; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-save"></i> Enregistrer le RDV
                    </button>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        
        this.loadAutocompleteData();

        let clientTimeout;
        document.getElementById('rdvClient').addEventListener('input', () => {
            clearTimeout(clientTimeout);
            clientTimeout = setTimeout(() => this.handleClientChange(), 300);
        });

        document.getElementById('rdvSubmitBtn').addEventListener('click', () => this.submitRdv());
    },

    async loadAutocompleteData() {
        try {
            const clientsSnap = await getDocs(collection(db, "clients"));
            this.clientsMap.clear();
            clientsSnap.forEach(doc => {
                const data = doc.data();
                if (data.nom) this.clientsMap.set(data.nom.trim(), data);
            });
            
            const datalist = document.getElementById('rdvClientsList');
            if (datalist) {
                datalist.innerHTML = Array.from(this.clientsMap.keys()).sort().map(nom => `<option value="${nom}"></option>`).join('');
            }
        } catch (e) {
            console.error("Erreur chargement auto-complétion :", e);
        }
    },

    handleClientChange() {
        const clientName = document.getElementById('rdvClient').value.trim();
        const telInput = document.getElementById('rdvTel');
        const adresseInput = document.getElementById('rdvAdresse');
        const feedback = document.getElementById('rdvClientFeedback');

        if (this.clientsMap.has(clientName)) {
            const clientData = this.clientsMap.get(clientName);
            if (!telInput.value) telInput.value = clientData.tel || '';
            if (!adresseInput.value) adresseInput.value = clientData.adresse || '';
            if (feedback) feedback.innerHTML = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> Client reconnu</span>`;
        } else {
            if (feedback) feedback.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-info-circle"></i> Nouveau client</span>`;
        }
    },

    async submitRdv() {
        const client = document.getElementById('rdvClient').value.trim();
        const date = document.getElementById('rdvDate').value;

        if (!client || !date) {
            this.app.showToast("Veuillez remplir le nom du client et la date.", "error");
            return;
        }

        const btn = document.getElementById('rdvSubmitBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        const rdvData = {
            client: client, tel: document.getElementById('rdvTel').value.trim(), adresse: document.getElementById('rdvAdresse').value.trim(),
            date: date, time: document.getElementById('rdvTime').value, notes: document.getElementById('rdvNotes').value.trim(),
            status: "en_attente", agency: sessionStorage.getItem('currentActiveAgency') || 'paris', createdAt: new Date().toISOString(), saisiPar: sessionStorage.getItem('userName') || 'Agent'
        };

        try {
            await addDoc(collection(db, "appointments"), rdvData);
            this.app.showToast("Rendez-vous enregistré avec succès !", "success");
            this.app.renderPage('appointments-list');
        } catch(e) {
            this.app.showToast("Erreur lors de l'enregistrement", "error");
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer le RDV';
            btn.disabled = false;
        }
    }
};