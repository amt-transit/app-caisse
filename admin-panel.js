document.addEventListener('DOMContentLoaded', async () => {
    const usersList = document.getElementById('usersList');
    const createUserBtn = document.getElementById('createUserBtn');
    const newUsername = document.getElementById('newUsername'); 
    const newPassword = document.getElementById('newPassword');
    const newRole = document.getElementById('newRole');

    const DOMAIN_SUFFIX = "@amt.local"; 

    // --- GESTION UTILISATEURS ---

    // Créer utilisateur
    createUserBtn.addEventListener('click', () => {
        const username = newUsername.value.trim();
        const password = newPassword.value.trim();
        const role = newRole.value;

        if (!username || !password) return alert("Nom d'utilisateur et mot de passe requis.");

        const cleanUsername = username.toLowerCase().replace(/\s+/g, '');
        const emailTechnique = `${cleanUsername}${DOMAIN_SUFFIX}`;

        const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");

        secondaryApp.auth().createUserWithEmailAndPassword(emailTechnique, password)
            .then((userCred) => {
                return db.collection('users').doc(userCred.user.uid).set({
                    role: role,
                    email: emailTechnique, 
                    displayName: username 
                });
            })
            .then(() => {
                alert(`Utilisateur "${username}" créé avec succès !`);
                secondaryApp.auth().signOut(); 
                secondaryApp.delete(); 
                newUsername.value = ''; newPassword.value = '';
            })
            .catch((error) => {
                console.error(error);
                alert("Erreur : " + error.message);
                secondaryApp.delete();
            });
    });

    window.deleteUser = (uid) => {
        if(confirm("Supprimer cet utilisateur ?")) {
            db.collection('users').doc(uid).delete();
        }
    };

    // --- VISUALISATION JOURNAL D'AUDIT ---
    const auditBody = document.getElementById('auditLogBody');
    
    if (auditBody) {
        // Charger les 50 derniers logs
        db.collection("audit_logs").orderBy("date", "desc").limit(50).onSnapshot(snap => {
            auditBody.innerHTML = '';
            if(snap.empty) {
                auditBody.innerHTML = '<tr><td colspan="4">Aucun log.</td></tr>';
                return;
            }
            snap.forEach(doc => {
                const d = doc.data();
                const date = d.date ? new Date(d.date).toLocaleString() : '-';
                auditBody.innerHTML += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td>${date}</td><td><b>${d.user}</b></td><td><span class="tag" style="background:#333;">${d.action}</span></td><td>${d.details}</td>
                    </tr>`;
            });
        });
    }
});
