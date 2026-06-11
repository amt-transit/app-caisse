// scan-container.js
import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, limit, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../commun/agencies-config.js';

export const ScanContainerView = {
    vueApp: null,
    scannerActive: false,
    nativeVideoStream: null,
    html5QrCode: null,
    barcodeDetector: null,
    scanAnimationFrame: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.scanContainer = this;

        const html = `
            <style>
                /* ====== COCKPIT DE SCAN — panneau sombre, camera héroïque ======
                   Accent thématique par page via --acc (ici : or AMT pour le
                   chargement conteneur). Charte AMT, lueurs, télémétrie mono. */
                .sw-page {
                    --acc: #F6B73C; --acc2: #FFD46A;
                    --ok: #34d399; --warn: #fbbf24; --err: #fb7185; --blue: #5aa2ff;
                    --ink: #eef4ff; --muted: #93a7c4;
                    --surf: rgba(255,255,255,.05); --bd: rgba(255,255,255,.10);
                    max-width: 860px; margin: 0 auto; position: relative;
                    padding: 18px 16px 20px; border-radius: 26px; overflow: hidden;
                    color: var(--ink); font-family: 'Jost','Comfortaa',system-ui,sans-serif;
                    background:
                        radial-gradient(120% 75% at 50% -8%, rgba(246,183,60,.16), transparent 60%),
                        linear-gradient(180deg, #102640 0%, #0b1828 55%, #081019 100%);
                    border: 1px solid rgba(255,255,255,.07);
                    box-shadow: 0 34px 70px -34px rgba(3,10,22,.85), inset 0 1px 0 rgba(255,255,255,.05);
                    animation: fadeIn .35s ease;
                }
                .sw-page::before { content:''; position:absolute; inset:0; pointer-events:none; z-index:0;
                    background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.016) 0 1px, transparent 1px 3px);
                    mix-blend-mode: overlay; opacity:.6; }
                .sw-page > * { position: relative; z-index: 1; }

                /* En-tête = barre de commande */
                .sm__header { position:relative; border-radius:18px; padding:15px 17px; margin-bottom:15px; overflow:hidden;
                    background: linear-gradient(120deg, rgba(246,183,60,.18), rgba(246,183,60,.03));
                    border:1px solid rgba(246,183,60,.30);
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 14px 34px -22px rgba(246,183,60,.6); }
                .sm__header::after { content:''; position:absolute; right:-50px; top:-70px; width:200px; height:200px;
                    background: radial-gradient(circle, rgba(246,183,60,.40), transparent 70%); }
                .sm__header-inner { display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; position:relative; }
                .sm__header-info { display:flex; align-items:center; gap:14px; }
                .sm__header-icon { font-size:25px; width:52px; height:52px; border-radius:15px; flex-shrink:0;
                    background: linear-gradient(135deg, var(--acc), var(--acc2)); color:#241a04;
                    display:flex; align-items:center; justify-content:center;
                    box-shadow: 0 10px 22px -7px rgba(246,183,60,.7), inset 0 1px 0 rgba(255,255,255,.6); }
                .sm__header-title { margin:0; font-family:'Comfortaa','Jost',sans-serif; font-size:21px; font-weight:800; letter-spacing:.2px; color:#fff; }
                .sm__header-desc { margin:3px 0 0; font-size:12.5px; color:var(--muted); }
                .sm__header-actions { display:flex; gap:8px; }
                .sm__btn-sound, .sm__btn-clear { width:42px; height:42px; border-radius:13px; border:1px solid var(--bd);
                    background:var(--surf); color:var(--ink); font-size:17px; cursor:pointer; transition:.15s;
                    display:flex; align-items:center; justify-content:center; }
                .sm__btn-sound:hover, .sm__btn-clear:hover { background:rgba(255,255,255,.12); transform:translateY(-2px); }

                /* Télémétrie (KPIs) */
                .sm__kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin-bottom:15px; }
                .sm__kpi { position:relative; background:var(--surf); border:1px solid var(--bd); border-radius:15px;
                    padding:13px 6px 11px; text-align:center; overflow:hidden; box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }
                .sm__kpi::before { content:''; position:absolute; top:0; left:16%; right:16%; height:2px; border-radius:2px;
                    background:var(--k,#5aa2ff); box-shadow:0 0 12px var(--k,#5aa2ff); }
                .sm__kpi--blue { --k:var(--blue); } .sm__kpi--green { --k:var(--ok); }
                .sm__kpi--orange { --k:var(--warn); } .sm__kpi--red { --k:var(--err); }
                .sm__kpi-val { font-family:ui-monospace,'SFMono-Regular',Menlo,monospace; font-size:25px; font-weight:800; color:#fff; line-height:1; text-shadow:0 0 18px rgba(255,255,255,.14); }
                .sm__kpi-lbl { margin-top:6px; font-size:9px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); }

                /* Sélecteur conteneur */
                .container-selector { background:var(--surf); border:1px solid var(--bd); border-radius:15px; padding:14px 16px; margin-bottom:14px; display:flex; flex-direction:column; gap:8px; }
                .container-selector label { font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }
                .container-select-input { width:100%; padding:13px 14px; border-radius:12px; border:1px solid var(--bd);
                    background:rgba(0,0,0,.28); color:#fff; font-size:15px; font-weight:700; outline:none; transition:.15s; }
                .container-select-input:focus { border-color:var(--acc); box-shadow:0 0 0 3px rgba(246,183,60,.18); }
                .container-select-input option { color:#0f172a; }

                /* Viseur caméra — le héros */
                .viewfinder-wrap { position:relative; border-radius:20px; overflow:hidden; background:#05080d; aspect-ratio:4/3; max-height:420px; width:100%; margin-bottom:0;
                    border:1px solid rgba(255,255,255,.09);
                    box-shadow: 0 26px 54px -24px rgba(0,0,0,.9), inset 0 0 70px rgba(0,0,0,.65); }
                .viewfinder-wrap::after { content:''; position:absolute; inset:0; pointer-events:none; border-radius:20px;
                    box-shadow: inset 0 0 0 1px rgba(246,183,60,.18), inset 0 0 38px rgba(246,183,60,.10);
                    animation: vf-breathe 3.4s ease-in-out infinite; }
                @keyframes vf-breathe { 0%,100% { opacity:.55; } 50% { opacity:1; } }
                #sw-video-preview, #sw-reader { width:100%; height:100%; object-fit:cover; display:block; }
                #sw-reader video { object-fit:cover !important; width:100% !important; height:100% !important; }

                .viewfinder-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
                .viewfinder-box { width:62%; aspect-ratio:1; border-radius:18px; position:relative; transition:border-color .12s, box-shadow .12s;
                    border:2px solid rgba(246,183,60,.55); box-shadow:0 0 0 9999px rgba(5,11,20,.55), inset 0 0 26px rgba(246,183,60,.18); }
                .viewfinder-box::before, .viewfinder-box::after { content:''; position:absolute; width:32px; height:32px; border-color:var(--acc); border-style:solid; filter:drop-shadow(0 0 6px rgba(246,183,60,.8)); }
                .viewfinder-box::before { top:-2px; left:-2px; border-width:4px 0 0 4px; border-radius:10px 0 0 0; }
                .viewfinder-box::after { bottom:-2px; right:-2px; border-width:0 4px 4px 0; border-radius:0 0 10px 0; }
                .viewfinder-box.flash-ok { border-color:var(--ok); box-shadow:0 0 0 9999px rgba(16,185,129,.34), inset 0 0 40px rgba(16,185,129,.4); }
                .viewfinder-box.flash-ok::before, .viewfinder-box.flash-ok::after { border-color:var(--ok); }
                .viewfinder-box.flash-warn { border-color:var(--warn); box-shadow:0 0 0 9999px rgba(251,191,36,.30), inset 0 0 36px rgba(251,191,36,.35); }
                .viewfinder-box.flash-warn::before, .viewfinder-box.flash-warn::after { border-color:var(--warn); }
                .viewfinder-box.flash-err { border-color:var(--err); box-shadow:0 0 0 9999px rgba(251,113,133,.34), inset 0 0 40px rgba(251,113,133,.4); }
                .viewfinder-box.flash-err::before, .viewfinder-box.flash-err::after { border-color:var(--err); }

                .scan-line { position:absolute; left:6%; right:6%; top:0; height:2px; border-radius:2px;
                    background:linear-gradient(90deg, transparent, var(--acc), transparent);
                    box-shadow:0 0 14px var(--acc), 0 0 4px #fff; animation: scan-anim 2.2s cubic-bezier(.45,0,.55,1) infinite; }
                @keyframes scan-anim { 0% { top:6%; opacity:.2; } 12% { opacity:1; } 50% { top:92%; opacity:1; } 88% { opacity:1; } 100% { top:6%; opacity:.2; } }

                /* Pastille statut flottante (HUD) chevauchant le viseur */
                .scan-status { position:relative; z-index:3; margin:-34px auto 14px; width:max-content; max-width:92%;
                    display:flex; align-items:center; gap:9px; padding:9px 16px; border-radius:999px;
                    background:rgba(8,16,28,.82); -webkit-backdrop-filter:blur(9px); backdrop-filter:blur(9px);
                    border:1px solid var(--bd); color:var(--ink); font-size:12.5px; font-weight:600;
                    box-shadow:0 14px 30px -14px rgba(0,0,0,.85); }
                .scan-dot { width:9px; height:9px; border-radius:50%; background:var(--acc); box-shadow:0 0 12px var(--acc); animation:blink 1.2s ease-in-out infinite; flex-shrink:0; }
                @keyframes blink { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.35; transform:scale(.8); } }

                .manual-row { display:flex; gap:9px; margin-bottom:18px; }
                .manual-input { flex:1; min-width:0; padding:14px 16px; border-radius:13px; border:1px solid var(--bd);
                    background:rgba(0,0,0,.28); color:#fff; font-size:15px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; outline:none; transition:.15s; }
                .manual-input::placeholder { color:#5f7da3; text-transform:none; letter-spacing:0; }
                .manual-input:focus { border-color:var(--acc); box-shadow:0 0 0 3px rgba(246,183,60,.18); }
                .btn-search { padding:0 22px; border:none; border-radius:13px; font-weight:800; cursor:pointer; color:#241a04;
                    background:linear-gradient(135deg, var(--acc), var(--acc2)); box-shadow:0 12px 24px -10px rgba(246,183,60,.7); transition:.15s; }
                .btn-search:hover { transform:translateY(-2px); filter:brightness(1.06); }
                .btn-search:active { transform:translateY(0); }

                .recent-scans { background:var(--surf); border:1px solid var(--bd); border-radius:17px; overflow:hidden; }
                .recent-scans-header { padding:13px 16px; background:rgba(255,255,255,.03); border-bottom:1px solid var(--bd); font-weight:700; font-size:13px; color:var(--ink); display:flex; justify-content:space-between; align-items:center; }
                .recent-count { font-family:ui-monospace,Menlo,monospace; background:var(--acc); color:#241a04; padding:2px 10px; border-radius:999px; font-size:12px; font-weight:800; }
                .scan-item { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 16px 12px 18px; border-bottom:1px solid rgba(255,255,255,.05); position:relative; }
                .scan-item:last-child { border-bottom:none; }
                .scan-item::before { content:''; position:absolute; left:0; top:9px; bottom:9px; width:3px; border-radius:0 3px 3px 0; background:transparent; }
                .scan-item:has(.status-ok)::before { background:var(--ok); box-shadow:0 0 10px var(--ok); }
                .scan-item:has(.status-warn)::before { background:var(--warn); box-shadow:0 0 10px var(--warn); }
                .scan-item:has(.status-err)::before { background:var(--err); box-shadow:0 0 10px var(--err); }
                .scan-item-info { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
                .scan-item-ref { font-family:ui-monospace,Menlo,monospace; font-weight:800; color:#fff; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .scan-item-client { font-size:11.5px; color:var(--muted); }
                .scan-item-status { padding:4px 11px; border-radius:999px; font-size:10.5px; font-weight:800; letter-spacing:.02em; white-space:nowrap; }
                .status-ok { background:rgba(52,211,153,.16); color:#6ee7b7; border:1px solid rgba(52,211,153,.32); }
                .status-warn { background:rgba(251,191,36,.16); color:#fcd34d; border:1px solid rgba(251,191,36,.32); }
                .status-err { background:rgba(251,113,133,.16); color:#fda4af; border:1px solid rgba(251,113,133,.32); }
                .btn-remove-scan { background:none; border:none; color:var(--muted); font-size:15px; cursor:pointer; padding:4px 7px; border-radius:9px; transition:.15s; }
                .btn-remove-scan:hover { color:#fff; background:rgba(255,255,255,.10); }

                /* Mobile/tablette : on retranche la description et on compacte le
                   haut pour que le VISEUR soit visible des l'ouverture de la page. */
                @media (max-width: 768px) {
                    .sw-page { padding:14px 12px 18px; }
                    .sm__header-desc { display:none; }
                    .sm__header { padding:12px 15px; margin-bottom:12px; }
                    .sm__header-icon { width:46px; height:46px; font-size:23px; border-radius:13px; }
                    .sm__header-title { font-size:19px; }
                    .container-selector { padding:11px 14px; margin-bottom:12px; }
                    .viewfinder-wrap { aspect-ratio:5/4; }
                    .sm__kpi-row { gap:7px; margin:14px 0; }
                }
                @media (max-width: 380px) {
                    .sm__kpi-val { font-size:21px; }
                    .sm__header-title { font-size:18px; }
                }
            </style>

            <div id="vue-scan-container-app" class="sw-page" v-cloak>
                <div class="sm__header">
                    <div class="sm__header-inner">
                        <div class="sm__header-info">
                            <span class="sm__header-icon">🚢</span>
                            <div>
                                <h1 class="sm__header-title">Charger Conteneur</h1>
                                <p class="sm__header-desc">Associez les colis à un conteneur pour l'expédition.</p>
                            </div>
                        </div>
                        <div class="sm__header-actions">
                            <button class="sm__btn-sound" type="button" @click="toggleSound" :title="isSoundEnabled ? 'Désactiver le son' : 'Activer le son'">{{ isSoundEnabled ? '🔊' : '🔇' }}</button>
                            <button class="sm__btn-clear" type="button" @click="clearSession" title="Effacer la session">🗑️</button>
                        </div>
                    </div>
                </div>
                
                <div class="container-selector">
                    <label>Sélectionnez le conteneur cible :</label>
                    <select v-model="selectedContainerId" class="container-select-input">
                        <option value="">-- Choisir un conteneur --</option>
                        <option v-for="c in containers" :key="c.id" :value="c.id">{{ c.number || c.id }}</option>
                    </select>
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
                    <input type="text" class="manual-input" v-model="manualRef" placeholder="Saisir la référence manuellement..." @keyup.enter="processManualScan">
                    <button class="btn-search" type="button" @click="processManualScan">Charger</button>
                </div>

                <div class="sm__kpi-row">
                    <div class="sm__kpi sm__kpi--blue">
                        <div class="sm__kpi-val">{{ stats.total }}</div>
                        <div class="sm__kpi-lbl">Total</div>
                    </div>
                    <div class="sm__kpi sm__kpi--green">
                        <div class="sm__kpi-val">{{ stats.success }}</div>
                        <div class="sm__kpi-lbl">Succès</div>
                    </div>
                    <div class="sm__kpi sm__kpi--orange">
                        <div class="sm__kpi-val">{{ stats.duplicate }}</div>
                        <div class="sm__kpi-lbl">Déjà traité</div>
                    </div>
                    <div class="sm__kpi sm__kpi--red">
                        <div class="sm__kpi-val">{{ stats.error }}</div>
                        <div class="sm__kpi-lbl">Erreurs</div>
                    </div>
                </div>

                <div class="recent-scans">
                    <div class="recent-scans-header">
                        <span>📋 Colis chargés dans la session</span>
                        <span class="recent-count">{{ recentScans.filter(s => s.type === 'ok').length }}</span>
                    </div>
                    <div v-if="recentScans.length === 0" style="padding: 30px; text-align: center; color: #94a3b8; font-size: 14px;">
                        Aucun colis chargé pour le moment.
                    </div>
                    <div v-else>
                        <div v-for="(scan, index) in recentScans" :key="index" class="scan-item">
                            <div class="scan-item-info">
                                <span class="scan-item-ref">{{ scan.ref }}</span>
                                <span class="scan-item-client">{{ scan.client }}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span :class="['scan-item-status', 'status-' + scan.type]">{{ scan.msg }}</span>
                                <button class="btn-remove-scan" type="button" @click="removeScanItem(index)" title="Supprimer">✕</button>
                            </div>
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
                const containers = ref([]);
                const selectedContainerId = ref('');
                const recentScans = ref([]);
                const manualRef = ref('');
                const scanStatusText = ref('Initialisation de la caméra...');
                const isSoundEnabled = ref(true);
                const isScanningPaused = ref(false);
                const lastScanText = ref('');
                const lastScanTime = ref(0);
                
                const stats = ref({
                    total: 0,
                    success: 0,
                    duplicate: 0,
                    error: 0
                });

                // Refs DOM
                const qrReader = ref(null);
                const videoPreview = ref(null);

                // Variables d'instance (non réactives)
                let scannerActive = true;
                let nativeVideoStream = null;
                let html5QrCode = null;
                let barcodeDetector = null;
                let scanAnimationFrame = null;
                let unsubContainers = null;

                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const currentUserName = sessionStorage.getItem('userName') || 'Agent';

                // ========== FONCTIONS UTILES ==========
                const formatMoney = (amount) => globalApp.formatMoney(amount);
                const showToast = (message, type) => globalApp.showToast(message, type);

                const flash = ref('');
                let audioCtx = null;
                const ensureAudio = () => { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} };
                const playBeep = (type) => {
                    if (!isSoundEnabled.value) return;
                    try {
                        ensureAudio(); if (!audioCtx) return;
                        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                        osc.connect(gain); gain.connect(audioCtx.destination);
                        osc.frequency.value = type === 'ok' ? 950 : (type === 'warn' ? 600 : 300);
                        gain.gain.value = 0.35; osc.start();
                        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.3);
                        osc.stop(audioCtx.currentTime + 0.3);
                    } catch (e) {}
                };
                const feedback = (type) => {
                    flash.value = type;
                    setTimeout(() => { if (flash.value === type) flash.value = ''; }, 600);
                    playBeep(type);
                    if (navigator.vibrate) navigator.vibrate(type === 'ok' ? [40] : (type === 'warn' ? [40, 40, 40] : [120]));
                };

                // Descriptif PAR PIÈCE depuis la description du colis (index _n_).
                const pieceDescOf = (subRef, description) => {
                    const map = {}; let idx = 1;
                    (description || '').split(', ').forEach(seg => {
                        const m = seg.trim().match(/^(\d+)\s*x\s*(.+)$/i);
                        if (m) { const q = parseInt(m[1]) || 1; for (let i = 0; i < q; i++) map[idx++] = m[2].trim(); }
                        else if (seg.trim()) map[idx++] = seg.trim();
                    });
                    const idxM = String(subRef).match(/_(\d+)_/);
                    return (idxM && map[parseInt(idxM[1])]) ? map[parseInt(idxM[1])] : (description || '');
                };

                const updateKPIs = () => {
                    // Les KPIs sont réactifs via stats.value
                };

                // ========== GESTION DES CONTENEURS ==========
                const loadContainers = () => {
                    if (unsubContainers) unsubContainers();
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const contCol = getCollectionName("containers");
                    // Route SaaS : collection déjà isolée -> pas de filtre agency
                    // (sinon les conteneurs sans ce champ disparaissent).
                    const qCont = (contCol !== "containers")
                        ? query(collection(db, contCol))
                        : query(collection(db, contCol), where("agency", "==", activeAgency));
                    unsubContainers = onSnapshot(qCont, (snapshot) => {
                        containers.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    });
                };

                // ========== GESTION DES SCANS RÉCENTS ==========
                const addRecentScan = (ref, client, msg, type) => {
                    recentScans.value.unshift({ ref, client, msg, type });
                    if (recentScans.value.length > 50) recentScans.value.pop();
                };

                const removeScanItem = (index) => {
                    const removed = recentScans.value[index];
                    recentScans.value.splice(index, 1);
                    if (removed.type === 'ok') {
                        stats.value.success--;
                        stats.value.total--;
                    } else if (removed.type === 'warn') {
                        stats.value.duplicate--;
                        stats.value.total--;
                    } else if (removed.type === 'err') {
                        stats.value.error--;
                        stats.value.total--;
                    }
                };

                const clearSession = async () => {
                    if (window.AppModal) {
                        if (!await window.AppModal.confirm("Voulez-vous vraiment effacer les données de scan de cette session ?", "Effacer la session", true)) return;
                    } else if (!confirm("Voulez-vous vraiment effacer les données de scan de cette session ?")) return;
                    
                    stats.value = { total: 0, success: 0, duplicate: 0, error: 0 };
                    recentScans.value = [];
                    showToast("Session effacée", "info");
                };

                // ========== TRAITEMENT DU SCAN ==========
                const processScan = async (text) => {
                    if (isScanningPaused.value) return;
                    if (!selectedContainerId.value) {
                        showToast("⚠️ Sélectionnez d'abord un conteneur !", "error");
                        feedback('err');
                        return;
                    }

                    if (lastScanText.value === text && Date.now() - lastScanTime.value < 3000) return;
                    lastScanText.value = text;
                    lastScanTime.value = Date.now();

                    isScanningPaused.value = true;
                    
                    // Étiquette = `<ref>_<labelIndex>_<uniqueId>` : on retire
                    // uniquement ce suffixe `_n_n` (robuste tout format de ref).
                    const baseRefMatch = text.match(/^(.+)_\d+_\d+$/);
                    const baseRef = (baseRefMatch ? baseRefMatch[1] : text).trim();
                    
                    const logData = {
                        scanRef: text,
                        date: new Date().toISOString(),
                        type: 'CONTENEUR_CHARGEMENT',
                        agent: currentUserName,
                        agency: activeAgency,
                        container: selectedContainerId.value
                    };

                    stats.value.total++;

                    try {
                        const livCol = getCollectionName("livraisons");
                        const qLiv = (livCol !== "livraisons")
                            ? query(collection(db, livCol), where('ref', '==', baseRef), limit(1))
                            : query(collection(db, livCol), where('ref', '==', baseRef), where("agency", "==", activeAgency), limit(1));
                        const snapLiv = await getDocs(qLiv);

                        if (!snapLiv.empty) {
                            const docId = snapLiv.docs[0].id;
                            const data = snapLiv.docs[0].data();
                            logData.description = pieceDescOf(text, data.description);

                            const isAlreadyScanned = data.scanHistory && data.scanHistory.some(s => s.scanRef === text && s.type === 'CONTENEUR_CHARGEMENT');

                            if (isAlreadyScanned) {
                                stats.value.duplicate++;
                                logData.status = 'DOUBLON';
                                addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Déjà dans ce conteneur', 'warn');
                                feedback('warn');
                            } else {
                                await updateDoc(doc(db, getCollectionName("livraisons"), docId), {
                                    conteneur: selectedContainerId.value,
                                    containerStatus: 'A_VENIR',
                                    scanHistory: arrayUnion({ 
                                        scanRef: text, 
                                        date: new Date().toISOString(), 
                                        type: 'CONTENEUR_CHARGEMENT', 
                                        container: selectedContainerId.value 
                                    })
                                });

                                // Mettre à jour Caisse (Transactions)
                                const qTrans = query(collection(db, getCollectionName("transactions")), where('reference', '==', baseRef), limit(1));
                                const snapTrans = await getDocs(qTrans);
                                if (!snapTrans.empty) {
                                    await updateDoc(doc(db, getCollectionName("transactions"), snapTrans.docs[0].id), { conteneur: selectedContainerId.value });
                                }
                
                                stats.value.success++;
                                logData.status = 'SUCCES';
                                addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Chargé avec succès', 'ok');
                                feedback('ok');
                            }
                        } else {
                            stats.value.error++;
                            logData.status = 'ERREUR';
                            addRecentScan(text, 'Non trouvé en base', 'Colis inconnu', 'err');
                            feedback('err');
                        }
                    } catch(e) {
                        console.error(e);
                        stats.value.error++;
                        logData.status = 'ERREUR';
                        feedback('err');
                        addRecentScan(text, 'NON ENREGISTRÉ', 'Erreur réseau — re-scannez ce colis', 'err');
                        showToast("⚠️ Scan NON enregistré (réseau). Re-scannez ce colis.", "error");
                    }
                    
                    // Sauvegarde silencieuse du log
                    addDoc(collection(db, 'scan_logs'), { ...logData, modeExpedition: sessionStorage.getItem('shippingMode') || 'maritime' }).catch(e => console.error("Log error", e));

                    setTimeout(() => { isScanningPaused.value = false; }, 1500);
                };

                const processManualScan = () => {
                    if (manualRef.value.trim().length > 2) {
                        processScan(manualRef.value.trim().toUpperCase());
                        manualRef.value = '';
                    }
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
                    loadContainers();
                    loadScannerScript();
                    document.addEventListener('touchstart', ensureAudio, { once: true });
                    document.addEventListener('click', ensureAudio, { once: true });
                });

                onUnmounted(() => {
                    stopScanner();
                    if (unsubContainers) unsubContainers();
                });

                // Watch pour la sélection du conteneur
                watch(selectedContainerId, (newVal) => {
                    if (newVal) {
                        const container = containers.value.find(c => c.id === newVal);
                        if (container) {
                            scanStatusText.value = `Conteneur sélectionné : ${container.number || container.id} — Prêt à scanner`;
                        }
                    }
                });

                return {
                    // États
                    containers,
                    selectedContainerId,
                    recentScans,
                    manualRef,
                    scanStatusText,
                    isSoundEnabled,
                    flash,
                    stats,
                    // Refs DOM
                    qrReader,
                    videoPreview,
                    // Méthodes
                    toggleSound,
                    clearSession,
                    removeScanItem,
                    processManualScan,
                    formatMoney
                };
            }
        });

        this.vueApp.mount('#vue-scan-container-app');
    },

    // Méthodes de nettoyage pour l'API externe
    stopScanner() {
        if (this.vueApp) {
            // Le cleanup est géré dans onUnmounted du composant Vue
        }
    }
};