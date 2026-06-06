import { db } from '../../../commun/firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../commun/agencies-config.js';

export const ChatView = {
    unsub: null,
    messages: [],
    clientsList: [],
    refsList: [],
    currentSuggestions: [],
    selectedSuggestionIndex: -1,
    currentWordBoundary: { start: 0, end: 0 },

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.chat = this;

        const html = `
            <style>
                .chat-page { max-width: 1000px; margin: 0 auto; height: calc(100vh - 140px); display: flex; flex-direction: column; animation: fadeIn 0.3s ease; }
                .chat-header { background: white; padding: 20px 25px; border-radius: 16px 16px 0 0; border: 1px solid #e2e8f0; border-bottom: none; display: flex; align-items: center; gap: 15px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); z-index: 10; flex-shrink: 0; }
                .chat-header__icon { font-size: 24px; background: #e0e7ff; color: #4f46e5; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .chat-header__title { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
                .chat-header__subtitle { margin: 2px 0 0 0; font-size: 12px; color: #64748b; }
                
                .chat-messages { flex: 1; background: #f8fafc; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
                
                .chat-msg { display: flex; flex-direction: column; max-width: 75%; }
                .chat-msg--me { align-self: flex-end; align-items: flex-end; }
                .chat-msg--other { align-self: flex-start; align-items: flex-start; }
                
                .chat-msg__meta { font-size: 11px; color: #64748b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
                .chat-msg__agency { font-weight: 800; padding: 2px 6px; border-radius: 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
                .agency-paris { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
                .agency-abidjan { background: #fce7f3; color: #be185d; border: 1px solid #fbcfe8; }
                
                .chat-msg__bubble { padding: 12px 16px; border-radius: 16px; font-size: 14px; line-height: 1.5; color: #1e293b; position: relative; word-wrap: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .chat-msg--me .chat-msg__bubble { background: #3b82f6; color: white; border-bottom-right-radius: 4px; }
                .chat-msg--other .chat-msg__bubble { background: white; border: 1px solid #e2e8f0; border-bottom-left-radius: 4px; }
                
                .chat-input-area { background: white; padding: 20px; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0; display: flex; gap: 10px; align-items: flex-end; box-shadow: 0 -4px 6px -1px rgba(0,0,0,0.02); flex-shrink: 0; }
                .chat-input { flex: 1; padding: 14px 16px; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 14px; outline: none; transition: 0.2s; font-family: inherit; resize: none; max-height: 120px; }
                .chat-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .chat-send-btn { background: #3b82f6; color: white; border: none; width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
                .chat-send-btn:hover { background: #2563eb; transform: translateY(-2px); }
                .chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
                
                .chat-attach-btn { background: #f1f5f9; color: #64748b; border: none; width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
                .chat-attach-btn:hover { background: #e2e8f0; color: #334155; }
                .chat-img-preview { max-width: 100%; max-height: 250px; border-radius: 8px; margin-top: 8px; cursor: pointer; border: 1px solid rgba(0,0,0,0.1); display: block; }
                .chat-msg--me .chat-ref-link { color: #fff; text-decoration: underline; font-weight: 800; }
                .chat-msg--other .chat-ref-link { color: #3b82f6; text-decoration: underline; font-weight: 800; }

                .chat-suggestions { position: absolute; bottom: 100%; left: 0; width: 100%; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 -4px 15px rgba(0,0,0,0.1); margin-bottom: 10px; display: none; z-index: 100; list-style: none; padding: 0; }
                .chat-suggestions li { padding: 10px 15px; cursor: pointer; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b; transition: 0.2s; display: flex; align-items: center; }
                .chat-suggestions li:last-child { border-bottom: none; }
            </style>

            <div class="chat-page">
                <div class="chat-header">
                    <div class="chat-header__icon"><i class="fas fa-comments"></i></div>
                    <div>
                        <h1 class="chat-header__title">Chat Inter-Agences</h1>
                        <p class="chat-header__subtitle">Communication en direct entre Paris et Abidjan</p>
                    </div>
                </div>
                
                <div class="chat-messages" id="chatMessages">
                    <div style="text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Connexion au chat...</div>
                </div>
                
                <div class="chat-input-area">
                    <input type="file" id="chatImageInput" accept="image/*" style="display: none;" onchange="window.app.views.chat.handleImageSelect(event)">
                    <button class="chat-attach-btn" onclick="document.getElementById('chatImageInput').click()" title="Joindre une image">
                        <i class="fas fa-paperclip"></i>
                    </button>
                    <div style="flex: 1; position: relative; display: flex; align-items: flex-end;">
                        <ul id="chatSuggestions" class="chat-suggestions"></ul>
                        <textarea id="chatInput" class="chat-input" rows="1" placeholder="Écrivez votre message ici... (Entrée pour envoyer)" oninput="window.app.views.chat.handleInput(event)" onkeydown="window.app.views.chat.handleKeyPress(event)"></textarea>
                    </div>
                    <button id="chatSendBtn" class="chat-send-btn" onclick="window.app.views.chat.sendMessage()">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        if (container) container.innerHTML = html;
        else document.getElementById('contentContainer').innerHTML = html;
        
        // Fermer les suggestions au clic en dehors
        document.addEventListener('click', (e) => {
            const suggBox = document.getElementById('chatSuggestions');
            const input = document.getElementById('chatInput');
            if (suggBox && e.target !== input && !suggBox.contains(e.target)) {
                suggBox.style.display = 'none';
            }
        });

        this.loadMessages();
        this.loadSuggestionsData();
    },

    async loadSuggestionsData() {
        try {
            // Récupère les noms des clients existants
            const clientsSnap = await getDocs(query(collection(db, getCollectionName("clients"))));
            this.clientsList = [...new Set(clientsSnap.docs.map(d => d.data().nom).filter(Boolean))];
            
            // Récupère les références récentes
            const livSnap = await getDocs(query(collection(db, getCollectionName("livraisons")), orderBy("dateAjout", "desc"), limit(2000)));
            this.refsList = [...new Set(livSnap.docs.map(d => d.data().ref).filter(Boolean))];
        } catch(e) {
            console.warn("Erreur chargement données de saisie intelligente :", e);
        }
    },

    loadMessages() {
        if (this.unsub) this.unsub();
        const q = query(collection(db, getCollectionName("internal_chat")), orderBy("date", "desc"), limit(100));
        this.unsub = onSnapshot(q, (snapshot) => {
            this.messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).reverse();
            this.renderMessages();
        }, (error) => {
            console.error("Erreur Chat:", error);
            this.app.showToast("Erreur de connexion au chat", "error");
        });
    },

    renderMessages() {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        const currentUser = sessionStorage.getItem('userName') || 'Utilisateur';

        if (this.messages.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#94a3b8; margin:auto;">Soyez le premier à envoyer un message !</div>';
            return;
        }

        container.innerHTML = this.messages.map(msg => {
            const isMe = msg.userName === currentUser;
            const dateStr = msg.date ? new Date(msg.date).toLocaleString('fr-FR', { hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' }) : '';
            const agencyClass = msg.agency === 'paris' ? 'agency-paris' : (msg.agency === 'abidjan' ? 'agency-abidjan' : '');
            const agencyLabel = msg.agency === 'paris' ? '🇫🇷 PARIS' : (msg.agency === 'abidjan' ? '🇨🇮 ABIDJAN' : 'GLOBAL');
            
            const formattedText = this.formatMessageText(msg.text || '');
            const imageHtml = msg.imageUrl ? `<img src="${msg.imageUrl}" class="chat-img-preview" onclick="window.open('${msg.imageUrl}', '_blank')">` : '';

            return `
                <div class="chat-msg ${isMe ? 'chat-msg--me' : 'chat-msg--other'}">
                    <div class="chat-msg__meta">
                        ${!isMe ? `<span class="chat-msg__agency ${agencyClass}">${agencyLabel}</span> <strong>${msg.userName}</strong>` : ''}
                        <span>${dateStr}</span>
                        ${isMe ? `<strong>Moi</strong> <span class="chat-msg__agency ${agencyClass}">${agencyLabel}</span>` : ''}
                    </div>
                    <div class="chat-msg__bubble">
                        ${formattedText}
                        ${imageHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Auto-scroll vers le bas
        container.scrollTop = container.scrollHeight;
    },

    formatMessageText(text) {
        let safeText = text.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag])
        );
        safeText = safeText.replace(/\n/g, '<br>');
        
        // Transformation des références (ex: AB-123-X ou AB-123-X_1_2) en liens
        const refRegex = /\b([A-Z]{2}-\d{3}-[A-Z0-9_]+)\b/gi;
        safeText = safeText.replace(refRegex, '<a href="#" class="chat-ref-link" onclick="window.app.views.chat.openRefDetails(\'$1\'); return false;">$1</a>');
        
        return safeText;
    },

    async openRefDetails(ref) {
        this.app.showToast("Recherche du colis...", "info");
        try {
            const q = query(collection(db, getCollectionName("livraisons")), where("ref", "==", ref.toUpperCase()), limit(1));
            const snap = await getDocs(q);
            
            if (snap.empty) {
                this.app.showToast("Colis introuvable dans la base de données.", "error");
                return;
            }
            
            const data = snap.docs[0].data();
            const statutTexte = (data.status || 'EN_ATTENTE').replace('_', ' ');
            
            let details = `
                <div style="text-align: left; font-size: 14px; line-height: 1.6;">
                    <p style="margin:5px 0;"><b>Conteneur :</b> <span style="background:#f1f5f9; padding:2px 6px; border-radius:6px; font-weight:600;">${data.conteneur || 'Non assigné'}</span></p>
                    <p style="margin:5px 0;"><b>Expéditeur :</b> ${data.expediteur || 'Inconnu'}</p>
                    <p style="margin:5px 0;"><b>Destinataire :</b> ${data.destinataire || 'Inconnu'}</p>
                    <p style="margin:5px 0;"><b>Téléphone :</b> <a href="tel:${data.numero}" style="color:#3b82f6; text-decoration:none;">${data.numero || 'Non renseigné'}</a></p>
                    <p style="margin:5px 0;"><b>Lieu :</b> ${data.lieuLivraison || '-'}</p>
                    <p style="margin:5px 0;"><b>Statut actuel :</b> <span style="background:#e2e8f0; padding:2px 8px; border-radius:12px; font-weight:bold; font-size:12px;">${statutTexte}</span></p>
                </div>
            `;
            
            if (window.AppModal) {
                window.AppModal.alert(details, `Détails : ${data.ref}`);
            } else {
                alert(`Colis: ${data.ref}\nStatut: ${statutTexte}\nExpéditeur: ${data.expediteur}\nDestinataire: ${data.destinataire}`);
            }
        } catch (e) {
            console.error(e);
            this.app.showToast("Erreur lors de la recherche.", "error");
        }
    },

    handleImageSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        this.app.showToast("Préparation de l'image...", "info");

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800; // Limite de largeur pour la compression
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) { if (width > MAX_WIDTH) { height = Math.round(height * (MAX_WIDTH / width)); width = MAX_WIDTH; } } 
                else { if (height > MAX_HEIGHT) { width = Math.round(width * (MAX_HEIGHT / height)); height = MAX_HEIGHT; } }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // Compression 60% de qualité
                this.sendImageMessage(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        event.target.value = ''; // Réinitialisation de l'input
    },

    handleInput(e) {
        const input = e.target;
        const text = input.value;
        const cursorPos = input.selectionStart;
        
        // Délimiter le mot actuel autour du curseur
        let start = cursorPos - 1;
        while (start >= 0 && !/[\s\n]/.test(text[start])) {
            start--;
        }
        start++;
        
        let end = cursorPos;
        while (end < text.length && !/[\s\n]/.test(text[end])) {
            end++;
        }
        
        const currentWord = text.substring(start, end);
        this.currentWordBoundary = { start, end };
        
        const suggBox = document.getElementById('chatSuggestions');
        
        if (currentWord.length >= 2) {
            const queryText = currentWord.toLowerCase();
            const matchedClients = this.clientsList.filter(c => c.toLowerCase().includes(queryText)).slice(0, 5);
            const matchedRefs = this.refsList.filter(r => r.toLowerCase().includes(queryText)).slice(0, 5);
            
            const matches = [
                ...matchedRefs.map(r => ({type: 'Réf', val: r})), 
                ...matchedClients.map(c => ({type: 'Client', val: c}))
            ];
            
            if (matches.length > 0) {
                this.currentSuggestions = matches;
                this.selectedSuggestionIndex = -1;
                suggBox.innerHTML = matches.map((m, i) => `
                    <li data-index="${i}" onclick="window.app.views.chat.selectSuggestion(${i})" onmouseenter="window.app.views.chat.highlightSuggestion(${i})">
                        <span style="font-size: 10px; color: #fff; background: ${m.type === 'Réf' ? '#3b82f6' : '#10b981'}; padding: 2px 6px; border-radius: 4px; margin-right: 8px;">${m.type}</span>
                        <b>${m.val}</b>
                    </li>
                `).join('');
                suggBox.style.display = 'block';
            } else {
                suggBox.style.display = 'none';
            }
        } else {
            suggBox.style.display = 'none';
        }
    },

    highlightSuggestion(index) {
        this.selectedSuggestionIndex = index;
        const suggBox = document.getElementById('chatSuggestions');
        if (!suggBox) return;
        suggBox.querySelectorAll('li').forEach((li, idx) => {
            li.style.background = idx === index ? '#e0f2fe' : 'white';
        });
    },

    selectSuggestion(index) {
        if (index < 0 || index >= this.currentSuggestions.length) return;
        const sugg = this.currentSuggestions[index];
        const input = document.getElementById('chatInput');
        const text = input.value;
        const { start, end } = this.currentWordBoundary;
        
        const newText = text.substring(0, start) + sugg.val + ' ' + text.substring(end);
        input.value = newText;
        
        const newPos = start + sugg.val.length + 1;
        input.setSelectionRange(newPos, newPos);
        input.focus();
        
        document.getElementById('chatSuggestions').style.display = 'none';
        this.currentSuggestions = [];
    },

    handleKeyPress(e) {
        const suggBox = document.getElementById('chatSuggestions');
        const isSuggVisible = suggBox && suggBox.style.display === 'block';

        if (isSuggVisible) {
            if (e.key === 'ArrowDown') { e.preventDefault(); this.highlightSuggestion((this.selectedSuggestionIndex + 1) % this.currentSuggestions.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); this.highlightSuggestion(this.selectedSuggestionIndex <= 0 ? this.currentSuggestions.length - 1 : this.selectedSuggestionIndex - 1); return; }
            if (e.key === 'Enter') { e.preventDefault(); this.selectSuggestion(this.selectedSuggestionIndex >= 0 ? this.selectedSuggestionIndex : 0); return; }
            if (e.key === 'Escape') { suggBox.style.display = 'none'; return; }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    },
    
    async sendImageMessage(base64Image) {
        try {
            await addDoc(collection(db, getCollectionName("internal_chat")), {
                text: "📷 Image envoyée",
                imageUrl: base64Image,
                userName: sessionStorage.getItem('userName') || 'Utilisateur',
                agency: sessionStorage.getItem('currentActiveAgency') || 'abidjan',
                date: new Date().toISOString()
            });
        } catch (e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'envoi de l'image", "error");
        }
    },

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const btn = document.getElementById('chatSendBtn');
        const text = input.value.trim();
        
        if (!text) return;
        input.disabled = true; btn.disabled = true;
        
        try {
            await addDoc(collection(db, getCollectionName("internal_chat")), {
                text: text,
                userName: sessionStorage.getItem('userName') || 'Utilisateur',
                agency: sessionStorage.getItem('currentActiveAgency') || 'abidjan',
                date: new Date().toISOString()
            });
            input.value = '';
        } catch (e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'envoi", "error");
        } finally {
            input.disabled = false; btn.disabled = false;
            input.focus();
        }
    }
};