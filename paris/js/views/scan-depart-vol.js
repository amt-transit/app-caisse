// scan-depart-vol.js — Scan INVERSÉ aérien (« Départ vol »).
// On scanne les colis qui RESTENT en entrepôt ; à la validation, le système
// marque « en vol » (statut À venir / A_VENIR) tous ceux qui ne sont plus là.
import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs, doc, arrayUnion, writeBatch, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';

export const ScanDepartVolView = {
    vueApp: null,
    scannerActive: false,
    nativeVideoStream: null,
    html5QrCode: null,
    barcodeDetector: null,
    scanAnimationFrame: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.scanDepartVol = this;

        // Page réservée au mode AÉRIEN (les collections sont routées en _aerien).
        const _mode = sessionStorage.getItem('shippingMode') || 'maritime';
        if (_mode !== 'aerien') {
            document.getElementById('contentContainer').innerHTML = '<div style="max-width:640px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:30px;text-align:center;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);"><div style="font-size:42px;">✈️</div><h2 style="color:#0f172a;margin:10px 0 6px;">Départ vol</h2><p style="color:#64748b;">Cette page fonctionne en <b>mode Aérien</b>. Activez le mode Aérien (bouton en haut) puis revenez ici.</p></div>';
            return;
        }

        const html = `
            <style>
                .sw-page { max-width: 800px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                
                /* Header & KPIs */
                .sm__header { border-radius: 16px; padding: 20px; margin-bottom: 20px; color: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); background: linear-gradient(135deg, rgb(245, 158, 11) 0%, rgb(217, 119, 6) 100%); }
                .sm__header-inner { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .sm__header-info { display: flex; align-items: center; gap: 15px; }
                .sm__header-icon { font-size: 28px; background: rgba(255,255,255,0.2); width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .sm__header-title { margin: 0; font-size: 20px; font-weight: 800; }
                .sm__header-desc { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; }
                .sm__header-actions { display: flex; gap: 10px; }
                .sm__btn-sound, .sm__btn-clear { background: rgba(255,255,255,0.2); border: none; width: 40px; height: 40px; border-radius: 10px; font-size: 18px; cursor: pointer; transition: 0.2s; color: white; display: flex; align-items: center; justify-content: center; }
                .sm__btn-sound:hover, .sm__btn-clear:hover { background: rgba(255,255,255,0.3); transform: translateY(-2px); }
                
                .sm__kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
                @media (max-width: 640px) { .sm__kpi-row { grid-template-columns: repeat(2, 1fr); } }
                .sm__kpi { background: white; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .sm__kpi--blue { border-bottom: 4px solid #3b82f6; }
                .sm__kpi--green { border-bottom: 4px solid #10b981; }
                .sm__kpi--orange { border-bottom: 4px solid #f59e0b; }
                .sm__kpi--red { border-bottom: 4px solid #ef4444; }
                .sm__kpi-val { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 4px; transition: 0.3s; }
                .sm__kpi-lbl { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }

                /* Conteneur selector */
                .container-selector { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .container-selector label { font-weight: 700; color: #1e293b; font-size: 14px; }
                .container-select-input { width: 100%; padding: 14px 16px; border: 2px solid #cbd5e1; border-radius: 12px; font-size: 16px; font-weight: bold; color: #0f172a; outline: none; transition: 0.2s; background: #f8fafc; }
                .container-select-input:focus { border-color: #f59e0b; background: white; box-shadow: 0 0 0 3px rgba(245,158,11,0.1); }

                /* Camera viewfinder */
                .viewfinder-wrap { position: relative; border-radius: 16px; overflow: hidden; background: #000; aspect-ratio: 1/1; max-height: 400px; width: 100%; margin-bottom: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); }
                #sw-video-preview, #sw-reader { width: 100%; height: 100%; object-fit: cover; display: block; }
                #sw-reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; }
                
                .viewfinder-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
                .viewfinder-box { width: 65%; aspect-ratio: 1; border: 3px solid rgba(245,158,11,0.85); border-radius: 16px; box-shadow: 0 0 0 9999px rgba(15,23,42,0.6); position: relative; }
                .viewfinder-box::before, .viewfinder-box::after { content: ''; position: absolute; width: 30px; height: 30px; border-color: #f59e0b; border-style: solid; }
                .viewfinder-box::before { top: -3px; left: -3px; border-width: 4px 0 0 4px; border-radius: 8px 0 0 0; }
                .viewfinder-box::after { bottom: -3px; right: -3px; border-width: 0 4px 4px 0; border-radius: 0 0 8px 0; }
                
                .scan-line { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #f59e0b, transparent); animation: scan-anim 2s ease-in-out infinite; border-radius: 1px; box-shadow: 0 0 8px #f59e0b; }
                @keyframes scan-anim { 0% { top: 5%; opacity: 1; } 50% { top: 90%; opacity: 0.7; } 100% { top: 5%; opacity: 1; } }

                /* Flash visuel du cadre après un scan (vert = OK, rouge = hors liste) */
                .viewfinder-box { transition: border-color .1s, box-shadow .1s; }
                .viewfinder-box.flash-ok { border-color: #10b981; box-shadow: 0 0 0 9999px rgba(16,185,129,0.30); }
                .viewfinder-box.flash-ok::before, .viewfinder-box.flash-ok::after { border-color: #10b981; }
                .viewfinder-box.flash-warn { border-color: #f59e0b; }
                .viewfinder-box.flash-err { border-color: #ef4444; box-shadow: 0 0 0 9999px rgba(239,68,68,0.30); }
                .viewfinder-box.flash-err::before, .viewfinder-box.flash-err::after { border-color: #ef4444; }

                .scan-status { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; margin-bottom: 20px; color: #1e293b; }
                .scan-dot { width: 10px; height: 10px; border-radius: 50%; background: #f59e0b; animation: blink 1.2s ease-in-out infinite; flex-shrink: 0; }
                @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

                .manual-row { display: flex; gap: 10px; margin-bottom: 25px; }
                .manual-input { flex: 1; padding: 14px 16px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 15px; font-weight: 600; outline: none; text-transform: uppercase; transition: 0.2s; }
                .manual-input:focus { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.1); }
                .btn-search { padding: 14px 20px; background: #f59e0b; border: none; border-radius: 12px; color: white; font-weight: bold; cursor: pointer; transition: 0.2s; }
                .btn-search:hover { background: #d97706; }

                .recent-scans { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
                .recent-scans-header { padding: 15px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b; display: flex; justify-content: space-between; align-items: center; }
                .recent-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
                .scan-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #f1f5f9; }
                .scan-item:last-child { border-bottom: none; }
                .scan-item-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
                .scan-item-ref { font-weight: 800; color: #0f172a; font-family: monospace; font-size: 15px; }
                .scan-item-client { font-size: 12px; color: #64748b; }
                .scan-item-status { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; }
                .status-ok { background: #dcfce7; color: #166534; }
                .status-warn { background: #ffedd5; color: #c2410c; }
                .status-err { background: #fee2e2; color: #991b1b; }
                .btn-remove-scan { background: none; border: none; font-size: 16px; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s; border-radius: 6px; }
                .btn-remove-scan:hover { opacity: 1; background: #f1f5f9; }
            </style>

            <div id="vue-depart-vol-app" class="sw-page" v-cloak>
                <div class="sm__header" style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);">
                    <div class="sm__header-inner">
                        <div class="sm__header-info">
                            <span class="sm__header-icon">✈️</span>
                            <div>
                                <h1 class="sm__header-title">Départ vol</h1>
                                <p class="sm__header-desc">Scan inversé : scannez les colis qui RESTENT en entrepôt.</p>
                            </div>
                        </div>
                        <div class="sm__header-actions">
                            <button class="sm__btn-sound" type="button" @click="toggleSound" :title="isSoundEnabled ? 'Désactiver le son' : 'Activer le son'">{{ isSoundEnabled ? '🔊' : '🔇' }}</button>
                            <button class="sm__btn-clear" type="button" @click="clearSession" title="Effacer la session">🗑️</button>
                        </div>
                    </div>
                </div>
                
                <div class="sm__kpi-row">
                    <div class="sm__kpi sm__kpi--blue">
                        <div class="sm__kpi-val">{{ enEntrepotCount }}</div>
                        <div class="sm__kpi-lbl">En entrepôt</div>
                    </div>
                    <div class="sm__kpi sm__kpi--red">
                        <div class="sm__kpi-val">{{ enVolCount }}</div>
                        <div class="sm__kpi-lbl">En vol</div>
                    </div>
                    <div class="sm__kpi sm__kpi--orange">
                        <div class="sm__kpi-val">{{ toEmbark.length }}</div>
                        <div class="sm__kpi-lbl">À embarquer</div>
                    </div>
                    <div class="sm__kpi sm__kpi--green">
                        <div class="sm__kpi-val">{{ broughtBack.length }}</div>
                        <div class="sm__kpi-lbl">À ramener</div>
                    </div>
                </div>

                <div class="container-selector">
                    <label>📦 {{ enEntrepotCount }} en entrepôt · ✈️ {{ enVolCount }} en vol</label>
                    <div style="font-size:13px;color:#64748b;">Scannez les colis qui <b>restent en entrepôt</b>. À la validation : les non-scannés partent <b>« en vol »</b> ; un colis déjà « en vol » re-scanné <b>revient en entrepôt</b>. Pensez à <b>Valider</b>.</div>
                </div>

                <div class="viewfinder-wrap">
                    <div id="sw-reader" ref="qrReader" style="display: none; background: #000;"></div>
                    <video ref="videoPreview" autoplay muted playsinline style="display: none;"></video>
                    <div class="viewfinder-overlay">
                        <div class="viewfinder-box" :class="flash ? 'flash-' + flash : ''"><div class="scan-line"></div></div>
                    </div>
                </div>

                <div class="scan-status">
                    <div class="scan-dot"></div>
                    <span>{{ scanStatusText }}</span>
                </div>

                <div class="manual-row">
                    <input type="text" class="manual-input" v-model="manualRef" placeholder="Saisir la référence d'un colis resté..." @keyup.enter="processManualScan">
                    <button class="btn-search" type="button" @click="processManualScan">Resté ✓</button>
                </div>

                <div style="display:flex; gap:10px; margin-bottom:20px;">
                    <button class="btn-search" type="button" @click="validateDepart" :disabled="validating || loading || (toEmbark.length === 0 && broughtBack.length === 0)" style="flex:1; padding:16px; font-size:15px; background:#7c3aed;">
                        {{ validating ? '⏳ Validation…' : '✅ Valider (' + toEmbark.length + ' partent · ' + broughtBack.length + ' reviennent)' }}
                    </button>
                </div>

                <div v-if="broughtBack.length" class="recent-scans" style="margin-bottom:20px;">
                    <div class="recent-scans-header">
                        <span>↩️ À RAMENER EN ENTREPÔT (re-scannés)</span>
                        <span class="recent-count">{{ broughtBack.length }}</span>
                    </div>
                    <div>
                        <div v-for="p in broughtBack" :key="p.docId" class="scan-item">
                            <div class="scan-item-info">
                                <span class="scan-item-ref">{{ p.ref }}</span>
                                <span class="scan-item-client">{{ p.client }}</span>
                            </div>
                            <span class="scan-item-status status-ok">revient</span>
                        </div>
                    </div>
                </div>

                <div class="recent-scans" style="margin-bottom:20px;">
                    <div class="recent-scans-header">
                        <span>✈️ À EMBARQUER (seront marqués « en vol »)</span>
                        <span class="recent-count">{{ toEmbark.length }}</span>
                    </div>
                    <div v-if="loading" style="padding:30px; text-align:center; color:#94a3b8; font-size:14px;">⏳ Chargement des colis en entrepôt…</div>
                    <div v-else-if="toEmbark.length === 0" style="padding:30px; text-align:center; color:#94a3b8; font-size:14px;">Tous les colis en entrepôt ont été scannés (aucun départ).</div>
                    <div v-else>
                        <div v-for="p in toEmbark" :key="p.docId" class="scan-item">
                            <div class="scan-item-info">
                                <span class="scan-item-ref">{{ p.ref }}</span>
                                <span class="scan-item-client">{{ p.client }}</span>
                            </div>
                            <span class="scan-item-status status-warn">à embarquer</span>
                        </div>
                    </div>
                </div>

                <div class="recent-scans">
                    <div class="recent-scans-header">
                        <span>📋 Derniers scans</span>
                        <span class="recent-count">{{ recentScans.length }}</span>
                    </div>
                    <div v-if="recentScans.length === 0" style="padding:30px; text-align:center; color:#94a3b8; font-size:14px;">Aucun scan pour le moment.</div>
                    <div v-else>
                        <div v-for="(scan, index) in recentScans" :key="index" class="scan-item">
                            <div class="scan-item-info">
                                <span class="scan-item-ref">{{ scan.ref }}</span>
                                <span class="scan-item-client">{{ scan.client }}</span>
                            </div>
                            <span :class="['scan-item-status', 'status-' + scan.type]">{{ scan.msg }}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.initVue(globalApp);
    },

    initVue(globalApp) {
        if (this.vueApp) {
            this.stopScanner();
            this.vueApp.unmount();
        }

        this.vueApp = createApp({
            setup() {
                // ========== ÉTATS RÉACTIFS ==========
                const population = ref([]);   // colis aériens en entrepôt/en vol : {ref, client, docId, status}
                const scanned = ref({});      // refs scannées comme « restées » : { baseRef: true }
                const loading = ref(true);
                const validating = ref(false);
                const outCount = ref(0);      // scans hors liste (pas dans la population)
                const flash = ref('');        // '' | 'ok' | 'warn' | 'err' : flash du cadre
                const recentScans = ref([]);
                const manualRef = ref('');
                const scanStatusText = ref('Initialisation de la caméra...');
                const isSoundEnabled = ref(true);
                const isScanningPaused = ref(false);
                const lastScanText = ref('');
                const lastScanTime = ref(0);

                // Refs DOM
                const qrReader = ref(null);
                const videoPreview = ref(null);

                // Variables d'instance (non réactives)
                let scannerActive = true;
                let nativeVideoStream = null;
                let html5QrCode = null;
                let barcodeDetector = null;
                let scanAnimationFrame = null;

                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const currentUserName = sessionStorage.getItem('userName') || 'Agent';

                // ========== POPULATION + DIFFÉRENCE ==========
                const enEntrepotCount = computed(() => population.value.filter(p => p.status === 'PARIS').length);
                const enVolCount = computed(() => population.value.filter(p => p.status === 'A_VENIR').length);
                const scannedCount = computed(() => population.value.filter(p => scanned.value[p.ref]).length);
                // À embarquer = colis EN ENTREPÔT (PARIS) non scannés.
                const toEmbark = computed(() => population.value.filter(p => p.status === 'PARIS' && !scanned.value[p.ref]));
                // Corrections : colis déjà « en vol » (A_VENIR) re-scannés -> reviennent en entrepôt.
                const broughtBack = computed(() => population.value.filter(p => p.status === 'A_VENIR' && scanned.value[p.ref]));

                // ========== FONCTIONS UTILES ==========
                const formatMoney = (amount) => globalApp.formatMoney(amount);
                const showToast = (message, type) => globalApp.showToast(message, type);

                // Contexte audio unique, débloqué au 1er geste (obligatoire mobile).
                let audioCtx = null;
                const ensureAudio = () => {
                    try {
                        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
                    } catch (e) { /* audio non supporté */ }
                };
                const playBeep = (type) => {
                    if (!isSoundEnabled.value) return;
                    try {
                        ensureAudio();
                        if (!audioCtx) return;
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        osc.connect(gain); gain.connect(audioCtx.destination);
                        osc.frequency.value = type === 'ok' ? 950 : (type === 'warn' ? 600 : 300);
                        gain.gain.value = 0.35;
                        osc.start();
                        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.3);
                        osc.stop(audioCtx.currentTime + 0.3);
                    } catch (e) { /* audio non supporté */ }
                };
                // Retour combiné son + vibration + flash du cadre.
                const feedback = (type) => {
                    flash.value = type;
                    setTimeout(() => { if (flash.value === type) flash.value = ''; }, 600);
                    playBeep(type);
                    if (navigator.vibrate) navigator.vibrate(type === 'ok' ? [40] : (type === 'warn' ? [40, 40, 40] : [120]));
                };

                const updateKPIs = () => {
                    // Les KPIs sont réactifs via stats.value
                };

                // ========== POPULATION : colis aériens en entrepôt / en vol ==========
                const loadPopulation = async () => {
                    loading.value = true;
                    try {
                        const livCol = getCollectionName("livraisons"); // -> livraisons_..._aerien
                        const snap = (livCol !== "livraisons")
                            ? await getDocs(query(collection(db, livCol)))
                            : await getDocs(query(collection(db, livCol), where("agency", "==", activeAgency)));
                        // Population = colis réellement passés par « Mise en entrepôt »
                        // (scanHistory ENTREPOT_PARIS) et encore PARIS, + ceux déjà
                        // « en vol » (A_VENIR) pour permettre les corrections.
                        const wasInWarehouse = (d) => Array.isArray(d.scanHistory) && d.scanHistory.some(s => s.type === 'ENTREPOT_PARIS');
                        population.value = snap.docs
                            .map(d => ({ docId: d.id, ...d.data() }))
                            .filter(d => !d.isDeleted && (
                                (d.containerStatus === 'PARIS' && wasInWarehouse(d)) ||
                                d.containerStatus === 'A_VENIR'
                            ))
                            .map(d => ({
                                docId: d.docId,
                                ref: d.ref,
                                client: d.destinataire || d.expediteur || 'Client',
                                status: d.containerStatus
                            }));
                    } catch (e) {
                        console.error('Chargement population (Départ vol) :', e);
                        globalApp.showToast("Erreur de chargement des colis en entrepôt", "error");
                    } finally { loading.value = false; }
                };

                // ========== SCANS RÉCENTS + SESSION ==========
                const addRecentScan = (ref, client, msg, type) => {
                    recentScans.value.unshift({ ref, client, msg, type });
                    if (recentScans.value.length > 50) recentScans.value.pop();
                };

                const clearSession = async () => {
                    if (window.AppModal) {
                        if (!await window.AppModal.confirm("Réinitialiser le scan (les colis scannés comme restés seront oubliés) ?", "Réinitialiser", true)) return;
                    } else if (!confirm("Réinitialiser le scan ?")) return;
                    scanned.value = {};
                    outCount.value = 0;
                    recentScans.value = [];
                    showToast("Scan réinitialisé", "info");
                };

                // ========== TRAITEMENT DU SCAN (inversé : colis RESTÉ en entrepôt) ==========
                const processScan = async (text) => {
                    if (isScanningPaused.value) return;
                    if (lastScanText.value === text && Date.now() - lastScanTime.value < 1500) return;
                    lastScanText.value = text;
                    lastScanTime.value = Date.now();
                    isScanningPaused.value = true;

                    // Étiquette = `<ref>_<labelIndex>_<uniqueId>` : on retire le suffixe.
                    const baseRefMatch = text.match(/^(.+)_\d+_\d+$/);
                    const baseRef = (baseRefMatch ? baseRefMatch[1] : text).trim();

                    // Comparaison robuste (casse/espaces) sur la réf de base.
                    const norm = baseRef.toUpperCase();
                    const p = population.value.find(x => (x.ref || '').toUpperCase().trim() === norm);
                    if (p) {
                        if (scanned.value[p.ref]) {
                            addRecentScan(text, p.client, 'Colis déjà scanné', 'warn');
                            feedback('warn');
                        } else {
                            scanned.value = { ...scanned.value, [p.ref]: true };
                            addRecentScan(text, p.client, 'Resté en entrepôt ✓', 'ok');
                            feedback('ok');
                        }
                    } else {
                        outCount.value++;
                        addRecentScan(text, '—', 'Hors liste entrepôt', 'err');
                        feedback('err');
                    }

                    setTimeout(() => { isScanningPaused.value = false; }, 1200);
                };

                const processManualScan = () => {
                    if (manualRef.value.trim().length > 2) {
                        processScan(manualRef.value.trim().toUpperCase());
                        manualRef.value = '';
                    }
                };

                // ========== VALIDATION DU DÉPART (applique la différence) ==========
                const validateDepart = async () => {
                    const embark = toEmbark.value;    // PARIS non scannés -> A_VENIR (en vol)
                    const back = broughtBack.value;   // A_VENIR scannés -> PARIS (correction)
                    if (embark.length === 0 && back.length === 0) {
                        globalApp.showToast("Rien à valider.", "info");
                        return;
                    }
                    const msg = `${embark.length} colis seront marqués « en vol », ${back.length} ramenés en entrepôt. Confirmer le départ ?`;
                    const ok = window.AppModal ? await window.AppModal.confirm(msg, "Valider le départ vol", true) : confirm(msg);
                    if (!ok) return;
                    validating.value = true;
                    try {
                        const livColName = getCollectionName("livraisons");
                        const nowIso = new Date().toISOString();
                        const batch = writeBatch(db);
                        embark.forEach(p => {
                            batch.update(doc(db, livColName, p.docId), {
                                containerStatus: 'A_VENIR',
                                scanHistory: arrayUnion({ scanRef: p.ref, date: nowIso, type: 'DEPART_VOL', agent: currentUserName })
                            });
                        });
                        back.forEach(p => {
                            batch.update(doc(db, livColName, p.docId), {
                                containerStatus: 'PARIS',
                                scanHistory: arrayUnion({ scanRef: p.ref, date: nowIso, type: 'DEPART_VOL_RETOUR', agent: currentUserName })
                            });
                        });
                        await batch.commit();
                        addDoc(collection(db, 'scan_logs'), {
                            date: nowIso, agent: currentUserName, agency: activeAgency,
                            type: 'DEPART_VOL', embarques: embark.length, retours: back.length, modeExpedition: 'aerien'
                        }).catch(() => {});
                        globalApp.showToast(`Départ validé : ${embark.length} en vol, ${back.length} ramenés.`, "success");
                        scanned.value = {};
                        outCount.value = 0;
                        recentScans.value = [];
                        await loadPopulation();
                    } catch (e) {
                        console.error('Validation départ vol :', e);
                        globalApp.showToast("Erreur lors de la validation", "error");
                    } finally { validating.value = false; }
                };

                // ========== GESTION DE LA CAMÉRA ==========
                const loadScannerScript = () => {
                    if (window.Html5Qrcode) {
                        startHybridScanner();
                        return;
                    }
                    const script = document.createElement('script');
                    script.src = "https://unpkg.com/html5-qrcode";
                    document.head.appendChild(script);
                    script.onload = () => startHybridScanner();
                };

                const startHybridScanner = async () => {
                    scannerActive = true;
                    isScanningPaused.value = false;
                    scanStatusText.value = 'Initialisation de la caméra...';

                    try {
                        let useNative = false;
                        if ('BarcodeDetector' in window) {
                            const supportedFormats = await BarcodeDetector.getSupportedFormats();
                            if (supportedFormats.includes('code_128') || supportedFormats.includes('qr_code')) useNative = true;
                        }

                        if (useNative && videoPreview.value) {
                            videoPreview.value.style.display = 'block';
                            if (qrReader.value) qrReader.value.style.display = 'none';
                            barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'qr_code', 'ean_13'] });
                            
                            nativeVideoStream = await navigator.mediaDevices.getUserMedia({
                                video: { facingMode: 'environment', width: { ideal: 1280 }, advanced: [{ focusMode: 'continuous' }] }
                            }).catch(async () => await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } } }));
                            
                            videoPreview.value.srcObject = nativeVideoStream;
                            videoPreview.value.onloadedmetadata = () => {
                                videoPreview.value.play();
                                detectNativeBarcode();
                            };
                            scanStatusText.value = 'Caméra active (Native ⚡) — prête à scanner';
                        } else {
                            startFallbackScanner();
                        }
                    } catch (e) {
                        startFallbackScanner();
                    }
                };

                const detectNativeBarcode = () => {
                    if (!scannerActive || !nativeVideoStream || !videoPreview.value) return;
                    if (videoPreview.value.readyState >= 2 && !isScanningPaused.value) {
                        barcodeDetector.detect(videoPreview.value)
                            .then(barcodes => {
                                if (barcodes.length > 0) processScan(barcodes[0].rawValue);
                            })
                            .catch(() => {});
                    }
                    scanAnimationFrame = requestAnimationFrame(detectNativeBarcode);
                };

                const startFallbackScanner = async () => {
                    if (videoPreview.value) videoPreview.value.style.display = 'none';
                    if (qrReader.value) qrReader.value.style.display = 'block';
                    
                    if (!html5QrCode && window.Html5Qrcode && qrReader.value) {
                        html5QrCode = new Html5Qrcode("sw-reader");
                    }
                    
                    if (html5QrCode) {
                        try {
                            await html5QrCode.start(
                                { facingMode: "environment" },
                                { fps: 10, formatsToSupport: [ window.Html5QrcodeSupportedFormats.CODE_128, window.Html5QrcodeSupportedFormats.QR_CODE ] },
                                (decodedText) => processScan(decodedText),
                                () => {}
                            );
                            scanStatusText.value = 'Caméra active (Compatibilité) — prête à scanner';
                        } catch (e) {
                            scanStatusText.value = '⚠️ Caméra non disponible — saisie manuelle requise';
                        }
                    } else {
                        scanStatusText.value = '⚠️ Scanner non disponible — saisie manuelle requise';
                    }
                };

                const stopScanner = () => {
                    scannerActive = false;
                    if (scanAnimationFrame) cancelAnimationFrame(scanAnimationFrame);
                    if (nativeVideoStream) nativeVideoStream.getTracks().forEach(t => t.stop());
                    if (html5QrCode && html5QrCode.isScanning) {
                        html5QrCode.stop().catch(e => console.log(e));
                    }
                };

                const toggleSound = () => {
                    isSoundEnabled.value = !isSoundEnabled.value;
                };

                // ========== CYCLE DE VIE ==========
                onMounted(() => {
                    loadPopulation();
                    loadScannerScript();
                    // Débloque l'audio au 1er contact (politique mobile : pas de
                    // son tant que l'utilisateur n'a pas interagi avec la page).
                    document.addEventListener('touchstart', ensureAudio, { once: true });
                    document.addEventListener('click', ensureAudio, { once: true });
                });

                onUnmounted(() => {
                    stopScanner();
                });

                return {
                    // États
                    population, scanned, loading, validating, outCount, flash,
                    recentScans, manualRef, scanStatusText, isSoundEnabled,
                    // Computeds
                    enEntrepotCount, enVolCount, scannedCount, toEmbark, broughtBack,
                    // Refs DOM
                    qrReader, videoPreview,
                    // Méthodes
                    toggleSound, clearSession, processManualScan, validateDepart
                };
            }
        });

        this.vueApp.mount('#vue-depart-vol-app');
    },

    // Méthodes de nettoyage pour l'API externe
    stopScanner() {
        if (this.vueApp) {
            // Le cleanup est géré dans onUnmounted du composant Vue
        }
    }
};