document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    
    // ON RÉCUPÈRE L'INPUT "USERNAME"
    const usernameInput = document.getElementById('username'); 
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');

    // CORRECTION : On ne redirige QUE si le profil existe déjà
    // Cela évite de couper l'herbe sous le pied à la création automatique
    firebase.auth().onAuthStateChanged(async user => {
        if (user) {
            try {
                const doc = await db.collection("users").doc(user.uid).get(); 
                if (doc.exists) {
                    window.location.href = 'index.html';
                }
            } catch (e) { console.error(e); }
        }
    });

    loginBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            showError("Veuillez remplir tous les champs.");
            return;
        }

        // Feedback visuel
        loginBtn.disabled = true;
        loginBtn.textContent = "Vérification...";

        // ON RECRÉE L'EMAIL TECHNIQUE
        const cleanUsername = username.toLowerCase().replace(/\s+/g, '');
        let emailTechnique = cleanUsername;
        if (!cleanUsername.includes('@')) {
            emailTechnique = `${cleanUsername}@amt.local`;
        }

        console.log("Tentative de connexion avec :", emailTechnique); // Pour débugger

        try {
            // FORCE LA PERSISTANCE DE SESSION (Important pour le local)
            await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

            const userCredential = await firebase.auth().signInWithEmailAndPassword(emailTechnique, password);
            const uid = userCredential.user.uid;

            // Vérification supplémentaire : le document users existe-t-il ?
            let userDoc = await db.collection("users").doc(uid).get();

            // --- AUTO-RÉPARATION SUPPRIMÉE POUR PROD ---

            if (!userDoc.exists) {
                // Oups, l'utilisateur a un compte Auth mais pas de profil Firestore (Cas Prod)
                await firebase.auth().signOut();
                showError("Compte utilisateur corrompu. Contactez l'admin.");
                loginBtn.disabled = false;
                loginBtn.textContent = "Se connecter";
            } else {
                // Petit délai pour assurer la sauvegarde de la session avant redirection
                setTimeout(() => window.location.href = 'index.html', 500);
            }

        } catch (error) {
            console.error(error);
            showError("Nom d'utilisateur ou mot de passe incorrect.");
            loginBtn.disabled = false;
            loginBtn.textContent = "Se connecter";
        }
    });

    function showError(message) {
        loginError.textContent = message; 
        loginError.style.display = 'block';
    }
});