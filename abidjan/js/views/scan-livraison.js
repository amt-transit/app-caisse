
import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, limit, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ScanLivraisonView = {
    scannerActive: false,
    nativeVideoStream: null,
    html5QrCode: null,
    barcodeDetector: null,
    scanAnimationFrame: null,
    isScanningPaused: false,
    lastScanText: '',
    lastScanTime: 0,
    recentScans: [],
    stats: { total: 0, success: 0, duplicate: 0, error: 0 },
    isSoundEnabled: true,

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.scanLivraison = this;
        this.recentScans = [];
        this.stats = { total: 0, success: 0, duplicate: 0, error: 0 };

        const html = `
            <style>
                .sw-page { max-width: 800px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .sm__header { border-radius: 16px; padding: 20px; margin-bottom: 20px; color: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); background: linear-gradient(135deg, rgb(16, 185, 129) 0%, rgb(5, 150, 105) 100%); }
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

                .container-selector { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .container-selector label { font-weight: 700; color: #1e293b; font-size: 14px; }
                .container-select-input { width: 100%; padding: 14px 16px; border: 2px solid #cbd5e1; border-radius: 12px; font-size: 16px; font-weight: bold; color: #0f172a; outline: none; transition: 0.2s; background: #f8fafc; }
                .container-select-input:focus { border-color: #10b981; background: white; box-shadow: 0 0 0 3px rgba(16,185,129,0.1); }

                .viewfinder-wrap { position: relative; border-radius: 16px; overflow: hidden; background: #000; aspect-ratio: 1/1; max-height: 400px; width: 100%; margin-bottom: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); }
                #sw-video-preview, #sw-reader { width: 100%; height: 100%; object-fit: cover; display: block; }
                #sw-reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; }
                
                .viewfinder-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
                .viewfinder-box { width: 65%; aspect-ratio: 1; border: 3px solid rgba(16,185,129,0.85); border-radius: 16px; box-shadow: 0 0 0 9999px rgba(15,23,42,0.6); position: relative; }
                .viewfinder-box::before, .viewfinder-box::after { content: ''; position: absolute; width: 30px; height: 30px; border-color: #10b981; border-style: solid; }
                .viewfinder-box::before { top: -3px; left: -3px; border-width: 4px 0 0 4px; border-radius: 8px 0 0 0; }
                .viewfinder-box::after { bottom: -3px; right: -3px; border-width: 0 4px 4px 0; border-radius: 0 0 8px 0; }
                
                .scan-line { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #10b981, transparent); animation: scan-anim 2s ease-in-out infinite; border-radius: 1px; box-shadow: 0 0 8px #10b981; }
                @keyframes scan-anim { 0% { top: 5%; opacity: 1; } 50% { top: 90%; opacity: 0.7; } 100% { top: 5%; opacity: 1; } }

                .scan-status { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; margin-bottom: 20px; color: #1e293b; }
                .scan-dot { width: 10px; height: 10px; border-radius: 50%; background: #10b981; animation: blink 1.2s ease-in-out infinite; flex-shrink: 0; }
                @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

                .manual-row { display: flex; gap: 10px; margin-bottom: 25px; }
                .manual-input { flex: 1; padding: 14px 16px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 15px; font-weight: 600; outline: none; text-transform: uppercase; transition: 0.2s; }
                .manual-input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.1); }
                .btn-search { padding: 14px 20px; background: #10b981; border: none; border-radius: 12px; color: white; font-weight: bold; cursor: pointer; transition: 0.2s; }
                .btn-search:hover { background: #059669; }

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
                            <span class="sm__header-icon">🚚</span>
                            <div>
                                <h1 class="sm__header-title">Mise en Livraison</h1>
                                <p class="sm__header-desc">Assignez les colis à un livreur et créez la tournée du jour.</p>
                            </div>
                        </div>
                        <div class="sm__header-actions">
                            <button class="sm__btn-sound" id="btn-sound-sl" type="button" title="Activer/Désactiver le son" onclick="window.app.views.scanLivraison.toggleSound()">🔊</button>
                            <button class="sm__btn-clear" type="button" title="Effacer la session" onclick="window.app.views.scanLivraison.clearSession()">🗑️</button>
                        </div>
                    </div>
                </div>
                
                <div class="sm__kpi-row">
                    <div class="sm__kpi sm__kpi--blue"><div class="sm__kpi-val" id="sl-kpi-total">0</div><div class="sm__kpi-lbl">Total</div></div>
                    <div class="sm__kpi sm__kpi--green"><div class="sm__kpi-val" id="sl-kpi-success">0</div><div class="sm__kpi-lbl">Succès</div></div>
                    <div class="sm__kpi sm__kpi--orange"><div class="sm__kpi-val" id="sl-kpi-duplicate">0</div><div class="sm__kpi-lbl">Déjà traité</div></div>
                    <div class="sm__kpi sm__kpi--red"><div class="sm__kpi-val" id="sl-kpi-error">0</div><div class="sm__kpi-lbl">Erreurs</div></div>
                </div>

                <div class="container-selector">
                    <label>Sélectionnez le livreur assigné :</label>
                    <select id="sl-target-driver" class="container-select-input">
                        <option value="">-- Choisir un chauffeur --</option>
                    </select>
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
                    <input type="text" class="manual-input" id="sw-manual-ref" placeholder="Saisir la référence manuellement..." onkeydown="if(event.key==='Enter') window.app.views.scanLivraison.processManualScan()">
                    <button class="btn-search" onclick="window.app.views.scanLivraison.processManualScan()">Assigner</button>
                </div>

                <div class="recent-scans">
                    <div class="recent-scans-header">
                        <span>📋 Colis assignés dans la session</span>
                        <span class="recent-count" id="sc-count">0</span>
                    </div>
                    <div id="sw-recent-list">
                        <div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 14px;">Aucun colis assigné pour le moment.</div>
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

        this.loadDrivers();
        this.loadScannerScript();
    },

    toggleSound() {
        this.isSoundEnabled = !this.isSoundEnabled;
        const btn = document.getElementById('btn-sound-sl');
        if (btn) btn.textContent = this.isSoundEnabled ? '🔊' : '🔇';
    },

    clearSession() {
        if (confirm("Voulez-vous vraiment effacer les données de scan de cette session ?")) {
            this.stats = { total: 0, success: 0, duplicate: 0, error: 0 };
            this.recentScans = [];
            this.updateKPIs();
            const list = document.getElementById('sw-recent-list');
            if (list) list.innerHTML = '<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 14px;">Aucun colis assigné pour le moment.</div>';
        }
    },

    updateKPIs() {
        document.getElementById('sl-kpi-total').textContent = this.stats.total;
        document.getElementById('sl-kpi-success').textContent = this.stats.success;
        document.getElementById('sl-kpi-duplicate').textContent = this.stats.duplicate;
        document.getElementById('sl-kpi-error').textContent = this.stats.error;
    },

    async loadDrivers() {
        try {
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
            const usersSnap = await getDocs(collection(db, "users"));
            const agentsSnap = await getDocs(collection(db, "agents"));
            
            const select = document.getElementById('sl-target-driver');
            if (!select) return;

            const driverMap = new Map();
            usersSnap.forEach(doc => {
                const data = doc.data();
                if ((data.role === 'chauf' || data.isChauffeur) && (data.agency === activeAgency || data.agency === 'all')) {
                    const name = data.displayName || data.email || 'Inconnu';
                    driverMap.set(name.toLowerCase().trim(), name);
                }
            });
            agentsSnap.forEach(doc => {
                const data = doc.data();
                const name = data.name;
                if (name && (data.agency === activeAgency || data.agency === 'all')) {
                    driverMap.set(name.toLowerCase().trim(), name);
                }
            });

            Array.from(driverMap.values()).sort().forEach(driver => {
                const opt = document.createElement('option');
                opt.value = driver;
                opt.textContent = driver;
                select.appendChild(opt);
            });
        } catch(e) { console.error("Erreur chargement chauffeurs", e); }
    },

    loadScannerScript() {
        if (window.Html5Qrcode) {
            this.startHybridScanner();
            return;
        }
        const script = document.createElement('script');
        script.src = "<https://unpkg.com/html5-qrcode>";
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
        const targetDriver = document.getElementById('sl-target-driver')?.value;
        if (!targetDriver) {
            this.app.showToast("⚠️ Sélectionnez d'abord un chauffeur !", "error");
            if(navigator.vibrate) navigator.vibrate([100,50,100]);
            return;
        }

        if (this.lastScanText === text && Date.now() - this.lastScanTime < 3000) return;
        this.lastScanText = text;
        this.lastScanTime = Date.now();

        this.isScanningPaused = true;
        
        const baseRefMatch = text.match(/^([A-Z]{2}[-_\s.]\d{3}[-_\s.][A-Z0-9]+)(?:_.*)?$/i);
        const baseRef = baseRefMatch ? baseRefMatch[1] : text;
        
        const logData = {
            scanRef: text,
            date: new Date().toISOString(),
            type: 'MISE_EN_LIVRAISON',
            agent: sessionStorage.getItem('userName') || 'Agent',
            agency: sessionStorage.getItem('currentActiveAgency') || 'abidjan',
            livreur: targetDriver
        };

        this.stats.total++;

        try {
            const qLiv = query(collection(db, 'livraisons'), where('ref', '==', baseRef), limit(1));
            const snapLiv = await getDocs(qLiv);

            if (!snapLiv.empty) {
                const docId = snapLiv.docs[0].id;
                const data = snapLiv.docs[0].data();
                
                const isAlreadyScanned = data.scanHistory && data.scanHistory.some(s => s.scanRef === text && s.type === 'MISE_EN_LIVRAISON');

                if (isAlreadyScanned) {
                    this.stats.duplicate++;
                    logData.status = 'DOUBLON';
                    this.addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Déjà en livraison', 'warn');
                    if (this.isSoundEnabled && navigator.vibrate) navigator.vibrate([50, 50, 50]);
                } else {
                    const today = new Date().toISOString().split('T')[0];
                    // Mettre à jour avec le livreur et statut EN_COURS
                    await updateDoc(doc(db, 'livraisons', docId), {
                        status: 'EN_COURS',
                        livreur: targetDriver,
                        dateProgramme: today,
                        scanHistory: arrayUnion({ scanRef: text, date: new Date().toISOString(), type: 'MISE_EN_LIVRAISON', livreur: targetDriver })
                    });
    
                    this.stats.success++;
                    logData.status = 'SUCCES';
                    this.addRecentScan(text, data.destinataire || data.expediteur || 'Client inconnu', 'Mis en livraison', 'ok');
                    if (this.isSoundEnabled && navigator.vibrate) navigator.vibrate([30, 20, 30]);
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
    }
};
