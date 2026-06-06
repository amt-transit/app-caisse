import { db } from '../../../commun/firebase-config.js';
import { doc, getDoc, setDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, watch, onMounted, onUnmounted, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { AGENCIES } from '../../../commun/agencies-config.js';

// ─── CONSTANTES ─────────────────────────────────────────────────────────────
const ALL_MENUS = [
    { key: 'main',             label: 'Accueil',           icon: '🏠' },
    { key: 'bilan',            label: 'Bilan journalier',  icon: '📊' },
    { key: 'factures',         label: 'Factures',          icon: '🧾' },
    { key: 'rdv',              label: 'Rendez-vous',       icon: '📅' },
    { key: 'operations',       label: 'Programmes',        icon: '🚚' },
    { key: 'devis',            label: 'Devis',             icon: '📋' },
    { key: 'chargement',       label: 'Chargement',        icon: '📦' },
    { key: 'scan',             label: 'Scan',              icon: '📷' },
    { key: 'clients',          label: 'Clients',           icon: '👥' },
    { key: 'comms',            label: 'Communication',     icon: '💬' },
    { key: 'produits',         label: 'Produits',          icon: '🛍️' },
    { key: 'finance',          label: 'Finance',           icon: '💰' },
    { key: 'colis-recus',      label: 'Colis reçus',       icon: '📬' },
    { key: 'stock',            label: 'Stock',             icon: '🗄️' },
    { key: 'bilans-financiers',label: 'Bilans financiers', icon: '📈' },
    { key: 'statistique',      label: 'Statistiques',      icon: '📉' },
    { key: 'settings',         label: 'Paramètres',        icon: '⚙️' },
    { key: 'configuration',    label: 'Configuration',     icon: '🔧' },
    { key: 'prospecting',      label: 'Prospects',         icon: '🔍' },
    { key: 'audit-log',        label: 'Audit Log',         icon: '🔒' },
];

const FONTS = [
    { value: "'Inter', sans-serif",          label: 'Inter',          sample: 'Aa' },
    { value: "'Poppins', sans-serif",        label: 'Poppins',        sample: 'Aa' },
    { value: "'Roboto', sans-serif",         label: 'Roboto',         sample: 'Aa' },
    { value: "'Montserrat', sans-serif",     label: 'Montserrat',     sample: 'Aa' },
    { value: "'Open Sans', sans-serif",      label: 'Open Sans',      sample: 'Aa' },
    { value: "'Nunito', sans-serif",         label: 'Nunito',         sample: 'Aa' },
    { value: "'DM Sans', sans-serif",        label: 'DM Sans',        sample: 'Aa' },
    { value: "'Figtree', sans-serif",        label: 'Figtree',        sample: 'Aa' },
    { value: "'Outfit', sans-serif",         label: 'Outfit',         sample: 'Aa' },
    { value: "'Plus Jakarta Sans', sans-serif", label: 'Plus Jakarta', sample: 'Aa' },
];

const PRESET_THEMES = [
    { name: 'Paris 🇫🇷',  bg: 'linear-gradient(135deg,#eff6ff 0%,#dbeafe 75%,#fee2e2 100%)', primary: '#1d4ed8', secondary: 'linear-gradient(180deg,#0a2558 0%,#1e3a8a 80%,#991b1b 100%)' },
    { name: 'Abidjan 🇨🇮', bg: 'linear-gradient(135deg,#fff7ed 0%,#fff 50%,#f0fdf4 100%)', primary: '#FF8200', secondary: 'linear-gradient(180deg,#FF8200 0%,#e67500 50%,#009A44 100%)' },
    { name: 'Chine 🇨🇳',   bg: 'linear-gradient(135deg,#fef2f2 0%,#fff 60%,#fef2f2 100%)', primary: '#dc2626', secondary: 'linear-gradient(180deg,#7f1d1d 0%,#dc2626 60%,#991b1b 100%)' },
    { name: 'Nuit 🌙',     bg: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',           primary: '#6366f1', secondary: 'linear-gradient(180deg,#0f172a 0%,#1e293b 100%)' },
    { name: 'Émeraude 💚', bg: 'linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%)',           primary: '#059669', secondary: 'linear-gradient(180deg,#064e3b 0%,#059669 100%)' },
    { name: 'Or 🌟',       bg: 'linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)',           primary: '#d97706', secondary: 'linear-gradient(180deg,#78350f 0%,#d97706 100%)' },
];

const DEFAULT_CONFIG = (agencyId) => {
    let name = 'AMT Paris';
    let slogan = 'Agent Dashboard';
    if (agencyId && agencyId !== 'paris') {
        name = AGENCIES[agencyId] ? AGENCIES[agencyId].name : "AMT Trans'it";
        slogan = 'Espace de Gestion';
    }
    return {
        // Couleurs
        bgColor:        'linear-gradient(135deg,#eff6ff 0%,#dbeafe 75%,#fee2e2 100%)',
        primaryColor:   '#1d4ed8',
        secondaryColor: 'linear-gradient(180deg,#0a2558 0%,#1e3a8a 80%,#991b1b 100%)',
        accentColor:    '#ef4444',
        // Identité
        agencyName:   name,
        agencySlogan: slogan,
        logoBase64:   null,
        // Typographie
        fontFamily:    "'Inter', sans-serif",
        baseFontSize:  '14px',
        density:       'normal',
        // Menus visibles pour cette agence (clés de ALL_MENUS)
        visibleMenus: ALL_MENUS.map(m => m.key),
    };
};

// ─── EXPORT ─────────────────────────────────────────────────────────────────
export const SettingsDesignView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsDesign = this;

        document.getElementById('contentContainer').innerHTML = `
            <style>
            /* ── PAGE ── */
            [v-cloak]{display:none}
            .sd-page{max-width:1400px;margin:0 auto;animation:fadeIn .3s ease;font-family:'Inter',sans-serif}
            
            /* ── HEADER ── */
            .sd-topbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:18px 24px;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
            .sd-topbar__left{display:flex;align-items:center;gap:16px}
            .sd-topbar__icon{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 4px 12px rgba(99,102,241,.3)}
            .sd-topbar__title{margin:0;font-size:20px;font-weight:800;color:#0f172a}
            .sd-topbar__sub{margin:3px 0 0;font-size:13px;color:#64748b}
            .sd-agency-select{padding:6px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:700;color:#0f172a;background:#f8fafc;cursor:pointer;transition:.2s}
            .sd-agency-select:focus{outline:none;border-color:#6366f1}
            
            /* ── TABS ── */
            .sd-tabs{display:flex;gap:4px;background:#f1f5f9;border-radius:14px;padding:4px;margin-bottom:24px;overflow-x:auto}
            .sd-tab{flex:1;min-width:120px;padding:10px 16px;border:none;border-radius:10px;background:transparent;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;transition:.2s;display:flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap}
            .sd-tab.active{background:#fff;color:#6366f1;box-shadow:0 1px 4px rgba(0,0,0,.08)}
            .sd-tab:hover:not(.active){background:rgba(255,255,255,.6);color:#334155}
            
            /* ── SECTIONS ── */
            .sd-section{display:none}
            .sd-section.active{display:block;animation:fadeIn .25s ease}
            
            /* ── CARDS ── */
            .sd-card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.03);margin-bottom:20px}
            .sd-card__head{padding:14px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px}
            .sd-card__head h3{margin:0;font-size:15px;font-weight:700;color:#1e293b}
            .sd-card__body{padding:20px}
            .sd-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}

            /* ── FIELD ── */
            .sd-field{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
            .sd-field:last-child{margin-bottom:0}
            .sd-label{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.6px}
            .sd-input{padding:10px 13px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:inherit;color:#0f172a;transition:.2s;background:#f8fafc}
            .sd-input:focus{outline:none;border-color:#6366f1;background:#fff;box-shadow:0 0 0 3px rgba(99,102,241,.1)}
            
            /* ── COLOR ROW ── */
            .sd-color-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
            .sd-color-swatch{width:44px;height:38px;border:1.5px solid #e2e8f0;border-radius:9px;cursor:pointer;flex-shrink:0;padding:2px}
            .sd-color-text{flex:1;min-width:120px}
            .sd-btn-grad{display:flex;align-items:center;gap:5px;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:9px;background:#fff;font-size:12px;font-weight:600;color:#475569;cursor:pointer;transition:.2s;white-space:nowrap}
            .sd-btn-grad:hover{border-color:#6366f1;color:#6366f1;background:#f5f3ff}
            
            /* ── PRESETS ── */
            .sd-presets{display:flex;flex-wrap:wrap;gap:10px;padding-bottom:4px}
            .sd-preset{padding:8px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;transition:.2s;background:#f8fafc;color:#334155;display:flex;align-items:center;gap:6px}
            .sd-preset:hover{border-color:#6366f1;background:#f5f3ff;color:#6366f1;transform:translateY(-1px)}
            .sd-preset-swatch{width:14px;height:14px;border-radius:4px;border:1px solid rgba(0,0,0,.1)}

            /* ── FONT CARDS ── */
            .sd-fonts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
            .sd-font-card{border:1.5px solid #e2e8f0;border-radius:12px;padding:12px 14px;cursor:pointer;transition:.2s;background:#f8fafc;display:flex;flex-direction:column;gap:4px}
            .sd-font-card:hover{border-color:#6366f1;background:#f5f3ff}
            .sd-font-card.active{border-color:#6366f1;background:#eff6ff;box-shadow:0 0 0 3px rgba(99,102,241,.1)}
            .sd-font-sample{font-size:22px;font-weight:700;color:#0f172a;line-height:1}
            .sd-font-name{font-size:11px;font-weight:600;color:#64748b}
            
            /* ── DENSITY ── */
            .sd-density-row{display:flex;gap:10px}
            .sd-density-btn{flex:1;padding:10px 8px;border:1.5px solid #e2e8f0;border-radius:10px;background:#f8fafc;font-size:12px;font-weight:700;color:#475569;cursor:pointer;transition:.2s;text-align:center}
            .sd-density-btn:hover{border-color:#6366f1;color:#6366f1}
            .sd-density-btn.active{border-color:#6366f1;background:#eff6ff;color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15)}
            
            /* ── SIZE SLIDER ── */
            .sd-range{width:100%;accent-color:#6366f1;cursor:pointer}
            .sd-range-labels{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-top:4px}
            
            /* ── LOGO ── */
            .sd-logo-zone{border:2px dashed #e2e8f0;border-radius:14px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;cursor:pointer;transition:.2s;background:#f8fafc;text-align:center}
            .sd-logo-zone:hover{border-color:#6366f1;background:#f5f3ff}
            .sd-logo-preview{width:80px;height:80px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #e2e8f0}
            .sd-logo-preview img{max-width:100%;max-height:100%;object-fit:contain}
            
            /* ── MENUS ── */
            .sd-menus-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
            .sd-menu-item{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:12px;cursor:pointer;transition:.2s;background:#f8fafc;user-select:none}
            .sd-menu-item:hover{border-color:#6366f1;background:#f5f3ff}
            .sd-menu-item.on{border-color:#10b981;background:#ecfdf5}
            .sd-menu-icon{font-size:18px;flex-shrink:0;width:28px;text-align:center}
            .sd-menu-label{font-size:13px;font-weight:600;color:#334155;flex:1}
            .sd-toggle{width:40px;height:22px;border-radius:11px;background:#cbd5e1;position:relative;transition:.3s;flex-shrink:0}
            .sd-toggle.on{background:#10b981}
            .sd-toggle::after{content:'';width:16px;height:16px;background:#fff;border-radius:50%;position:absolute;top:3px;left:3px;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
            .sd-toggle.on::after{left:21px}
            .sd-menus-actions{display:flex;gap:8px;margin-bottom:14px}
            .sd-menus-action-btn{padding:6px 12px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;font-size:12px;font-weight:600;cursor:pointer;transition:.2s;color:#475569}
            .sd-menus-action-btn:hover{border-color:#6366f1;color:#6366f1;background:#f5f3ff}
            
            /* ── PREVIEW SIDEBAR ── */
            .sd-preview-wrap{position:sticky;top:16px}
            .sd-preview{border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.12);border:1px solid #e2e8f0}
            .sd-preview-sidebar{padding:16px 12px;min-height:360px}
            .sd-preview-logo-area{display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.15)}
            .sd-preview-logo-img{width:32px;height:32px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
            .sd-preview-agency-name{font-size:13px;font-weight:800;color:#fff;margin:0}
            .sd-preview-agency-sub{font-size:10px;color:rgba(255,255,255,.6);margin:1px 0 0}
            .sd-preview-menu-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;margin-bottom:3px;color:rgba(255,255,255,.75);font-size:12px;font-weight:500}
            .sd-preview-menu-item.active{background:rgba(255,255,255,.15);color:#fff;font-weight:700;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-left:5px solid var(--primary);border-radius:4px 20px 20px 4px;box-shadow:0 4px 10px rgba(0,0,0,.05)}
            .sd-preview-main{padding:14px;background:#f8fafc;min-height:200px}
            .sd-preview-topbar{height:38px;background:#fff;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;padding:0 12px;gap:8px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
            .sd-preview-content{display:grid;grid-template-columns:1fr 1fr;gap:8px}
            .sd-preview-card{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.05);border:1px solid #e2e8f0}
            .sd-preview-card-title{font-size:10px;font-weight:600;color:#64748b;margin-bottom:6px}
            .sd-preview-card-value{font-size:18px;font-weight:800;color:#0f172a}
            .sd-preview-btn{height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;padding:0 10px;margin-top:8px}
            
            /* ── GRADIENT MODAL ── */
            .sd-grad-modal{display:none;position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:2000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
            .sd-grad-modal.open{display:flex;animation:fadeIn .2s}
            .sd-grad-box{background:#fff;width:90%;max-width:440px;border-radius:18px;box-shadow:0 25px 60px rgba(0,0,0,.2);overflow:hidden}
            .sd-grad-head{padding:18px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#f8fafc}
            .sd-grad-head h3{margin:0;font-size:15px;font-weight:700;color:#0f172a}
            .sd-grad-close{background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;line-height:1;padding:0}
            .sd-grad-body{padding:20px;display:flex;flex-direction:column;gap:16px}
            .sd-grad-preview{height:100px;border-radius:12px;border:1px solid #e2e8f0;transition:.3s}
            .sd-grad-row{display:flex;gap:8px;align-items:center}
            .sd-grad-color-pick{width:44px;height:38px;border:1.5px solid #e2e8f0;border-radius:9px;cursor:pointer;padding:2px;flex-shrink:0}
            .sd-apply-grad{width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:.2s}
            .sd-apply-grad:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(99,102,241,.35)}
            
            /* ── FOOTER ── */
            .sd-footer{display:flex;justify-content:flex-end;gap:12px;padding:20px 0 4px}
            .sd-btn-reset{padding:11px 24px;border:1.5px solid #e2e8f0;border-radius:12px;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#475569;transition:.2s}
            .sd-btn-reset:hover{border-color:#ef4444;color:#ef4444;background:#fef2f2}
            .sd-btn-save{padding:11px 28px;border:none;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:.2s;box-shadow:0 4px 12px rgba(99,102,241,.3)}
            .sd-btn-save:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 18px rgba(99,102,241,.4)}
            .sd-btn-save:disabled{opacity:.6;cursor:not-allowed}
            
            /* ── BADGE ── */
            .sd-live-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:#ecfdf5;border:1px solid #bbf7d0;color:#16a34a;font-size:12px;font-weight:600}
            .sd-pulse{width:7px;height:7px;border-radius:50%;background:#16a34a;animation:pulse 1.5s infinite}
            @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.7}}
            
            /* ── RANGE ── */
            input[type=range].sd-range{-webkit-appearance:none;height:5px;border-radius:3px;background:#e2e8f0}
            input[type=range].sd-range::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#6366f1;cursor:pointer;box-shadow:0 1px 4px rgba(99,102,241,.4)}
            </style>

            <div id="vue-sd-app" class="sd-page" v-cloak>
                
                <!-- TOPBAR -->
                <div class="sd-topbar">
                    <div class="sd-topbar__left">
                        <div class="sd-topbar__icon">🎨</div>
                        <div>
                            <h1 class="sd-topbar__title">Apparence & Design</h1>
                            <p class="sd-topbar__sub">
                                Agence active :
                                <select class="sd-agency-select" v-model="currentAgency" @change="loadData" style="margin-left:6px">
                                    <option v-for="ag in agenciesList" :key="ag.id" :value="ag.id">{{ ag.flag || '🏢' }} {{ ag.name }}</option>
                                </select>
                            </p>
                        </div>
                    </div>
                    <div class="sd-live-badge">
                        <div class="sd-pulse"></div>
                        Aperçu en direct actif
                    </div>
                </div>

                <!-- TABS -->
                <div class="sd-tabs">
                    <button class="sd-tab" :class="{active: tab==='couleurs'}" @click="tab='couleurs'">🎨 Couleurs & Thème</button>
                    <button class="sd-tab" :class="{active: tab==='identite'}" @click="tab='identite'">🏢 Logo & Identité</button>
                    <button class="sd-tab" :class="{active: tab==='typo'}" @click="tab='typo'">Aa Typographie</button>
                    <button class="sd-tab" :class="{active: tab==='menus'}" @click="tab='menus'">📋 Menus visibles</button>
                    <button class="sd-tab" :class="{active: tab==='apercu'}" @click="tab='apercu'">👁️ Aperçu</button>
                </div>

                <!-- ══ ONGLET COULEURS ══ -->
                <div class="sd-section" :class="{active: tab==='couleurs'}">
                    <div class="sd-grid2">
                        
                        <!-- Colonne gauche : contrôles -->
                        <div>
                            <!-- Presets -->
                            <div class="sd-card">
                                <div class="sd-card__head"><span style="font-size:18px">⚡</span><h3>Thèmes prédéfinis</h3></div>
                                <div class="sd-card__body">
                                    <div class="sd-presets">
                                        <button v-for="preset in presets" :key="preset.name" class="sd-preset" @click="applyPreset(preset)">
                                            <div class="sd-preset-swatch" :style="{background: preset.primary}"></div>
                                            {{ preset.name }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Fond principal -->
                            <div class="sd-card">
                                <div class="sd-card__head"><span style="font-size:18px">🖼️</span><h3>Fond de l'application</h3></div>
                                <div class="sd-card__body">
                                    <div class="sd-field">
                                        <label class="sd-label">Couleur ou dégradé CSS</label>
                                        <div class="sd-color-row">
                                            <input type="color" class="sd-color-swatch" v-model="pickerBg" title="Couleur unie">
                                            <input type="text" class="sd-input sd-color-text" v-model="config.bgColor" placeholder="linear-gradient(...)">
                                            <button class="sd-btn-grad" @click="openGrad('bgColor')">🪄 Dégradé</button>
                                        </div>
                                        <div class="sd-color-row" style="margin-top:8px">
                                            <div style="height:32px;border-radius:8px;flex:1;border:1px solid #e2e8f0;transition:.3s" :style="{background: config.bgColor}"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Couleur principale -->
                            <div class="sd-card">
                                <div class="sd-card__head"><span style="font-size:18px">🔵</span><h3>Couleur principale (boutons, liens actifs)</h3></div>
                                <div class="sd-card__body">
                                    <div class="sd-field">
                                        <div class="sd-color-row">
                                            <input type="color" class="sd-color-swatch" v-model="pickerPrimary">
                                            <input type="text" class="sd-input sd-color-text" v-model="config.primaryColor" placeholder="#1d4ed8 ou linear-gradient(...)">
                                            <button class="sd-btn-grad" @click="openGrad('primaryColor')">🪄 Dégradé</button>
                                        </div>
                                        <div style="margin-top:8px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;cursor:default" :style="{background: config.primaryColor}">
                                            Bouton exemple
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Sidebar -->
                            <div class="sd-card">
                                <div class="sd-card__head"><span style="font-size:18px">📌</span><h3>Sidebar / Menu latéral</h3></div>
                                <div class="sd-card__body">
                                    <div class="sd-field">
                                        <div class="sd-color-row">
                                            <input type="color" class="sd-color-swatch" v-model="pickerSecondary">
                                            <input type="text" class="sd-input sd-color-text" v-model="config.secondaryColor" placeholder="linear-gradient(180deg,...)">
                                            <button class="sd-btn-grad" @click="openGrad('secondaryColor')">🪄 Dégradé</button>
                                        </div>
                                        <div style="margin-top:8px;height:50px;border-radius:4px 20px 20px 4px;display:flex;align-items:center;padding:0 14px;gap:10px;background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 15px rgba(0,0,0,0.05)" :style="{borderLeft: '5px solid ' + config.primaryColor}">
                                            <div style="width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,.2)"></div>
                                            <span style="color:#ffffff;font-size:13px;font-weight:700">Menu exemple (Actif)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Couleur accentuation -->
                            <div class="sd-card">
                                <div class="sd-card__head"><span style="font-size:18px">🔴</span><h3>Couleur d'accentuation (alertes, badges)</h3></div>
                                <div class="sd-card__body">
                                    <div class="sd-field">
                                        <div class="sd-color-row">
                                            <input type="color" class="sd-color-swatch" v-model="config.accentColor">
                                            <input type="text" class="sd-input sd-color-text" v-model="config.accentColor" placeholder="#ef4444">
                                            <div style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2)" :style="{background: config.accentColor}">!</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Colonne droite : aperçu sidebar live -->
                        <div class="sd-preview-wrap">
                            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;text-align:center">Aperçu sidebar</div>
                            <div class="sd-preview">
                                <div class="sd-preview-sidebar" :style="{background: config.secondaryColor}">
                                    <div class="sd-preview-logo-area">
                                        <div class="sd-preview-logo-img">
                                            <img v-if="config.logoBase64" :src="config.logoBase64" style="width:100%;height:100%;object-fit:contain">
                                            <span v-else>🏢</span>
                                        </div>
                                        <div>
                                            <div class="sd-preview-agency-name">{{ config.agencyName || 'Mon Agence' }}</div>
                                            <div class="sd-preview-agency-sub">{{ config.agencySlogan || 'Dashboard' }}</div>
                                        </div>
                                    </div>
                                    <div v-for="item in previewMenuItems" :key="item.label" class="sd-preview-menu-item" :class="{active: item.active}">
                                        <span style="font-size:14px">{{ item.icon }}</span>
                                        <span>{{ item.label }}</span>
                                    </div>
                                </div>
                                <div class="sd-preview-main" :style="{background: config.bgColor}">
                                    <div class="sd-preview-topbar">
                                        <div style="width:10px;height:10px;border-radius:50%;background:#e2e8f0"></div>
                                        <div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;max-width:120px"></div>
                                        <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0" :style="{background: config.primaryColor}"></div>
                                    </div>
                                    <div class="sd-preview-content">
                                        <div class="sd-preview-card">
                                            <div class="sd-preview-card-title">Chiffre d'affaires</div>
                                            <div class="sd-preview-card-value" :style="{color: config.primaryColor}">25 000 €</div>
                                            <div class="sd-preview-btn" :style="{background: config.primaryColor}">Voir</div>
                                        </div>
                                        <div class="sd-preview-card">
                                            <div class="sd-preview-card-title">Factures</div>
                                            <div class="sd-preview-card-value" :style="{color: config.primaryColor}">142</div>
                                            <div class="sd-preview-btn" :style="{background: config.primaryColor}">Ouvrir</div>
                                        </div>
                                    </div>
                                    <div style="margin-top:8px;height:8px;border-radius:20px;overflow:hidden;background:#e2e8f0">
                                        <div style="height:100%;width:68%;border-radius:20px;transition:.4s" :style="{background: config.primaryColor}"></div>
                                    </div>
                                    <div style="font-size:9px;color:#94a3b8;margin-top:4px;text-align:right">68 / 100 CBM</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ══ ONGLET IDENTITÉ ══ -->
                <div class="sd-section" :class="{active: tab==='identite'}">
                    <div class="sd-grid2">
                        <div class="sd-card">
                            <div class="sd-card__head"><span style="font-size:18px">🖼️</span><h3>Logo de l'agence</h3></div>
                            <div class="sd-card__body">
                                <div class="sd-logo-zone" @click="$refs.logoInput.click()">
                                    <div class="sd-logo-preview">
                                        <img v-if="config.logoBase64" :src="config.logoBase64">
                                        <span v-else style="font-size:32px">🏢</span>
                                    </div>
                                    <div style="font-size:13px;font-weight:600;color:#475569">Cliquez pour téléverser votre logo</div>
                                    <div style="font-size:11px;color:#94a3b8">PNG, JPG ou SVG — max 200 Ko recommandé</div>
                                </div>
                                <input type="file" ref="logoInput" accept="image/png,image/jpeg,image/svg+xml" style="display:none" @change="handleLogo">
                                <button v-if="config.logoBase64" @click="config.logoBase64=null" style="margin-top:10px;width:100%;padding:9px;border:1.5px solid #fecaca;border-radius:10px;background:#fef2f2;color:#dc2626;font-size:13px;font-weight:600;cursor:pointer;transition:.2s">
                                    🗑️ Supprimer le logo
                                </button>
                            </div>
                        </div>
                        
                        <div class="sd-card">
                            <div class="sd-card__head"><span style="font-size:18px">✏️</span><h3>Nom & Slogan</h3></div>
                            <div class="sd-card__body">
                                <div class="sd-field">
                                    <label class="sd-label">Nom affiché dans la sidebar</label>
                                    <input type="text" class="sd-input" v-model="config.agencyName" placeholder="Ex: AMT Paris">
                                </div>
                                <div class="sd-field">
                                    <label class="sd-label">Sous-titre / Slogan</label>
                                    <input type="text" class="sd-input" v-model="config.agencySlogan" placeholder="Ex: Agent Dashboard">
                                </div>
                                
                                <!-- Aperçu -->
                                <div style="margin-top:16px;padding:14px;border-radius:12px;display:flex;align-items:center;gap:12px" :style="{background: config.secondaryColor}">
                                    <div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                                        <img v-if="config.logoBase64" :src="config.logoBase64" style="max-width:100%;max-height:100%;object-fit:contain">
                                        <span v-else style="font-size:20px">🏢</span>
                                    </div>
                                    <div>
                                        <div style="font-weight:800;color:#fff;font-size:14px">{{ config.agencyName || '—' }}</div>
                                        <div style="font-size:11px;color:rgba(255,255,255,.65)">{{ config.agencySlogan || '—' }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ══ ONGLET TYPOGRAPHIE ══ -->
                <div class="sd-section" :class="{active: tab==='typo'}">
                    <div class="sd-grid2">
                        <div>
                            <div class="sd-card">
                                <div class="sd-card__head"><span style="font-size:18px">🔤</span><h3>Police principale</h3></div>
                                <div class="sd-card__body">
                                    <div class="sd-fonts-grid">
                                        <div v-for="font in fontsList" :key="font.value"
                                             class="sd-font-card"
                                             :class="{active: config.fontFamily === font.value}"
                                             @click="config.fontFamily = font.value"
                                             :style="{fontFamily: font.value}">
                                            <div class="sd-font-sample">Aa</div>
                                            <div class="sd-font-name">{{ font.label }}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <div class="sd-card">
                                <div class="sd-card__head"><span style="font-size:18px">📏</span><h3>Taille de base</h3></div>
                                <div class="sd-card__body">
                                    <div class="sd-field">
                                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                            <label class="sd-label">Taille actuelle</label>
                                            <strong style="font-size:22px;color:#6366f1" :style="{fontFamily: config.fontFamily}">{{ config.baseFontSize }}</strong>
                                        </div>
                                        <input type="range" class="sd-range" min="12" max="17" step="1" v-model="fontSizePx">
                                        <div class="sd-range-labels">
                                            <span>12px (mini)</span>
                                            <span>14px (normal)</span>
                                            <span>17px (large)</span>
                                        </div>
                                        <div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0" :style="{fontFamily: config.fontFamily, fontSize: config.baseFontSize}">
                                            <div style="font-weight:800;color:#0f172a;margin-bottom:4px">Titre de section</div>
                                            <div style="color:#334155;margin-bottom:4px">Corps du texte — Aperçu de votre police et taille.</div>
                                            <div style="color:#94a3b8;font-size:.85em">Sous-texte et métadonnées secondaires</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="sd-card">
                                <div class="sd-card__head"><span style="font-size:18px">🗜️</span><h3>Densité / Espacement</h3></div>
                                <div class="sd-card__body">
                                    <div class="sd-density-row">
                                        <button class="sd-density-btn" :class="{active: config.density==='compact'}" @click="config.density='compact'">
                                            📦 Compact<br><small style="font-weight:400;color:inherit;opacity:.7">Données denses</small>
                                        </button>
                                        <button class="sd-density-btn" :class="{active: config.density==='normal'}" @click="config.density='normal'">
                                            📄 Normal<br><small style="font-weight:400;color:inherit;opacity:.7">Équilibré</small>
                                        </button>
                                        <button class="sd-density-btn" :class="{active: config.density==='comfortable'}" @click="config.density='comfortable'">
                                            🪶 Aéré<br><small style="font-weight:400;color:inherit;opacity:.7">Facile à lire</small>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ══ ONGLET MENUS ══ -->
                <div class="sd-section" :class="{active: tab==='menus'}">
                    <div class="sd-card">
                        <div class="sd-card__head"><span style="font-size:18px">📋</span><h3>Menus visibles pour cette agence</h3></div>
                        <div class="sd-card__body">
                            <div style="padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:16px;font-size:13px;color:#92400e">
                                <strong>⚠️ Note :</strong> Ces paramètres définissent quels menus sont <em>physiquement disponibles</em> pour cette agence. Les permissions par rôle (agent/manager/etc.) sont configurées séparément dans "Gestion des menus".
                            </div>
                            <div class="sd-menus-actions">
                                <button class="sd-menus-action-btn" @click="selectAllMenus">✅ Tout activer</button>
                                <button class="sd-menus-action-btn" @click="deselectAllMenus">❌ Tout désactiver</button>
                                <span style="margin-left:auto;font-size:12px;color:#64748b;align-self:center">
                                    {{ config.visibleMenus.length }} / {{ allMenus.length }} menus actifs
                                </span>
                            </div>
                            <div class="sd-menus-grid">
                                <div v-for="menu in allMenus" :key="menu.key"
                                     class="sd-menu-item" :class="{on: config.visibleMenus.includes(menu.key)}"
                                     @click="toggleMenu(menu.key)">
                                    <span class="sd-menu-icon">{{ menu.icon }}</span>
                                    <span class="sd-menu-label">{{ menu.label }}</span>
                                    <div class="sd-toggle" :class="{on: config.visibleMenus.includes(menu.key)}"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ══ ONGLET APERÇU COMPLET ══ -->
                <div class="sd-section" :class="{active: tab==='apercu'}">
                    <div class="sd-card">
                        <div class="sd-card__head"><span style="font-size:18px">👁️</span><h3>Aperçu complet de l'interface</h3></div>
                        <div class="sd-card__body" style="padding:0;overflow:hidden;border-radius:0 0 18px 18px">
                            <div style="display:flex;height:500px;overflow:hidden">
                                <!-- Sidebar -->
                                <div style="width:220px;flex-shrink:0;padding:18px 14px;overflow-y:auto" :style="{background: config.secondaryColor, fontFamily: config.fontFamily}">
                                    <div class="sd-preview-logo-area">
                                        <div style="width:36px;height:36px;border-radius:9px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                                            <img v-if="config.logoBase64" :src="config.logoBase64" style="max-width:100%;max-height:100%;object-fit:contain">
                                            <span v-else style="font-size:18px">🏢</span>
                                        </div>
                                        <div>
                                            <div class="sd-preview-agency-name" style="font-size:13px">{{ config.agencyName }}</div>
                                            <div class="sd-preview-agency-sub" style="font-size:10px">{{ config.agencySlogan }}</div>
                                        </div>
                                    </div>
                                    <div v-for="menu in previewMenuList" :key="menu.key" class="sd-preview-menu-item" :class="{active: menu.key==='main'}">
                                        <span style="font-size:15px">{{ menu.icon }}</span>
                                        <span style="font-size:12px">{{ menu.label }}</span>
                                    </div>
                                </div>
                                <!-- Main -->
                                <div style="flex:1;display:flex;flex-direction:column;overflow:hidden" :style="{background: config.bgColor, fontFamily: config.fontFamily}">
                                    <!-- Topbar -->
                                    <div style="height:52px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0">
                                        <div style="font-weight:700;color:#0f172a;font-size:15px" :style="{fontFamily: config.fontFamily, fontSize: config.baseFontSize}">Tableau de bord</div>
                                        <div style="flex:1"></div>
                                        <div style="padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;color:#fff" :style="{background: config.primaryColor}">+ Nouvelle facture</div>
                                        <div style="width:34px;height:34px;border-radius:50%;flex-shrink:0" :style="{background: config.primaryColor}"></div>
                                    </div>
                                    <!-- Content -->
                                    <div style="flex:1;padding:18px;overflow-y:auto">
                                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px">
                                            <div v-for="card in previewCards" :key="card.label" style="background:#fff;border-radius:14px;padding:16px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.04)">
                                                <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:8px" :style="{fontFamily: config.fontFamily}">{{ card.label }}</div>
                                                <div style="font-size:22px;font-weight:800;color:#0f172a" :style="{color: config.primaryColor, fontFamily: config.fontFamily, fontSize: config.baseFontSize === '13px' ? '20px' : config.baseFontSize === '16px' ? '26px' : '22px'}">{{ card.value }}</div>
                                                <div style="margin-top:10px;height:6px;border-radius:3px;background:#f1f5f9">
                                                    <div style="height:100%;border-radius:3px;transition:.4s" :style="{width: card.pct, background: config.primaryColor}"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #e2e8f0">
                                            <div style="font-weight:700;color:#0f172a;margin-bottom:12px;font-size:13px" :style="{fontFamily: config.fontFamily}">Dernières factures</div>
                                            <div v-for="row in previewRows" :key="row.ref" style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9">
                                                <div style="font-family:monospace;font-size:12px;font-weight:700;color:#0f172a;min-width:110px">{{ row.ref }}</div>
                                                <div style="flex:1;font-size:12px;color:#334155" :style="{fontFamily: config.fontFamily}">{{ row.name }}</div>
                                                <div style="font-weight:800;font-size:13px" :style="{color: config.primaryColor}">{{ row.amount }}</div>
                                                <div style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700" :style="{background: config.accentColor+'22', color: config.accentColor}">{{ row.status }}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- FOOTER -->
                <div class="sd-footer">
                    <button class="sd-btn-reset" @click="resetToDefault">↺ Réinitialiser</button>
                    <button class="sd-btn-save" @click="saveDesign" :disabled="saving">
                        <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                        <span v-else>💾 Enregistrer l'apparence</span>
                    </button>
                </div>

                <!-- ══ MODAL DÉGRADÉ ══ -->
                <div class="sd-grad-modal" :class="{open: showGrad}">
                    <div class="sd-grad-box">
                        <div class="sd-grad-head">
                            <h3>🪄 Générateur de dégradé</h3>
                            <button class="sd-grad-close" @click="showGrad=false">&times;</button>
                        </div>
                        <div class="sd-grad-body">
                            <div class="sd-grad-preview" :style="{background: computedGrad}"></div>
                            
                            <div class="sd-field">
                                <label class="sd-label">Couleur de départ</label>
                                <div class="sd-grad-row">
                                    <input type="color" class="sd-grad-color-pick" v-model="gradForm.c1">
                                    <input type="text" class="sd-input" style="flex:1" v-model="gradForm.c1">
                                </div>
                            </div>
                            <div class="sd-field">
                                <label class="sd-label">Couleur de fin</label>
                                <div class="sd-grad-row">
                                    <input type="color" class="sd-grad-color-pick" v-model="gradForm.c2">
                                    <input type="text" class="sd-input" style="flex:1" v-model="gradForm.c2">
                                </div>
                            </div>
                            <div class="sd-field">
                                <label class="sd-label" style="display:flex;justify-content:space-between"><span>Angle</span><strong>{{ gradForm.angle }}°</strong></label>
                                <input type="range" class="sd-range" min="0" max="360" v-model="gradForm.angle">
                            </div>
                            <div class="sd-field">
                                <label class="sd-label" style="display:flex;justify-content:space-between"><span>Point de fusion</span><strong>{{ gradForm.pos }}%</strong></label>
                                <input type="range" class="sd-range" min="0" max="100" v-model="gradForm.pos">
                            </div>
                            
                            <button class="sd-apply-grad" @click="applyGrad">✅ Appliquer ce dégradé</button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        this.initVue(globalApp);
    },

    initVue(globalApp) {
        if (this.vueApp) { try { this.vueApp.unmount(); } catch(e) {} }

        this.vueApp = createApp({
            setup() {
                // ── STATE ──────────────────────────────────────────────────
                const tab           = ref('couleurs');
                const saving        = ref(false);
                const showGrad      = ref(false);
                const gradTarget    = ref('bgColor');
                const currentAgency = ref(sessionStorage.getItem('currentActiveAgency') || 'paris');
                const agenciesList  = ref(Object.values(AGENCIES));

                const logoInput = ref(null);

                const config = reactive({ ...DEFAULT_CONFIG('paris') });

                const pickerBg        = ref('#eff6ff');
                const pickerPrimary   = ref('#1d4ed8');
                const pickerSecondary = ref('#0a2558');
                const fontSizePx      = ref(14);

                const gradForm = reactive({ c1: '#6366f1', c2: '#8b5cf6', angle: 135, pos: 50 });

                // ── COMPUTED ───────────────────────────────────────────────
                const computedGrad = computed(() =>
                    `linear-gradient(${gradForm.angle}deg, ${gradForm.c1} 0%, ${gradForm.pos}%, ${gradForm.c2} 100%)`
                );

                const presets      = ref(PRESET_THEMES);
                const allMenus     = ref(ALL_MENUS);
                const fontsList    = ref(FONTS);

                const previewMenuItems = computed(() => [
                    { icon:'🏠', label:'Accueil',   active: true  },
                    { icon:'🧾', label:'Factures',  active: false },
                    { icon:'👥', label:'Clients',   active: false },
                    { icon:'💰', label:'Finance',   active: false },
                ]);

                const previewMenuList = computed(() =>
                    ALL_MENUS.filter(m => config.visibleMenus.includes(m.key)).slice(0, 12)
                );

                const previewCards = ref([
                    { label: "Chiffre d'affaires", value: "24 500 €", pct: "72%" },
                    { label: "Colis en transit",   value: "143",       pct: "55%" },
                    { label: "Clients actifs",      value: "68",        pct: "40%" },
                ]);

                const previewRows = ref([
                    { ref: 'KA-001-E14', name: 'Jean Kouamé',    amount: '120 000 F', status: 'En attente' },
                    { ref: 'KA-002-E14', name: 'Marie Diallo',   amount: '85 000 F',  status: 'Livré'      },
                    { ref: 'KA-003-E14', name: 'Koffi Assouma',  amount: '200 000 F', status: 'En attente' },
                ]);

                // ── HELPERS ────────────────────────────────────────────────
                const getDocRef = () => doc(db, "settings", `design_${currentAgency.value}`);

                const extractHex = (v) => {
                    if (!v) return '#1d4ed8';
                    const m = v.match(/#[0-9a-fA-F]{6}/);
                    return m ? m[0] : '#1d4ed8';
                };

                const injectFont = (fontFamily) => {
                    const name = fontFamily.split(',')[0].replace(/'/g,'').trim();
                    const safe = ['Inter','Arial','Roboto','Helvetica'];
                    if (safe.includes(name)) return;
                    const id   = `sd-font-${name.replace(/\s/g,'_')}`;
                    if (document.getElementById(id)) return;
                    const link = document.createElement('link');
                    link.id   = id;
                    link.rel  = 'stylesheet';
                    link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/\s+/g,'+')}:wght@300;400;500;600;700;800&display=swap`;
                    document.head.appendChild(link);
                };

                // ── LIVE PREVIEW ───────────────────────────────────────────
                const applyLivePreview = () => {
                    injectFont(config.fontFamily);
                    const densityMap = { compact:'0.7rem', normal:'1rem', comfortable:'1.4rem' };
                    const spacing = densityMap[config.density] || '1rem';

                    let el = document.getElementById('_sd_live_preview');
                    if (!el) { el = document.createElement('style'); el.id = '_sd_live_preview'; document.head.appendChild(el); }

                    el.textContent = `
                        :root {
                            --primary:         ${config.primaryColor};
                            --primary-hover:   ${config.primaryColor};
                            --secondary:       ${config.secondaryColor};
                            --bg-body:         ${config.bgColor};
                            --bg-gradient:     ${config.bgColor};
                            --accent-color:    ${config.accentColor};
                            --sd-spacing:      ${spacing};
                        }
                        body {
                            background: ${config.bgColor} !important;
                            font-family: ${config.fontFamily} !important;
                            font-size: ${config.baseFontSize} !important;
                        }
                        .sidebar { background: ${config.secondaryColor} !important; }
                        .top-bar { background: #fff !important; }
                        .btn-primary, .btn.btn-primary { background: ${config.primaryColor} !important; border-color: ${config.primaryColor} !important; }
                        .sidebar-item.active { background: rgba(255,255,255,0.15) !important; font-weight: 700 !important; backdrop-filter: blur(10px) !important; -webkit-backdrop-filter: blur(10px) !important; border-left: 5px solid var(--primary) !important; border-radius: 4px 20px 20px 4px !important; box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important; }
                        .stat-icon { background: ${config.primaryColor} !important; color: white !important; }
                        .badge-primary { background: ${config.primaryColor} !important; }
                        .form-card, .data-table-wrap, .stat-card { padding: ${spacing} !important; }
                        h1, h2, h3, .page-title { font-family: ${config.fontFamily} !important; }
                        input[type="range"] { accent-color: ${config.primaryColor}; }
                    `;

                    // Mise à jour logo et nom sidebar en live
                    const sidebarLogo = document.querySelector('.sidebar-logo img');
                    const sidebarName = document.querySelector('.sidebar-header h2');
                    const sidebarSub  = document.querySelector('.sidebar-header p');
                    if (sidebarLogo && config.logoBase64) sidebarLogo.src = config.logoBase64;
                    if (sidebarName) sidebarName.textContent = config.agencyName || '';
                    if (sidebarSub)  sidebarSub.textContent  = config.agencySlogan || '';
                };

                // ── LOAD / SAVE ────────────────────────────────────────────
                const loadData = async () => {
                    try {
                        const snap = await getDoc(getDocRef());
                        const def  = DEFAULT_CONFIG(currentAgency.value);
                        if (snap.exists()) {
                            Object.assign(config, def, snap.data());
                        } else {
                            Object.assign(config, def);
                        }

                        // Récupération synchronisée des menus visibles depuis la vraie configuration des menus
                        const menusSnap = await getDoc(doc(db, "settings", `menus_${currentAgency.value}`));
                        if (menusSnap.exists() && menusSnap.data().visibleMenus) {
                            config.visibleMenus = menusSnap.data().visibleMenus;
                        }
                        pickerBg.value        = extractHex(config.bgColor);
                        pickerPrimary.value   = extractHex(config.primaryColor);
                        pickerSecondary.value = extractHex(config.secondaryColor);
                        fontSizePx.value      = parseInt(config.baseFontSize) || 14;
                        applyLivePreview();
                    } catch(e) { console.error('load design:', e); }
                };

                const saveDesign = async () => {
                    saving.value = true;
                    try {
                        await setDoc(getDocRef(), { ...config, updatedAt: new Date().toISOString() }, { merge: true });
                        
                        // Sauvegarde également des menus visibles dans la configuration de routage globale
                        const menuDocRef = doc(db, "settings", `menus_${currentAgency.value}`);
                        await setDoc(menuDocRef, { visibleMenus: Array.from(config.visibleMenus) }, { merge: true });
                        
                        // Vider le cache pour forcer l'application du nouveau design au prochain rechargement
                        sessionStorage.removeItem(`branding_${currentAgency.value}`);
                        
                        globalApp.showToast('✅ Configuration enregistrée !', 'success');
                        
                        if (currentAgency.value === (sessionStorage.getItem('currentActiveAgency') || 'paris')) {
                            setTimeout(() => { window.location.reload(); }, 1500);
                        }
                    } catch(e) {
                        console.error(e);
                        globalApp.showToast('Erreur lors de l\'enregistrement', 'error');
                    } finally { saving.value = false; }
                };

                const resetToDefault = () => {
                    const def = DEFAULT_CONFIG(currentAgency.value);
                    Object.assign(config, def);
                    pickerBg.value        = '#eff6ff';
                    pickerPrimary.value   = '#1d4ed8';
                    pickerSecondary.value = '#0a2558';
                    fontSizePx.value      = 14;
                    globalApp.showToast('Réinitialisé (non sauvegardé)', 'info');
                };

                // ── PRESETS ────────────────────────────────────────────────
                const applyPreset = (preset) => {
                    config.bgColor        = preset.bg;
                    config.primaryColor   = preset.primary;
                    config.secondaryColor = preset.secondary;
                    pickerBg.value        = extractHex(preset.bg);
                    pickerPrimary.value   = extractHex(preset.primary);
                    pickerSecondary.value = extractHex(preset.secondary);
                };

                // ── GRADIENT BUILDER ───────────────────────────────────────
                const openGrad = (target) => {
                    gradTarget.value = target;
                    const val = config[target] || '';
                    const hexes = val.match(/#[0-9a-fA-F]{6}/g);
                    if (hexes && hexes.length >= 2) { gradForm.c1 = hexes[0]; gradForm.c2 = hexes[1]; }
                    const ang = val.match(/(\d+)deg/);
                    if (ang) gradForm.angle = parseInt(ang[1]);
                    showGrad.value = true;
                };

                const applyGrad = () => {
                    config[gradTarget.value] = computedGrad.value;
                    if (gradTarget.value === 'bgColor')        pickerBg.value        = gradForm.c1;
                    if (gradTarget.value === 'primaryColor')   pickerPrimary.value   = gradForm.c1;
                    if (gradTarget.value === 'secondaryColor') pickerSecondary.value = gradForm.c1;
                    showGrad.value = false;
                };

                // ── LOGO ───────────────────────────────────────────────────
                const handleLogo = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 500 * 1024) { globalApp.showToast('Logo trop lourd (max 500 Ko)', 'error'); return; }
                    const reader = new FileReader();
                    reader.onload = (ev) => { config.logoBase64 = ev.target.result; };
                    reader.readAsDataURL(file);
                };

                // ── MENUS ──────────────────────────────────────────────────
                const toggleMenu = (key) => {
                    const idx = config.visibleMenus.indexOf(key);
                    if (idx > -1) config.visibleMenus.splice(idx, 1);
                    else config.visibleMenus.push(key);
                };
                const selectAllMenus   = () => { config.visibleMenus = ALL_MENUS.map(m => m.key); };
                const deselectAllMenus = () => { config.visibleMenus = []; };

                // ── WATCHERS ───────────────────────────────────────────────
                watch(pickerBg,        (v) => { if (!config.bgColor.includes('gradient'))        config.bgColor        = v; });
                watch(pickerPrimary,   (v) => { if (!config.primaryColor.includes('gradient'))   config.primaryColor   = v; });
                watch(pickerSecondary, (v) => { if (!config.secondaryColor.includes('gradient')) config.secondaryColor = v; });
                watch(fontSizePx,      (v) => { config.baseFontSize = v + 'px'; });
                watch(config, () => applyLivePreview(), { deep: true });

                // ── LOAD D'ABORD ───────────────────────────────────────────
                onMounted(() => {
                    // Charge agences depuis Firestore si disponible
                    try {
                        onSnapshot(collection(db, 'agencies_config'), (snap) => {
                            if (!snap.empty) {
                                const fetched = {};
                                snap.docs.forEach(d => fetched[d.id] = { id: d.id, ...d.data() });
                                const merged = { ...AGENCIES, ...fetched };
                                agenciesList.value = Object.values(merged);
                            }
                        });
                    } catch(e) { /* pas critique */ }
                    loadData();
                });

                return {
                    tab, saving, showGrad, gradTarget, currentAgency, agenciesList,
                    logoInput, config, pickerBg, pickerPrimary, pickerSecondary, fontSizePx,
                    gradForm, computedGrad, presets, allMenus, fontsList,
                    previewMenuItems, previewMenuList, previewCards, previewRows,
                    loadData, saveDesign, resetToDefault, applyPreset,
                    openGrad, applyGrad, handleLogo, toggleMenu, selectAllMenus, deselectAllMenus,
                };
            }
        });

        this.vueApp.mount('#vue-sd-app');
    }
};