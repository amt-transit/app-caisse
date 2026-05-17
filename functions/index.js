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

// Provisionne un compte de connexion (email/mot de passe) pour un DÉMARCHEUR
// (parrain/filleul) + custom claims consommés par les règles Firestore de
// l'app mobile. Réservé admin/super_admin. Idempotent (réutilise le compte
// existant). NE donne AUCUN privilège staff (les règles staff lisent le rôle
// dans la collection users, pas le token).
exports.provisionDemarcheurAuth = functions.https.onCall(async (data, context) => {
    await assertCallerIsAdmin(context);

    const demarcheurId = ((data && data.demarcheurId) || "").trim();
    if (!demarcheurId) {
        throw new functions.https.HttpsError("invalid-argument", "demarcheurId requis.");
    }

    const demRef = admin.firestore().collection("demarcheurs").doc(demarcheurId);
    const demSnap = await demRef.get();
    if (!demSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Démarcheur introuvable.");
    }
    const dem = demSnap.data();

    // SÉCURITÉ : on n'utilise QUE l'email de la fiche démarcheur — JAMAIS
    // data.email fourni par l'appelant (réduit la surface d'attaque).
    const email = ((dem.email) || "").trim().toLowerCase();
    if (!email) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Email requis sur la fiche démarcheur (renseignez-le d'abord)."
        );
    }

    // Mot de passe : fourni par l'admin, sinon généré et renvoyé pour transmission.
    let password = (data && data.password) || "";
    let generated = false;
    if (!password || String(password).length < 6) {
        password = Math.random().toString(36).slice(-10) + "A1!";
        generated = true;
    }

    try {
        let userRecord = null;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
        } catch (e) {
            userRecord = null; // aucun compte existant -> on en créera un
        }

        if (userRecord) {
            // Un compte existe déjà pour cet email. On NE le réutilise QUE si
            // c'est sans risque, sinon = prise de contrôle de compte.
            // a) Refus si c'est un compte du PERSONNEL (doc users/{uid}).
            const staffSnap = await admin.firestore()
                .collection("users").doc(userRecord.uid).get();
            if (staffSnap.exists) {
                throw new functions.https.HttpsError(
                    "permission-denied",
                    "Cet email appartient à un compte du personnel : provisioning démarcheur interdit."
                );
            }
            // b) Refus si le compte porte un rôle non-démarcheur ou les claims
            //    d'un AUTRE démarcheur.
            const cc = userRecord.customClaims || {};
            if (cc.role && cc.role !== "demarcheur") {
                throw new functions.https.HttpsError(
                    "permission-denied",
                    "Cet email est rattaché à un compte privilégié : opération refusée."
                );
            }
            if (cc.role === "demarcheur" && cc.demarcheurId && cc.demarcheurId !== demarcheurId) {
                throw new functions.https.HttpsError(
                    "permission-denied",
                    "Cet email est déjà rattaché à un autre démarcheur."
                );
            }
            // Sûr : pas de doc staff, et (aucun claim) ou déjà CE démarcheur
            // -> re-provisioning idempotent (reset du mot de passe autorisé).
            await admin.auth().updateUser(userRecord.uid, { password });
        } else {
            userRecord = await admin.auth().createUser({
                email,
                password,
                displayName: `${dem.prenom || ""} ${dem.nom || ""}`.trim() || email,
            });
        }
        const uid = userRecord.uid;

        // Claims posés UNIQUEMENT sur un compte vérifié sûr ou nouvellement créé.
        await admin.auth().setCustomUserClaims(uid, {
            role: "demarcheur",
            demarcheurId,
        });

        const stamp = new Date().toISOString();
        await demRef.set(
            {
                authUid: uid,
                authEmail: email,
                authProvisionedAt: stamp,
                authProvisionedBy: context.auth.uid,
            },
            { merge: true }
        );
        // Index uid -> démarcheur (visibilité admin / secours).
        await admin.firestore().collection("demarcheur_auth").doc(uid).set({
            demarcheurId,
            email,
            updatedAt: stamp,
        });

        return {
            uid,
            email,
            generated,
            password: generated ? password : undefined,
        };
    } catch (error) {
        // Préserve les refus de sécurité (permission-denied, etc.).
        if (error instanceof functions.https.HttpsError) throw error;
        console.error("Erreur provisionDemarcheurAuth:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
