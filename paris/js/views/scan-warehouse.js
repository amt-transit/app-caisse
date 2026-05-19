import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, limit, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';

export const ScanWarehouseView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.scanWarehouse = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .sw-page { max-width: 800px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                
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
                        <div class="viewfinder-box"><div class="scan-line"></div></div>
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
                            
                            const isAlreadyScanned = data.scanHistory && data.scanHistory.some(s => s.scanRef === text && s.type === 'ENTREPOT_PARIS');

                            if (isAlreadyScanned) {
                                stats.duplicate++;
                                logData.status = 'DOUBLON';
                                addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Déjà en entrepôt', 'warn');
                                if (isSoundEnabled.value && navigator.vibrate) navigator.vibrate([50, 50, 50]);
                            } else {
                                await updateDoc(doc(db, livCol, docId), {
                                    containerStatus: 'PARIS',
                                    scanHistory: arrayUnion({ scanRef: text, date: new Date().toISOString(), type: 'ENTREPOT_PARIS' })
                                });
                                stats.success++;
                                logData.status = 'SUCCES';
                                addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Mise en entrepôt OK', 'ok');
                                if (isSoundEnabled.value && navigator.vibrate) navigator.vibrate([30, 20, 30]);
                            }
                        } else {
                            stats.error++;
                            logData.status = 'ERREUR';
                            addRecentScan(text, 'Non trouvé en base', 'Colis inconnu', 'err');
                            if(isSoundEnabled.value && navigator.vibrate) navigator.vibrate([100, 50, 100]);
                        }
                    } catch(e) { 
                        console.error(e); 
                        stats.error++;
                        logData.status = 'ERREUR';
                        globalApp.showToast("Erreur de connexion", "error"); 
                    }
                    
                    addDoc(collection(db, 'scan_logs'), logData).catch(e => console.error("Log error", e));

                    setTimeout(() => { isScanningPaused = false; }, 1500);
                };

                onMounted(() => {
                    loadScannerScript();
                });

                onUnmounted(() => {
                    stopScanner();
                });

                return {
                    stats, recentScans, isSoundEnabled, statusText, manualRef,
                    toggleSound, clearSession, processManualScan
                };
            }
        });

        this.vueApp.mount('#vue-scan-warehouse-app');
    }
};