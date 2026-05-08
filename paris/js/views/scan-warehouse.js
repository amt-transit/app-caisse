import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ScanWarehouseView = {
    scannerActive: false,
    nativeVideoStream: null,
    html5QrCode: null,
    barcodeDetector: null,
    scanAnimationFrame: null,
    isScanningPaused: false,
    lastScanText: '',
    lastScanTime: 0,
    recentScans: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.scanWarehouse = this;
        this.recentScans = [];

        const html = `
            <style>
                .sw-page { max-width: 800px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .sw-header { background: white; border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .sw-header__icon { font-size: 28px; background: #eef2ff; color: #4f46e5; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .sw-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .sw-header__sub { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }

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
                .status-err { background: #fee2e2; color: #991b1b; }
            </style>

            <div class="sw-page" id="sw-page">
                <div class="sw-header">
                    <div class="sw-header__icon"><i class="fas fa-warehouse"></i></div>
                    <div>
                        <h1 class="sw-header__title">Mise en entrepôt</h1>
                        <p class="sw-header__sub">Scannez les colis reçus à Paris pour les marquer comme "En Entrepôt"</p>
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
                    <span id="sw-status-text">Initialisation de la caméra...</span>
                </div>

                <div class="manual-row">
                    <input type="text" class="manual-input" id="sw-manual-ref" placeholder="Saisir la référence manuellement..." onkeydown="if(event.key==='Enter') window.app.views.scanWarehouse.processManualScan()">
                    <button class="btn-search" onclick="window.app.views.scanWarehouse.processManualScan()">Valider</button>
                </div>

                <div class="recent-scans">
                    <div class="recent-scans-header">📋 Derniers scans de la session</div>
                    <div id="sw-recent-list">
                        <div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 14px;">Aucun colis scanné pour le moment.</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;

        // Sécurité : Arrêter la caméra si on change de page dans la SPA
        const observer = new MutationObserver(() => {
            if (!document.body.contains(document.getElementById('sw-page'))) {
                this.stopScanner();
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        this.loadScannerScript();
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
        if(!statusText) return; // Sécurité

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
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
        
        const baseRefMatch = text.match(/^([A-Z]{2}[-_\s.]\d{3}[-_\s.][A-Z0-9]+)(?:_.*)?$/i);
        const baseRef = baseRefMatch ? baseRefMatch[1] : text;

        try {
            const q = query(collection(db, 'livraisons'), where('ref', '==', baseRef), limit(1));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const docId = snap.docs[0].id;
                const data = snap.docs[0].data();
                await updateDoc(doc(db, 'livraisons', docId), {
                    containerStatus: 'PARIS',
                    scanHistory: arrayUnion({ scanRef: text, date: new Date().toISOString(), type: 'ENTREPOT_PARIS' })
                });
                this.addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Mise en entrepôt OK', 'ok');
            } else {
                this.addRecentScan(text, 'Non trouvé en base', 'Colis inconnu', 'err');
                if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
            }
        } catch(e) { console.error(e); this.app.showToast("Erreur de connexion", "error"); }

        setTimeout(() => { this.isScanningPaused = false; }, 1500);
    },

    addRecentScan(ref, client, msg, type) {
        this.recentScans.unshift({ ref, client, msg, type });
        if (this.recentScans.length > 50) this.recentScans.pop();
        
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
    }
};