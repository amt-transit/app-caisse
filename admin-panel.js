document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

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

    // 1. LISTE DES UTILISATEURS
    function loadUsers() {
        db.collection("users").onSnapshot(snapshot => {
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
                    if(isSuperAdmin && confirm("Supprimer cet utilisateur ? (L'accès sera révoqué)")) {
                        const uid = e.target.dataset.id;
                        // Note: On supprime seulement de Firestore. Pour Auth, il faudrait une Cloud Function ou Admin SDK.
                        // Ici on casse le lien Firestore -> Auth Guard bloquera l'accès.
                        await db.collection("users").doc(uid).delete();
                        alert("Utilisateur supprimé (Accès révoqué).");
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

            if (!username || !password) return alert("Veuillez remplir tous les champs.");
            if (password.length < 6) return alert("Le mot de passe doit faire au moins 6 caractères.");

            // Email fictif si c'est juste un nom d'utilisateur
            let email = username;
            if (!email.includes('@')) email = username.replace(/\s+/g, '').toLowerCase() + "@amt.com";

            createUserBtn.disabled = true;
            createUserBtn.textContent = "Création...";

            try {
                // Initialisation d'une app secondaire pour créer l'user sans déconnecter l'admin
                const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");

                const userCred = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
                const uid = userCred.user.uid;

                // Création fiche Firestore
                await db.collection("users").doc(uid).set({
                    email: email,
                    displayName: username,
                    role: role,
                    password: password, // Stockage du mot de passe
                    createdAt: new Date().toISOString()
                });

                // Déconnexion de l'app secondaire et nettoyage
                await secondaryApp.auth().signOut();
                await secondaryApp.delete();

                alert(`Utilisateur créé avec succès !\nEmail de connexion : ${email}\nMot de passe : ${password}`);
                newUsernameInput.value = '';
                newPasswordInput.value = '';
            } catch (error) {
                console.error(error);
                alert("Erreur lors de la création : " + error.message);
            } finally {
                createUserBtn.disabled = false;
                createUserBtn.textContent = "Créer Utilisateur";
            }
        });
    } else if (createUserBtn) {
        // Si l'utilisateur n'est pas super_admin, on cache le formulaire de création
        const form = createUserBtn.closest('.card');
        if (form) {
            form.style.display = 'none';
        }
    }

    // 3. JOURNAL D'AUDIT
    function loadAuditLogs() {
        // Charger les 50 derniers logs
        db.collection("audit_logs").orderBy("date", "desc").limit(50).onSnapshot(snapshot => {
            auditLogBody.innerHTML = '';
            if (snapshot.empty) {
                auditLogBody.innerHTML = '<tr><td colspan="4">Aucun log.</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const log = doc.data();
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
        });
    }

    // Init
    loadUsers();
    loadAuditLogs();
    initBackToTopButton();
});
