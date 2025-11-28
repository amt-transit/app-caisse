document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    const usernameInput = document.getElementById('username'); // ID modifié
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');
    
    // DOMAINE VIRTUEL (Invisible pour l'utilisateur)
    const DOMAIN_SUFFIX = "@amt.local"; 

    firebase.auth().onAuthStateChanged(user => {
        if (user) window.location.href = 'index.html';
    });

    loginBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim(); // On récupère "Salif"
        const password = passwordInput.value;

        if (!username || !password) {
            showError("Veuillez remplir tous les champs.");
            return;
        }

        // ON FABRIQUE L'EMAIL TECHNIQUE
        const emailTechnique = username + DOMAIN_SUFFIX; // "Salif@amt.local"

        firebase.auth().signInWithEmailAndPassword(emailTechnique, password)
            .then(() => {
                window.location.href = 'index.html';
            })
            .catch((error) => {
                console.error(error);
                if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-email') {
                    showError("Nom d'utilisateur ou mot de passe incorrect.");
                } else {
                    showError("Erreur : " + error.message);
                }
            });
    });

    function showError(message) {
        loginError.textContent = message;
        loginError.style.display = 'block';
    }
});