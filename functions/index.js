const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// SÉCURITÉ : vérifie que l'appelant est connecté ET possède un rôle admin/super_admin.
// On relit sa fiche Firestore avec l'Admin SDK (source de vérité non falsifiable côté client).
async function assertCallerIsAdmin(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Vous devez être connecté.");
    }
    const callerSnap = await admin.firestore().collection("users").doc(context.auth.uid).get();
    const role = callerSnap.exists ? callerSnap.data().role : null;
    if (role !== "admin" && role !== "super_admin") {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Action réservée aux administrateurs."
        );
    }
}

// Fonction pour Créer un Agent
exports.createAgent = functions.https.onCall(async (data, context) => {
    // 1. SÉCURITÉ : seul un admin/super_admin peut créer un compte
    await assertCallerIsAdmin(context);

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
    // SÉCURITÉ : seul un admin/super_admin peut supprimer un compte
    await assertCallerIsAdmin(context);

    try {
        await admin.auth().deleteUser(data.uid);
        return { success: true };
    } catch (error) {
        console.error("Erreur suppression utilisateur:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
