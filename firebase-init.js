const firebaseConfig = {
    apiKey: "AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4",
    authDomain: "caisse-amt-perso.firebaseapp.com",
    projectId: "caisse-amt-perso",
    storageBucket: "caisse-amt-perso.firebasestorage.app",
    messagingSenderId: "682789156997",
    appId: "1:682789156997:web:9ce3303120851d37be91ec"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// DÉTECTION ENVIRONNEMENT LOCAL (EMULATEURS)
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    db.useEmulator("localhost", 8080);
    firebase.auth().useEmulator("http://localhost:9099");
    console.log("🔧 Mode Local : Connecté aux émulateurs Firebase");
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (confirm("Voulez-vous vous déconnecter ?")) firebase.auth().signOut();
    });
}