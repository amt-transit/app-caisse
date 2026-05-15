import { db } from '../../../firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, writeBatch, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const NotificationsView = {
    unsub: null,
    notifications: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.notifications = this;

        const html = `
            <div class="page" style="max-width: 800px; margin: 0 auto; animation: fadeIn 0.3s ease;">
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); padding: 20px 25px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="background: #fef3c7; color: #f59e0b; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">
                                <i class="fas fa-bell"></i>
                            </div>
                            <div>
                                <h2 style="margin:0; font-size: 20px; color:#0f172a; font-weight: 800;">Notifications</h2>
                                <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Alertes et événements importants</p>
                            </div>
                        </div>
                        <button class="btn btn-outline" onclick="window.app.views.notifications.markAllAsRead()" style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-check-double"></i> Tout marquer comme lu
                        </button>
                    </div>
                </div>

                <div class="form-card" style="padding: 0; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid #e2e8f0; border-radius: 16px; background: white;">
                    <div id="notificationsList">
                        <div style="text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.loadNotifications();
    },

    loadNotifications() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const q = query(collection(db, "notifications"), where("agency", "==", activeAgency), orderBy("createdAt", "desc"), limit(50));
        this.unsub = onSnapshot(q, (snapshot) => {
            this.notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.renderList();
        });
    },

    renderList() {
        const container = document.getElementById('notificationsList');
        if (!container) return;
        const currentUserId = sessionStorage.getItem('userName') || 'Inconnu';

        if (this.notifications.length === 0) {
            container.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b;">Aucune notification pour le moment.</div>';
            return;
        }

        container.innerHTML = this.notifications.map(n => {
            const readBy = n.readBy || [];
            const isRead = readBy.includes(currentUserId);
            const time = n.createdAt ? new Date(n.createdAt).toLocaleString('fr-FR') : '';
            
            return `
                <div style="padding: 20px; border-bottom: 1px solid #f1f5f9; display: flex; gap: 15px; align-items: flex-start; background: ${isRead ? 'white' : '#eff6ff'}; transition: background 0.2s;">
                    <div style="font-size: 20px; color: ${isRead ? '#94a3b8' : '#3b82f6'}; flex-shrink: 0; background: ${isRead ? '#f1f5f9' : '#dbeafe'}; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                        ${isRead ? '<i class="far fa-bell"></i>' : '<i class="fas fa-bell"></i>'}
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <strong style="color: #0f172a; font-size: 15px;">${n.title || 'Notification'}</strong>
                            <span style="font-size: 11px; color: #64748b; font-weight: 600;">${time}</span>
                        </div>
                        <div style="color: #475569; font-size: 13px; line-height: 1.5; margin-bottom: 12px;">${n.message || ''}</div>
                        ${!isRead ? `<button class="btn btn-outline btn-small" onclick="window.app.views.notifications.markAsRead('${n.id}')" style="font-size: 11px; padding: 6px 12px; border-radius: 6px;">Marquer comme lu</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    async markAsRead(id) {
        const currentUserId = sessionStorage.getItem('userName') || 'Inconnu';
        try {
            const { arrayUnion } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            await updateDoc(doc(db, "notifications", id), { readBy: arrayUnion(currentUserId) });
        } catch (e) { console.error(e); }
    },

    async markAllAsRead() {
        const currentUserId = sessionStorage.getItem('userName') || 'Inconnu';
        const unreadNotifs = this.notifications.filter(n => !(n.readBy || []).includes(currentUserId));
        
        if (unreadNotifs.length === 0) return this.app.showToast("Toutes les notifications sont lues.", "info");

        try {
            const { arrayUnion } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            const batch = writeBatch(db);
            unreadNotifs.forEach(n => batch.update(doc(db, "notifications", n.id), { readBy: arrayUnion(currentUserId) }));
            await batch.commit();
            this.app.showToast("Notifications marquées comme lues.", "success");
        } catch (e) { console.error(e); }
    }
};