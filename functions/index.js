const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// Fonction pour Créer un Agent
exports.createAgent = functions.https.onCall(async (data, context) => {
    // 1. SÉCURITÉ : Vérifier si l'utilisateur qui appelle la fonction est connecté
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Vous devez être connecté pour créer un compte.");
    }

    try {
        // 2. Création de l'utilisateur avec l'Admin SDK (Bypass les règles de création standard)
        const userRecord = await admin.auth().createUser({
            email: data.email,
            password: data.password,
            displayName: data.displayName,
        });

        // On retourne uniquement l'ID du nouvel utilisateur à l'application front-end
        return { uid: userRecord.uid };
    } catch (error) {
        console.error("Erreur création utilisateur:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// Fonction pour Supprimer un Agent
exports.deleteAgent = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Vous devez être connecté pour supprimer un compte.");
    }

    try {
        await admin.auth().deleteUser(data.uid);
        return { success: true };
    } catch (error) {
        console.error("Erreur suppression utilisateur:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
