// API v2 (2e génération) : les fonctions sont déployées sur le runtime
// Cloud Run de 2e génération. Le handler reçoit UN seul argument `request`
// ({ data, auth, app, ... }). L'ancienne signature v1 (data, context) ne
// recevait pas l'identité ici -> "Vous devez être connecté" malgré une
// session valide. On s'aligne donc sur l'API v2.
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
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

// Suivi colis PUBLIC (lien partageable, sans compte). Renvoie UNIQUEMENT les
// étapes de livraison (aucun montant, ni nom complet, ni téléphone). Mêmes
// paramètres que verifyInvoice : c (collection transactions route-aware) + id.
exports.verifyTracking = onRequest({ region: REGION, invoker: "public", cors: true }, async (req, res) => {
    try {
        const c = String((req.query && req.query.c) || "");
        const id = String((req.query && req.query.id) || "");
        if (!/^transactions(_[a-z0-9_]+)?$/.test(c) || !id) {
            res.status(400).json({ ok: false, error: "Paramètres invalides." });
            return;
        }
        const db = admin.firestore();
        const snap = await db.collection(c).doc(id).get();
        if (!snap.exists) { res.json({ ok: true, found: false }); return; }
        const t = snap.data() || {};
        if (t.isDeleted) { res.json({ ok: true, found: false, deleted: true }); return; }

        const ref = String(t.reference || "");
        // Collection livraisons dérivée de la collection transactions (route + aérien).
        const aerien = /_aerien$/.test(c);
        const route = configSourceForCollection(c);
        const suffix = (route === "paris" ? "" : "_" + route) + (aerien ? "_aerien" : "");
        const livCols = [`livraisons${suffix}`, `livraisons${suffix}_archives`];
        const livraisons = [];
        for (const lc of livCols) {
            try { const ls = await db.collection(lc).where("ref", "==", ref).get(); ls.forEach((d) => livraisons.push(d.data() || {})); }
            catch (e) { /* collection absente */ }
        }

        // Étape (0 Entrepôt, 1 Conteneur/Départ, 2 Arrivé, 3 Livré) — même règle
        // que l'app (scanHistory par label, sinon repli sur le statut global).
        const stageOf = (liv, label) => {
            const scans = (liv.scanHistory || []).filter((s) => !label || s.scanRef === label)
                .sort((a, b) => String(b.date).localeCompare(String(a.date)));
            if (scans.length) {
                const tp = scans[0].type;
                if (tp === "REMISE_CLIENT") return 3;
                if (tp === "DECHARGEMENT_ABIDJAN") return 2;
                if (tp === "CONTENEUR_CHARGEMENT" || tp === "DEPART_VOL" || tp === "DEPART_VOL_RETOUR") return 1;
                if (tp === "ENTREPOT_PARIS") return 0;
            }
            if (liv.status === "LIVRE") return 3;
            if (liv.containerStatus === "EN_COURS") return 2;
            if (liv.containerStatus === "A_VENIR") return 1;
            return 0;
        };

        const colis = [];
        livraisons.forEach((liv) => {
            const labels = (liv.labels && liv.labels.length) ? liv.labels : [liv.ref || ref];
            labels.forEach((lb) => colis.push({ label: String(lb || ref), desc: liv.description || "", stage: stageOf(liv, lb) }));
        });

        // Vie privée : prénom seul du destinataire (pas le nom complet ni le tel).
        const destFirst = String(t.nomDestinataire || "").replace(/(\+?\d[\d\s.\-]{6,}\d)/g, "").trim().split(/\s+/)[0] || "";

        res.json({
            ok: true, found: true,
            reference: ref,
            destinataire: destFirst,
            conteneur: t.conteneur || "",
            commune: t.lieuLivraison || t.commune || "",
            colis,
            checkedAt: new Date().toISOString(),
        });
    } catch (e) {
        console.error("verifyTracking:", e);
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

// Nettoie un nom : retire un numéro de téléphone éventuellement collé + espaces.
function stripName(s) {
    return String(s || "").replace(/(\+?\d[\d\s.\-]{6,}\d)/g, "").replace(/[\s\-_/]+$/, "").trim();
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
    // Profil du client connecté (pour préremplir l'app : Dépôt/Récup, etc.).
    // Quand il est EXPÉDITEUR, son nom = `nom` et son tél = `tel` de la facture.
    const self = { name: "", tel: "", address: "", commune: "" };

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
            // Profil : nom/tél du client selon son rôle sur la facture.
            // EXPÉDITEUR prioritaire (son nom = `nom`), sinon DESTINATAIRE
            // (`nomDestinataire`). On nettoie un éventuel n° collé au nom.
            if (role === "exp") {
                if (expName && !/amt/i.test(expName)) self.name = stripName(expName);
                if (!self.tel && t.tel) self.tel = String(t.tel);
            } else if (role === "dest") {
                if (!self.name && t.nomDestinataire) self.name = stripName(String(t.nomDestinataire));
                if (!self.tel && t.numero) self.tel = String(t.numero);
            }

            byKey.set(key, {
                id: doc.id,
                collection: colName,
                reference: t.reference || "",
                role, // 'exp' | 'dest' | 'both'
                counterpart: role === "exp" ? (t.nomDestinataire || "") : (t.nom || ""),
                date: t.date || t.dateAjout || "",
                total, paid, remaining, status, currency,
                agency: t.agency || "",
                // Agence de DÉPART réelle (officiel = agency ; import = departureAgency
                // car l'import tague agency='abidjan' pour la devise FCFA).
                departureAgency: t.departureAgency || t.agency || "",
                _factor: factor,
                _desc: t.description || "",
                _adjType: t.adjustmentType || "",
                _adjVal: parseFloat(t.adjustmentVal) || 0,
                _waived: !!t.storageFeeWaived,
            });
        };

        for (const d of destSnap.docs) await add(d, "dest");
        for (const d of expSnap.docs) await add(d, "exp");
    }

    const invoices = Array.from(byKey.values());
    const parcels = []; // suivi colis (rempli avec le magasinage ci-dessous)

    // --- MAGASINAGE : aligne le "reste à payer" du tableau de bord sur le
    // détail/PDF officiel. On lit la livraison (active ou archivée) liée à
    // chaque facture pour calculer les frais selon le barème officiel. ---
    try {
        // Référence -> base de collection livraisons (route-aware).
        const livBaseFor = (colName) => {
            const aerien = /_aerien$/.test(colName);
            const route = configSourceForCollection(colName);
            const suffix = (route === "paris" ? "" : "_" + route) + (aerien ? "_aerien" : "");
            return "livraisons" + suffix;
        };
        // Regrouper les références par base de livraisons.
        const refsByBase = new Map(); // base -> Set(refs)
        for (const inv of invoices) {
            const base = livBaseFor(inv.collection);
            if (!refsByBase.has(base)) refsByBase.set(base, new Set());
            refsByBase.get(base).add(String(inv.reference).toUpperCase());
        }
        // Charger les livraisons concernées (active + archives), par paquets de 10.
        const livByKey = new Map(); // base + "|" + ref -> livraison "la plus pertinente"
        for (const [base, refSet] of refsByBase) {
            const refs = Array.from(refSet);
            for (const colL of [base, base + "_archives"]) {
                for (let i = 0; i < refs.length; i += 10) {
                    const chunk = refs.slice(i, i + 10);
                    let snap;
                    try { snap = await db.collection(colL).where("ref", "in", chunk).get(); }
                    catch (e) { continue; }
                    snap.forEach((d) => {
                        const l = d.data() || {};
                        const k = base + "|" + String(l.ref || "").toUpperCase();
                        const prev = livByKey.get(k);
                        // Priorité à la livraison EN_COURS (celle qui porte le magasinage).
                        if (!prev || (l.containerStatus === "EN_COURS" && prev.containerStatus !== "EN_COURS")) {
                            livByKey.set(k, l);
                        }
                    });
                }
            }
        }
        const now = new Date();
        for (const inv of invoices) {
            const base = livBaseFor(inv.collection);
            const liv = livByKey.get(base + "|" + String(inv.reference).toUpperCase());
            // Profil : adresse de l'EXPÉDITEUR depuis la livraison (nouveau format).
            if (liv && (inv.role === "exp" || inv.role === "both")) {
                if (!self.address && liv.adresseExpediteur) self.address = String(liv.adresseExpediteur);
            }
            let feeFcfa = 0;
            if (inv._adjType === "augmentation" && inv._adjVal > 0) {
                feeFcfa = inv._adjVal;
            } else if (liv && !inv._waived && liv.dateAjout
                && liv.status !== "LIVRE" && liv.status !== "ABANDONNE") {
                const qte = (liv.quantiteRestante !== undefined && liv.quantiteRestante !== null)
                    ? parseInt(liv.quantiteRestante) : (parseInt(liv.quantite) || 1);
                const desc = [liv.description, inv._desc].filter(Boolean).join(" ").toLowerCase();
                feeFcfa = storageFeeServer(liv.dateAjout, qte, desc.includes("palette"), now).fee;
            }
            const reductionFcfa = (inv._adjType === "reduction" && inv._adjVal > 0) ? inv._adjVal : 0;
            // Conversion vers la devise d'affichage de la facture (EUR pour Paris).
            const magDisp = feeFcfa / inv._factor;
            const redDisp = reductionFcfa / inv._factor;
            inv.magasinage = magDisp;
            let rem = inv.total - inv.paid - redDisp + magDisp;
            if (rem < 0.01) rem = 0;
            inv.remaining = rem;
            inv.status = rem <= 0 ? "PAYE" : (inv.paid > 0 ? "PARTIEL" : "IMPAYE");

            // --- SUIVI COLIS : un colis par sous-référence (label), avec son
            // étape (0 Entrepôt, 1 Conteneur, 2 Arrivé, 3 Livré). On affine PAR
            // LABEL via scanHistory si présent, sinon repli sur le statut global. ---
            if (liv) {
                const baseStage = liv.status === "LIVRE" ? 3
                    : liv.containerStatus === "EN_COURS" ? 2
                    : liv.containerStatus === "A_VENIR" ? 1 : 0;
                const labels = (Array.isArray(liv.labels) && liv.labels.length) ? liv.labels : [String(liv.ref || inv.reference)];
                const scans = Array.isArray(liv.scanHistory) ? liv.scanHistory : [];
                const stageFromScan = (lbl) => {
                    const mine = scans.filter((s) => s.scanRef === lbl).sort((a, b) => String(b.date).localeCompare(String(a.date)));
                    if (!mine.length) return null;
                    const tp = mine[0].type;
                    if (tp === "REMISE_CLIENT") return 3;
                    if (tp === "DECHARGEMENT_ABIDJAN") return 2;
                    if (tp === "CONTENEUR_CHARGEMENT" || tp === "DEPART_VOL" || tp === "DEPART_VOL_RETOUR") return 1;
                    if (tp === "ENTREPOT_PARIS") return 0;
                    return null;
                };
                labels.forEach((lbl) => {
                    const st = stageFromScan(lbl);
                    parcels.push({
                        ref: inv.reference,
                        label: lbl,
                        desc: liv.description || inv._desc || "Colis",
                        stage: (st === null ? baseStage : st),
                        date: liv.dateAjout || inv.date || "",
                    });
                });
            }
        }
    } catch (e) { /* non bloquant : on garde le reste sans magasinage */ }

    // Profil : adresse/tél de l'expéditeur depuis sa FICHE CLIENT (source que
    // le staff affiche), si on n'a pas déjà trouvé via la livraison.
    if (self.name && (!self.address || !self.tel)) {
        try {
            const cSnap = await db.collection("clients").where("nom", "==", self.name).limit(1).get();
            if (!cSnap.empty) {
                const c = cSnap.docs[0].data() || {};
                if (!self.address && c.adresse) self.address = String(c.adresse);
                if (!self.tel && (c.tel || c.numero)) self.tel = String(c.tel || c.numero);
            }
        } catch (e) { /* non bloquant */ }
    }

    // Préférence : la fiche profil ÉDITÉE par le client (client_profiles) prime
    // sur le nom/adresse/photo déduits des factures. Ainsi ce que le client
    // saisit dans l'app s'affiche partout (en-tête, menu, profil) et PERSISTE
    // après rechargement.
    try {
        const pd = await db.collection("client_profiles").doc(tail).get();
        if (pd.exists) {
            const p = pd.data() || {};
            const full = `${p.prenom || ""} ${p.nom || ""}`.trim();
            if (p.prenom) self.prenom = String(p.prenom);
            if (p.nom) self.nom = String(p.nom);
            if (full) self.name = full;
            if (p.address) self.address = String(p.address);
            if (p.photoUrl) self.photoUrl = String(p.photoUrl);
        }
    } catch (e) { /* non bloquant */ }

    // Nettoyage des champs internes (préfixe _) avant envoi au client.
    invoices.forEach((inv) => { Object.keys(inv).forEach((k) => { if (k[0] === "_") delete inv[k]; }); });
    invoices.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // Carton moyen offert toutes les 10 factures envoyées (expéditeur ≠ AMT).
    const freeCartons = Math.floor(sentAsSender / 10);
    const toNext = sentAsSender === 0 ? 10 : (10 - (sentAsSender % 10)) % 10 || 10;

    // AGENCES rattachées au client (logique UNIQUE, même mapping que dépôt/chat).
    // On part de l'agence de DÉPART réelle (departureAgency, fiable même pour les
    // imports tagués agency='abidjan'). exp -> départ ; dest -> arrivée déduite.
    const agencyRoles = new Map();
    const mark = (ag, role) => {
        if (!ag) return;
        const cur = agencyRoles.get(ag) || "";
        agencyRoles.set(ag, (cur && cur !== role) ? "both" : role);
    };
    for (const inv of invoices) {
        const dep = inv.departureAgency || inv.agency;
        if (!dep) continue;
        if (inv.role === "exp" || inv.role === "both") mark(dep, "exp");
        if (inv.role === "dest" || inv.role === "both") mark(arrivalAgencyOf(dep), "dest");
    }
    const labelCacheA = {};
    const labelA = async (ag) => {
        if (labelCacheA[ag] !== undefined) return labelCacheA[ag];
        let nm = ag;
        try { const c = await db.collection("settings").doc(`company_${ag}`).get(); if (c.exists && c.data().name) nm = c.data().name; } catch (e) {}
        labelCacheA[ag] = nm; return nm;
    };
    const agencies = [];
    for (const [ag, role] of agencyRoles) agencies.push({ agency: ag, name: await labelA(ag), role });
    agencies.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    parcels.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { invoices, parcels, profile: self, agencies, loyalty: { sentAsSender, freeCartons, toNext } };
});

// ===========================================================================
//  getMyInvoiceDetail — détail complet d'UNE facture (app AMT Clients)
// ---------------------------------------------------------------------------
//  Renvoie tout ce qu'il faut pour : (a) générer le PDF OFFICIEL côté client
//  (config société/CGV de l'agence de départ + transaction + magasinage) et
//  (b) afficher le suivi colis-par-colis (livraisons + scanHistory).
//  SÉCURITÉ : seul le propriétaire (son phoneTail == exp/destPhoneTail de la
//  facture) peut lire. Admin SDK -> aucune règle Firestore à modifier.
// ===========================================================================

// Barème magasinage (miroir de services/storageFee.js) — FCFA.
function storageFeeServer(dateString, qte, isPalette, now) {
    if (!dateString) return { days: 0, fee: 0 };
    const arrival = new Date(dateString);
    const diff = now - arrival;
    if (isNaN(diff) || diff < 0) return { days: 0, fee: 0 };
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 7) return { days, fee: 0 };
    const q = (!qte || isNaN(qte)) ? 1 : qte;
    if (days <= 14) return { days, fee: 10000 * q };
    return { days, fee: (10000 + (days - 14) * (isPalette ? 3000 : 1000)) * q };
}
// Agence source de config (logo/CGV) = agence de DÉPART de la route.
function configSourceForCollection(colName) {
    if (colName === "transactions" || colName === "transactions_aerien") return "paris";
    const r = colName.replace(/^transactions_/, "").replace(/_aerien$/, "");
    return r || "paris";
}
function pick(obj, keys) {
    const out = {};
    if (!obj) return out;
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
}

exports.getMyInvoiceDetail = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const reference = request.data && request.data.reference;
    if (!reference) throw new HttpsError("invalid-argument", "Référence manquante.");

    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    if (tail.length < 8) throw new HttpsError("permission-denied", "Numéro non reconnu.");

    const db = admin.firestore();
    const ref = String(reference).toUpperCase().trim();

    // 1. Retrouver la facture (toutes collections transactions*) + VÉRIFIER la propriété.
    const cols = await db.listCollections();
    const txCols = cols.map((c) => c.id).filter((id) => /^transactions(_[a-z0-9_]+)?$/.test(id));
    let trans = null, transDocId = null, transCol = null;
    for (const colName of txCols) {
        let snap;
        try { snap = await db.collection(colName).where("reference", "==", ref).limit(10).get(); }
        catch (e) { continue; }
        for (const d of snap.docs) {
            const t = d.data() || {};
            if (t.isDeleted) continue;
            if (t.expPhoneTail === tail || t.destPhoneTail === tail) { trans = t; transDocId = d.id; transCol = colName; break; }
        }
        if (trans) break;
    }
    if (!trans) throw new HttpsError("permission-denied", "Facture introuvable ou non autorisée.");

    // 2. Livraisons (colis + scanHistory) par référence — actives + archives.
    const aerien = /_aerien$/.test(transCol);
    const route = configSourceForCollection(transCol); // 'paris' (historique) ou route SaaS
    const suffix = (route === "paris" ? "" : "_" + route) + (aerien ? "_aerien" : "");
    const livCols = [`livraisons${suffix}`, `livraisons${suffix}_archives`];
    const LIV_KEYS = ["ref", "labels", "conteneur", "expediteur", "destinataire", "numero",
        "lieuLivraison", "commune", "description", "quantite", "quantiteRestante", "dateAjout",
        "status", "containerStatus", "scanHistory", "departureDate", "arrivalDate",
        "modeExpedition", "telExpediteur", "adresseExpediteur", "montant", "prixOriginal"];
    const livraisons = [];
    for (const lc of livCols) {
        try {
            const ls = await db.collection(lc).where("ref", "==", ref).get();
            ls.forEach((d) => livraisons.push(pick(d.data(), LIV_KEYS)));
        } catch (e) { /* collection absente */ }
    }

    // 3. Config (société + facture) de l'agence de DÉPART.
    let company = null, invoiceConfig = null;
    try { const c = await db.collection("settings").doc(`company_${route}`).get(); if (c.exists) company = pick(c.data(), ["name", "logoBase64"]); } catch (e) {}
    try {
        const ic = await db.collection("settings").doc(`invoice_config_${route}`).get();
        if (ic.exists) invoiceConfig = ic.data();
        if (aerien) { const ica = await db.collection("settings").doc(`invoice_config_${route}_aerien`).get(); if (ica.exists) invoiceConfig = Object.assign({}, invoiceConfig || {}, ica.data()); }
    } catch (e) {}

    // 4. Magasinage (même règle que le PDF staff) : livraison la plus pertinente.
    const livForFee = livraisons.find((l) => l.containerStatus === "EN_COURS") || livraisons[0] || null;
    let magasinageFee = 0;
    if (trans.adjustmentType === "augmentation" && trans.adjustmentVal > 0) {
        magasinageFee = trans.adjustmentVal;
    } else if (livForFee && !trans.storageFeeWaived && livForFee.dateAjout
        && livForFee.status !== "LIVRE" && livForFee.status !== "ABANDONNE") {
        const qte = (livForFee.quantiteRestante !== undefined && livForFee.quantiteRestante !== null)
            ? parseInt(livForFee.quantiteRestante) : (parseInt(livForFee.quantite) || 1);
        const desc = [livForFee.description, trans.description].filter(Boolean).join(" ").toLowerCase();
        magasinageFee = storageFeeServer(livForFee.dateAjout, qte, desc.includes("palette"), new Date()).fee;
    }
    const reduction = (trans.adjustmentType === "reduction" && trans.adjustmentVal > 0) ? trans.adjustmentVal : 0;

    const TX_KEYS = ["reference", "nom", "nomDestinataire", "numero", "tel", "conteneur",
        "adresseDestinataire", "items", "prix", "montantParis", "montantAbidjan", "reste",
        "date", "modeExpedition", "description", "quantite", "agency",
        "adjustmentType", "adjustmentVal", "storageFeeWaived"];

    return {
        reference: ref,
        collection: transCol,
        transDocId,
        transaction: pick(trans, TX_KEYS),
        livraison: livForFee,           // livraison de référence pour le PDF
        livraisons,                     // toutes (suivi colis-par-colis)
        company,
        invoiceConfig: invoiceConfig || null,
        magasinageFee,
        reduction,
        configSource: route,
    };
});

// ===========================================================================
//  DEMANDES CLIENT (dépôt / récupération) — app AMT Clients
// ---------------------------------------------------------------------------
//  Le client (connecté par téléphone) crée une demande d'enlèvement (dépôt)
//  ou de livraison/récupération (récup). Stockage : collection partagée
//  `client_requests`. Lecture : seulement SES demandes (par phoneTail du token).
//  Admin SDK -> aucune règle Firestore à modifier. Le traitement côté staff
//  (validation) sera branché plus tard ; ici on gère la création + le suivi.
// ===========================================================================
exports.createClientRequest = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");

    const data = request.data || {};
    const type = (data.type === "recup") ? "recup" : "depot";
    const clean = (s, max) => String(s == null ? "" : s).trim().slice(0, max || 200);
    const fullName = clean(data.fullName, 120);
    const address = clean(data.address, 300);
    const commune = clean(data.commune, 120);
    const wantedDate = clean(data.date, 30);
    const wantedTime = clean(data.time, 40);
    const description = clean(data.description, 1000);
    const etage = clean(data.etage, 120);
    const acces = clean(data.acces, 60);
    const codeAcces = clean(data.codeAcces, 120);
    const contactTel = clean(data.contactTel, 40); // téléphone de contact sur place
    if (!address && !commune) throw new HttpsError("invalid-argument", "Adresse requise.");

    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    const db = admin.firestore();

    // AGENCE CIBLE = déduite des FACTURES (logique unique, voir clientAgenciesFor).
    // Dépôt/récup : on vise l'agence où le client est EXPÉDITEUR (= agence de
    // DÉPART qui collecte ses colis). Priorité : agence demandée par le client si
    // valide -> sinon agence « exp » -> sinon 1re rattachée -> repli indicatif.
    let agency, position;
    let attached = new Map();
    try { attached = await clientAgenciesFor(db, tail); } catch (e) {}
    const requested = String(data.agency || "").trim();
    const expAgency = [...attached.entries()].find(([, r]) => r === "exp" || r === "both");
    if (requested && attached.has(requested)) agency = requested;
    else if (expAgency) agency = expAgency[0];
    else if (attached.size) agency = [...attached.keys()][0];
    else agency = digits.startsWith("33") ? "paris" : "abidjan"; // repli si aucune facture
    position = (agency === "paris" || !agency.startsWith("abidjan")) ? "depart" : "arrivee";

    // ANTI-DOUBLON : on refuse une nouvelle demande du même type tant qu'une est
    // encore EN COURS (en_attente / modifiee / confirmee) pour ce client.
    try {
        const dupSnap = await db.collection("client_requests")
            .where("phoneTail", "==", tail).where("type", "==", type).limit(20).get();
        const hasActive = dupSnap.docs.some((d) => {
            const s = (d.data() || {}).status;
            return s === "en_attente" || s === "modifiee" || s === "confirmee";
        });
        if (hasActive) {
            throw new HttpsError("already-exists", "Vous avez déjà une demande de ce type en cours. Attendez son traitement ou annulez-la.");
        }
    } catch (e) {
        if (e instanceof HttpsError) throw e; // propage l'erreur métier
        /* lecture impossible : on n'empêche pas la création */
    }

    const ref = db.collection("client_requests").doc();
    const now = new Date().toISOString();
    await ref.set({
        type,                         // 'depot' | 'recup'
        status: "en_attente",         // en_attente | validee | refusee | traitee
        agency,                       // agence qui traite (selon la position du client)
        position,                     // 'depart' | 'arrivee'
        phoneE164: phone,
        phoneTail: tail,
        fullName, address, commune, wantedDate, wantedTime, description,
        etage, acces, codeAcces, contactTel,
        // Le créneau souhaité par le client sert de proposition par défaut au staff.
        staffTime: wantedTime || "",
        // La date souhaitée sert aussi de proposition par défaut (le client a
        // choisi un jour réellement disponible sur le calendrier).
        staffDate: wantedDate || "",
        createdAt: now,
        updatedAt: now,
        source: "app_client",
    });
    // Notification STAFF : nouvelle demande à traiter.
    try {
        const typeLbl = type === "recup" ? "récupération" : "dépôt";
        await db.collection("notifications").add({
            title: "📥 Nouvelle demande client",
            message: `${fullName || phone} demande un ${typeLbl}${commune ? " à " + commune : ""}${wantedDate ? " pour le " + wantedDate : ""}.`,
            agency,
            type: "client_request",
            refId: ref.id,
            createdAt: now,
            readBy: [],
        });
    } catch (e) { /* non bloquant */ }

    return { id: ref.id, ok: true, agency };
});

// Disponibilités RDV pour un mois (app client) : places restantes par jour,
// même barème que le staff (settings/appointments_<agence> : trucks×rdv, offDays)
// moins les RDV déjà pris (appointments, hors 'annulé') et les demandes client
// déjà planifiées. agency déduite du numéro si non fournie.
exports.getRdvAvailability = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const data = request.data || {};
    const digits = String(phone).replace(/\D/g, "");
    let agency = data.agency;
    if (agency !== "paris" && agency !== "abidjan") {
        agency = digits.startsWith("33") ? "paris" : "abidjan";
    }
    const now = new Date();
    const year = parseInt(data.year) || now.getUTCFullYear();
    const month = (data.month == null) ? now.getUTCMonth() : parseInt(data.month); // 0-11

    const db = admin.firestore();
    // Config capacité.
    let trucks = 4, perTruck = 20, offDays = [0];
    try {
        const cfg = await db.collection("settings").doc(`appointments_${agency}`).get();
        if (cfg.exists) {
            const c = cfg.data() || {};
            if (c.trucksPerDay) trucks = parseInt(c.trucksPerDay) || trucks;
            if (c.rdvPerTruck) perTruck = parseInt(c.rdvPerTruck) || perTruck;
            if (Array.isArray(c.offDays)) offDays = c.offDays;
        }
    } catch (e) { /* défauts */ }
    const capacity = trucks * perTruck;

    // Compte les RDV existants par date (sur le mois ± marge). appointments
    // n'a pas d'index par mois -> on lit l'agence et on filtre en mémoire.
    const counts = {};
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    try {
        const snap = await db.collection("appointments").where("agency", "==", agency).limit(5000).get();
        snap.forEach((d) => {
            const a = d.data() || {};
            if (a.status === "annulé") return;
            const dt = String(a.date || "");
            if (dt.startsWith(ym)) counts[dt] = (counts[dt] || 0) + 1;
        });
    } catch (e) { /* pas bloquant */ }

    const days = {};
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${ym}-${String(d).padStart(2, "0")}`;
        const dow = new Date(Date.UTC(year, month, d)).getUTCDay(); // 0=dim
        const off = offDays.includes(dow);
        days[ds] = off ? -1 : Math.max(0, capacity - (counts[ds] || 0)); // -1 = jour off
    }
    return { agency, year, month, capacity, offDays, days };
});

// ===========================================================================
//  DEVIS (simulateur de tarif) — app AMT Clients
// ---------------------------------------------------------------------------
//  Source UNIQUE de vérité : on lit les MÊMES tarifs que la facture
//  (parametres/tarifs global + settings/invoice_config_<route>) et on applique
//  les MÊMES formules que nouvellefacture.js / facture-aerien.js. Ainsi le
//  devis ne peut pas diverger de la facture réelle.
//  - getQuoteConfig : routes de départ actives + tarifs + modèle par route.
//  - computeQuote   : calcule le prix selon route + mode + articles.
// ---------------------------------------------------------------------------
const TARIF_DEFAULTS = {
    cbmChine: 250000,        // CFA/m³ (maritime modèle chine)
    kgAerienNormal: 12000,   // CFA/kg (aérien modèle chine - normal)
    kgAerienExpress: 14000,  // CFA/kg (aérien modèle chine - express)
    kgStdEur: 13,            // €/kg (aérien Paris standard)
    kgParfumEur: 15,         // €/kg (aérien Paris parfum/alcool)
    forfaitChaussuresEur: 23,// € (forfait chaussures aérien Paris)
    volDiviseur: 5000,       // diviseur volumétrique (L×l×H cm / 5000 = kg)
};

async function loadTarifsForRoute(db, route) {
    const t = Object.assign({}, TARIF_DEFAULTS);
    // 1) Tarifs globaux.
    try {
        const g = await db.collection("parametres").doc("tarifs").get();
        if (g.exists) {
            const x = g.data() || {};
            ["cbmChine", "kgAerienNormal", "kgAerienExpress"].forEach((k) => { if (x[k] != null) t[k] = Number(x[k]); });
        }
    } catch (e) {}
    // 2) Config par route (écrase). + modèle de facture.
    let model = (route === "paris") ? "paris" : (route === "chine" ? "chine" : "paris");
    try {
        const c = await db.collection("settings").doc(`invoice_config_${route}`).get();
        if (c.exists) {
            const x = c.data() || {};
            ["kgStdEur", "kgParfumEur", "forfaitChaussuresEur", "kgAerienNormal", "kgAerienExpress", "cbmChine"].forEach((k) => { if (x[k] != null) t[k] = Number(x[k]); });
            if (x.factureModel) model = x.factureModel;
        }
    } catch (e) {}
    return { tarifs: t, model };
}

// ===========================================================================
//  CHAT CLIENT (app AMT Clients) — conversations par agence
// ---------------------------------------------------------------------------
//  Collection `client_messages` : 1 doc par message
//  { phoneTail, agency, text, sender:'client'|'staff', senderName,
//    createdAt, readByClient, readByStaff }. Le client dialogue avec UNE
//  agence à la fois (conversation). Les agences auxquelles son numéro est
//  rattaché sont déduites de ses factures (exp -> agence départ ; dest ->
//  agence arrivée). Staff lit/écrit via le web (firestore.rules) ; le client
//  passe par ces fonctions (Admin SDK).
// ---------------------------------------------------------------------------

// Agence d'ARRIVÉE correspondant à une agence de DÉPART.
//   paris -> abidjan ; <route SaaS> (ex. chine) -> abidjan_<route>.
function arrivalAgencyOf(departureAgency) {
    if (!departureAgency || departureAgency === "paris") return "abidjan";
    if (departureAgency.startsWith("abidjan")) return departureAgency; // déjà une arrivée
    return "abidjan_" + departureAgency;
}

// SOURCE UNIQUE du rattachement client -> agence(s). Sur une facture, `agency`
// = l'agence de DÉPART. L'agence de CONTACT du client dépend de son rôle :
//   - EXPÉDITEUR (exp)    -> agence de DÉPART  (qui collecte/expédie ses colis)
//   - DESTINATAIRE (dest) -> agence d'ARRIVÉE  (qui réceptionne/livre)
// Renvoie Map<agenceContact, role 'exp'|'dest'|'both'>. Utilisé PARTOUT
// (dépôt/récup, devis, chat) pour une logique cohérente.
async function clientAgenciesFor(db, tail) {
    const found = new Map(); // agenceContact -> role
    const add = (ag, role) => {
        if (!ag) return;
        const cur = found.get(ag) || "";
        found.set(ag, cur && cur !== role ? "both" : role);
    };
    const cols = await db.listCollections();
    const txCols = cols.map((c) => c.id).filter((id) => /^transactions(_[a-z0-9_]+)?$/.test(id));
    for (const colName of txCols) {
        let destSnap, expSnap;
        try {
            [destSnap, expSnap] = await Promise.all([
                db.collection(colName).where("destPhoneTail", "==", tail).limit(1).get(),
                db.collection(colName).where("expPhoneTail", "==", tail).limit(1).get(),
            ]);
        } catch (e) { continue; }
        // Agence de DÉPART réelle = departureAgency (repli sur agency). Indispensable
        // pour les imports tagués agency='abidjan' : sinon l'expéditeur était
        // rattaché à l'arrivée (bug chat/dépôt). Destinataire -> arrivée de la route.
        const depOf = (x) => (x.departureAgency || x.agency || "");
        destSnap.forEach((d) => add(arrivalAgencyOf(depOf(d.data() || {})), "dest"));
        expSnap.forEach((d) => add(depOf(d.data() || {}), "exp"));
    }
    return found; // Map agenceContact -> role
}

exports.getMyChat = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    if (tail.length < 8) return { conversations: [], messages: [] };

    const db = admin.firestore();
    // 1. Agences rattachées (conversations possibles).
    let agenciesMap = new Map();
    try { agenciesMap = await clientAgenciesFor(db, tail); } catch (e) {}

    // 2. Messages existants du client (toutes agences).
    let msgs = [];
    try {
        const snap = await db.collection("client_messages").where("phoneTail", "==", tail).limit(500).get();
        msgs = snap.docs.map((d) => { const x = d.data() || {}; return {
            id: d.id, agency: x.agency || "", text: x.text || "", sender: x.sender || "client",
            senderName: x.senderName || "", createdAt: x.createdAt || "", readByClient: !!x.readByClient,
            readByStaff: !!x.readByStaff, imageUrl: x.imageUrl || "", audioUrl: x.audioUrl || "",
        }; });
    } catch (e) {}
    // S'assurer que toute agence ayant des messages apparaît aussi en conversation.
    msgs.forEach((m) => { if (m.agency && !agenciesMap.has(m.agency)) agenciesMap.set(m.agency, "other"); });

    // 3. Libellés d'agence (settings/company_<agence> sinon id).
    const labelCache = {};
    const labelFor = async (ag) => {
        if (labelCache[ag] !== undefined) return labelCache[ag];
        let name = ag;
        try { const c = await db.collection("settings").doc(`company_${ag}`).get(); if (c.exists && c.data().name) name = c.data().name; } catch (e) {}
        labelCache[ag] = name; return name;
    };
    const conversations = [];
    for (const [ag, role] of agenciesMap) {
        const unread = msgs.filter((m) => m.agency === ag && m.sender === "staff" && !m.readByClient).length;
        conversations.push({ agency: ag, name: await labelFor(ag), role, unread });
    }
    conversations.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    msgs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return { conversations, messages: msgs };
});

exports.sendClientMessage = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const data = request.data || {};
    const text = String(data.text == null ? "" : data.text).trim().slice(0, 2000);
    // Image : dataURL JPEG compressée côté client (même format que le chat staff).
    // Limite ~900 Ko pour rester sous la limite Firestore de 1 Mo par document.
    let imageUrl = String(data.imageUrl || "");
    if (imageUrl && !/^data:image\/(jpeg|png|webp);base64,/.test(imageUrl)) imageUrl = "";
    if (imageUrl.length > 950000) throw new HttpsError("invalid-argument", "Image trop lourde.");
    // Audio : URL Firebase Storage (le fichier est uploadé côté client dans
    // client_chat/). On ne stocke que l'URL (légère), pas le binaire.
    let audioUrl = String(data.audioUrl || "");
    if (audioUrl && !/^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(audioUrl)) audioUrl = "";
    let agency = String(data.agency || "").trim();
    if (!text && !imageUrl && !audioUrl) throw new HttpsError("invalid-argument", "Message vide.");

    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;

    const db = admin.firestore();
    // Sécurité : l'agence cible doit faire partie des agences rattachées au
    // numéro (sinon repli sur la 1re trouvée, ou refus si aucune).
    let agenciesMap = new Map();
    try { agenciesMap = await clientAgenciesFor(db, tail); } catch (e) {}
    if (!agency || !agenciesMap.has(agency)) {
        if (agenciesMap.size === 1) agency = Array.from(agenciesMap.keys())[0];
        else if (agenciesMap.size === 0) agency = digits.startsWith("33") ? "paris" : "abidjan";
        else throw new HttpsError("failed-precondition", "Précisez l'agence destinataire.");
    }
    const now = new Date().toISOString();
    const ref = await db.collection("client_messages").add({
        phoneTail: tail, phoneE164: phone, agency,
        text, imageUrl, audioUrl, sender: "client", senderName: data.fromName || "",
        createdAt: now, readByClient: true, readByStaff: false,
    });
    // Notifier le staff (page Notifications, temps réel).
    try {
        const apercu = audioUrl && !text ? "🎤 Message vocal" : (imageUrl && !text ? "📷 Photo" : text.slice(0, 80));
        await db.collection("notifications").add({
            title: "💬 Nouveau message client",
            message: `${data.fromName || phone} : ${apercu}`,
            agency, type: "client_chat", refId: ref.id,
            createdAt: now, readBy: [],
        });
    } catch (e) {}
    return { ok: true, id: ref.id, agency };
});

// Marque comme lus (côté client) les messages du staff d'une agence.
exports.markChatRead = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion requise.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    const agency = String((request.data || {}).agency || "").trim();
    const db = admin.firestore();
    try {
        let q = db.collection("client_messages").where("phoneTail", "==", tail).where("sender", "==", "staff").where("readByClient", "==", false).limit(300);
        const snap = await q.get();
        let batch = db.batch(), n = 0;
        snap.forEach((d) => { if (!agency || (d.data() || {}).agency === agency) { batch.update(d.ref, { readByClient: true }); n++; } });
        if (n > 0) await batch.commit();
        return { ok: true, updated: n };
    } catch (e) { return { ok: true, updated: 0 }; }
});

// Déclencheur : quand l'AGENCE répond dans le chat (doc client_messages créé
// avec sender='staff'), le client reçoit une NOTIFICATION PUSH (app fermée
// incluse), comme une vraie messagerie. Les messages du client sont ignorés.
exports.onClientMessageCreated = onDocumentCreated(
    { region: REGION, document: "client_messages/{id}" },
    async (event) => {
        const m = (event.data && event.data.data()) || null;
        if (!m || m.sender !== "staff") return;
        const tail = String(m.phoneTail || "");
        if (!tail) return;
        try {
            const db = admin.firestore();
            const prof = await db.collection("client_profiles").doc(tail).get();
            const token = prof.exists ? (prof.data() || {}).pushToken : null;
            if (!token) return;
            const apercu = m.audioUrl && !m.text ? "🎤 Message vocal"
                : (m.imageUrl && !m.text ? "📷 Photo" : String(m.text || "").slice(0, 120));
            await sendExpoPush(token, {
                title: `💬 ${m.senderName || "AMT Trans'it"}`,
                body: apercu || "Nouveau message",
                data: { type: "chat", agency: m.agency || "" },
            });
        } catch (e) { /* push best-effort */ }
    }
);

// ===========================================================================
//  PROFIL CLIENT (app AMT Clients) — fiche par numéro
// ---------------------------------------------------------------------------
//  Collection `client_profiles`, doc = phoneTail. { prenom, nom, photoUrl
//  (dataURL JPEG compressée), lang, phoneE164, updatedAt }. Le staff peut la
//  lire (firestore.rules). « À propos » = infos company_<agence de départ>.
// ===========================================================================
exports.getMyProfile = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    const db = admin.firestore();

    let profile = { prenom: "", nom: "", photoUrl: "", lang: "fr", address: "" };
    try {
        const d = await db.collection("client_profiles").doc(tail).get();
        if (d.exists) { const x = d.data() || {}; profile = { prenom: x.prenom || "", nom: x.nom || "", photoUrl: x.photoUrl || "", lang: x.lang || "fr", address: x.address || "" }; }
    } catch (e) {}

    // Repli : si la fiche profil n'a aucun nom, on déduit le nom du client depuis
    // ses factures (exp -> `nom`, dest -> `nomDestinataire`), comme getMyInvoices.
    if (!profile.prenom && !profile.nom) {
        try {
            const cols = await db.listCollections();
            const txCols = cols.map((c) => c.id).filter((id) => /^transactions(_[a-z0-9_]+)?$/.test(id));
            let found = "";
            for (const colName of txCols) {
                if (found) break;
                const [ds, es] = await Promise.all([
                    db.collection(colName).where("destPhoneTail", "==", tail).limit(1).get(),
                    db.collection(colName).where("expPhoneTail", "==", tail).limit(1).get(),
                ]);
                if (!es.empty) found = stripName(String((es.docs[0].data() || {}).nom || ""));
                else if (!ds.empty) found = stripName(String((ds.docs[0].data() || {}).nomDestinataire || ""));
            }
            if (found && !/amt/i.test(found)) profile.nom = found; // on met tout dans `nom` (pas de split prénom/nom fiable)
        } catch (e) {}
    }

    // « À propos » : société de l'agence de DÉPART rattachée (où le client expédie),
    // sinon la 1re agence rattachée, sinon paris.
    let about = null;
    try {
        const attached = await clientAgenciesFor(db, tail);
        let srcAgency = "paris";
        const exp = [...attached.entries()].find(([, r]) => r === "exp" || r === "both");
        if (exp) srcAgency = exp[0];
        else if (attached.size) {
            // si arrivée (abidjan / abidjan_x), remonter à l'agence de départ source
            const first = [...attached.keys()][0];
            srcAgency = first === "abidjan" ? "paris" : (first.startsWith("abidjan_") ? first.split("_")[1] : first);
        }
        const c = await db.collection("settings").doc(`company_${srcAgency}`).get();
        if (c.exists) {
            const x = c.data() || {};
            about = { name: x.name || "AMT TRANS'IT", address: x.address || "", phone: x.phone || x.tel || "", email: x.email || "", website: x.website || "", agency: srcAgency };
        }
    } catch (e) {}

    return { profile, about };
});

exports.saveMyProfile = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const data = request.data || {};
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;

    const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
    const upd = { phoneE164: phone, updatedAt: new Date().toISOString() };
    if (data.prenom !== undefined) upd.prenom = clip(data.prenom, 60);
    if (data.nom !== undefined) upd.nom = clip(data.nom, 60);
    if (data.address !== undefined) upd.address = clip(data.address, 200);
    if (data.lang !== undefined) upd.lang = (data.lang === "en") ? "en" : "fr";
    if (data.photoUrl !== undefined) {
        let img = String(data.photoUrl || "");
        if (img && !/^data:image\/(jpeg|png|webp);base64,/.test(img)) throw new HttpsError("invalid-argument", "Photo invalide.");
        if (img.length > 600000) throw new HttpsError("invalid-argument", "Photo trop lourde.");
        upd.photoUrl = img; // "" = suppression
    }
    const db = admin.firestore();
    await db.collection("client_profiles").doc(tail).set(upd, { merge: true });
    return { ok: true };
});

// Enregistre le token Expo Push du client (notifications même app fermée).
// Stocké sur sa fiche client_profiles. Appelé au démarrage de l'app native.
exports.saveMyPushToken = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const token = String((request.data || {}).token || "").trim();
    if (!token || !/^ExponentPushToken\[/.test(token)) throw new HttpsError("invalid-argument", "Token invalide.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    const db = admin.firestore();
    await db.collection("client_profiles").doc(tail).set({
        pushToken: token, phoneE164: phone, pushUpdatedAt: new Date().toISOString(),
    }, { merge: true });
    return { ok: true };
});

// Prochains départs (bateaux) des routes rattachées au client. Lit la collection
// `boats` (+ variantes route) et renvoie les départs à venir, triés par date.
exports.getNextDepartures = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;

    const db = admin.firestore();
    // Routes de départ du client (departureAgency) -> collections boats.
    let routes = new Set(["paris"]);
    try {
        const att = await clientAgenciesFor(db, tail);
        // les agences "exp" sont des départs ; on ne garde pas les arrivées (abidjan…)
        for (const [ag, role] of att) {
            if (role === "exp" || role === "both") routes.add(ag);
        }
    } catch (e) {}

    const boatCol = (route) => (route === "paris" ? "boats" : `boats_${route}`);
    const todayStr = new Date().toISOString().slice(0, 10);
    const out = [];
    for (const route of routes) {
        try {
            const snap = await db.collection(boatCol(route)).limit(200).get();
            snap.forEach((d) => {
                const b = d.data() || {};
                const dt = String(b.departureDate || "");
                if (!dt || dt < todayStr) return;             // passé ou sans date -> ignoré
                if (b.status === "ARRIVE" || b.status === "ANNULE") return;
                out.push({ name: b.name || "", date: dt, destination: b.destination || "", route });
            });
        } catch (e) { /* collection absente */ }
    }
    out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { departures: out.slice(0, 20) };
});

exports.getQuoteConfig = onCall({ region: REGION, invoker: "public" }, async (request) => {
    if (!request.auth || !request.auth.token || !request.auth.token.phone_number) {
        throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    }
    const db = admin.firestore();
    // Routes de DÉPART actives (agencies_config type=departure, non désactivées).
    const routes = [];
    try {
        const snap = await db.collection("agencies_config").get();
        snap.forEach((d) => {
            const a = d.data() || {};
            if (a.disabled) return;
            if (a.type === "departure") routes.push({ id: d.id, name: a.name || d.id, flag: a.flag || "" });
        });
    } catch (e) {}
    if (!routes.length) routes.push({ id: "paris", name: "PARIS (AMT TRANSIT)", flag: "🇫🇷" });

    // Nom de la collection produits pour une route + un mode (route-aware).
    const productsCol = (route, mode) => {
        const base = (route === "paris") ? "products" : `products_${route}`;
        return mode === "aerien" ? `${base}_aerien` : base;
    };
    const loadProducts = async (route, mode) => {
        const items = [];
        try {
            const snap = await db.collection(productsCol(route, mode)).get();
            snap.forEach((d) => {
                const p = d.data() || {};
                if (!p.desc) return;
                if (p.category === "REMISES") return; // pas un colis facturable
                items.push({ desc: p.desc, price: Number(p.price) || 0, dim: Number(p.dim) || 0, category: p.category || "COLIS" });
            });
        } catch (e) {}
        items.sort((a, b) => String(a.desc).localeCompare(String(b.desc)));
        return items;
    };

    // Tarifs + modèle + catalogue produits (maritime ET aérien) pour chaque route.
    const out = [];
    for (const r of routes) {
        const { tarifs, model } = await loadTarifsForRoute(db, r.id);
        const productsMaritime = await loadProducts(r.id, "maritime");
        const productsAerien = await loadProducts(r.id, "aerien");
        out.push({ id: r.id, name: r.name, flag: r.flag, model, tarifs, productsMaritime, productsAerien });
    }
    return { routes: out, taux: TAUX_EUR };
});

exports.computeQuote = onCall({ region: REGION, invoker: "public" }, async (request) => {
    if (!request.auth || !request.auth.token || !request.auth.token.phone_number) {
        throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    }
    const data = request.data || {};
    const route = String(data.route || "paris");
    const mode = (data.mode === "aerien") ? "aerien" : "maritime";
    const items = Array.isArray(data.items) ? data.items : [];

    const db = admin.firestore();
    const { tarifs, model } = await loadTarifsForRoute(db, route);
    const num = (v) => parseFloat(v) || 0;

    // Catalogue produits de la route+mode : le PRIX (€) et le VOLUME (CBM) du
    // produit viennent du catalogue (comme la facture staff), pas du client.
    const prodCol = ((route === "paris") ? "products" : `products_${route}`) + (mode === "aerien" ? "_aerien" : "");
    const catalog = new Map();
    try {
        const snap = await db.collection(prodCol).get();
        snap.forEach((d) => { const p = d.data() || {}; if (p.desc) catalog.set(String(p.desc).trim(), p); });
    } catch (e) {}
    const prodOf = (desc) => catalog.get(String(desc || "").trim()) || {};

    let currency = "XOF";   // devise du résultat
    let totalEur = 0, totalCfa = 0;
    const lines = [];

    if (mode === "maritime") {
        if (model === "chine") {
            // Maritime Chine : CBM (catalogue) × tarif CFA/m³.
            currency = "XOF";
            for (const it of items) {
                const qty = num(it.qty) || 1;
                const cbm = num(prodOf(it.desc).dim);    // m³ par unité (catalogue)
                const lineCfa = Math.round(cbm * qty * tarifs.cbmChine);
                totalCfa += lineCfa;
                lines.push({ desc: it.desc || "", qty, detail: `${cbm} m³ × ${qty} × ${tarifs.cbmChine} FCFA/m³`, amount: lineCfa, currency: "XOF" });
            }
        } else {
            // Maritime Paris : prix unitaire € (catalogue) × qté.
            currency = "EUR";
            for (const it of items) {
                const qty = num(it.qty) || 1;
                const pu = num(prodOf(it.desc).price);   // prix catalogue
                const lineEur = pu * qty;
                totalEur += lineEur;
                lines.push({ desc: it.desc || "", qty, detail: `${qty} × ${pu} €`, amount: lineEur, currency: "EUR" });
            }
        }
    } else {
        // AÉRIEN : le poids n'est pas au catalogue -> saisi par le client (réel +
        // dimensions). Le tarif €/kg ou CFA/kg vient des réglages.
        if (model === "chine") {
            currency = "XOF";
            const rate = (data.aerienType === "express") ? tarifs.kgAerienExpress : tarifs.kgAerienNormal;
            for (const it of items) {
                const qty = num(it.qty) || 1;
                const real = num(it.poids);
                const vol = (num(it.lng) * num(it.lrg) * num(it.haut)) / tarifs.volDiviseur;
                const kg = Math.max(real, vol);
                const lineCfa = Math.round(kg * qty * rate);
                totalCfa += lineCfa;
                lines.push({ desc: it.desc || "", qty, detail: `${kg.toFixed(1)} kg × ${qty} × ${rate} FCFA/kg`, amount: lineCfa, currency: "XOF" });
            }
        } else {
            currency = "EUR";
            for (const it of items) {
                const qty = num(it.qty) || 1;
                const real = num(it.poids);
                const vol = (num(it.lng) * num(it.lrg) * num(it.haut)) / tarifs.volDiviseur;
                const kg = Math.max(real, vol);
                const rateEur = it.parfum ? tarifs.kgParfumEur : tarifs.kgStdEur;
                const lineEur = kg * qty * rateEur;
                totalEur += lineEur;
                lines.push({ desc: it.desc || "", qty, detail: `${kg.toFixed(1)} kg × ${qty} × ${rateEur} €/kg${it.parfum ? " (parfum/alcool)" : ""}`, amount: lineEur, currency: "EUR" });
            }
        }
    }

    // Totaux dans les deux devises (pour affichage clair).
    if (currency === "EUR") { totalCfa = Math.round(totalEur * TAUX_EUR); }
    else { totalEur = totalCfa / TAUX_EUR; }

    return {
        route, mode, model, currency,
        totalEur: Math.round(totalEur * 100) / 100,
        totalCfa: Math.round(totalCfa),
        lines,
    };
});

exports.getMyRequests = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    if (tail.length < 8) return { requests: [] };

    const db = admin.firestore();
    let snap;
    try {
        snap = await db.collection("client_requests").where("phoneTail", "==", tail).limit(200).get();
    } catch (e) { return { requests: [] }; }
    const requests = snap.docs.map((d) => {
        const x = d.data() || {};
        return {
            id: d.id, type: x.type || "depot", status: x.status || "en_attente",
            fullName: x.fullName || "", address: x.address || "", commune: x.commune || "",
            wantedDate: x.wantedDate || "", wantedTime: x.wantedTime || "", description: x.description || "",
            etage: x.etage || "", acces: x.acces || "", codeAcces: x.codeAcces || "", contactTel: x.contactTel || "",
            createdAt: x.createdAt || "",
            // Proposition du staff (visible par le client quand status === 'modifiee').
            staffDate: x.staffDate || "", staffTime: x.staffTime || "", staffNote: x.staffNote || "",
        };
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { requests };
});

// Annulation par le CLIENT de SA demande, tant qu'elle n'est pas « traitee »
// (RDV déjà créé) ni « refusee ». Sécurité : phoneTail du token.
exports.cancelClientRequest = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const id = request.data && request.data.id;
    if (!id) throw new HttpsError("invalid-argument", "Demande manquante.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;

    const db = admin.firestore();
    const ref = db.collection("client_requests").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Demande introuvable.");
    const r = snap.data() || {};
    if (r.phoneTail !== tail) throw new HttpsError("permission-denied", "Demande non autorisée.");
    if (r.status === "traitee") throw new HttpsError("failed-precondition", "Le rendez-vous est déjà fixé. Contactez l'agence.");
    if (r.status === "annulee" || r.status === "refusee") return { ok: true, status: r.status };

    await ref.update({ status: "annulee", updatedAt: new Date().toISOString() });
    // Prévenir le staff (la demande disparaît de leur file de traitement).
    try {
        const typeLbl = r.type === "recup" ? "récupération" : "dépôt";
        await db.collection("notifications").add({
            title: "🚫 Demande annulée par le client",
            message: `${r.fullName || r.phoneE164 || "Un client"} a annulé sa demande de ${typeLbl}.`,
            agency: r.agency || "paris", type: "client_request", refId: id,
            createdAt: new Date().toISOString(), readBy: [],
        });
    } catch (e) { /* non bloquant */ }
    return { ok: true, status: "annulee" };
});

// Modifier une demande TANT QUE le rendez-vous n'est pas fixé (statut traitee).
// Le client peut corriger adresse / date / champs. Repasse en 'en_attente'
// (le staff devra re-traiter). Sécurité : propriété par phoneTail.
exports.updateClientRequest = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const data = request.data || {};
    const id = data.id;
    if (!id) throw new HttpsError("invalid-argument", "Demande manquante.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;

    const db = admin.firestore();
    const ref = db.collection("client_requests").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Demande introuvable.");
    const r = snap.data() || {};
    if (r.phoneTail !== tail) throw new HttpsError("permission-denied", "Demande non autorisée.");
    if (r.status === "traitee") throw new HttpsError("failed-precondition", "Le rendez-vous est déjà fixé. Contactez l'agence.");

    const clean = (s, max) => String(s == null ? "" : s).trim().slice(0, max || 200);
    const upd = {
        type: (data.type === "recup") ? "recup" : "depot",
        fullName: clean(data.fullName, 120),
        address: clean(data.address, 300),
        commune: clean(data.commune, 120),
        wantedDate: clean(data.date, 30),
        wantedTime: clean(data.time, 40),
        description: clean(data.description, 1000),
        etage: clean(data.etage, 120),
        acces: clean(data.acces, 60),
        codeAcces: clean(data.codeAcces, 120),
        contactTel: clean(data.contactTel, 40),
        // La modification client remet la demande dans la file (sauf si refusée/annulée).
        status: "en_attente",
        // La date choisie sert de proposition par défaut au staff.
        staffDate: clean(data.date, 30), staffTime: clean(data.time, 40),
        updatedAt: new Date().toISOString(),
    };
    if (!upd.address && !upd.commune) throw new HttpsError("invalid-argument", "Adresse requise.");
    await ref.update(upd);

    try {
        await db.collection("notifications").add({
            title: "✏️ Demande modifiée par le client",
            message: `${upd.fullName || r.phoneE164 || "Un client"} a modifié sa demande de ${upd.type === "recup" ? "récupération" : "dépôt"}.`,
            agency: r.agency || "paris", type: "client_request", refId: id,
            createdAt: new Date().toISOString(), readBy: [],
        });
    } catch (e) {}
    return { ok: true };
});

// Réponse du CLIENT à une proposition du staff (date/créneau modifiés).
// action: 'accept' -> status 'confirmee' (le staff pourra créer le RDV) ;
//         'refuse' -> status 'refusee'. SÉCURITÉ : le client ne peut agir que
// sur SA demande (phoneTail du token) ET seulement si elle est 'modifiee'.
exports.respondClientRequest = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const data = request.data || {};
    const id = data.id;
    const action = data.action === "refuse" ? "refuse" : "accept";
    if (!id) throw new HttpsError("invalid-argument", "Demande manquante.");

    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;

    const db = admin.firestore();
    const ref = db.collection("client_requests").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Demande introuvable.");
    const r = snap.data() || {};
    if (r.phoneTail !== tail) throw new HttpsError("permission-denied", "Demande non autorisée.");
    if (r.status !== "modifiee") throw new HttpsError("failed-precondition", "Aucune modification à confirmer.");

    await ref.update({
        status: action === "accept" ? "confirmee" : "refusee",
        clientRespondedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });

    // Notification STAFF (collection partagée `notifications`, temps réel côté
    // web) pour prévenir l'agence de la réponse du client.
    try {
        const typeLbl = r.type === "recup" ? "récupération" : "dépôt";
        const who = r.fullName || r.phoneE164 || "Un client";
        await db.collection("notifications").add({
            title: action === "accept" ? "✅ Demande confirmée par le client" : "❌ Modification refusée par le client",
            message: action === "accept"
                ? `${who} a accepté la date proposée pour sa ${typeLbl}. Vous pouvez valider et créer le RDV.`
                : `${who} a refusé la date proposée pour sa ${typeLbl}.`,
            agency: r.agency || "paris",
            type: "client_request",
            refId: id,
            createdAt: new Date().toISOString(),
            readBy: [],
        });
    } catch (e) { /* non bloquant */ }

    return { ok: true, status: action === "accept" ? "confirmee" : "refusee" };
});

// ===========================================================================
//  NOTIFICATIONS CLIENT (app AMT Clients)
// ---------------------------------------------------------------------------
//  Fondation réutilisable : chaque notification est un document Firestore
//  (collection `client_notifications`) ciblé par phoneTail. L'app web les lit
//  via la cloche 🔔. Plus tard (app native React), on ajoutera l'envoi push
//  Expo À PARTIR DE CES MÊMES documents (même modèle que parrainage), sans rien
//  changer ici. createClientNotif() est appelé côté serveur quand un événement
//  concerne le client (proposition de date, RDV confirmé…).
// ---------------------------------------------------------------------------
async function createClientNotif(db, tail, notif) {
    if (!tail) return;
    try {
        await db.collection("client_notifications").add({
            phoneTail: tail,
            title: notif.title || "Notification",
            body: notif.body || "",
            icon: notif.icon || "🔔",
            type: notif.type || "info",
            refId: notif.refId || "",
            read: false,
            createdAt: new Date().toISOString(),
        });
    } catch (e) { /* non bloquant : une notif ratée ne casse pas l'action */ }
    // PUSH Expo (app native, même fermée) si le client a enregistré un token.
    try {
        const prof = await db.collection("client_profiles").doc(tail).get();
        const token = prof.exists ? (prof.data() || {}).pushToken : null;
        if (token) {
            await sendExpoPush(token, {
                title: `${notif.icon || "🔔"} ${notif.title || "AMT Trans'it"}`,
                body: notif.body || "",
                data: { type: notif.type || "info", refId: notif.refId || "" },
            });
        }
    } catch (e) { /* push best-effort */ }
}

exports.getMyNotifications = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    if (tail.length < 8) return { notifications: [] };

    const db = admin.firestore();
    let snap;
    try {
        snap = await db.collection("client_notifications").where("phoneTail", "==", tail).limit(100).get();
    } catch (e) { return { notifications: [] }; }
    const notifications = snap.docs.map((d) => {
        const x = d.data() || {};
        return {
            id: d.id, title: x.title || "", body: x.body || "", icon: x.icon || "🔔",
            type: x.type || "info", read: !!x.read, createdAt: x.createdAt || "",
        };
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { notifications };
});

// Marque des notifications comme lues (ids fournis, ou toutes si vide).
exports.markNotificationsRead = onCall({ region: REGION, invoker: "public" }, async (request) => {
    const auth = request.auth;
    const phone = auth && auth.token && auth.token.phone_number;
    if (!phone) throw new HttpsError("unauthenticated", "Connexion par téléphone requise.");
    const digits = String(phone).replace(/\D/g, "");
    const tail = digits.length >= 9 ? digits.slice(-9) : digits;
    const ids = Array.isArray(request.data && request.data.ids) ? request.data.ids : null;

    const db = admin.firestore();
    let docs = [];
    try {
        const snap = await db.collection("client_notifications").where("phoneTail", "==", tail).where("read", "==", false).limit(200).get();
        docs = snap.docs;
    } catch (e) { return { ok: true, updated: 0 }; }
    let batch = db.batch(), n = 0, updated = 0;
    for (const d of docs) {
        if (ids && !ids.includes(d.id)) continue;
        batch.update(d.ref, { read: true });
        if (++n >= 400) { await batch.commit(); updated += n; batch = db.batch(); n = 0; }
    }
    if (n > 0) { await batch.commit(); updated += n; }
    return { ok: true, updated };
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
// ── Trigger demande client : notifier le CLIENT à chaque changement de statut ─
// Quand le staff modifie/valide/refuse une demande (client_requests), on crée
// une notification dans `client_notifications` (lue par la cloche 🔔 de l'app).
// Fondation réutilisable : l'envoi push Expo (app native) se branchera ici.
exports.notifyClientRequestChange = onDocumentUpdated(
    { region: REGION, document: "client_requests/{id}" },
    async (event) => {
        const before = event.data && event.data.before && event.data.before.data();
        const after = event.data && event.data.after && event.data.after.data();
        if (!before || !after) return;
        if (before.status === after.status) return; // seul le changement de statut nous intéresse
        const tail = after.phoneTail;
        if (!tail) return;
        const db = admin.firestore();
        const typeLbl = after.type === "recup" ? "récupération" : "dépôt";
        const fdate = (d) => { try { return d ? new Date(d).toLocaleDateString("fr-FR") : ""; } catch (e) { return d || ""; } };
        let notif = null;
        if (after.status === "modifiee") {
            notif = {
                icon: "📅", type: "request_modified", refId: event.params.id,
                title: "Nouvelle date proposée",
                body: `Votre demande de ${typeLbl} : l'agence propose le ${fdate(after.staffDate)}${after.staffTime ? " (" + after.staffTime + ")" : ""}. Ouvrez l'onglet Dépôt pour accepter.`,
            };
        } else if (after.status === "traitee") {
            notif = {
                icon: "✅", type: "request_done", refId: event.params.id,
                title: "Rendez-vous confirmé",
                body: `Votre ${typeLbl} est planifié pour le ${fdate(after.staffDate || after.wantedDate)}${after.staffTime ? " (" + after.staffTime + ")" : ""}.`,
            };
        } else if (after.status === "refusee") {
            notif = {
                icon: "❌", type: "request_refused", refId: event.params.id,
                title: "Demande non retenue",
                body: `Votre demande de ${typeLbl} n'a pas pu être retenue. Contactez l'agence pour plus d'informations.`,
            };
        }
        if (notif) await createClientNotif(db, tail, notif);
    },
);

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
