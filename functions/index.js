// API v2 (2e génération) : les fonctions sont déployées sur le runtime
// Cloud Run de 2e génération. Le handler reçoit UN seul argument `request`
// ({ data, auth, app, ... }). L'ancienne signature v1 (data, context) ne
// recevait pas l'identité ici -> "Vous devez être connecté" malgré une
// session valide. On s'aligne donc sur l'API v2.
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

// Région alignée sur l'URL appelée par l'app web (us-central1) : ne pas
// changer sans mettre à jour les appels côté client.
const REGION = "us-central1";

// VÉRIFICATION PUBLIQUE D'UNE FACTURE (anti-falsification).
// Le QR code d'une facture PDF pointe vers verify.html, qui appelle cette
// fonction. Elle lit la transaction via l'Admin SDK (source de vérité) et
// renvoie UNIQUEMENT des champs sûrs + le statut de paiement RÉEL et À JOUR.
// Pas d'authentification (le destinataire d'une facture n'est pas connecté),
// mais on n'expose que le minimum et l'id de doc est non devinable.
const TAUX_EUR = 655.957;
exports.verifyInvoice = onRequest({ region: REGION, invoker: "public", cors: true }, async (req, res) => {
    try {
        const c = String((req.query && req.query.c) || "");
        const id = String((req.query && req.query.id) || "");
        // c doit être une collection de transactions (route-aware) : on
        // n'autorise QUE ce motif pour empêcher la lecture d'autres données.
        if (!/^transactions(_[a-z0-9_]+)?$/.test(c) || !id) {
            res.status(400).json({ ok: false, error: "Paramètres invalides." });
            return;
        }
        const snap = await admin.firestore().collection(c).doc(id).get();
        if (!snap.exists) { res.json({ ok: true, found: false }); return; }
        const t = snap.data() || {};
        if (t.isDeleted) { res.json({ ok: true, found: false, deleted: true }); return; }

        // Devise d'affichage de la route.
        let currency = (t.agency === "paris") ? "EUR" : "XOF";
        if (currency !== "EUR" && t.agency && t.agency !== "abidjan" && t.agency !== "all") {
            try {
                const ac = await admin.firestore().collection("agencies_config").doc(t.agency).get();
                if (ac.exists && ac.data().currency === "EUR") currency = "EUR";
            } catch (e) { /* défaut XOF */ }
        }
        const factor = currency === "EUR" ? TAUX_EUR : 1;

        const total = parseFloat(t.prix) || 0;
        const paid = (parseFloat(t.montantParis) || 0) + (parseFloat(t.montantAbidjan) || 0);
        let remaining = total - paid;
        if (Math.abs(remaining) < 1) remaining = 0;
        let status = "IMPAYE";
        if (total > 0 && remaining <= 0) status = "PAYE";
        else if (paid > 0) status = "PARTIEL";

        res.json({
            ok: true,
            found: true,
            reference: t.reference || "",
            client: t.nom || "",
            destinataire: t.nomDestinataire || "",
            date: t.date || "",
            currency,
            total: total / factor,
            paid: paid / factor,
            remaining: remaining / factor,
            status,
            checkedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("verifyInvoice:", e);
        res.status(500).json({ ok: false, error: "Erreur serveur." });
    }
});

// ===========================================================================
//  getMyInvoices — app AMT Clients : factures du client connecté
// ---------------------------------------------------------------------------
//  Le client se connecte par SMS (Firebase Phone Auth) -> son numéro vérifié
//  est dans le token. On le réduit aux 9 derniers chiffres (phoneTail), puis
//  on interroge TOUTES les collections transactions* par destPhoneTail ET
//  expPhoneTail. Résultat : ses factures, toutes routes/origines confondues,
//  qu'il soit expéditeur OU destinataire. Sécurité : il ne peut voir que les
//  factures portant SON numéro (le token n'est pas falsifiable).
// ===========================================================================
const _currencyCache = {};
async function currencyForAgency(agency) {
    if (agency === "paris") return "EUR";
    if (!agency || agency === "abidjan" || agency === "all") return "XOF";
    if (_currencyCache[agency]) return _currencyCache[agency];
    let cur = "XOF";
    try {
        const ac = await admin.firestore().collection("agencies_config").doc(agency).get();
        if (ac.exists && ac.data().currency === "EUR") cur = "EUR";
    } catch (e) { /* défaut XOF */ }
    _currencyCache[agency] = cur;
    return cur;
}

exports.getMyInvoices = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");

    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    if (tail.length < 8) return { invoices: [], loyalty: { sentAsSender: 0, freeCartons: 0, toNext: 10 } };

    const db = admin.firestore();
    // Toutes les collections de factures (route-aware) : transactions,
    // transactions_aerien, transactions_<route>, ...
    const cols = await db.listCollections();
    const txCols = cols.map((c) => c.id).filter((id) => /^transactions(_[a-z0-9_]+)?$/.test(id));

    const TAUX = 655.957;
    const byKey = new Map(); // évite les doublons (même doc via exp ET dest)
    let sentAsSender = 0;

    for (const colName of txCols) {
        const col = db.collection(colName);
        let destSnap, expSnap;
        try {
            [destSnap, expSnap] = await Promise.all([
                col.where("destPhoneTail", "==", tail).limit(500).get(),
                col.where("expPhoneTail", "==", tail).limit(500).get(),
            ]);
        } catch (e) { continue; }

        const add = async (doc, role) => {
            const key = colName + "/" + doc.id;
            const t = doc.data() || {};
            if (t.isDeleted) return;
            const existing = byKey.get(key);
            if (existing) { if (existing.role !== role) existing.role = "both"; return; }

            const currency = await currencyForAgency(t.agency);
            const factor = currency === "EUR" ? TAUX : 1;
            const total = (parseFloat(t.prix) || 0) / factor;
            const paid = ((parseFloat(t.montantParis) || 0) + (parseFloat(t.montantAbidjan) || 0)) / factor;
            let remaining = total - paid;
            if (Math.abs(remaining) < 0.01) remaining = 0;
            let status = "IMPAYE";
            if (total > 0 && remaining <= 0) status = "PAYE";
            else if (paid > 0) status = "PARTIEL";

            // Fidélité : compter les envois en tant qu'EXPÉDITEUR (≠ AMT).
            const expName = String(t.nom || "");
            if (role === "exp" && !/amt/i.test(expName)) sentAsSender++;

            byKey.set(key, {
                id: doc.id,
                collection: colName,
                reference: t.reference || "",
                role, // 'exp' | 'dest' | 'both'
                counterpart: role === "exp" ? (t.nomDestinataire || "") : (t.nom || ""),
                date: t.date || t.dateAjout || "",
                total, paid, remaining, status, currency,
                agency: t.agency || "",
            });
        };

        for (const d of destSnap.docs) await add(d, "dest");
        for (const d of expSnap.docs) await add(d, "exp");
    }

    const invoices = Array.from(byKey.values())
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // Carton moyen offert toutes les 10 factures envoyées (expéditeur ≠ AMT).
    const freeCartons = Math.floor(sentAsSender / 10);
    const toNext = sentAsSender === 0 ? 10 : (10 - (sentAsSender % 10)) % 10 || 10;

    return { invoices, loyalty: { sentAsSender, freeCartons, toNext } };
});

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
exports.createAgent = onCall({ region: REGION, invoker: "public" }, async (request) => {
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
exports.deleteAgent = onCall({ region: REGION, invoker: "public" }, async (request) => {
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
exports.provisionDemarcheurAuth = onCall({ region: REGION, invoker: "public" }, async (request) => {
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
            // MULTI-ROUTE : on accepte qu'un même compte soit lié à plusieurs
            // fiches démarcheur, à condition que chacune existe (= fiche active
            // sur sa route). On filtre les liens orphelins et on AJOUTE le
            // nouveau lien (route + id) au lieu de refuser.
            // Pour la rétrocompat, les claims legacy `agency` + `demarcheurId`
            // continuent d'être posés (= lien le plus récemment activé).
            // Sûr : pas de doc staff, role démarcheur (ou aucun) — on autorise
            // le (re)provisioning.
            await admin.auth().updateUser(userRecord.uid, { password });
        } else {
            userRecord = await admin.auth().createUser({
                email,
                password,
                displayName: `${dem.prenom || ""} ${dem.nom || ""}`.trim() || email,
            });
        }
        const uid = userRecord.uid;

        // ── Construction des claims MULTI-ROUTE ────────────────────────
        // On lit les claims existants pour préserver les autres routes
        // auxquelles ce compte serait déjà lié. Chaque lien {agency, id} est
        // conservé SI sa fiche existe encore (orphelins purgés).
        const freshRecord = await admin.auth().getUser(uid).catch(() => userRecord);
        const oldClaims = (freshRecord && freshRecord.customClaims) || {};
        const oldLinks = Array.isArray(oldClaims.links) ? oldClaims.links : [];
        // Si pas de tableau links, fallback sur les claims legacy.
        if (oldLinks.length === 0 && oldClaims.demarcheurId && oldClaims.agency) {
            oldLinks.push({ agency: oldClaims.agency, demarcheurId: oldClaims.demarcheurId });
        }

        // Purge des liens orphelins (fiche disparue) + dédoublonnage par
        // (agency, demarcheurId). On retire aussi la route demandée si elle
        // y figure déjà avec un autre id, pour la remplacer proprement.
        const linksOk = [];
        for (const l of oldLinks) {
            if (!l || !l.agency || !l.demarcheurId) continue;
            if (l.agency === agency) continue; // on remplace l'entrée pour cette route
            try {
                const lSnap = await admin.firestore()
                    .collection(routeCollectionName("demarcheurs", l.agency))
                    .doc(l.demarcheurId).get();
                if (lSnap.exists) linksOk.push({ agency: l.agency, demarcheurId: l.demarcheurId });
            } catch (_) { /* collection absente : on saute */ }
        }
        // Ajout de la route demandée en TÊTE (= lien "principal" pour les
        // claims legacy `agency`/`demarcheurId`).
        const newLinks = [{ agency: agency || null, demarcheurId }, ...linksOk];

        await admin.auth().setCustomUserClaims(uid, {
            role: "demarcheur",
            // Legacy (rétrocompat avec les comptes / le code existant) :
            demarcheurId,
            agency: agency || null,
            // Multi-route :
            links: newLinks,
            demarcheurIds: newLinks.map((l) => l.demarcheurId), // tableau plat (rules)
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
exports.reconcilePartnerBalances = onCall({ region: REGION, invoker: "public" }, async (request) => {
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
    { region: REGION, timeoutSeconds: 540, memory: "512MiB", invoker: "public" },
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
    { region: REGION, timeoutSeconds: 540, memory: "512MiB", invoker: "public" },
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

// ============================================================================
//  NOTIFICATIONS PUSH (Expo Push API)
// ----------------------------------------------------------------------------
//  Déclencheurs Firestore : à la création d'une commission ou d'un retrait
//  (= retrait validé/payé côté staff), on envoie une notification push au
//  démarcheur concerné via son token Expo (stocké sur sa fiche).
//
//  Limitation Firestore v2 : pas de wildcard sur le nom de collection dans
//  le path d'un trigger. On déclare donc UN trigger par collection connue :
//    - commissions / retraits          (historique paris/abidjan)
//    - commissions_chine / retraits_chine  (route SaaS Chine, seule active)
//  Ajouter une nouvelle route SaaS = ajouter 2 triggers ci-dessous.
//
//  L'API Expo Push : https://exp.host/--/api/v2/push/send (HTTPS POST). Pas
//  de credentials côté serveur — c'est Expo qui relaie vers FCM/APNS. Fetch
//  natif (Node 20).
// ============================================================================

async function sendExpoPush(tokens, payload) {
    const list = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
    if (list.length === 0) return { sent: 0 };
    const messages = list.map((t) => ({
        to: t,
        sound: "default",
        priority: "high",
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
    }));
    try {
        const resp = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Accept-Encoding": "gzip, deflate",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
        });
        const result = await resp.json();
        console.log("[push] sent", list.length, JSON.stringify(result).slice(0, 250));
        return { sent: list.length };
    } catch (e) {
        console.warn("[push] erreur d'envoi :", e && e.message);
        return { sent: 0, error: String((e && e.message) || e) };
    }
}

// Lit le pushToken (et nom prénom) du démarcheur dans la collection de la route.
async function getDemarcheurPush(agency, demarcheurId) {
    if (!demarcheurId) return null;
    const coll = routeCollectionName("demarcheurs", agency);
    try {
        const snap = await admin.firestore().collection(coll).doc(demarcheurId).get();
        if (!snap.exists) return null;
        const d = snap.data() || {};
        return {
            token: d.pushToken || null,
            prenom: d.prenom || "",
            nom: d.nom || "",
        };
    } catch (e) {
        console.warn("[push] lecture démarcheur échouée :", e && e.message);
        return null;
    }
}

const fmtMoney = (n) => (Number(n) || 0).toLocaleString("fr-FR") + " F CFA";

// ── Trigger commission créée ──────────────────────────────────────────────
async function handleCommissionCreated(snap, agency) {
    if (!snap) return;
    const c = snap.data() || {};
    const dem = await getDemarcheurPush(agency, c.demarcheurId);
    if (!dem || !dem.token) return;
    const isParrainage = c.type === "parrainage";
    const montant = Number(c.montantNet) || 0;
    const title = isParrainage ? "🤝 Bonus parrainage gagné !" : "💰 Nouvelle commission";
    const body = isParrainage
        ? `Un filleul a généré une expédition — vous touchez ${fmtMoney(montant)}.`
        : `Vous avez gagné ${fmtMoney(montant)} sur la facture ${c.expeditionId || "-"}.`;
    await sendExpoPush(dem.token, {
        title, body,
        data: { type: "commission", commissionId: snap.id, expeditionId: c.expeditionId || "" },
    });
}

// Trigger pour la collection HISTORIQUE (paris / abidjan).
exports.notifyCommissionPushGlobal = onDocumentCreated(
    { region: REGION, document: "commissions/{id}" },
    async (event) => handleCommissionCreated(event.data, "paris"),
);
// Trigger pour la route SaaS Chine.
exports.notifyCommissionPushChine = onDocumentCreated(
    { region: REGION, document: "commissions_chine/{id}" },
    async (event) => handleCommissionCreated(event.data, "chine"),
);

// ── Trigger retrait validé ────────────────────────────────────────────────
// Un retrait est créé par le staff lors de la validation/paiement (côté web).
// Sa simple existence dans `retraits_<route>` signifie « validé / payé ».
async function handleWithdrawalCreated(snap, agency) {
    if (!snap) return;
    const r = snap.data() || {};
    const dem = await getDemarcheurPush(agency, r.demarcheurId);
    if (!dem || !dem.token) return;
    const montant = Number(r.montant) || 0;
    const moyen = r.moyenPaiement ? ` (${r.moyenPaiement})` : "";
    await sendExpoPush(dem.token, {
        title: "✅ Paiement validé",
        body: `Vous avez reçu ${fmtMoney(montant)}${moyen}. Merci pour votre confiance !`,
        data: { type: "retrait", retraitId: snap.id },
    });
}

exports.notifyWithdrawalPushGlobal = onDocumentCreated(
    { region: REGION, document: "retraits/{id}" },
    async (event) => handleWithdrawalCreated(event.data, "paris"),
);
exports.notifyWithdrawalPushChine = onDocumentCreated(
    { region: REGION, document: "retraits_chine/{id}" },
    async (event) => handleWithdrawalCreated(event.data, "chine"),
);

// ── Test manuel de notification push (callable depuis l'app mobile) ────────
// Permet au démarcheur connecté de s'envoyer une notif de TEST à lui-même
// pour vérifier que :
//   - son token push est bien enregistré
//   - le pipeline Expo Push -> FCM fonctionne
//   - les permissions notification sont accordées sur le device
// Sécurité : doit être appelé par un démarcheur connecté. La fonction lit le
// token UNIQUEMENT sur sa propre fiche (pas moyen de notifier quelqu'un d'autre).
exports.sendTestPush = onCall({ region: REGION, invoker: "public" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Connexion requise.");
    }
    const claims = request.auth.token || {};
    if (claims.role !== "demarcheur") {
        throw new HttpsError("permission-denied", "Réservé aux comptes démarcheur.");
    }
    const data = request.data || {};
    // L'appelant précise sur QUELLE route il veut tester (utile multi-route).
    // Sinon fallback sur les claims legacy.
    const agency = String(data.agency || claims.agency || "chine").trim();
    const demarcheurId = String(data.demarcheurId || claims.demarcheurId || "").trim();
    if (!demarcheurId) {
        throw new HttpsError("invalid-argument", "Identifiant démarcheur manquant.");
    }
    // Sécurité : on vérifie que ce demarcheurId est BIEN dans les links du
    // compte (= que le démarcheur ne tente pas de tester pour quelqu'un d'autre).
    const myIds = Array.isArray(claims.demarcheurIds)
        ? claims.demarcheurIds
        : [claims.demarcheurId].filter(Boolean);
    if (!myIds.includes(demarcheurId)) {
        throw new HttpsError("permission-denied", "Ce démarcheur n'est pas rattaché à votre compte.");
    }

    const dem = await getDemarcheurPush(agency, demarcheurId);
    if (!dem) {
        return { ok: false, reason: "fiche_introuvable", agency, demarcheurId };
    }
    if (!dem.token) {
        return { ok: false, reason: "pas_de_token", agency, demarcheurId,
            hint: "Ouvrez l'app sur un build natif (pas Expo Go) et acceptez la permission notifications.",
        };
    }
    const res = await sendExpoPush(dem.token, {
        title: "🔔 Notification de test",
        body: `Bonjour ${dem.prenom || ''} ! Si vous lisez ceci, les notifications fonctionnent ✔`,
        data: { type: "test" },
    });
    return { ok: true, tokenPreview: String(dem.token).slice(0, 20) + "…", expoResponse: res };
});
