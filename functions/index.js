// API v2 (2e génération) : les fonctions sont déployées sur le runtime
// Cloud Run de 2e génération. Le handler reçoit UN seul argument `request`
// ({ data, auth, app, ... }). L'ancienne signature v1 (data, context) ne
// recevait pas l'identité ici -> "Vous devez être connecté" malgré une
// session valide. On s'aligne donc sur l'API v2.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

// Région alignée sur l'URL appelée par l'app web (us-central1) : ne pas
// changer sans mettre à jour les appels côté client.
const REGION = "us-central1";

// SÉCURITÉ : vérifie que l'appelant est connecté ET possède un rôle
// admin/super_admin. On relit sa fiche Firestore avec l'Admin SDK
// (source de vérité non falsifiable côté client).
async function assertCallerIsAdmin(auth) {
    if (!auth) {
        throw new HttpsError("unauthenticated", "Vous devez être connecté.");
    }
    const callerSnap = await admin.firestore()
        .collection("users").doc(auth.uid).get();
    const role = callerSnap.exists ? callerSnap.data().role : null;
    if (role !== "admin" && role !== "super_admin") {
        throw new HttpsError(
            "permission-denied",
            "Action réservée aux administrateurs."
        );
    }
}

// Fonction pour Créer un Agent
exports.createAgent = onCall({ region: REGION }, async (request) => {
    // 1. SÉCURITÉ : seul un admin/super_admin peut créer un compte
    await assertCallerIsAdmin(request.auth);
    const data = request.data || {};

    try {
        // 2. Création de l'utilisateur avec l'Admin SDK
        const userRecord = await admin.auth().createUser({
            email: data.email,
            password: data.password,
            displayName: data.displayName,
        });
        return { uid: userRecord.uid };
    } catch (error) {
        console.error("Erreur création utilisateur:", error);
        throw new HttpsError("internal", error.message);
    }
});

// Fonction pour Supprimer un Agent
exports.deleteAgent = onCall({ region: REGION }, async (request) => {
    // SÉCURITÉ : seul un admin/super_admin peut supprimer un compte
    await assertCallerIsAdmin(request.auth);
    const data = request.data || {};

    try {
        await admin.auth().deleteUser(data.uid);
        return { success: true };
    } catch (error) {
        console.error("Erreur suppression utilisateur:", error);
        throw new HttpsError("internal", error.message);
    }
});

// Provisionne un compte de connexion (email/mot de passe) pour un DÉMARCHEUR
// (parrain/filleul) + custom claims consommés par les règles Firestore de
// l'app mobile. Réservé admin/super_admin. Idempotent (réutilise le compte
// existant). NE donne AUCUN privilège staff (les règles staff lisent le rôle
// dans la collection users, pas le token).
exports.provisionDemarcheurAuth = onCall({ region: REGION }, async (request) => {
    await assertCallerIsAdmin(request.auth);
    const data = request.data || {};

    const demarcheurId = ((data && data.demarcheurId) || "").trim();
    if (!demarcheurId) {
        throw new HttpsError("invalid-argument", "demarcheurId requis.");
    }
    // La fiche démarcheur vit dans demarcheurs_<route> (sauf paris/abidjan
    // historiques). L'appelant (page Réseau Partenaires) passe l'agence active.
    const agency = ((data && data.agency) || "").trim();
    const demCollName = routeCollectionName("demarcheurs", agency);
    const demRef = admin.firestore().collection(demCollName).doc(demarcheurId);
    const demSnap = await demRef.get();
    if (!demSnap.exists) {
        throw new HttpsError("not-found", "Démarcheur introuvable.");
    }
    const dem = demSnap.data();

    // SÉCURITÉ : on n'utilise QUE l'email de la fiche démarcheur — JAMAIS
    // data.email fourni par l'appelant (réduit la surface d'attaque).
    const email = ((dem.email) || "").trim().toLowerCase();
    if (!email) {
        throw new HttpsError(
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
                throw new HttpsError(
                    "permission-denied",
                    "Cet email appartient à un compte du personnel : provisioning démarcheur interdit."
                );
            }
            // b) Refus si le compte porte un rôle non-démarcheur ou les claims
            //    d'un AUTRE démarcheur.
            const cc = userRecord.customClaims || {};
            if (cc.role && cc.role !== "demarcheur") {
                throw new HttpsError(
                    "permission-denied",
                    "Cet email est rattaché à un compte privilégié : opération refusée."
                );
            }
            if (cc.role === "demarcheur" && cc.demarcheurId && cc.demarcheurId !== demarcheurId) {
                // L'ancien démarcheur lié à ce compte est-il encore actif ? On
                // vérifie sur TOUTES les routes possibles (le compte n'a pas
                // forcément la même agency aujourd'hui qu'à la création).
                // Si la fiche n'existe nulle part = ORPHELIN, on autorise le
                // re-provisioning (cas "Repartir de zéro"). Sinon, on refuse.
                let orphan = true;
                const candidates = new Set();
                candidates.add("demarcheurs");
                if (cc.agency) candidates.add(routeCollectionName("demarcheurs", cc.agency));
                if (agency) candidates.add(routeCollectionName("demarcheurs", agency));
                for (const coll of candidates) {
                    try {
                        const snap = await admin.firestore().collection(coll).doc(cc.demarcheurId).get();
                        if (snap.exists) { orphan = false; break; }
                    } catch (_) { /* collection absente : on continue */ }
                }
                if (!orphan) {
                    throw new HttpsError(
                        "permission-denied",
                        "Cet email est déjà rattaché à un autre démarcheur actif."
                    );
                }
                // Sinon : claim orphelin, on autorise le re-provisioning
                // (les claims seront réécrits plus bas avec le nouveau ID).
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
        // agency : utile à l'app mobile pour interroger la bonne collection
        // (demarcheurs_<route>, commissions_<route>, etc.).
        await admin.auth().setCustomUserClaims(uid, {
            role: "demarcheur",
            demarcheurId,
            agency: agency || null,
        });

        const stamp = new Date().toISOString();
        await demRef.set(
            {
                authUid: uid,
                authEmail: email,
                authProvisionedAt: stamp,
                authProvisionedBy: request.auth.uid,
            },
            { merge: true }
        );
        // Index uid -> démarcheur (visibilité admin / secours).
        await admin.firestore().collection("demarcheur_auth").doc(uid).set({
            demarcheurId,
            agency: agency || null,
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
        if (error instanceof HttpsError) throw error;
        console.error("Erreur provisionDemarcheurAuth:", error);
        throw new HttpsError("internal", error.message);
    }
});

// ============================================================================
//  SOLDE PARTENAIRE : « DISPONIBLE » vs « POTENTIEL »  (au prorata du paiement)
// ----------------------------------------------------------------------------
//  Règle métier : une commission n'est PERCEVABLE qu'à hauteur de ce que le
//  client a réellement payé sur sa facture.
//    part_payée = (montantParis + montantAbidjan) / prix   (borné 0..1)
//    montantDisponible = round(montantNet * part_payée)   -> retirable
//    montantPotentiel  = montantNet - montantDisponible    -> en attente
//  La fiche démarcheur est RECALCULÉE de zéro (idempotent, auto-réparant) :
//    totalGagne      = Σ montantNet
//    soldePotentiel  = Σ montantPotentiel
//    soldeDisponible = max(0, Σ montantDisponible - totalRetire)
//  Source de vérité unique, côté serveur (Admin SDK = lit les factures même
//  si les règles l'interdisent à l'app mobile).
// ============================================================================

// Réplique getCollectionName (agencies-config.js) pour les factures
// (transactions). Une commission est créée au DÉPART -> agency = agence de
// départ (paris, chine, dakar...).
function txCollectionCandidates(agency) {
    const a = String(agency || "").trim();
    const list = ["transactions"];
    if (a && a !== "paris" && a !== "abidjan" && a !== "all") {
        if (a.includes("_")) list.push(`transactions_${a.split("_")[1]}`);
        list.push(`transactions_${a}`);
        list.push(`transactions_${a.split("_").pop()}`);
    }
    return [...new Set(list)];
}

async function findInvoice(db, expeditionId, agency) {
    if (!expeditionId) return null;
    for (const coll of txCollectionCandidates(agency)) {
        try {
            const snap = await db.collection(coll)
                .where("reference", "==", expeditionId).limit(1).get();
            if (!snap.empty) return snap.docs[0].data();
        } catch (e) { /* collection inexistante : on essaie la suivante */ }
    }
    return null;
}

function paidRatio(tx) {
    if (!tx) return 0;
    const total = Number(tx.prix) || 0;
    if (total <= 0) return 0;
    const paid = (Number(tx.montantParis) || 0) + (Number(tx.montantAbidjan) || 0);
    let r = paid / total;
    if (!isFinite(r) || r < 0) r = 0;
    if (r > 1) r = 1;
    return r;
}

// Recalcule et ÉCRIT la fiche d'UN démarcheur + le détail de chaque commission.
// agency : route du démarcheur (sert à router demarcheurs/commissions).
async function reconcileOne(demId, agency) {
    const db = admin.firestore();
    const demCollName = routeCollectionName("demarcheurs", agency);
    const commCollName = routeCollectionName("commissions", agency);
    const demRef = db.collection(demCollName).doc(demId);
    const demSnap = await demRef.get();
    if (!demSnap.exists) {
        throw new HttpsError("not-found", "Démarcheur introuvable.");
    }
    const dem = demSnap.data() || {};

    const commSnap = await db.collection(commCollName)
        .where("demarcheurId", "==", demId).get();

    let sumNet = 0, sumDispo = 0, sumPot = 0;
    const ratioCache = new Map();
    const updates = [];

    for (const d of commSnap.docs) {
        const c = d.data() || {};
        const net = Number(c.montantNet) || 0;
        const key = `${c.agency || ""}|${c.expeditionId || ""}`;
        let ratio = ratioCache.get(key);
        if (ratio === undefined) {
            const tx = await findInvoice(db, c.expeditionId, c.agency);
            ratio = paidRatio(tx);
            ratioCache.set(key, ratio);
        }
        const dispo = Math.round(net * ratio);
        const pot = net - dispo;
        sumNet += net; sumDispo += dispo; sumPot += pot;
        const etat = ratio >= 1 ? "disponible" : (ratio > 0 ? "partiel" : "en_attente");
        updates.push({
            ref: d.ref,
            data: {
                montantDisponible: dispo,
                montantPotentiel: pot,
                partPayee: Math.round(ratio * 100), // % payé de la facture
                etatSolde: etat,
            },
        });
    }

    // Commits par lots de 400 (limite Firestore = 500 op/lot).
    for (let i = 0; i < updates.length; i += 400) {
        const batch = db.batch();
        updates.slice(i, i + 400).forEach((u) => batch.update(u.ref, u.data));
        await batch.commit();
    }

    const totalRetire = Number(dem.totalRetire) || 0;
    const soldeDisponible = Math.max(0, sumDispo - totalRetire);
    await demRef.set({
        totalGagne: sumNet,
        soldePotentiel: sumPot,
        soldeDisponible,
        soldesReconciliesAt: new Date().toISOString(),
    }, { merge: true });

    return {
        demarcheurId: demId,
        totalGagne: sumNet,
        soldePotentiel: sumPot,
        soldeDisponible,
        nbCommissions: commSnap.size,
    };
}

// Appelable par LE PARTENAIRE lui-même (claims demarcheur) ou par un admin
// (en passant demarcheurId). L'app mobile l'appelle au chargement : le
// partenaire voit toujours des montants justes, et soldeDisponible (utilisé
// pour les retraits) est à jour.
exports.reconcilePartnerBalances = onCall({ region: REGION }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Vous devez être connecté.");
    }
    const claims = request.auth.token || {};
    const data = request.data || {};
    let demId = null;
    let agency = null;

    if (claims.role === "demarcheur" && claims.demarcheurId) {
        demId = claims.demarcheurId; // un partenaire ne réconcilie que LUI
        // agency vient du custom claim posé au provisioning (Phase mobile).
        // Pour les comptes pré-existants sans agency dans le claim, on retombe
        // sur "chine" (seule route ayant historiquement des partenaires).
        agency = claims.agency || "chine";
    } else {
        await assertCallerIsAdmin(request.auth); // sinon réservé admin
        demId = String(data.demarcheurId || "").trim();
        agency = String(data.agency || "").trim();
        if (!demId) {
            throw new HttpsError("invalid-argument", "demarcheurId requis.");
        }
    }

    try {
        return await reconcileOne(demId, agency);
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error("Erreur reconcilePartnerBalances:", error);
        throw new HttpsError("internal", error.message);
    }
});

// MIGRATION / recalcul global — réservé admin/super_admin. À lancer UNE fois
// après déploiement, puis à volonté (idempotent).
exports.reconcileAllPartnersBalances = onCall(
    { region: REGION, timeoutSeconds: 540, memory: "512MiB" },
    async (request) => {
        await assertCallerIsAdmin(request.auth);
        try {
            const db = admin.firestore();
            // L'appelant (admin) passe agency = route active (ex: 'chine').
            // Réconciliation route par route — on traite UNE route par appel.
            const agency = String((request.data || {}).agency || "").trim();
            const demCollName = routeCollectionName("demarcheurs", agency);
            const demsSnap = await db.collection(demCollName).get();
            let ok = 0;
            const erreurs = [];
            for (const d of demsSnap.docs) {
                try { await reconcileOne(d.id, agency); ok++; }
                catch (e) { erreurs.push({ id: d.id, error: String(e && e.message || e) }); }
            }
            return { total: demsSnap.size, reconcilies: ok, erreurs, agency };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("Erreur reconcileAllPartnersBalances:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);

// ============================================================================
//  MIGRATION P2b — RDV / DEVIS / DEMANDES vers les collections PAR ROUTE
// ----------------------------------------------------------------------------
//  Avant P2a, les RDV (appointments), devis (quotes) et demandes de devis
//  (quote_requests) des routes SaaS étaient stockés dans les collections
//  COMMUNES. P2a fait écrire/lire les NOUVEAUX dans les collections par route
//  (appointments_chine, ...). Cette migration déplace l'EXISTANT des routes
//  SaaS depuis la collection commune vers la collection de route.
//
//  Sûr : Paris/Abidjan/all (= historique) ne bougent JAMAIS. On ne déplace
//  que les docs dont l'agence est une route SaaS. Copie + suppression dans le
//  MÊME lot atomique (Firestore : tout ou rien) → aucun doc à moitié migré.
//  IDs CONSERVÉS (les liens RDV↔facture de P5 reposent dessus). Idempotent :
//  rejouable sans risque (les docs déjà migrés ne sont plus dans la commune).
// ============================================================================

// Réplique EXACTE de getCollectionName (agencies-config.js) côté serveur.
function routeCollectionName(base, agency) {
    const a = String(agency || "").trim();
    if (!a || a === "paris" || a === "abidjan" || a === "all") return base;
    if (a.includes("_")) return `${base}_${a.split("_")[1]}`; // arrivée SaaS
    return `${base}_${a}`; // départ SaaS
}

async function migrateBaseCollection(db, base) {
    const snap = await db.collection(base).get();
    let migrated = 0;
    let kept = 0; // historiques (paris/abidjan/all/sans agence) → non touchés
    const errors = [];

    // 1 doc migré = 1 set (cible) + 1 delete (source) = 2 ops. Lots ≤ 400 ops
    // donc ≤ 200 docs par lot.
    let batch = db.batch();
    let opsInBatch = 0;
    const commitIfNeeded = async (force) => {
        if (opsInBatch > 0 && (force || opsInBatch >= 400)) {
            await batch.commit();
            batch = db.batch();
            opsInBatch = 0;
        }
    };

    for (const d of snap.docs) {
        try {
            const data = d.data() || {};
            const target = routeCollectionName(base, data.agency);
            if (target === base) { kept++; continue; } // historique : on ne touche pas
            // Copie en CONSERVANT l'id, puis suppression de la source, dans le
            // même lot atomique.
            batch.set(db.collection(target).doc(d.id), data);
            batch.delete(db.collection(base).doc(d.id));
            opsInBatch += 2;
            migrated++;
            await commitIfNeeded(false);
        } catch (e) {
            errors.push({ id: d.id, error: String((e && e.message) || e) });
        }
    }
    await commitIfNeeded(true);
    return { collection: base, scanned: snap.size, migrated, kept, errors };
}

// Réservé admin/super_admin. À lancer UNE fois après déploiement de P2a.
// Idempotent : rejouable sans risque.
exports.migrateSaasRdvDevis = onCall(
    { region: REGION, timeoutSeconds: 540, memory: "512MiB" },
    async (request) => {
        await assertCallerIsAdmin(request.auth);
        try {
            const db = admin.firestore();
            const results = [];
            for (const base of ["appointments", "quotes", "quote_requests"]) {
                results.push(await migrateBaseCollection(db, base));
            }
            return { ok: true, results };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("Erreur migrateSaasRdvDevis:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
