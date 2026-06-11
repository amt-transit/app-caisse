import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ScanHistoryView = {
    unsub: null,
    logs: [],
    filteredLogs: [],

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.scanHistory = this;

        const html = `
            <style>
                .sh-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .sh-header { display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 24px; }
                .sh-title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
                
                .sh-filters { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .sh-input, .sh-select { padding: 10px 15px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; transition: 0.2s; background: white; flex: 1; min-width: 150px; }
                .sh-input:focus, .sh-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                
                .sh-table-wrap { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow-x: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .sh-table { width: 100%; border-collapse: collapse; }
                .sh-table th { background: #f8fafc; padding: 15px 20px; text-align: left; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
                .sh-table td { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .sh-table tr:hover td { background: #f8fafc; }
                
                .sh-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block; white-space: nowrap; }
                .sh-type-paris { background: #e0f2fe; color: #0284c7; }
                .sh-type-transit { background: #fef3c7; color: #b45309; }
                .sh-type-abidjan { background: #f3e8ff; color: #7e22ce; }
                .sh-type-livraison { background: #ffedd5; color: #c2410c; }
                .sh-type-client { background: #dcfce7; color: #166534; }
                .sh-type-default { background: #f1f5f9; color: #475569; }

                .sh-status-succes { color: #10b981; font-weight: bold; }
                .sh-status-doublon { color: #f59e0b; font-weight: bold; }
                .sh-status-erreur { color: #ef4444; font-weight: bold; }

                .sh-ref { font-family: monospace; font-weight: 800; color: #0f172a; font-size: 14px; }
                .sh-agent { display: flex; align-items: center; gap: 8px; font-weight: 600; }
                .sh-agency { font-size: 10px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; color: #475569; }

                /* Regroupement par dossier */
                .sh-group-row { cursor: pointer; }
                .sh-group-row td { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
                .sh-group-row:hover td { background: #eef2f7; }
                .sh-group-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
                .sh-caret { color: #3b82f6; font-weight: 800; width: 14px; }
                .sh-group-ref { font-family: monospace; font-weight: 800; color: #0f172a; background: #e0f2fe; padding: 3px 10px; border-radius: 6px; }
                .sh-group-count { font-weight: 800; color: #1e40af; }
                .sh-group-meta { color: #64748b; font-size: 12px; }
                .sh-group-agent { margin-left: auto; color: #1e293b; font-weight: 600; font-size: 12px; }
                .sh-detail td:first-child { padding-left: 40px; }

                /* ── Tablette + pliable + mobile (≤768px) : le tableau (6 colonnes
                   nowrap) deborde -> on masque l'en-tete et on transforme les
                   lignes de detail en fiches compactes SANS libelles. L'en-tete
                   de dossier (.sh-group-head) est deja un flex qui s'enroule. */
                @media (max-width: 768px) {
                    .sh-table thead { display: none; }
                    .sh-table, .sh-table tbody, .sh-table tr { display: block; width: 100%; }
                    .sh-table td { box-sizing: border-box; }
                    .sh-group-row td { display: block; width: 100%; padding: 12px 14px; }
                    .sh-detail { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 10px; margin: 7px 10px; padding: 9px 13px; border: 1px solid #e8edf3; border-left: 3px solid #cbd5e1; border-radius: 10px; background: #fff; }
                    .sh-detail td { display: inline-flex; align-items: center; width: auto; border: none !important; padding: 0 !important; font-size: 12px; color: #475569; }
                    .sh-detail td:first-child { width: 100%; padding-left: 0 !important; color: #94a3b8; font-size: 11px; }
                    .sh-detail .sh-ref { font-size: 13px; }
                    .sh-detail .sh-agent { font-size: 12px; }
                    /* l'agent ne doit plus etre pousse a droite (deborde) : il
                       passe a la ligne avec le reste de l'en-tete de dossier. */
                    .sh-group-agent { margin-left: 0 !important; }
                    .sh-group-head { gap: 6px 10px; }
                }
            </style>
            <div class="sh-page">
                <div class="sh-header">
                    <h1 class="sh-title"><i class="fas fa-history"></i> Historique des Scans</h1>
                    <button class="amt-btn amt-btn-outline" onclick="window.app.views.scanHistory.loadData()"><i class="fas fa-sync-alt"></i> Actualiser</button>
                </div>

                <div class="sh-filters">
                    <input type="text" id="shSearch" class="sh-input" placeholder="🔍 Référence, Agent..." oninput="window.app.views.scanHistory.applyFilters()">
                    <select id="shType" class="sh-select" onchange="window.app.views.scanHistory.applyFilters()">
                        <option value="">Tous les types de scan</option>
                        <option value="ENTREPOT_PARIS">Mise en Entrepôt (Paris)</option>
                        <option value="CONTENEUR_CHARGEMENT">Chargement Conteneur (Paris)</option>
                        <option value="DECHARGEMENT_ABIDJAN">Déchargement Conteneur (Abidjan)</option>
                        <option value="MISE_EN_LIVRAISON">Mise en Livraison (Abidjan)</option>
                        <option value="REMISE_CLIENT">Remise au Client (Abidjan)</option>
                    </select>
                    <select id="shStatus" class="sh-select" onchange="window.app.views.scanHistory.applyFilters()">
                        <option value="">Tous les résultats</option>
                        <option value="SUCCES">Succès</option>
                        <option value="DOUBLON">Doublon / Déjà scanné</option>
                        <option value="ERREUR">Erreur / Inconnu</option>
                    </select>
                    <input type="date" id="shDate" class="sh-input" onchange="window.app.views.scanHistory.applyFilters()">
                </div>

                <div class="sh-table-wrap">
                    <table class="sh-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Référence</th>
                                <th>Étape / Type</th>
                                <th>Résultat</th>
                                <th>Infos sup.</th>
                                <th>Agent</th>
                            </tr>
                        </thead>
                        <tbody id="shTableBody">
                            <tr><td colspan="6" style="text-align: center; padding: 40px;">Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        container.innerHTML = html;
        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const q = query(collection(db, "scan_logs"), where("agency", "==", activeAgency), orderBy("date", "desc"), limit(1000));

        this.unsub = onSnapshot(q, (snapshot) => {
            // Isolation Maritime/Aerien : on ne garde que les scans du mode
            // actif. Anciens scans sans modeExpedition = maritime (legacy).
            const _mode = sessionStorage.getItem('shippingMode') || 'maritime';
            this.logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(s => ((s.modeExpedition === 'aerien') ? 'aerien' : 'maritime') === _mode);
            this.applyFilters();
        }, (error) => {
            console.error("Erreur chargement scan logs:", error);
            document.getElementById('shTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Erreur de chargement.</td></tr>';
        });
    },

    applyFilters() {
        const search = (document.getElementById('shSearch')?.value || '').toLowerCase().trim();
        const type = document.getElementById('shType')?.value || '';
        const status = document.getElementById('shStatus')?.value || '';
        const date = document.getElementById('shDate')?.value || '';

        this.filteredLogs = this.logs.filter(log => {
            if (type && log.type !== type) return false;
            if (status && log.status !== status) return false;
            if (date && log.date && !log.date.startsWith(date)) return false;
            
            if (search) {
                const str = `${log.scanRef || ''} ${log.agent || ''} ${log.container || ''} ${log.livreur || ''}`.toLowerCase();
                if (!str.includes(search)) return false;
            }
            return true;
        });
        this.renderTable();
    },

    // Référence du DOSSIER (client) à partir d'un sous-colis :
    // « J-004-AER1_13_22 » -> « J-004-AER1 ».
    baseRefOf(ref) {
        const r = ref || '';
        return r.replace(/_\d+_\d+$/, '') || r || '-';
    },

    toggleGroup(key) {
        if (!this.expanded) this.expanded = new Set();
        if (this.expanded.has(key)) this.expanded.delete(key);
        else this.expanded.add(key);
        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('shTableBody');
        if (!tbody) return;
        if (!this.expanded) this.expanded = new Set();
        if (this.filteredLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun scan trouvé pour ces critères.</td></tr>';
            return;
        }

        const getTypeInfo = (type) => {
            switch(type) {
                case 'ENTREPOT_PARIS': return { label: 'Mise Entrepôt (Paris)', cls: 'sh-type-paris' };
                case 'CONTENEUR_CHARGEMENT': return { label: 'Chargement Conteneur', cls: 'sh-type-transit' };
                case 'DECHARGEMENT_ABIDJAN': return { label: 'Déchargement Abidjan', cls: 'sh-type-abidjan' };
                case 'MISE_EN_LIVRAISON': return { label: 'Mise en Livraison', cls: 'sh-type-livraison' };
                case 'REMISE_CLIENT': return { label: 'Remise Client', cls: 'sh-type-client' };
                default: return { label: type || 'Inconnu', cls: 'sh-type-default' };
            }
        };

        const getStatusHtml = (status) => {
            if (status === 'SUCCES') return '<span class="sh-status-succes"><i class="fas fa-check-circle"></i> Succès</span>';
            if (status === 'DOUBLON') return '<span class="sh-status-doublon"><i class="fas fa-exclamation-triangle"></i> Doublon</span>';
            if (status === 'ERREUR') return '<span class="sh-status-erreur"><i class="fas fa-times-circle"></i> Erreur</span>';
            return status || '-';
        };

        // Regroupement par DOSSIER + ACTION (type) + JOUR.
        const map = new Map();
        this.filteredLogs.forEach(log => {
            const base = this.baseRefOf(log.scanRef);
            const day = (log.date || '').slice(0, 10);
            const key = `${base}__${log.type || ''}__${day}`;
            if (!map.has(key)) map.set(key, { key, baseRef: base, type: log.type, day, items: [], latest: log.date || '', agent: log.agent, agency: log.agency, nSuccess: 0, nDup: 0, nErr: 0 });
            const g = map.get(key);
            g.items.push(log);
            if (!g.latest || (log.date || '') > g.latest) g.latest = log.date || '';
            if (log.status === 'SUCCES') g.nSuccess++;
            else if (log.status === 'DOUBLON') g.nDup++;
            else g.nErr++;
        });
        const groups = Array.from(map.values()).sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));

        tbody.innerHTML = groups.map(g => {
            const typeInfo = getTypeInfo(g.type);
            const dateStr = g.latest ? new Date(g.latest).toLocaleString('fr-FR') : '-';
            const keyAttr = g.key.replace(/'/g, '');
            const isOpen = this.expanded.has(g.key);
            const agencyBadge = g.agency === 'paris' ? 'FR' : (g.agency === 'abidjan' ? 'CI' : (g.agency || 'N/A'));

            let rollup = '';
            if (g.nSuccess) rollup += `<span class="sh-status-succes">✅ ${g.nSuccess}</span> `;
            if (g.nDup) rollup += `<span class="sh-status-doublon">⚠️ ${g.nDup}</span> `;
            if (g.nErr) rollup += `<span class="sh-status-erreur">❌ ${g.nErr}</span>`;

            const header = `
                <tr class="sh-group-row" onclick="window.app.views.scanHistory.toggleGroup('${keyAttr}')">
                    <td colspan="6">
                        <div class="sh-group-head">
                            <span class="sh-caret">${isOpen ? '▾' : '▸'}</span>
                            <span class="sh-group-ref">${g.baseRef}</span>
                            <span class="sh-group-count">${g.items.length} colis</span>
                            <span class="sh-badge ${typeInfo.cls}">${typeInfo.label}</span>
                            <span class="sh-group-meta">${dateStr}</span>
                            <span>${rollup}</span>
                            <span class="sh-group-agent">👤 ${g.agent || 'Système'} · ${agencyBadge}</span>
                        </div>
                    </td>
                </tr>
            `;

            if (!isOpen) return header;

            const details = g.items.map(log => {
                const dStr = log.date ? new Date(log.date).toLocaleString('fr-FR') : '-';
                let extraInfo = '-';
                if (log.container) extraInfo = `Conteneur: <b>${log.container}</b>`;
                if (log.livreur) extraInfo = `Livreur: <b>${log.livreur}</b>`;
                return `
                    <tr class="sh-detail">
                        <td>${dStr}</td>
                        <td class="sh-ref">${log.scanRef || '—'}</td>
                        <td><span class="sh-badge ${typeInfo.cls}">${typeInfo.label}</span></td>
                        <td>${getStatusHtml(log.status)}</td>
                        <td>${extraInfo}</td>
                        <td>
                            <div class="sh-agent">
                                ${log.agent || 'Système'}
                                <span class="sh-agency">${log.agency === 'paris' ? 'FR' : (log.agency === 'abidjan' ? 'CI' : log.agency || 'N/A')}</span>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            return header + details;
        }).join('');
    }
};