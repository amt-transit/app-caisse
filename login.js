import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    
    // ON RÉCUPÈRE L'INPUT "USERNAME"
    const usernameInput = document.getElementById('username'); 
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');

    // CORRECTION : On ne redirige QUE si le profil existe déjà
    // Cela évite de couper l'herbe sous le pied à la création automatique
    onAuthStateChanged(auth, async user => {
        if (user) {
            try {
                const docRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(docRef); 
                if (docSnap.exists()) {
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
            emailTechnique = `${cleanUsername}@amt.com`;
        }

        console.log("Tentative de connexion avec :", emailTechnique); // Pour débugger

        try {
            // FORCE LA PERSISTANCE DE SESSION (Important pour le local)
            await setPersistence(auth, browserLocalPersistence);

            const userCredential = await signInWithEmailAndPassword(auth, emailTechnique, password);
            const uid = userCredential.user.uid;

            // Vérification supplémentaire : le document users existe-t-il ?
            const userDocRef = doc(db, "users", uid);
            let userDocSnap = await getDoc(userDocRef);

            // --- AUTO-RÉPARATION SUPPRIMÉE POUR PROD ---

            if (!userDocSnap.exists()) {
                // Oups, l'utilisateur a un compte Auth mais pas de profil Firestore (Cas Prod)
                await signOut(auth);
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