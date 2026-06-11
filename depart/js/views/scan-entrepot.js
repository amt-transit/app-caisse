import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, limit, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../commun/agencies-config.js';

export const ScanWarehouseView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.scanWarehouse = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                /* ====== COCKPIT DE SCAN (style partagé, accent par page) ====== */
                .sw-page {
                    --acc: #4d9fff; --acc2: #86c2ff;
                    --ok:#34d399; --warn:#fbbf24; --err:#fb7185; --blue:#5aa2ff;
                    --ink:#eef4ff; --muted:#93a7c4; --surf:rgba(255,255,255,.05); --bd:rgba(255,255,255,.10);
                    max-width:860px; margin:0 auto; position:relative; display:flex; flex-direction:column;
                    padding:18px 16px 20px; border-radius:26px; overflow:hidden; color:var(--ink);
                    font-family:'Jost','Comfortaa',system-ui,sans-serif;
                    background: radial-gradient(120% 75% at 50% -8%, color-mix(in srgb, var(--acc) 18%, transparent), transparent 60%), linear-gradient(180deg,#102640 0%,#0b1828 55%,#081019 100%);
                    border:1px solid rgba(255,255,255,.07);
                    box-shadow:0 34px 70px -34px rgba(3,10,22,.85), inset 0 1px 0 rgba(255,255,255,.05);
                    animation:fadeIn .35s ease;
                }
                .sw-page::before { content:''; position:absolute; inset:0; pointer-events:none; z-index:0; background-image:repeating-linear-gradient(0deg, rgba(255,255,255,.016) 0 1px, transparent 1px 3px); mix-blend-mode:overlay; opacity:.6; }
                .sw-page > * { position:relative; z-index:1; }
                /* La caméra (viseur) doit être visible dès l'ouverture -> KPIs sous la caméra */
                .sw-page > .sm__header { order:0; } .sw-page > .container-selector { order:1; }
                .sw-page > .viewfinder-wrap { order:2; } .sw-page > .scan-status { order:3; }
                .sw-page > .manual-row { order:4; } .sw-page > .sm__kpi-row { order:5; }
                .sw-page > .recent-scans { order:6; }
                .sw-page .sm__header { background:linear-gradient(120deg, color-mix(in srgb,var(--acc) 18%,transparent), color-mix(in srgb,var(--acc) 3%,transparent)) !important; border:1px solid color-mix(in srgb,var(--acc) 30%,transparent) !important; border-radius:18px; padding:15px 17px; margin-bottom:14px; box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 14px 34px -22px color-mix(in srgb,var(--acc) 55%,transparent); position:relative; overflow:hidden; color:#fff; }
                .sw-page .sm__header::after { content:''; position:absolute; right:-50px; top:-70px; width:200px; height:200px; background:radial-gradient(circle, color-mix(in srgb,var(--acc) 40%,transparent), transparent 70%); }
                .sw-page .sm__header-info { gap:14px; }
                .sw-page .sm__header-icon { font-size:25px; width:52px; height:52px; border-radius:15px; background:linear-gradient(135deg,var(--acc),var(--acc2)); color:#06121f; box-shadow:0 10px 22px -7px color-mix(in srgb,var(--acc) 70%,transparent), inset 0 1px 0 rgba(255,255,255,.5); }
                .sw-page .sm__header-title { font-family:'Comfortaa','Jost',sans-serif; font-size:21px; font-weight:800; color:#fff; }
                .sw-page .sm__header-desc { font-size:12.5px; color:var(--muted); opacity:1; }
                .sw-page .sm__btn-sound, .sw-page .sm__btn-clear { width:42px; height:42px; border-radius:13px; border:1px solid var(--bd); background:var(--surf); color:var(--ink); }
                .sw-page .sm__btn-sound:hover, .sw-page .sm__btn-clear:hover { background:rgba(255,255,255,.12); }
                .sw-page .sm__kpi-row { grid-template-columns:repeat(4,1fr); gap:9px; margin:14px 0 0; }
                .sw-page .sm__kpi { position:relative; background:var(--surf); border:1px solid var(--bd); border-radius:15px; padding:13px 6px 11px; overflow:hidden; box-shadow:inset 0 1px 0 rgba(255,255,255,.04); }
                .sw-page .sm__kpi::before { content:''; position:absolute; top:0; left:16%; right:16%; height:2px; border-radius:2px; background:var(--k,#5aa2ff); box-shadow:0 0 12px var(--k,#5aa2ff); }
                .sw-page .sm__kpi--blue { --k:var(--blue); } .sw-page .sm__kpi--green { --k:var(--ok); } .sw-page .sm__kpi--orange { --k:var(--warn); } .sw-page .sm__kpi--red { --k:var(--err); }
                .sw-page .sm__kpi-val { font-family:ui-monospace,Menlo,monospace; font-size:25px; font-weight:800; color:#fff; text-shadow:0 0 18px rgba(255,255,255,.14); }
                .sw-page .sm__kpi-lbl { margin-top:6px; font-size:9px; letter-spacing:.07em; color:var(--muted); }
                .sw-page .container-selector { background:var(--surf); border:1px solid var(--bd); border-radius:15px; padding:13px 16px; margin-bottom:14px; }
                .sw-page .container-selector label { font-size:11px; letter-spacing:.05em; color:var(--muted); }
                .sw-page .container-select-input { border-radius:12px; border:1px solid var(--bd); background:rgba(0,0,0,.28); color:#fff; }
                .sw-page .container-select-input:focus { border-color:var(--acc); box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 22%,transparent); }
                .sw-page .container-select-input option { color:#0f172a; }
                .sw-page .viewfinder-wrap { aspect-ratio:5/4; max-height:420px; border-radius:20px; background:#05080d; margin-bottom:0; border:1px solid rgba(255,255,255,.09); box-shadow:0 26px 54px -24px rgba(0,0,0,.9), inset 0 0 70px rgba(0,0,0,.65); }
                .sw-page .viewfinder-wrap::after { content:''; position:absolute; inset:0; pointer-events:none; border-radius:20px; box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--acc) 18%,transparent), inset 0 0 38px color-mix(in srgb,var(--acc) 12%,transparent); animation:vf-breathe 3.4s ease-in-out infinite; }
                @keyframes vf-breathe { 0%,100%{opacity:.55;} 50%{opacity:1;} }
                .sw-page .viewfinder-box { border:2px solid color-mix(in srgb,var(--acc) 55%,transparent); border-radius:18px; box-shadow:0 0 0 9999px rgba(5,11,20,.55), inset 0 0 26px color-mix(in srgb,var(--acc) 18%,transparent); }
                .sw-page .viewfinder-box::before, .sw-page .viewfinder-box::after { width:32px; height:32px; border-color:var(--acc); filter:drop-shadow(0 0 6px color-mix(in srgb,var(--acc) 75%,transparent)); }
                .sw-page .scan-line { left:6%; right:6%; background:linear-gradient(90deg, transparent, var(--acc), transparent); box-shadow:0 0 14px var(--acc), 0 0 4px #fff; }
                .sw-page .scan-status { position:relative; z-index:3; margin:-34px auto 14px; width:max-content; max-width:92%; padding:9px 16px; border-radius:999px; background:rgba(8,16,28,.82); -webkit-backdrop-filter:blur(9px); backdrop-filter:blur(9px); border:1px solid var(--bd); color:var(--ink); box-shadow:0 14px 30px -14px rgba(0,0,0,.85); }
                .sw-page .scan-dot { background:var(--acc); box-shadow:0 0 12px var(--acc); }
                .sw-page .manual-input { border-radius:13px; border:1px solid var(--bd); background:rgba(0,0,0,.28); color:#fff; }
                .sw-page .manual-input::placeholder { color:#5f7da3; }
                .sw-page .manual-input:focus { border-color:var(--acc); box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 22%,transparent); }
                .sw-page .btn-search { background:linear-gradient(135deg,var(--acc),var(--acc2)); color:#06121f; border-radius:13px; box-shadow:0 12px 24px -10px color-mix(in srgb,var(--acc) 70%,transparent); }
                .sw-page .btn-search:hover { transform:translateY(-2px); filter:brightness(1.06); }
                .sw-page .recent-scans { background:var(--surf); border:1px solid var(--bd); border-radius:17px; }
                .sw-page .recent-scans-header { background:rgba(255,255,255,.03); border-bottom:1px solid var(--bd); color:var(--ink); }
                .sw-page .recent-count { font-family:ui-monospace,Menlo,monospace; background:var(--acc); color:#06121f; border-radius:999px; font-weight:800; }
                .sw-page .scan-item { border-bottom:1px solid rgba(255,255,255,.05); padding-left:18px; position:relative; }
                .sw-page .scan-item::before { content:''; position:absolute; left:0; top:9px; bottom:9px; width:3px; border-radius:0 3px 3px 0; background:transparent; }
                .sw-page .scan-item:has(.status-ok)::before { background:var(--ok); box-shadow:0 0 10px var(--ok); }
                .sw-page .scan-item:has(.status-warn)::before { background:var(--warn); box-shadow:0 0 10px var(--warn); }
                .sw-page .scan-item:has(.status-err)::before { background:var(--err); box-shadow:0 0 10px var(--err); }
                .sw-page .scan-item-ref { font-family:ui-monospace,Menlo,monospace; color:#fff; }
                .sw-page .scan-item-client { color:var(--muted); }
                .sw-page .status-ok { background:rgba(52,211,153,.16); color:#6ee7b7; border:1px solid rgba(52,211,153,.32); }
                .sw-page .status-warn { background:rgba(251,191,36,.16); color:#fcd34d; border:1px solid rgba(251,191,36,.32); }
                .sw-page .status-err { background:rgba(251,113,133,.16); color:#fda4af; border:1px solid rgba(251,113,133,.32); }
                .sw-page .btn-remove-scan { color:var(--muted); }
                .sw-page .btn-remove-scan:hover { color:#fff; background:rgba(255,255,255,.10); }
                @media (max-width:768px) {
                    .sw-page { padding:14px 12px 18px; }
                    .sw-page .sm__header-desc { display:none; }
                    .sw-page .sm__header { padding:12px 15px; margin-bottom:12px; }
                    .sw-page .sm__header-icon { width:46px; height:46px; font-size:23px; }
                    .sw-page .sm__header-title { font-size:19px; }
                    .sw-page .container-selector { padding:11px 14px; margin-bottom:12px; }
                }
                
                /* --- NOUVEAU HEADER & KPIs --- */
                .sm__header { border-radius: 16px; padding: 20px; margin-bottom: 20px; color: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); background: linear-gradient(135deg, rgb(37, 99, 235) 0%, rgb(29, 78, 216) 100%); }
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

                /* Camera viewfinder styles copied from livreurscan */
                .viewfinder-wrap { position: relative; border-radius: 16px; overflow: hidden; background: #000; aspect-ratio: 1/1; max-height: 400px; width: 100%; margin-bottom: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); }
                #sw-video-preview, #sw-reader { width: 100%; height: 100%; object-fit: cover; display: block; }
                #sw-reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; }
                
                .viewfinder-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
                .viewfinder-box { width: 65%; aspect-ratio: 1; border: 3px solid rgba(59,130,246,0.85); border-radius: 16px; box-shadow: 0 0 0 9999px rgba(15,23,42,0.6); position: relative; }
                .viewfinder-box::before, .viewfinder-box::after { content: ''; position: absolute; width: 30px; height: 30px; border-color: #3b82f6; border-style: solid; }
                .viewfinder-box::before { top: -3px; left: -3px; border-width: 4px 0 0 4px; border-radius: 8px 0 0 0; }
                .viewfinder-box::after { bottom: -3px; right: -3px; border-width: 0 4px 4px 0; border-radius: 0 0 8px 0; }
                .viewfinder-box { transition: border-color .1s, box-shadow .1s; }
                .viewfinder-box.flash-ok { border-color:#10b981; box-shadow:0 0 0 9999px rgba(16,185,129,0.30); }
                .viewfinder-box.flash-ok::before, .viewfinder-box.flash-ok::after { border-color:#10b981; }
                .viewfinder-box.flash-warn { border-color:#f59e0b; }
                .viewfinder-box.flash-err { border-color:#ef4444; box-shadow:0 0 0 9999px rgba(239,68,68,0.30); }
                .viewfinder-box.flash-err::before, .viewfinder-box.flash-err::after { border-color:#ef4444; }
                
                .scan-line { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #3b82f6, transparent); animation: scan-anim 2s ease-in-out infinite; border-radius: 1px; box-shadow: 0 0 8px #3b82f6; }
                @keyframes scan-anim { 0% { top: 5%; opacity: 1; } 50% { top: 90%; opacity: 0.7; } 100% { top: 5%; opacity: 1; } }

                .scan-status { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; margin-bottom: 20px; color: #1e293b; }
                .scan-dot { width: 10px; height: 10px; border-radius: 50%; background: #3b82f6; animation: blink 1.2s ease-in-out infinite; flex-shrink: 0; }
                @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

                .manual-row { display: flex; gap: 10px; margin-bottom: 25px; }
                .manual-input { flex: 1; padding: 14px 16px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 15px; font-weight: 600; outline: none; text-transform: uppercase; transition: 0.2s; }
                .manual-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .btn-search { padding: 14px 20px; background: #3b82f6; border: none; border-radius: 12px; color: white; font-weight: bold; cursor: pointer; transition: 0.2s; }
                .btn-search:hover { background: #2563eb; }

                .recent-scans { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
                .recent-scans-header { padding: 15px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b; }
                .scan-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #f1f5f9; }
                .scan-item:last-child { border-bottom: none; }
                .scan-item-info { display: flex; flex-direction: column; gap: 4px; }
                .scan-item-ref { font-weight: 800; color: #0f172a; font-family: monospace; font-size: 15px; }
                .scan-item-client { font-size: 12px; color: #64748b; }
                .scan-item-status { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
                .status-ok { background: #dcfce7; color: #166534; }
                .status-warn { background: #ffedd5; color: #c2410c; }
                .status-err { background: #fee2e2; color: #991b1b; }
            </style>

            <div class="sw-page" id="vue-scan-warehouse-app" v-cloak>
                <div class="sm__header">
                    <div class="sm__header-inner">
                        <div class="sm__header-info">
                            <span class="sm__header-icon">🏭</span>
                            <div>
                                <h1 class="sm__header-title">Mise en entrepôt</h1>
                                <p class="sm__header-desc">Scannez un colis pour le marquer en entrepôt à Paris.</p>
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

                <div class="viewfinder-wrap">
                    <div id="sw-reader" style="display: none; background: #000;"></div>
                    <video id="sw-video-preview" autoplay muted playsinline style="display: none;"></video>
                    <div class="viewfinder-overlay">
                        <div class="viewfinder-box" :class="flash ? 'flash-' + flash : ''"><div class="scan-line"></div></div>
                    </div>
                </div>

                <div class="scan-status">
                    <div class="scan-dot"></div>
                    <span>{{ statusText }}</span>
                </div>

                <div class="manual-row">
                    <input type="text" class="manual-input" v-model="manualRef" @keydown.enter="processManualScan" placeholder="Saisir la référence manuellement...">
                    <button class="btn-search" @click="processManualScan">Valider</button>
                </div>

                <div class="recent-scans">
                    <div class="recent-scans-header">📋 Derniers scans de la session</div>
                    <div>
                        <div v-if="recentScans.length === 0" style="padding: 30px; text-align: center; color: #94a3b8; font-size: 14px;">Aucun colis scanné pour le moment.</div>
                        <div v-else v-for="(s, index) in recentScans" :key="index" class="scan-item">
                            <div class="scan-item-info">
                                <span class="scan-item-ref">{{ s.ref }}</span>
                                <span class="scan-item-client">{{ s.client }}</span>
                            </div>
                            <span :class="['scan-item-status', 'status-' + s.type]">{{ s.msg }}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.initVue(globalApp);
    },

    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                const stats = reactive({ total: 0, success: 0, duplicate: 0, error: 0 });
                const recentScans = ref([]);
                const isSoundEnabled = ref(true);
                const statusText = ref('Initialisation de la caméra...');
                const manualRef = ref('');

                // Variables internes pour le scanner (Non réactives)
                let scannerActive = false;
                let nativeVideoStream = null;
                let html5QrCode = null;
                let barcodeDetector = null;
                let scanAnimationFrame = null;
                let isScanningPaused = false;
                let lastScanText = '';
                let lastScanTime = 0;

                const toggleSound = () => { isSoundEnabled.value = !isSoundEnabled.value; };

                // Retour scan : son (débloqué au 1er geste) + vibration + flash du cadre.
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

                const clearSession = () => {
                    if (confirm("Voulez-vous vraiment effacer les données de scan de cette session ?")) {
                        stats.total = 0; stats.success = 0; stats.duplicate = 0; stats.error = 0;
                        recentScans.value = [];
                    }
                };

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
                    isScanningPaused = false;

                    try {
                        let useNative = false;
                        if ('BarcodeDetector' in window) {
                            const supportedFormats = await BarcodeDetector.getSupportedFormats();
                            if (supportedFormats.includes('code_128') || supportedFormats.includes('qr_code')) useNative = true;
                        }

                        if (useNative) {
                            document.getElementById('sw-video-preview').style.display = 'block';
                            barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'qr_code', 'ean_13'] });
                            
                            nativeVideoStream = await navigator.mediaDevices.getUserMedia({
                                video: { facingMode: 'environment', width: { ideal: 1280 }, advanced: [{ focusMode: 'continuous' }] }
                            }).catch(async () => await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } } }));
                            
                            const videoEl = document.getElementById('sw-video-preview');
                            videoEl.srcObject = nativeVideoStream;
                            videoEl.onloadedmetadata = () => { videoEl.play(); detectNativeBarcode(videoEl); };
                            statusText.value = 'Caméra active (Native ⚡) — prête à scanner';
                        } else {
                            startFallbackScanner();
                        }
                    } catch (e) {
                        startFallbackScanner();
                    }
                };

                const startFallbackScanner = async () => {
                    document.getElementById('sw-video-preview').style.display = 'none';
                    document.getElementById('sw-reader').style.display = 'block';
                    
                    if (!html5QrCode) html5QrCode = new Html5Qrcode("sw-reader");
                    
                    try {
                        await html5QrCode.start(
                            { facingMode: "environment" },
                            { fps: 10, formatsToSupport: [ window.Html5QrcodeSupportedFormats.CODE_128, window.Html5QrcodeSupportedFormats.QR_CODE ] },
                            (decodedText) => onScanSuccess(decodedText),
                            () => {}
                        );
                        statusText.value = 'Caméra active (Compatibilité) — prête à scanner';
                    } catch (e) {
                        statusText.value = '⚠️ Caméra non disponible — saisie manuelle requise';
                    }
                };

                const detectNativeBarcode = async (videoEl) => {
                    if (!scannerActive || !nativeVideoStream) return;
                    if (videoEl.readyState >= 2 && !isScanningPaused) {
                        try {
                            const barcodes = await barcodeDetector.detect(videoEl);
                            if (barcodes.length > 0) onScanSuccess(barcodes[0].rawValue);
                        } catch (e) {}
                    }
                    scanAnimationFrame = requestAnimationFrame(() => detectNativeBarcode(videoEl));
                };

                const stopScanner = async () => {
                    scannerActive = false;
                    if (scanAnimationFrame) cancelAnimationFrame(scanAnimationFrame);
                    if (nativeVideoStream) nativeVideoStream.getTracks().forEach(t => t.stop());
                    if (html5QrCode && html5QrCode.isScanning) await html5QrCode.stop().catch(e=>console.log(e));
                };

                const onScanSuccess = (decodedText) => {
                    if (isScanningPaused) return;
                    let text = decodedText.trim().toUpperCase();
                    const refMatch = text.match(/([A-Z]{2})[-_.\s]*(\d{3})[-_.\s]*([A-Z0-9]+(?:_[0-9]+)*)/i);
                    if (refMatch) text = `${refMatch[1]}-${refMatch[2]}-${refMatch[3]}`.toUpperCase();

                    processScan(text);
                };

                const processManualScan = () => {
                    const val = manualRef.value.trim();
                    if (val.length > 2) {
                        processScan(val.toUpperCase());
                        manualRef.value = '';
                    }
                };

                const addRecentScan = (ref, client, msg, type) => {
                    recentScans.value.unshift({ ref, client, msg, type });
                    if (recentScans.value.length > 50) recentScans.value.pop();
                };

                const processScan = async (text) => {
                    if (lastScanText === text && Date.now() - lastScanTime < 3000) return;
                    lastScanText = text;
                    lastScanTime = Date.now();

                    isScanningPaused = true;
                    
                    // L'étiquette colis = `<ref>_<labelIndex>_<uniqueId>`
                    // (cf. Nouvelle Facture). On retire UNIQUEMENT ce suffixe
                    // `_n_n` final pour retrouver la référence de base —
                    // robuste quel que soit le format de la ref (initiales de
                    // n'importe quelle longueur, conteneur avec tirets, routes
                    // SaaS…). Si pas de suffixe (ref tapée à la main), on garde.
                    const baseRefMatch = text.match(/^(.+)_\d+_\d+$/);
                    const baseRef = (baseRefMatch ? baseRefMatch[1] : text).trim();
                    
                    const logData = {
                        scanRef: text,
                        date: new Date().toISOString(),
                        type: 'ENTREPOT_PARIS',
                        agent: sessionStorage.getItem('userName') || 'Agent',
                        agency: sessionStorage.getItem('currentActiveAgency') || 'paris',
                        container: '-'
                    };

                    stats.total++;

                    try {
                        // Route-aware (isolation SaaS) : collection de route
                        // déjà isolée -> pas de filtre agency (les docs route
                        // ne portent pas toujours ce champ) ; collection
                        // historique -> filtre agency conservé.
                        const livCol = getCollectionName('livraisons');
                        const q = (livCol !== 'livraisons')
                            ? query(collection(db, livCol), where('ref', '==', baseRef), limit(1))
                            : query(collection(db, livCol), where('ref', '==', baseRef), where("agency", "==", sessionStorage.getItem('currentActiveAgency') || 'paris'), limit(1));
                        const snap = await getDocs(q);

                        if (!snap.empty) {
                            const docId = snap.docs[0].id;
                            const data = snap.docs[0].data();
                            logData.description = pieceDescOf(text, data.description);

                            const isAlreadyScanned = data.scanHistory && data.scanHistory.some(s => s.scanRef === text && s.type === 'ENTREPOT_PARIS');

                            if (isAlreadyScanned) {
                                stats.duplicate++;
                                logData.status = 'DOUBLON';
                                addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Déjà en entrepôt', 'warn');
                                feedback('warn');
                            } else {
                                await updateDoc(doc(db, livCol, docId), {
                                    containerStatus: 'PARIS',
                                    scanHistory: arrayUnion({ scanRef: text, date: new Date().toISOString(), type: 'ENTREPOT_PARIS' })
                                });
                                stats.success++;
                                logData.status = 'SUCCES';
                                addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Mise en entrepôt OK', 'ok');
                                feedback('ok');
                            }
                        } else {
                            stats.error++;
                            logData.status = 'ERREUR';
                            addRecentScan(text, 'Non trouvé en base', 'Colis inconnu', 'err');
                            feedback('err');
                        }
                    } catch(e) {
                        console.error(e);
                        stats.error++;
                        logData.status = 'ERREUR';
                        feedback('err');
                        addRecentScan(text, 'NON ENREGISTRÉ', 'Erreur réseau — re-scannez ce colis', 'err');
                        globalApp.showToast("⚠️ Scan NON enregistré (réseau). Re-scannez ce colis.", "error");
                    }
                    
                    addDoc(collection(db, 'scan_logs'), { ...logData, modeExpedition: sessionStorage.getItem('shippingMode') || 'maritime' }).catch(e => console.error("Log error", e));

                    setTimeout(() => { isScanningPaused = false; }, 1500);
                };

                onMounted(() => {
                    loadScannerScript();
                    document.addEventListener('touchstart', ensureAudio, { once: true });
                    document.addEventListener('click', ensureAudio, { once: true });
                });

                onUnmounted(() => {
                    stopScanner();
                });

                return {
                    stats, recentScans, isSoundEnabled, statusText, manualRef, flash,
                    toggleSound, clearSession, processManualScan
                };
            }
        });

        this.vueApp.mount('#vue-scan-warehouse-app');
    }
};