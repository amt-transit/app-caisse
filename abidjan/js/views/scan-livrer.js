import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, limit, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';

export const ScanLivrerView = {
    scannerActive: false,
    nativeVideoStream: null,
    html5QrCode: null,
    barcodeDetector: null,
    scanAnimationFrame: null,
    isScanningPaused: false,
    lastScanText: '',
    lastScanTime: 0,
    recentScans: [],
    sessionItemsToShare: [],
    capturedPhotos: [],
    deliveryGeo: null, // { lat, lng, accuracy } capturé par captureGPS()
    stats: { total: 0, success: 0, duplicate: 0, error: 0 },
    isSoundEnabled: true,

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.scanLivrer = this;
        this.recentScans = [];
        this.sessionItemsToShare = [];
        this.capturedPhotos = [];
        this.stats = { total: 0, success: 0, duplicate: 0, error: 0 };

        const html = `
            <style>
                .sw-page { max-width: 800px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .sm__header { border-radius: 16px; padding: 20px; margin-bottom: 20px; color: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); background: linear-gradient(135deg, rgb(139, 92, 246) 0%, rgb(109, 40, 217) 100%); }
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

                .viewfinder-wrap { position: relative; border-radius: 16px; overflow: hidden; background: #000; aspect-ratio: 1/1; max-height: 400px; width: 100%; margin-bottom: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); }
                #sw-video-preview, #sw-reader { width: 100%; height: 100%; object-fit: cover; display: block; }
                #sw-reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; }
                
                .viewfinder-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
                .viewfinder-box { width: 65%; aspect-ratio: 1; border: 3px solid rgba(139, 92, 246, 0.85); border-radius: 16px; box-shadow: 0 0 0 9999px rgba(15,23,42,0.6); position: relative; }
                .viewfinder-box::before, .viewfinder-box::after { content: ''; position: absolute; width: 30px; height: 30px; border-color: #8b5cf6; border-style: solid; }
                .viewfinder-box::before { top: -3px; left: -3px; border-width: 4px 0 0 4px; border-radius: 8px 0 0 0; }
                .viewfinder-box::after { bottom: -3px; right: -3px; border-width: 0 4px 4px 0; border-radius: 0 0 8px 0; }
                
                .scan-line { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #8b5cf6, transparent); animation: scan-anim 2s ease-in-out infinite; border-radius: 1px; box-shadow: 0 0 8px #8b5cf6; }
                @keyframes scan-anim { 0% { top: 5%; opacity: 1; } 50% { top: 90%; opacity: 0.7; } 100% { top: 5%; opacity: 1; } }

                .scan-status { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; margin-bottom: 20px; color: #1e293b; }
                .scan-dot { width: 10px; height: 10px; border-radius: 50%; background: #8b5cf6; animation: blink 1.2s ease-in-out infinite; flex-shrink: 0; }
                @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

                .manual-row { display: flex; gap: 10px; margin-bottom: 25px; }
                .manual-input { flex: 1; padding: 14px 16px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 15px; font-weight: 600; outline: none; text-transform: uppercase; transition: 0.2s; }
                .manual-input:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1); }
                .btn-search { padding: 14px 20px; background: #8b5cf6; border: none; border-radius: 12px; color: white; font-weight: bold; cursor: pointer; transition: 0.2s; }
                .btn-search:hover { background: #7c3aed; }

                /* Styles pour Photos et WhatsApp */
                .session-panel { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .session-panel-title { font-size: 15px; font-weight: 800; color: #1e293b; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
                .photos-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 15px; scrollbar-width: none; }
                .photos-row::-webkit-scrollbar { display: none; }
                .photo-thumb { width: 80px; height: 80px; border-radius: 12px; object-fit: cover; border: 2px solid #10b981; flex-shrink: 0; cursor: pointer; transition: transform 0.2s; }
                .photo-thumb:active { transform: scale(0.95); }
                .photo-add-btn { width: 80px; height: 80px; border-radius: 12px; border: 2px dashed #cbd5e1; background: #f8fafc; color: #64748b; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: border-color 0.2s; }
                .photo-add-btn:hover { border-color: #8b5cf6; color: #8b5cf6; }
                .btn-wa { width: 100%; padding: 16px; background: #25D366; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: transform 0.2s, box-shadow 0.2s; }
                .btn-wa:hover { background: #128C7E; transform: translateY(-2px); box-shadow: 0 6px 12px rgba(37, 211, 102, 0.3); }
                .btn-wa:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

                .recent-scans { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
                .recent-scans-header { padding: 15px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #1e293b; display: flex; justify-content: space-between; align-items: center; }
                .recent-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
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

            <div class="sw-page" id="sw-page">
                <div class="sm__header">
                    <div class="sm__header-inner">
                        <div class="sm__header-info">
                            <span class="sm__header-icon">🤝</span>
                            <div>
                                <h1 class="sm__header-title">Remise au client (Livrer)</h1>
                                <p class="sm__header-desc">Scannez les colis pour valider la remise finale au client.</p>
                            </div>
                        </div>
                        <div class="sm__header-actions">
                            <button class="sm__btn-sound" id="btn-sound-liv" type="button" title="Activer/Désactiver le son" onclick="window.app.views.scanLivrer.toggleSound()">🔊</button>
                            <button class="sm__btn-clear" type="button" title="Effacer la session" onclick="window.app.views.scanLivrer.clearSession()">🗑️</button>
                        </div>
                    </div>
                </div>
                
                <div class="sm__kpi-row">
                    <div class="sm__kpi sm__kpi--blue"><div class="sm__kpi-val" id="liv-kpi-total">0</div><div class="sm__kpi-lbl">Total</div></div>
                    <div class="sm__kpi sm__kpi--green"><div class="sm__kpi-val" id="liv-kpi-success">0</div><div class="sm__kpi-lbl">Succès</div></div>
                    <div class="sm__kpi sm__kpi--orange"><div class="sm__kpi-val" id="liv-kpi-duplicate">0</div><div class="sm__kpi-lbl">Déjà livré</div></div>
                    <div class="sm__kpi sm__kpi--red"><div class="sm__kpi-val" id="liv-kpi-error">0</div><div class="sm__kpi-lbl">Erreurs</div></div>
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
                    <span id="sw-status-text">Initialisation de la caméra...</span>
                </div>

                <div class="manual-row">
                    <input type="text" class="manual-input" id="sw-manual-ref" placeholder="Saisir la référence manuellement..." onkeydown="if(event.key==='Enter') window.app.views.scanLivrer.processManualScan()">
                    <button class="btn-search" onclick="window.app.views.scanLivrer.processManualScan()">Livrer</button>
                </div>

                <input type="file" id="liv-photoInput" accept="image/*" multiple style="display:none" onchange="window.app.views.scanLivrer.handlePhotoCapture(event)">
                
                <div class="session-panel">
                    <div class="session-panel-title">
                        <span>📸 Preuves & Partage <span id="liv-session-count" style="background:#8b5cf6;color:white;padding:2px 8px;border-radius:10px;font-size:12px;margin-left:8px;">0 colis prêt(s)</span></span>
                    </div>

                    <!-- ─── Bloc Adresse + GPS de la livraison ─── -->
                    <div id="liv-addr-block" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:14px; display:none;">
                        <div style="font-size:11px; color:#64748b; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:6px;">📍 Lieu de livraison</div>
                        <div id="liv-addr-current" style="font-size:14px; color:#0f172a; font-weight:600; line-height:1.4; margin-bottom:8px;">—</div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button onclick="window.app.views.scanLivrer.captureGPS()" style="flex:1; min-width:120px; padding:8px 12px; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                                <span id="liv-gps-icon">🎯</span> <span id="liv-gps-text">Géolocaliser</span>
                            </button>
                            <button onclick="window.app.views.scanLivrer.editAddress()" style="flex:1; min-width:120px; padding:8px 12px; background:#fff7ed; color:#9a3412; border:1px solid #fed7aa; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                                ✏️ Modifier adresse
                            </button>
                        </div>
                        <div id="liv-gps-info" style="font-size:11px; color:#047857; margin-top:8px; display:none;">✓ GPS capturé</div>
                    </div>

                    <div class="photos-row" id="liv-photos-row">
                        <div class="photo-add-btn" onclick="document.getElementById('liv-photoInput').click()">
                            <i class="fas fa-camera" style="font-size:20px; margin-bottom:5px;"></i><span style="font-size:11px;font-weight:600;">Ajouter</span>
                        </div>
                    </div>
                    <button class="btn-wa" id="btn-wa-liv" onclick="window.app.views.scanLivrer.sendToWhatsApp()" disabled><i class="fab fa-whatsapp" style="font-size: 20px;"></i> WhatsApp & Terminer</button>
                </div>

                <div class="recent-scans">
                    <div class="recent-scans-header">
                        <span>📋 Colis livrés dans la session</span>
                        <span class="recent-count" id="sc-count">0</span>
                    </div>
                    <div id="sw-recent-list">
                        <div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 14px;">Aucun colis livré pour le moment.</div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

        const observer = new MutationObserver(() => {
            if (!document.body.contains(document.getElementById('sw-page'))) {
                this.stopScanner();
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        this.loadScannerScript();
    },

    toggleSound() {
        this.isSoundEnabled = !this.isSoundEnabled;
        const btn = document.getElementById('btn-sound-liv');
        if (btn) btn.textContent = this.isSoundEnabled ? '🔊' : '🔇';
    },

    clearSession() {
        if (confirm("Voulez-vous vraiment effacer les données de scan de cette session ?")) {
            this.stats = { total: 0, success: 0, duplicate: 0, error: 0 };
            this.recentScans = [];
            this.sessionItemsToShare = [];
            this.capturedPhotos = [];
            this.updateKPIs();
            this.updateSessionUI();
            const list = document.getElementById('sw-recent-list');
            if (list) list.innerHTML = '<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 14px;">Aucun colis livré pour le moment.</div>';
        }
    },

    updateKPIs() {
        document.getElementById('liv-kpi-total').textContent = this.stats.total;
        document.getElementById('liv-kpi-success').textContent = this.stats.success;
        document.getElementById('liv-kpi-duplicate').textContent = this.stats.duplicate;
        document.getElementById('liv-kpi-error').textContent = this.stats.error;
    },

    loadScannerScript() {
        if (window.Html5Qrcode) {
            this.startHybridScanner();
            return;
        }
        const script = document.createElement('script');
        script.src = "https://unpkg.com/html5-qrcode";
        document.head.appendChild(script);
        script.onload = () => this.startHybridScanner();
    },

    async startHybridScanner() {
        this.scannerActive = true;
        this.isScanningPaused = false;
        const statusText = document.getElementById('sw-status-text');
        if(!statusText) return;

        try {
            let useNative = false;
            if ('BarcodeDetector' in window) {
                const supportedFormats = await BarcodeDetector.getSupportedFormats();
                if (supportedFormats.includes('code_128') || supportedFormats.includes('qr_code')) useNative = true;
            }

            if (useNative) {
                document.getElementById('sw-video-preview').style.display = 'block';
                this.barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'qr_code', 'ean_13'] });
                
                this.nativeVideoStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, advanced: [{ focusMode: 'continuous' }] }
                }).catch(async () => await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } } }));
                
                const videoEl = document.getElementById('sw-video-preview');
                videoEl.srcObject = this.nativeVideoStream;
                videoEl.onloadedmetadata = () => { videoEl.play(); this.detectNativeBarcode(videoEl); };
                statusText.textContent = 'Caméra active (Native ⚡) — prête à scanner';
            } else {
                this.startFallbackScanner();
            }
        } catch (e) {
            this.startFallbackScanner();
        }
    },

    async startFallbackScanner() {
        document.getElementById('sw-video-preview').style.display = 'none';
        document.getElementById('sw-reader').style.display = 'block';
        
        if (!this.html5QrCode) this.html5QrCode = new Html5Qrcode("sw-reader");
        
        try {
            await this.html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, formatsToSupport: [ window.Html5QrcodeSupportedFormats.CODE_128, window.Html5QrcodeSupportedFormats.QR_CODE ] },
                (decodedText) => this.onScanSuccess(decodedText),
                () => {}
            );
            document.getElementById('sw-status-text').textContent = 'Caméra active (Compatibilité) — prête à scanner';
        } catch (e) {
            document.getElementById('sw-status-text').textContent = '⚠️ Caméra non disponible — saisie manuelle requise';
        }
    },

    async detectNativeBarcode(videoEl) {
        if (!this.scannerActive || !this.nativeVideoStream) return;
        if (videoEl.readyState >= 2 && !this.isScanningPaused) {
            try {
                const barcodes = await this.barcodeDetector.detect(videoEl);
                if (barcodes.length > 0) this.onScanSuccess(barcodes[0].rawValue);
            } catch (e) {}
        }
        this.scanAnimationFrame = requestAnimationFrame(() => this.detectNativeBarcode(videoEl));
    },

    async stopScanner() {
        this.scannerActive = false;
        if (this.scanAnimationFrame) cancelAnimationFrame(this.scanAnimationFrame);
        if (this.nativeVideoStream) this.nativeVideoStream.getTracks().forEach(t => t.stop());
        if (this.html5QrCode && this.html5QrCode.isScanning) await this.html5QrCode.stop().catch(e=>console.log(e));
    },

    onScanSuccess(decodedText) {
        if (this.isScanningPaused) return;
        let text = decodedText.trim().toUpperCase();
        const refMatch = text.match(/([A-Z]{2})[-_.\s]*(\d{3})[-_.\s]*([A-Z0-9]+(?:_[0-9]+)*)/i);
        if (refMatch) text = `${refMatch[1]}-${refMatch[2]}-${refMatch[3]}`.toUpperCase();

        this.processScan(text);
    },

    processManualScan() {
        const input = document.getElementById('sw-manual-ref');
        if (input.value.trim().length > 2) {
            this.processScan(input.value.trim().toUpperCase());
            input.value = '';
            input.blur();
        }
    },

    async processScan(text) {
        if (this.lastScanText === text && Date.now() - this.lastScanTime < 3000) return;
        this.lastScanText = text;
        this.lastScanTime = Date.now();

        this.isScanningPaused = true;
        
        // Étiquette = `<ref>_<labelIndex>_<uniqueId>` : on retire uniquement
        // ce suffixe `_n_n` (robuste quel que soit le format de la ref).
        const baseRefMatch = text.match(/^(.+)_\d+_\d+$/);
        const baseRef = (baseRefMatch ? baseRefMatch[1] : text).trim();
        
        const logData = {
            scanRef: text,
            date: new Date().toISOString(),
            type: 'REMISE_CLIENT',
            agent: sessionStorage.getItem('userName') || 'Agent',
            agency: sessionStorage.getItem('currentActiveAgency') || 'abidjan'
        };

        this.stats.total++;

        try {
            const qLiv = query(collection(db, getCollectionName('livraisons')), where('ref', '==', baseRef), limit(1));
            const snapLiv = await getDocs(qLiv);

            if (!snapLiv.empty) {
                const docId = snapLiv.docs[0].id;
                const data = snapLiv.docs[0].data();
                const clientName = data.destinataire || data.expediteur || 'Client inconnu';

                // ── MULTI-LABELS : on scanne les sous-colis un par un ─────
                // labels = liste des labels prévus pour cette livraison.
                // scannedLabels = ceux DÉJÀ scannés (lus depuis scanHistory).
                const labelsTotal = Array.isArray(data.labels) && data.labels.length > 0
                    ? data.labels
                    : [data.ref];
                const alreadyScanned = new Set(
                    (data.scanHistory || [])
                        .filter((s) => s && s.type === 'REMISE_CLIENT' && s.scanRef)
                        .map((s) => s.scanRef)
                );

                // Le scan d'AUJOURD'HUI est-il déjà fait ?
                const isDuplicate = alreadyScanned.has(text);
                // Le scan correspond-il à un label connu ? Si oui on peut compter,
                // sinon on tolère (le user a saisi la baseRef pour valider d'un coup).
                const isKnownLabel = labelsTotal.includes(text);
                const scanIsBaseRef = text === baseRef && labelsTotal.length > 1 && !isKnownLabel;

                if (data.status === 'LIVRE') {
                    // Livraison déjà entièrement livrée → toujours doublon.
                    this.stats.duplicate++;
                    logData.status = 'DOUBLON';
                    this.addRecentScan(text, clientName, 'Déjà livré', 'warn');
                    if (this.isSoundEnabled && navigator.vibrate) navigator.vibrate([50, 50, 50]);
                } else if (isDuplicate) {
                    // Ce label précis a déjà été scanné dans une session précédente.
                    this.stats.duplicate++;
                    logData.status = 'DOUBLON';
                    this.addRecentScan(text, clientName, `Déjà scanné · ${alreadyScanned.size}/${labelsTotal.length}`, 'warn');
                    if (this.isSoundEnabled && navigator.vibrate) navigator.vibrate([50, 50, 50]);
                } else {
                    // Calcul du compteur APRES ce nouveau scan.
                    // Si l'utilisateur scanne la baseRef d'un colis multi-labels,
                    // on considère qu'il « valide tout d'un coup ».
                    const nowCount = scanIsBaseRef
                        ? labelsTotal.length
                        : (isKnownLabel ? alreadyScanned.size + 1 : Math.min(alreadyScanned.size + 1, labelsTotal.length));
                    const allDone = nowCount >= labelsTotal.length;

                    const updates = {
                        scanHistory: arrayUnion({ scanRef: text, date: new Date().toISOString(), type: 'REMISE_CLIENT' }),
                    };
                    if (allDone) {
                        updates.status = 'LIVRE';
                        updates.dateLivraison = new Date().toISOString();
                        updates.quantiteLivree = labelsTotal.length;
                        updates.quantiteRestante = 0;
                    } else {
                        updates.quantiteLivree = nowCount;
                        updates.quantiteRestante = labelsTotal.length - nowCount;
                    }
                    await updateDoc(doc(db, getCollectionName('livraisons'), docId), updates);

                    this.stats.success++;
                    logData.status = 'SUCCES';
                    const msg = allDone
                        ? `Livré · ${nowCount}/${labelsTotal.length} ✔`
                        : `Reçu · ${nowCount}/${labelsTotal.length} colis`;
                    this.addRecentScan(text, clientName, msg, 'ok');
                    if (this.isSoundEnabled && navigator.vibrate) navigator.vibrate([30, 20, 30]);
                }

                // Ajouter aux éléments à partager (Évite les doublons stricts).
                if (!this.sessionItemsToShare.some(i => i.scanRef === text)) {
                    this.sessionItemsToShare.push({
                        scanRef: text,
                        client: clientName,
                        baseRef,
                        livraisonId: docId,
                        adresse: data.lieuLivraison || data.adresseDestinataire || '',
                        telephone: data.numero || data.tel || '',
                    });
                    this.updateSessionUI();
                }

            } else {
                this.stats.error++;
                logData.status = 'ERREUR';
                this.addRecentScan(text, 'Non trouvé en base', 'Colis inconnu', 'err');
                if(this.isSoundEnabled && navigator.vibrate) navigator.vibrate([100, 50, 100]);
            }
        } catch(e) { 
            console.error(e); 
            this.stats.error++;
            logData.status = 'ERREUR';
            this.app.showToast("Erreur de connexion", "error"); 
        }
        
        addDoc(collection(db, 'scan_logs'), logData).catch(e => console.error("Log error", e));
        this.updateKPIs();
        setTimeout(() => { this.isScanningPaused = false; }, 1500);
    },

    addRecentScan(ref, client, msg, type) {
        this.recentScans.unshift({ ref, client, msg, type });
        if (this.recentScans.length > 50) this.recentScans.pop();
        
        const countEl = document.getElementById('sc-count');
        if (countEl) countEl.textContent = this.recentScans.filter(s => s.type === 'ok').length;

        const list = document.getElementById('sw-recent-list');
        if (!list) return;
        list.innerHTML = this.recentScans.map(s => `
            <div class="scan-item">
                <div class="scan-item-info">
                    <span class="scan-item-ref">${s.ref}</span>
                    <span class="scan-item-client">${s.client}</span>
                </div>
                <span class="scan-item-status status-${s.type}">${s.msg}</span>
            </div>
        `).join('');
    },

    // ==========================================
    // GESTION DES PHOTOS ET PARTAGE WHATSAPP
    // ==========================================

    compressImageForReadability(file) {
        return new Promise((resolve) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1920; 
                if (width > height) { if (width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; } } 
                else { if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => { resolve(blob); }, 'image/jpeg', 0.8); 
            };
            img.src = objectUrl;
        });
    },

    async handlePhotoCapture(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        this.app.showToast("Compression des photos en cours...", "info");
        for (let file of files) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const compressedBlob = await this.compressImageForReadability(file);
                const compressedFile = new File([compressedBlob], `Preuve_${Date.now()}.jpg`, { type: "image/jpeg" });
                const previewUrl = URL.createObjectURL(compressedBlob);
                this.capturedPhotos.push({ previewUrl: previewUrl, file: compressedFile, type: 'image' });
            } catch (e) { console.error("Erreur compression :", e); }
        }
        this.updateSessionUI();
        event.target.value = '';
    },

    // ── GÉOLOCALISATION ─────────────────────────────────────────────────
    // Capture la position GPS du livreur AU MOMENT de la remise. La position
    // est jointe au message WhatsApp final (lien Google Maps) et persistée
    // sur la livraison côté Firestore (champ gpsLivraison).
    captureGPS() {
        if (!navigator.geolocation) {
            this.app.showToast("Géolocalisation non disponible sur cet appareil.", "error");
            return;
        }
        const iconEl = document.getElementById('liv-gps-icon');
        const textEl = document.getElementById('liv-gps-text');
        if (iconEl) iconEl.textContent = '⏳';
        if (textEl) textEl.textContent = 'Localisation…';

        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            this.deliveryGeo = { lat: latitude, lng: longitude, accuracy: Math.round(accuracy || 0) };
            // Persister sur chaque livraison de la session.
            this.sessionItemsToShare.forEach((item) => {
                if (item.livraisonId) {
                    updateDoc(doc(db, getCollectionName('livraisons'), item.livraisonId), {
                        gpsLivraison: { lat: latitude, lng: longitude, accuracy: this.deliveryGeo.accuracy, capturedAt: new Date().toISOString() },
                    }).catch((e) => console.warn('GPS update livraison:', e));
                }
            });
            const info = document.getElementById('liv-gps-info');
            if (info) {
                info.style.display = 'block';
                info.textContent = `✓ GPS capturé (précision ${this.deliveryGeo.accuracy} m)`;
            }
            if (iconEl) iconEl.textContent = '✓';
            if (textEl) textEl.textContent = 'Géolocalisé';
            this.app.showToast("📍 Position GPS enregistrée", "success");
        }, (err) => {
            console.warn('GPS error:', err);
            if (iconEl) iconEl.textContent = '🎯';
            if (textEl) textEl.textContent = 'Géolocaliser';
            const msg = err.code === 1
                ? "Permission refusée. Activez la localisation dans les paramètres du navigateur."
                : (err.code === 3 ? "Délai dépassé. Réessayez à l'extérieur." : "Impossible de récupérer la position.");
            this.app.showToast(msg, "error");
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    },

    // ── MODIFICATION D'ADRESSE DESTINATAIRE ─────────────────────────────
    // Le livreur peut corriger / préciser l'adresse réelle de remise sur
    // place. La mise à jour est appliquée à toutes les livraisons de la
    // session (utile car un client peut avoir plusieurs colis groupés).
    async editAddress() {
        if (this.sessionItemsToShare.length === 0) {
            this.app.showToast("Scannez d'abord un colis pour modifier son adresse.", "info");
            return;
        }
        const current = this.sessionItemsToShare[0].adresse || '';
        const next = window.prompt("Nouvelle adresse de livraison (vide = inchangée) :", current);
        if (next === null) return; // user a annulé
        const cleaned = String(next).trim();
        if (!cleaned || cleaned === current) return;

        // Update toutes les livraisons de la session + update local.
        const updates = this.sessionItemsToShare.map((item) =>
            item.livraisonId
                ? updateDoc(doc(db, getCollectionName('livraisons'), item.livraisonId), { lieuLivraison: cleaned })
                    .catch((e) => console.warn('Adresse update:', e))
                : null
        ).filter(Boolean);
        await Promise.all(updates);
        this.sessionItemsToShare.forEach((item) => { item.adresse = cleaned; });
        this.updateSessionUI();
        this.app.showToast("✓ Adresse mise à jour", "success");
    },

    updateSessionUI() {
        // Met à jour le compteur de colis
        const countEl = document.getElementById('liv-session-count');
        if(countEl) countEl.textContent = `${this.sessionItemsToShare.length} colis prêt(s)`;

        // Active le bouton WA s'il y a au moins 1 colis ou 1 photo
        const btnWa = document.getElementById('btn-wa-liv');
        if(btnWa) btnWa.disabled = (this.sessionItemsToShare.length === 0 && this.capturedPhotos.length === 0);

        // Bloc adresse : visible UNIQUEMENT s'il y a au moins un colis scanné.
        const addrBlock = document.getElementById('liv-addr-block');
        const addrCurrent = document.getElementById('liv-addr-current');
        if (addrBlock && addrCurrent) {
            if (this.sessionItemsToShare.length > 0) {
                addrBlock.style.display = 'block';
                const adr = this.sessionItemsToShare[0].adresse || '(adresse non renseignée)';
                addrCurrent.textContent = adr;
            } else {
                addrBlock.style.display = 'none';
            }
        }

        // Met à jour la liste des photos
        const row = document.getElementById('liv-photos-row');
        if(row) {
            row.innerHTML = `
                <div class="photo-add-btn" onclick="document.getElementById('liv-photoInput').click()">
                    <i class="fas fa-camera" style="font-size:20px; margin-bottom:5px;"></i><span style="font-size:11px;font-weight:600;">Ajouter</span>
                </div>
            ` + this.capturedPhotos.map((p, i) => `
                <div style="position:relative; flex-shrink:0;">
                    <img src="${p.previewUrl}" class="photo-thumb">
                    <button onclick="window.app.views.scanLivrer.deletePhoto(${i})" style="position:absolute; top:-5px; right:-5px; background:#ef4444; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.2);">✕</button>
                </div>
            `).join('');
        }
    },

    deletePhoto(index) {
        this.capturedPhotos.splice(index, 1);
        this.updateSessionUI();
    },

    async sendToWhatsApp() {
        if (this.sessionItemsToShare.length === 0 && this.capturedPhotos.length === 0) return;

        const clients = [...new Set(this.sessionItemsToShare.map(i => i.client))].join(', ');
        const refs = this.sessionItemsToShare.map(i => `- ${i.scanRef}`).join('\n');

        // ── Adresse + GPS (si capturés) ────────────────────────────────
        const adresse = this.sessionItemsToShare[0]?.adresse || '';
        const gps = this.deliveryGeo;
        const mapsLink = gps
            ? `https://www.google.com/maps?q=${gps.lat},${gps.lng}`
            : '';

        const richMessage = [
            `✅ *Remise de colis effectuée*`,
            `👤 Client(s) : ${clients || 'Non spécifié'}`,
            `📦 Colis remis : ${this.sessionItemsToShare.length}`,
            adresse ? `📍 Adresse : ${adresse}` : '',
            mapsLink ? `🗺️ Position : ${mapsLink}` : '',
            ``,
            refs,
        ].filter(Boolean).join('\n');

        try {
            const filesToShare = this.capturedPhotos.map(p => p.file);
            const shareData = { text: richMessage };
            if (filesToShare.length > 0) shareData.files = filesToShare;

            if (navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
                this.app.showToast('📤 Partage effectué !', 'success');
                
                // Nettoyage après partage
                this.sessionItemsToShare = [];
                this.capturedPhotos = [];
                this.deliveryGeo = null;
                this.updateSessionUI();
            } else {
                // Fallback texte seul si navigateur non compatible avec partage de fichiers
                window.open(`https://wa.me/?text=${encodeURIComponent(richMessage)}`, '_blank');
                this.app.showToast('📱 WhatsApp ouvert (Texte seul)', 'success');
                this.sessionItemsToShare = [];
                this.capturedPhotos = [];
                this.deliveryGeo = null;
                this.updateSessionUI();
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.warn('Share API error:', e);
                this.app.showToast('Erreur lors du partage', 'error');
            }
        }
    }
};