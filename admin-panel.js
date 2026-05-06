import { db } from './firebase-config.js';
import { collection, doc, setDoc, updateDoc, deleteDoc, getDocs, onSnapshot, writeBatch, query, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {

    // --- INJECTION DU MODAL DE MODIFICATION UTILISATEUR ---
    const editUserModalHTML = `
    <div id="editUserModal" class="modal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
        <div class="modal-content" style="background:#fff; padding:20px; width:90%; max-width:400px; border-radius:12px;">
            <span class="close-modal" id="closeEditUserModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
            <h2 style="margin-top:0;">Modifier Utilisateur</h2>
            <input type="hidden" id="editUserId">
            
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">Agence</label>
                <select id="editUserAgency" style="width:100%; padding:8px; box-sizing:border-box;">
                    <option value="abidjan">🇨🇮 Abidjan</option>
                    <option value="paris">🇫🇷 Paris</option>
                    <option value="all">🌍 Abidjan & Paris (Global)</option>
                </select>
            </div>
            
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">Rôle</label>
                <select id="editUserRole" style="width:100%; padding:8px; box-sizing:border-box;">
                    <option value="saisie_limited">Saisie Limitée</option>
                    <option value="saisie_full">Saisie Complète</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="admin_abidjan">Admin Abidjan</option>
                    <option value="agent_paris">Agent Paris</option>
                    <option value="livreur">Livreur</option>
                    <option value="magasinier">Magasinier</option>
                    <option value="spectateur">👓 Spectateur</option>
                </select>
            </div>

            <div style="text-align:right; margin-top:20px;">
                <button id="cancelEditUserBtn" class="btn" style="background: #6c757d; color:white; margin-right:10px; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Annuler</button>
                <button id="saveEditUserBtn" class="btn btn-success" style="background: #10b981; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Enregistrer</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', editUserModalHTML);

    const editUserModal = document.getElementById('editUserModal');
    const closeUserModal = () => { editUserModal.style.display = 'none'; };
    document.getElementById('closeEditUserModal').onclick = closeUserModal;
    document.getElementById('cancelEditUserBtn').onclick = closeUserModal;
    window.addEventListener('click', (e) => { if(e.target === editUserModal) closeUserModal(); });

    document.getElementById('saveEditUserBtn').addEventListener('click', async () => {
        const uid = document.getElementById('editUserId').value;
        const newAgency = document.getElementById('editUserAgency').value;
        const newRole = document.getElementById('editUserRole').value;
        
        if (!uid) return;
        
        const saveBtn = document.getElementById('saveEditUserBtn');
        saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement...';
        
        try {
            await updateDoc(doc(db, "users", uid), { agency: newAgency, role: newRole });
            AppModal.success("Les autorisations de l'utilisateur ont été mises à jour !");
            closeUserModal();
        } catch (error) {
            console.error(error);
            AppModal.error("Erreur lors de la modification : " + error.message);
        } finally {
            saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer';
        }
    });

    // Configuration nécessaire pour l'app secondaire (Création utilisateur)
    const firebaseConfig = {
        apiKey: "AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4",
        authDomain: "caisse-amt-perso.firebaseapp.com",
        projectId: "caisse-amt-perso",
        storageBucket: "caisse-amt-perso.firebasestorage.app",
        messagingSenderId: "682789156997",
        appId: "1:682789156997:web:9ce3303120851d37be91ec"
    };

    const usersListEl = document.getElementById('usersList');
    const auditLogBody = document.getElementById('auditLogBody');
    
    // Recherche Audit
    const auditSearchInput = document.getElementById('auditSearchInput');
    let allAuditLogs = [];

    // Formulaire Création
    const newUsernameInput = document.getElementById('newUsername');
    const newPasswordInput = document.getElementById('newPassword');
    const newAgencySelect = document.getElementById('newAgency');
    const newRoleSelect = document.getElementById('newRole');
    const createUserBtn = document.getElementById('createUserBtn');

    // --- AJOUT AUTOMATIQUE DE L'OPTION SPECTATEUR ---
    if (newRoleSelect && !newRoleSelect.querySelector('option[value="spectateur"]')) {
        const opt = document.createElement('option');
        opt.value = "spectateur";
        opt.textContent = "👓 Spectateur";
        newRoleSelect.appendChild(opt);
    }

// Récupération du rôle pour la gestion des accès
const userRole = sessionStorage.getItem('userRole');
const isSuperAdmin = userRole === 'super_admin';

    // Masquer la gestion des utilisateurs si ce n'est pas le Super Admin
    const userManagementSection = document.getElementById('userManagementSection');
    if (!isSuperAdmin && userManagementSection) {
        userManagementSection.style.display = 'none';
        
        // Masquer l'onglet Utilisateurs et forcer l'onglet Audit pour les admins simples
        const tabUsers = document.getElementById('tabUsers');
        if (tabUsers) tabUsers.style.display = 'none';
        
        const tabAudit = document.getElementById('tabAudit');
        const panelAudit = document.getElementById('panel-audit');
        const panelUsers = document.getElementById('panel-users');
        if (tabAudit && panelAudit) {
            tabAudit.classList.add('active');
            panelAudit.classList.add('active');
            if (panelUsers) panelUsers.classList.remove('active');
        }
    }

    // --- GESTION DES SOUS-ONGLETS ---
    const tabs = document.querySelectorAll('#adminSubNav a');
    const panels = document.querySelectorAll('.admin-container .tab-panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = tab.getAttribute('href').substring(1);
            const targetPanel = document.getElementById(targetId);
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    // --- BOUTON DE RÉPARATION DE LA BASE DE DONNÉES (POUR LES ANCIENNES RÉDUCTIONS) ---
    if (isSuperAdmin && usersListEl) {
        const repairBtn = document.createElement('button');
        repairBtn.className = "btn";
        repairBtn.style.cssText = "background-color: #f59e0b; color: white; margin-bottom: 20px; padding: 10px 15px; border-radius: 6px; cursor: pointer; border: none; font-weight: bold; width: 100%;";
        repairBtn.innerHTML = "🛠️ Réparer le Reste à Payer des Anciennes Réductions (Base de Données)";
        repairBtn.onclick = async () => {
            if (!await AppModal.confirm("Voulez-vous analyser et corriger définitivement le reste à payer des anciens colis ayant bénéficié d'une réduction dans la base de données ?\n\nCette action est recommandée pour nettoyer l'onglet Impayés.", "Réparation Base de Données", true)) return;
            repairBtn.disabled = true;
            repairBtn.textContent = "Analyse en cours...";

            try {
                const snapshot = await getDocs(collection(db, "transactions"));
                const batch = writeBatch(db);
                let count = 0;

                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.adjustmentType && String(data.adjustmentType).toLowerCase() === 'reduction') {
                        const expectedPrix = (data.prix || 0);
                        const reduction = (data.adjustmentVal || 0);
                        const effectivePrix = expectedPrix - reduction;
                        const totalPaye = (data.montantParis || 0) + (data.montantAbidjan || 0);
                        const expectedReste = totalPaye - effectivePrix;

                        // Si la base de données contient toujours l'ancien calcul erroné
                        if (data.reste !== expectedReste) {
                            batch.update(doc.ref, { reste: expectedReste });
                            count++;
                        }
                    }
                });

                if (count > 0) {
                    await batch.commit();
                    AppModal.success(`Succès ! ${count} anciens colis ont été corrigés définitivement dans la base de données.`);
                } else {
                    AppModal.alert("Aucune anomalie détectée. Tous les colis sont déjà à jour.", "Analyse Terminée");
                }
            } catch (e) {
                console.error(e);
                AppModal.error("Erreur lors de la réparation : " + e.message);
            } finally {
                repairBtn.disabled = false;
                repairBtn.innerHTML = "🛠️ Réparer le Reste à Payer des Anciennes Réductions (Base de Données)";
            }
        };
        usersListEl.parentNode.insertBefore(repairBtn, usersListEl);
    }

    // 1. LISTE DES UTILISATEURS
    function loadUsers() {
        if (!isSuperAdmin) return; // Economise des lectures Firebase si l'utilisateur n'est qu'un admin simple
        onSnapshot(collection(db, "users"), snapshot => {
            usersListEl.innerHTML = '';
            if (snapshot.empty) {
                usersListEl.innerHTML = '<p>Aucun utilisateur trouvé.</p>';
                return;
            }

            const table = document.createElement('table');
            table.className = 'table';
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Nom / Email</th>
                        <th>Agence</th>
                        <th>Rôle</th>
                        <th>Mot de passe</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = table.querySelector('tbody');

            snapshot.forEach(doc => {
                const user = doc.data();
                const tr = document.createElement('tr');
                
                // Gestion de l'affichage de l'agence (avec fallback pour les anciens comptes)
                let agencyDisplay = user.agency === 'paris' ? '🇫🇷 Paris' : '🇨🇮 Abidjan';
                if (user.agency === 'all') agencyDisplay = '🌍 Global (Abidjan & Paris)';
                if (!user.agency) agencyDisplay = '🇨🇮 Abidjan (Défaut)';

                // Mapping des rôles pour affichage propre
                let roleDisplay = user.role;
                if(user.role === 'super_admin') roleDisplay = '👑 Super Admin';
                else if(user.role === 'admin') roleDisplay = '🛡️ Admin';
                else if(user.role === 'saisie_full') roleDisplay = '✏️ Saisie Complète';
                else if(user.role === 'saisie_limited') roleDisplay = '👀 Saisie Limitée';
                else if(user.role === 'spectateur') roleDisplay = '👓 Spectateur';
                else if(user.role === 'admin_abidjan') roleDisplay = '🛡️ Admin Abidjan';
                else if(user.role === 'agent_paris') roleDisplay = '🇫🇷 Agent Paris';
                else if(user.role === 'livreur') roleDisplay = '🚚 Livreur';
                else if(user.role === 'magasinier') roleDisplay = '📦 Magasinier';

                // Gestion affichage mot de passe
                let passwordHtml = '<span style="color:#999; font-style:italic; font-size:0.8em;">Non stocké</span>';
                if (user.password) {
                    passwordHtml = `
                        <div style="display:flex; align-items:center; gap:5px;">
                            <input type="password" value="${user.password}" readonly style="border:1px solid #eee; background:#fff; width:100px; padding:2px; border-radius:4px;" class="password-field">
                            <button class="toggle-password" type="button" style="border:none; background:none; cursor:pointer;">👁️</button>
                        </div>
                    `;
                }

                tr.innerHTML = `
                    <td>
                        <div style="font-weight:bold;">${user.displayName || user.email}</div>
                        <div style="font-size:0.8em; color:#666;">${user.email}</div>
                    </td>
                    <td><span class="tag" style="background:#f1f5f9; color:#334155;">${agencyDisplay}</span></td>
                    <td><span class="tag" style="background:#e2e8f0; color:#334155;">${roleDisplay}</span></td>
                    <td>${passwordHtml}</td>
                    <td>
                        ${isSuperAdmin ? `
                        <button class="editBtn" data-id="${doc.id}" data-agency="${user.agency || 'abidjan'}" data-role="${user.role}" style="background:#3b82f6; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-right:5px;">Modifier</button>
                        <button class="deleteBtn" data-id="${doc.id}" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Supprimer</button>
                        ` : ''}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            usersListEl.appendChild(table);

            // Listeners Toggle Password
            tbody.querySelectorAll('.toggle-password').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const input = e.target.previousElementSibling;
                    if (input.type === "password") {
                        input.type = "text";
                        e.target.textContent = "🙈";
                    } else {
                        input.type = "password";
                        e.target.textContent = "👁️";
                    }
                });
            });

            // Listeners modification
            tbody.querySelectorAll('.editBtn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.getElementById('editUserId').value = e.target.dataset.id;
                    document.getElementById('editUserAgency').value = e.target.dataset.agency;
                    document.getElementById('editUserRole').value = e.target.dataset.role;
                    
                    document.getElementById('editUserModal').style.display = 'flex';
                });
            });

            // Listeners suppression
            tbody.querySelectorAll('.deleteBtn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if(isSuperAdmin && await AppModal.confirm("Supprimer cet utilisateur ? (L'accès sera révoqué)", "Suppression", true)) {
                        const uid = e.target.dataset.id;
                        // Note: On supprime seulement de Firestore. Pour Auth, il faudrait une Cloud Function ou Admin SDK.
                        // Ici on casse le lien Firestore -> Auth Guard bloquera l'accès.
                        await deleteDoc(doc(db, "users", uid));
                        AppModal.success("Utilisateur supprimé (Accès révoqué).");
                    }
                });
            });
        });
    }

    // 2. CRÉATION UTILISATEUR (Via Secondary App pour ne pas déconnecter l'admin)
    if (createUserBtn && isSuperAdmin) {
        createUserBtn.addEventListener('click', async () => {
            const username = newUsernameInput.value.trim();
            const password = newPasswordInput.value.trim();
            const agency = newAgencySelect ? newAgencySelect.value : 'abidjan';
            const role = newRoleSelect.value;

            if (!username || !password) return AppModal.error("Veuillez remplir tous les champs.");
            if (password.length < 6) return AppModal.error("Le mot de passe doit faire au moins 6 caractères.");

            // Email fictif si c'est juste un nom d'utilisateur
            let email = username;
            if (!email.includes('@')) email = username.replace(/\s+/g, '').toLowerCase() + "@amt.com";

            createUserBtn.disabled = true;
            createUserBtn.textContent = "Création...";

            try {
                // Initialisation d'une app secondaire pour créer l'user sans déconnecter l'admin
                const secondaryApp = initializeApp(firebaseConfig, "Secondary");
                const secondaryAuth = getAuth(secondaryApp);

                const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const uid = userCred.user.uid;

                // Création fiche Firestore
                await setDoc(doc(db, "users", uid), {
                    email: email,
                    displayName: username,
                    agency: agency,
                    role: role,
                    password: password, // Stockage du mot de passe
                    createdAt: new Date().toISOString()
                });

                // Déconnexion de l'app secondaire et nettoyage
                await signOut(secondaryAuth);
                await deleteApp(secondaryApp);

                AppModal.success(`Utilisateur créé avec succès !\nEmail de connexion : ${email}\nMot de passe : ${password}`, "Création Réussie");
                newUsernameInput.value = '';
                newPasswordInput.value = '';
            } catch (error) {
                console.error(error);
                AppModal.error("Erreur lors de la création : " + error.message);
            } finally {
                createUserBtn.disabled = false;
                createUserBtn.textContent = "Créer Utilisateur";
            }
        });
    }

    // 3. JOURNAL D'AUDIT
    function loadAuditLogs() {
        // Charger tous les logs
        onSnapshot(query(collection(db, "audit_logs"), orderBy("date", "desc")), snapshot => {
            allAuditLogs = [];
            snapshot.forEach(doc => {
                allAuditLogs.push({ id: doc.id, ...doc.data() });
            });
            renderAuditLogs();
        });
    }

    function renderAuditLogs() {
        const term = auditSearchInput ? auditSearchInput.value.toLowerCase().trim() : "";
        const filtered = allAuditLogs.filter(log => {
            if (!term) return true;
            return (log.user || '').toLowerCase().includes(term) ||
                   (log.action || '').toLowerCase().includes(term) ||
                   (log.details || '').toLowerCase().includes(term) ||
                   (log.date || '').toLowerCase().includes(term);
        });

        auditLogBody.innerHTML = '';
        if (filtered.length === 0) {
            auditLogBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px;">Aucun log trouvé pour cette recherche.</td></tr>';
            return;
        }

        filtered.forEach(log => {
            const date = new Date(log.date).toLocaleString('fr-FR');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${date}</td>
                <td>${log.user || 'Système'}</td>
                <td><b>${log.action}</b></td>
                <td>${log.details || '-'}</td>
            `;
            auditLogBody.appendChild(tr);
        });
    }

    if (auditSearchInput) {
        auditSearchInput.addEventListener('input', renderAuditLogs);
    }

    // Init
    loadUsers();
    loadAuditLogs();
    initBackToTopButton();
});
