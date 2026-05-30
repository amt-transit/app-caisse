// Init Firebase pour l'app AMT Clients (léger : Auth + Functions seulement,
// PAS de Firestore — les données passent par la Cloud Function getMyInvoices,
// qui lit Firestore côté serveur et sécurise l'accès par le numéro vérifié).
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4",
    authDomain: "caisse-amt-perso.firebaseapp.com",
    projectId: "caisse-amt-perso",
    storageBucket: "caisse-amt-perso.firebasestorage.app",
    messagingSenderId: "682789156997",
    appId: "1:682789156997:web:9ce3303120851d37be91ec"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// getMyInvoices est déployée en us-central1 (région par défaut).
export const functions = getFunctions(app, "us-central1");
