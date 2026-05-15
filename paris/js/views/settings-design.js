import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, watch, onMounted, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { AGENCIES } from '../../../agencies-config.js';

export const SettingsDesignView = {
    vueApp: null,

    render(app, container) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsDesign = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .design-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .design-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .design-header h1 { margin: 0; font-size: 22px; font-weight: 800; }
                .design-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 24px; }
                .design-card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
                .design-card__header { padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 12px; }
                .design-card__header i { font-size: 22px; color: #3b82f6; }
                .design-card__header h3 { margin: 0; font-size: 16px; font-weight: 700; }
                .design-card__body { padding: 20px; display: flex; flex-direction: column; gap: 18px; }
                .design-field { display: flex; flex-direction: column; gap: 6px; }
                .design-label { font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
                .design-input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 13px; transition: 0.2s; }
                .design-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .design-color-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
                .design-color-preview { width: 50px; height: 40px; border-radius: 8px; border: 1px solid #cbd5e1; cursor: pointer; }
                .design-actions { margin-top: 30px; display: flex; justify-content: flex-end; gap: 12px; padding: 20px 0; }
                .btn-save-design { background: #3b82f6; color: white; border: none; padding: 12px 28px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: 0.2s; }
                .btn-save-design:hover { background: #2563eb; transform: translateY(-1px); }
                .btn-reset-design { background: white; border: 1px solid #cbd5e1; padding: 12px 28px; border-radius: 12px; font-weight: 600; cursor: pointer; }
                .live-preview-badge { background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 8px 16px; border-radius: 20px; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; }
                .font-select { font-family: inherit; }
                .density-option { display: flex; gap: 12px; align-items: center; }
                .density-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer; font-size: 12px; transition: 0.2s; }
                .density-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; }
                
                /* Modal Générateur de dégradé */
                .sd-modal { display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 1000; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
                .sd-modal.active { display: flex; animation: fadeIn 0.2s; }
                .sd-modal-content { background: white; width: 90%; max-width: 450px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .sd-modal-header { padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
                .btn-magic { background: #f8fafc; border: 1px solid #cbd5e1; color: #475569; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; transition: 0.2s; }
                .btn-magic:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
            </style>

            <div id="vue-settings-design-app" class="design-page" v-cloak>
                <div class="design-header">
                    <div>
                        <h1><i class="fas fa-palette"></i> Apparence & menus</h1>
                        <p style="margin: 6px 0 0; color: #64748b; display: flex; align-items: center;">
                            Configuration visuelle pour l'agence : 
                            <select v-model="currentAgency" @change="loadData" style="margin-left: 10px; padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a; background: white; cursor: pointer;">
                                <option v-for="a in agenciesList" :key="a.id" :value="a.id">{{ a.name }} {{ a.flag }}</option>
                            </select>
                        </p>
                    </div>
                    <div class="live-preview-badge" title="L'aperçu en direct s'applique automatiquement ci-dessous">
                        <i class="fas fa-eye"></i> Aperçu actif : <strong>{{ fontNameDisplay }}</strong> | <strong>{{ config.baseFontSize }}</strong> | <strong>{{ config.density }}</strong>
                    </div>
                </div>

                <div class="design-grid">
                    <!-- CARTE COULEURS -->
                    <div class="design-card">
                        <div class="design-card__header">
                            <i class="fas fa-fill-drip"></i>
                            <h3>Couleurs de l'agence</h3>
                        </div>
                        <div class="design-card__body">
                            <div class="design-field">
                                <label class="design-label">Fond principal</label>
                                <div class="design-color-row">
                                    <input type="color" v-model="pickerBg" class="design-input" style="width: 60px; height: 40px;">
                                    <input type="text" v-model="config.bgColor" class="design-input" placeholder="linear-gradient(...)">
                                    <button type="button" class="btn-magic" @click="openGradientBuilder('bgColor')">🪄 Créer un dégradé</button>
                                    <small style="color:#64748b">Couleur ou dégradé CSS</small>
                                </div>
                            </div>
                            <div class="design-field">
                                <label class="design-label">Couleur principale (boutons, liens)</label>
                                <div class="design-color-row">
                                    <input type="color" v-model="pickerPrimary" class="design-input" style="width: 60px; height: 40px;">
                                    <input type="text" v-model="config.primaryColor" class="design-input" placeholder="linear-gradient(...) ou #1d4ed8">
                                    <button type="button" class="btn-magic" @click="openGradientBuilder('primaryColor')">🪄 Créer un dégradé</button>
                                    <small style="color:#64748b">Couleur ou dégradé CSS</small>
                                </div>
                            </div>
                            <div class="design-field">
                                <label class="design-label">Couleur secondaire (sidebar)</label>
                                <div class="design-color-row">
                                    <input type="color" v-model="pickerSecondary" class="design-input" style="width: 60px; height: 40px;">
                                    <input type="text" v-model="config.secondaryColor" class="design-input" placeholder="linear-gradient(...) ou #0a2558">
                                    <button type="button" class="btn-magic" @click="openGradientBuilder('secondaryColor')">🪄 Créer un dégradé</button>
                                    <small style="color:#64748b">Couleur ou dégradé CSS</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- CARTE LOGO & IDENTITÉ -->
                    <div class="design-card">
                        <div class="design-card__header">
                            <i class="fas fa-building"></i>
                            <h3>Logo & identité</h3>
                        </div>
                        <div class="design-card__body">
                            <div class="design-field">
                                <label class="design-label">Logo (image)</label>
                                <input type="file" ref="logoUpload" accept="image/png,image/jpeg,image/svg+xml" style="margin-bottom: 8px;" @change="handleLogoUpload">
                                <div style="width: 80px; height: 80px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-top: 8px;">
                                    <img v-if="config.logoBase64" :src="config.logoBase64" style="max-width: 100%; max-height: 100%;">
                                    <span v-else style="font-size: 32px;">🏢</span>
                                </div>
                                <button type="button" @click="clearLogo" class="design-input" style="margin-top: 8px; background: #fee2e2; color: #991b1b; border-color: #fecaca;">🗑️ Supprimer le logo</button>
                            </div>
                            <div class="design-field">
                                <label class="design-label">Nom affiché dans la sidebar</label>
                                <input type="text" v-model="config.agencyName" class="design-input" placeholder="AMT Paris">
                            </div>
                            <div class="design-field">
                                <label class="design-label">Sous-titre / slogan</label>
                                <input type="text" v-model="config.agencySlogan" class="design-input" placeholder="Agent Dashboard">
                            </div>
                        </div>
                    </div>

                    <!-- CARTE POLICES -->
                    <div class="design-card">
                        <div class="design-card__header">
                            <i class="fas fa-font"></i>
                            <h3>Polices & tailles</h3>
                        </div>
                        <div class="design-card__body">
                            <div class="design-field">
                                <label class="design-label">Police principale</label>
                                <select v-model="config.fontFamily" class="design-input font-select">
                                    <option value="'Inter', sans-serif">Inter (défaut)</option>
                                    <option value="'Poppins', sans-serif">Poppins</option>
                                    <option value="'Roboto', sans-serif">Roboto</option>
                                    <option value="'Montserrat', sans-serif">Montserrat</option>
                                    <option value="'Open Sans', sans-serif">Open Sans</option>
                                </select>
                            </div>
                            <div class="design-field">
                                <label class="design-label">Taille de base</label>
                                <select v-model="config.baseFontSize" class="design-input">
                                    <option value="13px">13px (compact)</option>
                                    <option value="14px" selected>14px (normal)</option>
                                    <option value="15px">15px (confortable)</option>
                                    <option value="16px">16px (large)</option>
                                </select>
                            </div>
                            <div class="design-field">
                                <label class="design-label">Densité des cartes / espacements</label>
                                <div class="density-option">
                                    <button type="button" class="density-btn" :class="{active: config.density === 'compact'}" @click="config.density = 'compact'">📦 Compact</button>
                                    <button type="button" class="density-btn" :class="{active: config.density === 'normal'}" @click="config.density = 'normal'">📄 Normal</button>
                                    <button type="button" class="density-btn" :class="{active: config.density === 'comfortable'}" @click="config.density = 'comfortable'">🪶 Confortable</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="design-actions">
                    <button class="btn-reset-design" @click="resetToDefault">↺ Réinitialiser</button>
                    <button class="btn-save-design" @click="saveDesign" :disabled="saving">
                        <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                        <span v-else>💾 Enregistrer l'apparence</span>
                    </button>
                </div>

                <!-- Modal Générateur de dégradé -->
                <div class="sd-modal" :class="{ 'active': showGradientModal }">
                    <div class="sd-modal-content">
                        <div class="sd-modal-header">
                            <h3 style="margin:0; font-size:16px; color:#0f172a;">🪄 Générateur de dégradé</h3>
                            <button @click="showGradientModal = false" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                        </div>
                        <div style="padding: 20px;">
                            <div style="height: 120px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);" :style="{ background: generatedGradient }"></div>
                            <div class="design-field" style="margin-bottom: 15px;">
                                <label class="design-label">Couleur 1 (Début)</label>
                                <div style="display: flex; gap: 10px;">
                                    <input type="color" v-model="gradientForm.color1" style="width: 50px; height: 40px; border: 1px solid #cbd5e1; border-radius: 8px; cursor:pointer;">
                                    <input type="text" v-model="gradientForm.color1" class="design-input" style="flex:1;">
                                </div>
                            </div>
                            <div class="design-field" style="margin-bottom: 15px;">
                                <label class="design-label">Couleur 2 (Fin)</label>
                                <div style="display: flex; gap: 10px;">
                                    <input type="color" v-model="gradientForm.color2" style="width: 50px; height: 40px; border: 1px solid #cbd5e1; border-radius: 8px; cursor:pointer;">
                                    <input type="text" v-model="gradientForm.color2" class="design-input" style="flex:1;">
                                </div>
                            </div>
                            <div class="design-field" style="margin-bottom: 20px;">
                                <label class="design-label" style="display:flex; justify-content:space-between;"><span>Angle</span> <span>{{ gradientForm.angle }}°</span></label>
                                <input type="range" v-model="gradientForm.angle" min="0" max="360" style="width: 100%; accent-color: #3b82f6; cursor:pointer;">
                            </div>
                            <div class="design-field" style="margin-bottom: 20px;">
                                <label class="design-label" style="display:flex; justify-content:space-between;"><span>Répartition (Fusion)</span> <span>{{ gradientForm.position }}%</span></label>
                                <input type="range" v-model="gradientForm.position" min="0" max="100" style="width: 100%; accent-color: #10b981; cursor:pointer;">
                            </div>
                            <button class="btn-save-design" @click="applyGradient" style="width:100%; padding: 12px; font-size: 14px;">✅ Appliquer et visualiser</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const targetContainer = container || document.getElementById('contentContainer');
        targetContainer.innerHTML = html;
        this.initVue(globalApp);
    },

    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                    const agenciesList = Object.values(AGENCIES || {});
                    const currentAgency = ref(sessionStorage.getItem('currentActiveAgency') || 'paris');
                    const getDocRef = () => doc(db, "settings", `design_${currentAgency.value}`);
                const saving = ref(false);
                const logoUpload = ref(null);
                
                // Variables pour le générateur de dégradé
                const showGradientModal = ref(false);
                const gradientTarget = ref(null);
                const gradientForm = reactive({ color1: '#1d4ed8', color2: '#1e3a8a', angle: 135, position: 50 });
                const generatedGradient = computed(() => {
                    return `linear-gradient(${gradientForm.angle}deg, ${gradientForm.color1} 0%, ${gradientForm.position}%, ${gradientForm.color2} 100%)`;
                });

                const getDefaultConfig = () => ({
                    bgColor: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 75%, #fee2e2 100%)',
                    primaryColor: 'linear-gradient(135deg, #1d4ed8, #1e3a8a)',
                    secondaryColor: 'linear-gradient(180deg, #0a2558 0%, #1e3a8a 80%, #991b1b 100%)',
                    agencyName: 'AMT Paris',
                    agencySlogan: 'Agent Dashboard',
                    fontFamily: "'Inter', sans-serif",
                    baseFontSize: '14px',
                    density: 'normal',
                        logoBase64: null
                });

                const config = reactive(getDefaultConfig());

                const pickerBg = ref('#eff6ff');
                const pickerPrimary = ref('#1d4ed8');
                const pickerSecondary = ref('#1e3a8a');

                const fontNameDisplay = computed(() => {
                    return config.fontFamily ? config.fontFamily.split(',')[0].replace(/'/g, '').trim() : 'Inter';
                });

                const extractHex = (colorStr) => {
                    if (colorStr && colorStr.startsWith('#')) return colorStr;
                    return '#1d4ed8';
                };
                
                const openGradientBuilder = (target) => {
                    gradientTarget.value = target;
                    const currentVal = config[target];
                    // Si c'est déjà un dégradé, on extrait les couleurs actuelles pour pré-remplir
                    if (currentVal && currentVal.includes('linear-gradient')) {
                        const colors = currentVal.match(/#[0-9a-fA-F]{3,6}/g);
                        const angleMatch = currentVal.match(/(\d+)deg/);
                        const posMatch = currentVal.match(/0%,\s*(\d+)%,\s*#/);
                        
                        if (colors && colors.length >= 2) {
                            gradientForm.color1 = colors[0];
                            gradientForm.color2 = colors[1];
                        }
                        if (angleMatch) gradientForm.angle = parseInt(angleMatch[1]);
                        if (posMatch) gradientForm.position = parseInt(posMatch[1]);
                        else gradientForm.position = 50;
                    } else if (currentVal && currentVal.startsWith('#')) {
                        gradientForm.color1 = currentVal;
                        gradientForm.color2 = currentVal;
                        gradientForm.position = 50;
                    }
                    else gradientForm.position = 50;
                    showGradientModal.value = true;
                };

                const applyGradient = () => {
                    config[gradientTarget.value] = generatedGradient.value;
                    // Synchronisation du petit carré de couleur unie avec la 1ère couleur du dégradé
                    if (gradientTarget.value === 'bgColor') pickerBg.value = gradientForm.color1;
                    else if (gradientTarget.value === 'primaryColor') pickerPrimary.value = gradientForm.color1;
                    else if (gradientTarget.value === 'secondaryColor') pickerSecondary.value = gradientForm.color1;
                    showGradientModal.value = false;
                };

                watch(pickerBg, (val) => config.bgColor = val);
                watch(pickerPrimary, (val) => config.primaryColor = val);
                watch(pickerSecondary, (val) => config.secondaryColor = val);

                watch(() => config.bgColor, (val) => { if (val && val.startsWith('#')) pickerBg.value = val; });
                watch(() => config.primaryColor, (val) => { if (val && val.startsWith('#')) pickerPrimary.value = val; });
                watch(() => config.secondaryColor, (val) => { if (val && val.startsWith('#')) pickerSecondary.value = val; });

                const loadData = async () => {
                    try {
                        const docSnap = await getDoc(getDocRef());
                        const defaults = getDefaultConfig();
                        
                        if (docSnap.exists()) {
                            Object.assign(config, defaults, docSnap.data());
                        } else {
                            Object.assign(config, defaults);
                        }

                        pickerBg.value = extractHex(config.bgColor) || '#eff6ff';
                        pickerPrimary.value = extractHex(config.primaryColor) || '#1d4ed8';
                        pickerSecondary.value = extractHex(config.secondaryColor) || '#1e3a8a';
                    } catch (e) {
                        console.error("Erreur chargement design:", e);
                    }
                };

                onMounted(() => {
                    loadData();
                });

                const handleLogoUpload = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            config.logoBase64 = ev.target.result;
                        };
                        reader.readAsDataURL(file);
                    }
                };

                const clearLogo = () => {
                    config.logoBase64 = null;
                    if (logoUpload.value) logoUpload.value.value = '';
                };

                const applyLivePreview = () => {
                    let densityCss = '';
                    if (config.density === 'compact') densityCss = '--spacing: 0.75rem;';
                    else if (config.density === 'comfortable') densityCss = '--spacing: 1.5rem;';
                    else densityCss = '--spacing: 1rem;';

                    const style = document.createElement('style');
                    style.id = 'live-design-preview';
                    const old = document.getElementById('live-design-preview');
                    if (old) old.remove();

                    const fontName = config.fontFamily ? config.fontFamily.split(',')[0].replace(/'/g, '').trim() : 'Inter';
                    let fontImport = '';
                    if (fontName !== 'Inter') {
                        fontImport = `@import url('https://fonts.googleapis.com/css2?family=${fontName.replace(/\\s+/g, '+')}:wght@300;400;500;600;700;800&display=swap');`;
                    }

                    style.textContent = `
                        ${fontImport}
                        :root {
                            --bg-body: ${config.bgColor};
                            --primary: ${config.primaryColor};
                            --secondary: ${config.secondaryColor};
                            font-family: ${config.fontFamily};
                            font-size: ${config.baseFontSize};
                            ${densityCss}
                        }
                        body { background: var(--bg-body) !important; font-family: ${config.fontFamily} !important; font-size: ${config.baseFontSize} !important; }
                        .sidebar { background: var(--secondary) !important; }
                        .btn-primary, .btn-primary:hover { background: var(--primary) !important; border-color: var(--primary) !important; }
                        .stat-card .stat-icon { background: var(--primary) !important; color: white !important; }
                    `;
                    document.head.appendChild(style);
                };

                watch(config, () => {
                    applyLivePreview();
                }, { deep: true, immediate: true });

                const saveDesign = async () => {
                    saving.value = true;
                    const payload = {
                            ...config,
                            updatedAt: new Date().toISOString()
                    };

                    try {
                            await setDoc(getDocRef(), payload, { merge: true });
                        globalApp.showToast("✅ Design enregistré. Rechargez la page pour voir les changements complets.", "success");
                    } catch (e) {
                        console.error(e);
                        globalApp.showToast("Erreur lors de l'enregistrement", "error");
                    } finally {
                        saving.value = false;
                    }
                };

                const resetToDefault = () => {
                    Object.assign(config, getDefaultConfig());
                    pickerBg.value = '#eff6ff';
                    pickerPrimary.value = '#1d4ed8';
                    pickerSecondary.value = '#1e3a8a';
                    if (logoUpload.value) logoUpload.value.value = '';
                    globalApp.showToast("Paramètres réinitialisés (non sauvegardés)", "info");
                };

                return {
                        agenciesList, currentAgency, config, saving, logoUpload,
                    pickerBg, pickerPrimary, pickerSecondary, fontNameDisplay,
                    showGradientModal, gradientForm, generatedGradient,
                    openGradientBuilder, applyGradient,
                        handleLogoUpload, clearLogo, saveDesign, resetToDefault
                };
            }
        });

        this.vueApp.mount('#vue-settings-design-app');
    }
};