import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4",
    authDomain: "caisse-amt-perso.firebaseapp.com",
    projectId: "caisse-amt-perso",
    storageBucket: "caisse-amt-perso.firebasestorage.app",
    messagingSenderId: "682789156997",
    appId: "1:682789156997:web:9ce3303120851d37be91ec"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Activation de la persistance hors-ligne pour les zones sans réseau
enableIndexedDbPersistence(db).catch((err) => {
    console.warn("La persistance hors-ligne n'a pas pu être activée : ", err.code);
});