// scan-container.js
import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, limit, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';

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
                .viewfinder-box { transition: border-color .1s, box-shadow .1s; }
                .viewfinder-box.flash-ok { border-color:#10b981; box-shadow:0 0 0 9999px rgba(16,185,129,0.30); }
                .viewfinder-box.flash-ok::before, .viewfinder-box.flash-ok::after { border-color:#10b981; }
                .viewfinder-box.flash-warn { border-color:#f59e0b; }
                .viewfinder-box.flash-err { border-color:#ef4444; box-shadow:0 0 0 9999px rgba(239,68,68,0.30); }
                .viewfinder-box.flash-err::before, .viewfinder-box.flash-err::after { border-color:#ef4444; }
                
                .scan-line { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #f59e0b, transparent); animation: scan-anim 2s ease-in-out infinite; border-radius: 1px; box-shadow: 0 0 8px #f59e0b; }
                @keyframes scan-anim { 0% { top: 5%; opacity: 1; } 50% { top: 90%; opacity: 0.7; } 100% { top: 5%; opacity: 1; } }

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
                            logData.description = data.description || '';

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
                        showToast("Erreur de connexion", "error"); 
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