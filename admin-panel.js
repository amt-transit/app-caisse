import { db } from './firebase-config.js';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, writeBatch, query, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {

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
                
                // Mapping des rôles pour affichage propre
                let roleDisplay = user.role;
                if(user.role === 'super_admin') roleDisplay = '👑 Super Admin';
                else if(user.role === 'admin') roleDisplay = '🛡️ Admin';
                else if(user.role === 'saisie_full') roleDisplay = '✏️ Saisie Complète';
                else if(user.role === 'saisie_limited') roleDisplay = '👀 Saisie Limitée';
                else if(user.role === 'spectateur') roleDisplay = '👓 Spectateur';

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
                    <td><span class="tag" style="background:#e2e8f0; color:#334155;">${roleDisplay}</span></td>
                    <td>${passwordHtml}</td>
                    <td>
                        ${isSuperAdmin ? `<button class="deleteBtn" data-id="${doc.id}" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Supprimer</button>` : ''}
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
