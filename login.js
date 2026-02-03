document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    
    // ON RÉCUPÈRE L'INPUT "USERNAME"
    const usernameInput = document.getElementById('username'); 
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');

    firebase.auth().onAuthStateChanged(user => {
        if (user) window.location.href = 'index.html';
    });

    loginBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            showError("Veuillez remplir tous les champs.");
            return;
        }

        // ON RECRÉE L'EMAIL TECHNIQUE
        const cleanUsername = username.toLowerCase().replace(/\s+/g, '');
        const emailTechnique = `${cleanUsername}@amt.local`;

        console.log("Tentative de connexion avec :", emailTechnique); // Pour débugger

        firebase.auth().signInWithEmailAndPassword(emailTechnique, password)
            .then(() => {
                window.location.href = 'index.html';
            })
            .catch((error) => {
                console.error(error);
                // Messages d'erreur simplifiés
                showError("Nom d'utilisateur ou mot de passe incorrect.");
            });
    });

    function showError(message) {
        loginError.textContent = message; 
        loginError.style.display = 'block';
    }
});