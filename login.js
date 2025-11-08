document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');

    // Redirige si l'utilisateur est déjà connecté
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            window.location.href = 'index.html'; // Le garde le redirigera
        }
    });

    loginBtn.addEventListener('click', () => {
        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            showError("Veuillez remplir tous les champs.");
            return;
        }

        firebase.auth().signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Succès, redirigé vers index.html
                window.location.href = 'index.html';
            })
            .catch((error) => {
                // Gérer les erreurs
                if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    showError("Email ou mot de passe incorrect.");
                } else {
                    showError("Une erreur est survenue.");
                }
            });
    });

    function showError(message) {
        loginError.textContent = message;
        loginError.style.display = 'block';
    }
});