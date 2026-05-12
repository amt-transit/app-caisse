import { db } from '../../../firebase-config.js';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ChatView = {
    unsub: null,
    messages: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.chat = this;

        const html = `
            <div class="page" style="max-width: 800px; margin: 0 auto; height: calc(100vh - 120px); display: flex; flex-direction: column; animation: fadeIn 0.3s ease;">
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); padding: 20px 25px;">
                    <h2 style="margin:0; font-size: 20px; color:#0f172a; display: flex; align-items: center; gap: 10px;">
                        <div style="background: #eff6ff; color: #3b82f6; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 10px; font-size: 20px;">
                            <i class="fas fa-comments"></i>
                        </div>
                        Chat Inter-Agences
                    </h2>
                </div>

                <div class="form-card" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); background: white;">
                    <div id="chatMessages" style="flex: 1; overflow-y: auto; padding: 20px; background: #f8fafc; display: flex; flex-direction: column; gap: 15px;">
                        <div style="text-align: center; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement des messages...</div>
                    </div>
                    <div style="padding: 15px; background: white; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="chatInput" placeholder="Écrivez votre message..." style="flex: 1; padding: 14px 18px; border: 1px solid #cbd5e1; border-radius: 12px; outline: none; font-size: 14px;" onkeydown="if(event.key === 'Enter') window.app.views.chat.sendMessage()">
                        <button class="btn btn-primary" onclick="window.app.views.chat.sendMessage()" style="padding: 14px 24px; border-radius: 12px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-paper-plane"></i> Envoyer
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.loadMessages();
    },

    loadMessages() {
        if (this.unsub) this.unsub();
        const q = query(collection(db, "chat_messages"), orderBy("timestamp", "asc"), limit(200));
        this.unsub = onSnapshot(q, (snapshot) => {
            this.messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.renderMessages();
        });
    },

    renderMessages() {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        const currentUser = sessionStorage.getItem('userName') || 'Inconnu';

        if (this.messages.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px;">Aucun message. Soyez le premier à écrire !</div>';
            return;
        }

        container.innerHTML = this.messages.map(msg => {
            const isMe = msg.sender === currentUser;
            const time = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '';
            const agencyBadge = msg.agency === 'paris' ? '🇫🇷' : (msg.agency === 'abidjan' ? '🇨🇮' : '🌍');

            return `
                <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; max-width: 80%;">
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 4px; text-align: ${isMe ? 'right' : 'left'};">
                        ${isMe ? '' : `${agencyBadge} <strong>${msg.sender}</strong>`}
                    </div>
                    <div style="padding: 12px 16px; border-radius: 16px; ${isMe ? 'background: #3b82f6; color: white; border-bottom-right-radius: 4px;' : 'background: white; border: 1px solid #e2e8f0; color: #1e293b; border-bottom-left-radius: 4px;'} box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-size: 14px; line-height: 1.5; word-break: break-word;">
                        ${msg.text}
                    </div>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 4px; text-align: ${isMe ? 'right' : 'left'};">
                        ${time}
                    </div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    },

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.focus();

        try {
            await addDoc(collection(db, "chat_messages"), {
                text: text,
                sender: sessionStorage.getItem('userName') || 'Inconnu',
                agency: sessionStorage.getItem('currentActiveAgency') || 'paris',
                timestamp: serverTimestamp()
            });
        } catch (e) {
            this.app.showToast("Erreur lors de l'envoi du message", "error");
        }
    }
};