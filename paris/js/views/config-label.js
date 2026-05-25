export const ConfigLabelView = {
    settings: {
        format: 'A5',
        model: 'classic',
        colorScheme: 'default',
        headerColor: '#000000',
        aerienHeaderColor: '#1A3553'
    },

    render(app) {
        this.app = app;
        this.isAerien = sessionStorage.getItem('shippingMode') === 'aerien';
        this.loadSavedSettings();

        const aerienBanner = this.isAerien ? `
                <div style="background: linear-gradient(135deg, #1A3553, #E51F21); color: #fff; border-radius: 14px; padding: 14px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 26px;">✈️</span>
                    <div>
                        <div style="font-weight: 800; font-size: 15px;">Étiquette AÉRIENNE « PAR AVION »</div>
                        <div style="font-size: 12px; opacity: 0.9;">Design dédié, différent du maritime, avec le poids affiché par colis. Réglez ci-dessous la couleur de la bande.</div>
                    </div>
                </div>` : '';

        const configPanel = this.isAerien ? this.renderAerienConfigPanel() : this.renderMaritimeConfigPanel();

        const html = `
            <div class="page" style="max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease;">
                ${aerienBanner}
                <div style="display: grid; grid-template-columns: 320px 1fr; gap: 25px; align-items: start;">
                    ${configPanel}
                    <!-- Aperçu -->
                    <div style="background: #f8fafc; padding: 40px; border-radius: 24px; border: 1px dashed #cbd5e1; display: flex; flex-direction: column; align-items: center; min-height: 550px;">
                        <div id="labelPreviewContainer" style="transition: all 0.3s ease; transform-origin: top center;"></div>
                        <p style="margin-top: 20px; color: #64748b; font-size: 13px; font-style: italic;"><i class="fas fa-info-circle"></i> Aperçu tel qu'il apparaîtra sur l'imprimante thermique</p>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        window.app.views = window.app.views || {};
        window.app.views.configLabel = this;

        this.updatePreview();
    },

    renderMaritimeConfigPanel() {
        return `
                    <!-- Panneau de configuration -->
                    <div style="background: white; padding: 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                        <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 800; color: #0f172a;">
                            <i class="fas fa-tag"></i> Configuration étiquette
                        </h3>

                        <!-- Format -->
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block;">
                                📏 Format de papier
                            </label>
                            <select id="labelFormat" class="config-select" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; font-weight: 500;" onchange="window.app.views.configLabel.updatePreview()">
                                <option value="A5" ${this.settings.format === 'A5' ? 'selected' : ''}>A5 Paysage (210 x 148 mm)</option>
                                <option value="A6" ${this.settings.format === 'A6' ? 'selected' : ''}>A6 Paysage (148 x 105 mm)</option>
                            </select>
                        </div>

                        <!-- Modèle -->
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block;">
                                🏷️ Modèle d'étiquette
                            </label>
                            <select id="labelModel" class="config-select" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; font-weight: 500;" onchange="window.app.views.configLabel.updatePreview()">
                                <option value="classic" ${this.settings.model === 'classic' ? 'selected' : ''}>Classique AMT (Design original)</option>
                                <option value="compact" ${this.settings.model === 'compact' ? 'selected' : ''}>Compact (QR Code Focus)</option>
                                <option value="premium" ${this.settings.model === 'premium' ? 'selected' : ''}>Premium (Design moderne)</option>
                            </select>
                        </div>

                        <!-- Thème de couleur -->
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block;">
                                🎨 Thème de couleur
                            </label>
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                                <div class="color-option ${this.settings.colorScheme === 'default' ? 'active' : ''}" data-color="default" onclick="window.app.views.configLabel.setColorScheme('default')" style="cursor: pointer; border-radius: 10px; overflow: hidden; border: 2px solid ${this.settings.colorScheme === 'default' ? '#3b82f6' : '#e2e8f0'};">
                                    <div style="background: linear-gradient(135deg, #1e3a5f, #0f172a); width: 100%; height: 40px;"></div>
                                    <span style="font-size: 11px; text-align: center; display: block; margin: 5px 0;">Classique</span>
                                </div>
                                <div class="color-option ${this.settings.colorScheme === 'blue' ? 'active' : ''}" data-color="blue" onclick="window.app.views.configLabel.setColorScheme('blue')" style="cursor: pointer; border-radius: 10px; overflow: hidden; border: 2px solid ${this.settings.colorScheme === 'blue' ? '#3b82f6' : '#e2e8f0'};">
                                    <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); width: 100%; height: 40px;"></div>
                                    <span style="font-size: 11px; text-align: center; display: block; margin: 5px 0;">Bleu</span>
                                </div>
                                <div class="color-option ${this.settings.colorScheme === 'green' ? 'active' : ''}" data-color="green" onclick="window.app.views.configLabel.setColorScheme('green')" style="cursor: pointer; border-radius: 10px; overflow: hidden; border: 2px solid ${this.settings.colorScheme === 'green' ? '#3b82f6' : '#e2e8f0'};">
                                    <div style="background: linear-gradient(135deg, #065f46, #10b981); width: 100%; height: 40px;"></div>
                                    <span style="font-size: 11px; text-align: center; display: block; margin: 5px 0;">Vert</span>
                                </div>
                            </div>
                        </div>

                        <!-- Bandeau Couleur -->
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block;">
                                🖌️ Couleur du bandeau (En-tête & Logo)
                            </label>
                            <input type="color" id="labelHeaderColor" value="${this.settings.headerColor}" style="width: 100%; height: 40px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; background: white;" onchange="window.app.views.configLabel.settings.headerColor = this.value; window.app.views.configLabel.updatePreview()">
                        </div>

                        <div style="padding-top: 15px; border-top: 1px solid #f1f5f9;">
                            <button class="amt-btn amt-btn-primary" style="width: 100%; justify-content: center; padding: 14px;" onclick="window.app.views.configLabel.saveConfig()">
                                <i class="fas fa-save"></i> Enregistrer par défaut
                            </button>
                            <button class="amt-btn amt-btn-outline" style="width: 100%; justify-content: center; margin-top: 10px;" onclick="window.app.views.configLabel.printTest()">
                                <i class="fas fa-print"></i> Imprimer un test
                            </button>
                        </div>
                    </div>
        `;
    },

    renderAerienConfigPanel() {
        return `
                    <!-- Panneau de configuration AÉRIEN -->
                    <div style="background: white; padding: 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                        <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 800; color: #0f172a;">
                            <i class="fas fa-plane"></i> Étiquette aérienne
                        </h3>

                        <!-- Format -->
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block;">
                                📏 Format de papier
                            </label>
                            <select id="labelFormat" class="config-select" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; font-weight: 500;" onchange="window.app.views.configLabel.updatePreview()">
                                <option value="A5" ${this.settings.format === 'A5' ? 'selected' : ''}>A5 Paysage (210 x 148 mm)</option>
                                <option value="A6" ${this.settings.format === 'A6' ? 'selected' : ''}>A6 Paysage (148 x 105 mm)</option>
                            </select>
                        </div>

                        <!-- Couleur de la bande -->
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block;">
                                🎨 Couleur de la bande d'en-tête
                            </label>
                            <input type="color" id="labelAerienHeaderColor" value="${this.settings.aerienHeaderColor}" style="width: 100%; height: 40px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; background: white;" onchange="window.app.views.configLabel.settings.aerienHeaderColor = this.value; window.app.views.configLabel.updatePreview()">
                            <p style="font-size: 11px; color: #94a3b8; margin: 8px 0 0 0;">Cette couleur habille la bande du logo et les rayures « par avion » du cadre.</p>
                        </div>

                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 20px; font-size: 12px; color: #475569;">
                            ℹ️ Le design aérien est fixe (rayures « PAR AVION » + badge ✈ + poids du colis) pour rester reconnaissable. Seules la couleur et le format sont réglables.
                        </div>

                        <div style="padding-top: 15px; border-top: 1px solid #f1f5f9;">
                            <button class="amt-btn amt-btn-primary" style="width: 100%; justify-content: center; padding: 14px;" onclick="window.app.views.configLabel.saveConfig()">
                                <i class="fas fa-save"></i> Enregistrer par défaut
                            </button>
                            <button class="amt-btn amt-btn-outline" style="width: 100%; justify-content: center; margin-top: 10px;" onclick="window.app.views.configLabel.printTest()">
                                <i class="fas fa-print"></i> Imprimer un test
                            </button>
                        </div>
                    </div>
        `;
    },

    loadSavedSettings() {
        const savedFormat = localStorage.getItem(this.isAerien ? 'amt_label_aerien_format' : 'amt_label_format');
        const savedModel = localStorage.getItem('amt_label_model');
        const savedColor = localStorage.getItem('amt_label_color');
        const savedHeaderColor = localStorage.getItem('amt_label_header_color');
        const savedAerienHeaderColor = localStorage.getItem('amt_label_aerien_header_color');

        if (savedFormat) this.settings.format = savedFormat;
        if (savedModel) this.settings.model = savedModel;
        if (savedColor) this.settings.colorScheme = savedColor;
        if (savedHeaderColor) this.settings.headerColor = savedHeaderColor;
        if (savedAerienHeaderColor) this.settings.aerienHeaderColor = savedAerienHeaderColor;
    },

    setColorScheme(color) {
        this.settings.colorScheme = color;
        this.updatePreview();
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.style.borderColor = '#e2e8f0';
            if (opt.getAttribute('data-color') === color) {
                opt.style.borderColor = '#3b82f6';
            }
        });
    },

    getColorStyles() {
        const colors = {
            default: { border: '#000', text: '#000', accent: '#1e293b' },
            blue: { border: '#1e40af', text: '#1e3a8a', accent: '#2563eb' },
            green: { border: '#065f46', text: '#064e3b', accent: '#059669' }
        };
        return colors[this.settings.colorScheme] || colors.default;
    },

    updatePreview() {
        const format = document.getElementById('labelFormat')?.value || this.settings.format;
        const model = document.getElementById('labelModel')?.value || this.settings.model;
        const colors = this.getColorStyles();
        
        const dimensions = {
            A5: { width: 210, height: 148, scale: 1.1 },
            A6: { width: 148, height: 105, scale: 1 }
        };
        const dim = dimensions[format] || dimensions.A5;
        
        const container = document.getElementById('labelPreviewContainer');

        let contentHtml = '';
        if (this.isAerien) {
            contentHtml = this.renderAerienModel(dim.width, dim.height);
        } else if (model === 'compact') {
            contentHtml = this.renderCompactModel(dim.width, dim.height, colors);
        } else if (model === 'premium') {
            contentHtml = this.renderPremiumModel(dim.width, dim.height, colors);
        } else {
            contentHtml = this.renderClassicModel(dim.width, dim.height, colors);
        }
        
        container.innerHTML = contentHtml;
        
        const labelDiv = document.getElementById('thermalLabel');
        if (labelDiv) {
            labelDiv.style.transform = `scale(${dim.scale})`;
            labelDiv.style.transformOrigin = 'top center';
        }

        setTimeout(() => {
            if (typeof QRCode !== 'undefined') {
                const qrContainer = document.getElementById('previewQRCode');
                if (qrContainer) {
                    qrContainer.innerHTML = '';
                    new QRCode(qrContainer, {
                        text: 'AB-169-D20',
                        width: format === 'A5' ? 180 : 140,
                        height: format === 'A5' ? 180 : 140,
                        correctLevel: QRCode.CorrectLevel.H
                    });
                    const qrImg = qrContainer.querySelector('img') || qrContainer.querySelector('canvas');
                    if(qrImg) {
                        qrImg.style.width = "100%";
                        qrImg.style.height = "100%";
                    }
                }
            }
        }, 100);
    },

    // Modèle Classique AMT (inspiré de votre PDF)
    renderClassicModel(widthMm, heightMm, colors) {
        const isA5 = widthMm === 210;
        const fontSize = isA5 ? '11pt' : '9pt';
        const titleFont = isA5 ? '14pt' : '11pt';
        const refFont = isA5 ? '28pt' : '16pt';
        
        return `
            <div id="thermalLabel" style="width: ${widthMm}mm; height: ${heightMm}mm; background: white; color: ${colors.text}; font-family: 'Arial', sans-serif; box-sizing: border-box; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <div style="height: 100%; display: flex; flex-direction: column; padding: 6mm;">
                    
                    <!-- En-tête avec coordonnées AMT -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${colors.border}; padding-bottom: 3mm; margin-bottom: 4mm;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="background: ${this.settings.headerColor}; padding: 2px 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                                <img src="../LOGOAMT.png" style="height: ${isA5 ? '8mm' : '6mm'}; object-fit: contain;" alt="Logo" />
                            </div>
                            <div>
                                <div style="font-size: ${fontSize}; font-weight: bold;">AMT TRANSIT CI FRET</div>
                                <div style="font-size: ${isA5 ? '9pt' : '7pt'};">81 AV. ARISTIDE BRIAND - 0180893370</div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: ${fontSize};"><strong>DATE</strong> ${new Date().toLocaleDateString()}</div>
                            <div style="font-size: ${fontSize};"><strong>HEURE</strong> ${new Date().toLocaleTimeString()}</div>
                        </div>
                    </div>

                    <!-- Zone QR Code -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5mm;">
                        <div style="font-size: ${titleFont}; font-weight: bold;">AB-169-D20_1_71</div>
                        <div id="previewQRCode" style="width: ${isA5 ? '45mm' : '35mm'}; height: ${isA5 ? '45mm' : '35mm'};"></div>
                    </div>

                    <!-- Informations Destinataire -->
                    <div style="margin-bottom: 5mm;">
                        <div style="font-size: ${titleFont}; font-weight: bold; margin-bottom: 2mm;">DESTINATAIRE</div>
                        <div style="font-size: ${titleFont}; font-weight: bold;">CEDRIC DADIE</div>
                        <div style="font-size: ${fontSize};">0767007528</div>
                    </div>

                    <!-- Informations Expéditeur -->
                    <div style="margin-bottom: 5mm;">
                        <div style="font-size: ${titleFont}; font-weight: bold; margin-bottom: 2mm;">EXPEDITEUR</div>
                        <div style="font-size: ${titleFont}; font-weight: bold;">WILLIAM DADIE</div>
                        <div style="font-size: ${fontSize};">22 ALLEE DES SYCOMORES</div>
                        <div style="font-size: ${fontSize};">95870 BEZONS</div>
                    </div>

                    <!-- Référence principale -->
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; width: 100%;">
                        <div style="font-size: ${refFont}; font-weight: 900; letter-spacing: 2px; word-break: break-all;">AB-169-D20</div>
                        <div style="font-size: ${fontSize}; font-weight: bold; margin-top: 2mm; text-transform: uppercase;">CARTON LONG</div>
                    </div>
                </div>
            </div>
        `;
    },

    renderCompactModel(widthMm, heightMm, colors) {
        const isA5 = widthMm === 210;
        
        return `
            <div id="thermalLabel" style="width: ${widthMm}mm; height: ${heightMm}mm; background: white; color: ${colors.text}; font-family: 'Arial', sans-serif; box-sizing: border-box; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <div style="height: 100%; display: flex; flex-direction: column; padding: 5mm;">
                    
                    <!-- En-tête simplifié -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${colors.border}; padding-bottom: 2mm; margin-bottom: 3mm;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="background: ${this.settings.headerColor}; padding: 2px 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                <img src="../LOGOAMT.png" style="height: ${isA5 ? '6mm' : '4mm'}; object-fit: contain;" alt="Logo" />
                            </div>
                            <div style="font-size: ${isA5 ? '9pt' : '7pt'}; font-weight: bold;">AMT TRANSIT CI FRET<br><span style="font-weight: normal; font-size: ${isA5 ? '8pt' : '6pt'};">81 AV. ARISTIDE BRIAND - 0180893370</span></div>
                        </div>
                        <div style="font-size: ${isA5 ? '8pt' : '7pt'}; text-align: right;">
                            ${new Date().toLocaleDateString()}<br>${new Date().toLocaleTimeString()}
                        </div>
                    </div>

                    <!-- QR Code géant -->
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold; margin-bottom: 3mm;">AB-169-D20_1_71</div>
                        <div id="previewQRCode" style="width: ${isA5 ? '65mm' : '50mm'}; height: ${isA5 ? '65mm' : '50mm'};"></div>
                        <div style="margin-top: 4mm; font-size: ${isA5 ? '16pt' : '14pt'}; font-weight: 900; text-align: center; word-break: break-all; width: 100%;">AB-169-D20</div>
                        <div style="font-size: ${isA5 ? '10pt' : '8pt'}; font-weight: bold; margin-top: 1mm; text-transform: uppercase; color: #475569;">CARTON LONG</div>
                    </div>

                    <!-- Infos minimales -->
                    <div style="display: flex; justify-content: space-between; border-top: 2px solid ${colors.border}; padding-top: 2mm; margin-top: 3mm; font-size: ${isA5 ? '9pt' : '7pt'};">
                        <div><strong>Exp:</strong> WILLIAM DADIE</div>
                        <div><strong>Dest:</strong> CEDRIC DADIE</div>
                    </div>
                </div>
            </div>
        `;
    },

    renderPremiumModel(widthMm, heightMm, colors) {
        const isA5 = widthMm === 210;
        
        return `
            <div id="thermalLabel" style="width: ${widthMm}mm; height: ${heightMm}mm; background: white; color: ${colors.text}; font-family: 'Arial', sans-serif; box-sizing: border-box; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <div style="height: 100%; display: flex; flex-direction: column;">
                    
                    <!-- Bandeau supérieur -->
                    <div style="background: ${this.settings.headerColor}; color: white; padding: 3mm 4mm; display: flex; justify-content: center; align-items: center; gap: 10px;">
                        <div style="background: ${this.settings.headerColor}; padding: 2px 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                            <img src="../LOGOAMT.png" style="height: ${isA5 ? '8mm' : '6mm'}; object-fit: contain;" alt="Logo" />
                        </div>
                        <span style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold; margin: 0;">AMT TRANSIT CI FRET INTERNATIONAL</span>
                    </div>

                    <div style="padding: 5mm; flex: 1; display: flex; flex-direction: column;">
                        
                        <!-- Coordonnées et date -->
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5mm;">
                            <div>
                                <div style="font-size: ${isA5 ? '9pt' : '8pt'};">81 AVENUE ARISTIDE BRIAND, 93240 STAINS</div>
                                <div style="font-size: ${isA5 ? '9pt' : '8pt'};">TEL: 01 80 89 33 70</div>
                            </div>
                            <div style="text-align: right; font-size: ${isA5 ? '8pt' : '7pt'};">
                                ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
                            </div>
                        </div>

                        <!-- QR Code et infos -->
                        <div style="display: flex; gap: 5mm; flex: 1;">
                            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                                <div style="margin-bottom: 3mm;">
                                    <div style="font-size: ${isA5 ? '10pt' : '9pt'}; font-weight: bold; color: ${colors.accent};">📤 EXPÉDITEUR</div>
                                    <div style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold;">WILLIAM DADIE</div>
                                    <div style="font-size: ${isA5 ? '9pt' : '8pt'};">22 ALLEE DES SYCOMORES, 95870 BEZONS</div>
                                </div>
                                <div>
                                    <div style="font-size: ${isA5 ? '10pt' : '9pt'}; font-weight: bold; color: ${colors.accent};">📥 DESTINATAIRE</div>
                                    <div style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold;">CEDRIC DADIE</div>
                                    <div style="font-size: ${isA5 ? '9pt' : '8pt'};">TEL: 07 67 00 75 28</div>
                                    <div style="font-size: ${isA5 ? '9pt' : '8pt'};">COCODY ANGRÉ, ABIDJAN</div>
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <div id="previewQRCode" style="width: ${isA5 ? '50mm' : '40mm'}; height: ${isA5 ? '50mm' : '40mm'};"></div>
                                <span style="font-size: ${isA5 ? '8pt' : '7pt'}; font-weight: bold; margin-top: 2mm;">AB-169-D20_1_71</span>
                            </div>
                        </div>

                        <!-- Référence -->
                        <div style="text-align: center; margin-top: 4mm; padding-top: 3mm; border-top: 2px solid ${colors.border}; width: 100%;">
                            <div style="font-size: ${isA5 ? '24pt' : '16pt'}; font-weight: 900; letter-spacing: 1px; word-break: break-all;">AB-169-D20</div>
                            <div style="font-size: ${isA5 ? '10pt' : '8pt'}; font-weight: bold; margin-top: 1.5mm; text-transform: uppercase; color: #475569;">CARTON LONG</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Aperçu de l'étiquette AÉRIENNE (reflète app.renderAerienLabel)
    renderAerienModel(widthMm, heightMm) {
        const isA5 = widthMm === 210;
        const fontSize = isA5 ? '11pt' : '9pt';
        const titleFont = isA5 ? '14pt' : '11pt';
        const refFont = isA5 ? '26pt' : '20pt';
        const headerColor = this.settings.aerienHeaderColor || '#1A3553';
        const stripe = `repeating-linear-gradient(45deg, #E51F21 0, #E51F21 8px, #ffffff 8px, #ffffff 16px, ${headerColor} 16px, ${headerColor} 24px, #ffffff 24px, #ffffff 32px)`;
        return `
            <div id="thermalLabel" style="width: ${widthMm}mm; height: ${heightMm}mm; background: ${stripe}; padding: 3mm; box-sizing: border-box; font-family: 'Arial', sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <div style="background: #fff; height: 100%; display: flex; flex-direction: column; padding: 4mm; box-sizing: border-box;">
                    <div style="display: flex; justify-content: space-between; align-items: center; background: ${headerColor}; color: #fff; border-radius: 8px; padding: 2mm 3mm; margin-bottom: 3mm;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <img src="../LOGOAMT.png" style="height: ${isA5 ? '9mm' : '6mm'}; object-fit: contain; background: #fff; border-radius: 4px; padding: 2px;" alt="Logo" />
                            <div>
                                <div style="font-size: ${fontSize}; font-weight: bold;">AMT TRANSIT CI FRET</div>
                                <div style="font-size: ${isA5 ? '8pt' : '6pt'};">81 AV. ARISTIDE BRIAND - 0180893370</div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="background: #F2A312; color: #1A3553; font-weight: 900; font-size: ${isA5 ? '13pt' : '10pt'}; padding: 2px 10px; border-radius: 20px; letter-spacing: 1px;">✈ PAR AVION</div>
                            <div style="font-size: ${isA5 ? '7pt' : '6pt'}; margin-top: 1mm; letter-spacing: 1px;">BY AIR · AÉRIEN</div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 3mm;">
                        <div style="flex: 1;">
                            <div style="font-size: ${titleFont}; font-weight: bold; color: #1A3553;">AB-169-D20_1_71</div>
                            <div style="margin-top: 3mm;">
                                <div style="font-size: ${isA5 ? '9pt' : '7pt'}; font-weight: bold; color: #94a3b8; letter-spacing: 1px;">DESTINATAIRE</div>
                                <div style="font-size: ${titleFont}; font-weight: bold;">CEDRIC DADIE</div>
                                <div style="font-size: ${fontSize};">07 67 00 75 28</div>
                            </div>
                            <div style="margin-top: 2mm;">
                                <div style="font-size: ${isA5 ? '9pt' : '7pt'}; font-weight: bold; color: #94a3b8; letter-spacing: 1px;">EXPÉDITEUR</div>
                                <div style="font-size: ${fontSize}; font-weight: bold;">WILLIAM DADIE</div>
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div id="previewQRCode" style="width: ${isA5 ? '42mm' : '33mm'}; height: ${isA5 ? '42mm' : '33mm'};"></div>
                            <div style="margin-top: 1.5mm; background: #E51F21; color: #fff; font-weight: 900; font-size: ${isA5 ? '14pt' : '11pt'}; padding: 2px 6px; border-radius: 8px;">⚖ 12.5 kg</div>
                        </div>
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; width: 100%;">
                        <div style="font-size: ${refFont}; font-weight: 900; letter-spacing: 2px; word-break: break-all; color: #1A3553;">AB-169-D20</div>
                        <div style="font-size: ${fontSize}; font-weight: bold; margin-top: 1mm; text-transform: uppercase; color: #475569;">CARTON LONG</div>
                    </div>
                </div>
            </div>
        `;
    },

    saveConfig() {
        const format = document.getElementById('labelFormat').value;
        if (this.isAerien) {
            localStorage.setItem('amt_label_aerien_format', format);
            localStorage.setItem('amt_label_aerien_header_color', this.settings.aerienHeaderColor);
            this.app.showToast(`Étiquette aérienne ${format} enregistrée !`, "success");
            return;
        }
        const model = document.getElementById('labelModel').value;
        localStorage.setItem('amt_label_format', format);
        localStorage.setItem('amt_label_model', model);
        localStorage.setItem('amt_label_color', this.settings.colorScheme);
        localStorage.setItem('amt_label_header_color', this.settings.headerColor);
        this.app.showToast(`Configuration ${format} - Modèle ${model} enregistrée !`, "success");
    },

    printTest() {
        if (!this.app.printLabels) {
            this.app.showToast("Fonction d'impression non disponible", "error");
            return;
        }

        const format = document.getElementById('labelFormat')?.value || this.settings.format;
        const prevFormat = localStorage.getItem('amt_label_format');
        localStorage.setItem('amt_label_format', format);

        const testData = {
            ref: 'AB-169-D20',
            expName: 'WILLIAM DADIE',
            expAddress: '22 ALLEE DES SYCOMORES\n95870 BEZONS',
            destName: 'CEDRIC DADIE',
            destPhone: '07 67 00 75 28',
            destAddress: 'COCODY ANGRÉ, ABIDJAN',
            isAerien: this.isAerien,
            headerColor: this.isAerien ? this.settings.aerienHeaderColor : undefined,
            labels: [
                { sousRef: 'AB-169-D20_1_71', desc: 'CARTON LONG', poids: 12.5, index: 1, total: 1 }
            ]
        };

        this.app.printLabels(testData);
        // printLabels lit le format de façon synchrone avant son 1er await :
        // on peut restaurer le défaut maritime tout de suite.
        if (prevFormat) localStorage.setItem('amt_label_format', prevFormat);
    }
};