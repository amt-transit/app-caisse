// Téléphone Côte d'Ivoire : une seule définition de la regex + helpers.
// Avant, la (longue) regex était copiée dans ~13 endroits.
//
// NB : pas de flag /g ici → l'objet regex est sans état, donc partageable
// entre modules pour .match()/.test() sans souci de lastIndex.

export const CI_PHONE_REGEX = /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/;

// Renvoie le 1er numéro trouvé dans une chaîne, sinon '' .
export function extractPhone(str) {
    const m = String(str || '').match(CI_PHONE_REGEX);
    return m ? m[0] : '';
}

// Retire le numéro d'un libellé du type "Nom + téléphone" et nettoie les
// séparateurs en fin de chaîne. Renvoie le nom seul (trim).
export function stripPhoneFromName(str) {
    const s = String(str || '');
    const m = s.match(CI_PHONE_REGEX);
    if (!m) return s.trim();
    return s.replace(m[0], '').replace(/[-–,;:\/\s]+$/, '').trim();
}

// Normalise un numéro au format international 225XXXXXXXXXX (liens wa.me).
export function toE164(phone) {
    const c = String(phone || '').replace(/[^\d]/g, '').replace(/^00/, '');
    return c.length === 10 ? '225' + c : c;
}

// ---------------------------------------------------------------------------
// Normalisation E.164 « + indicatif » (format des numéros Firebase Auth).
// Utilisée par l'app AMT Clients pour relier un client à ses factures et par
// les règles Firestore (request.auth.token.phone_number).
//
// IMPORTANT : la règle du « 0 » dépend du pays.
//   - France (FR) : le 0 national est RETIRÉ -> +33 6 12 34 56 78 = +33612345678
//   - Côte d'Ivoire (CI) : numéro à 10 chiffres, le 0 est CONSERVÉ -> +2250701020304
// ---------------------------------------------------------------------------

// Quand un champ contient plusieurs numéros ("0763.../0605..."), on garde le 1er.
export function firstPhoneChunk(raw) {
    const parts = String(raw || '').split(/[\/]+/);
    for (const p of parts) { if (p.replace(/\D/g, '').length >= 8) return p; }
    return parts[0] || '';
}

// raw : numéro brut (formats variés) ; country : 'FR' | 'CI' | 'CN'.
// Renvoie '+33…' / '+225…' / '+86…' ou '' si non normalisable.
// Sert à l'AFFICHAGE (joli format). Le LIEN client<->factures se fait, lui,
// par phoneTail() (voir plus bas), insensible au pays.
export function toE164Intl(raw, country) {
    if (!country) return '';
    let d = firstPhoneChunk(raw).replace(/\D/g, '').replace(/^00/, '');
    if (!d) return '';
    if (country === 'FR') {
        if (d.startsWith('33')) d = d.slice(2);
        if (d.startsWith('0')) d = d.slice(1);   // France : 0 national retiré
        return d.length >= 9 ? '+33' + d : '';
    }
    if (country === 'CI') {
        if (d.startsWith('225')) d = d.slice(3);  // CI : 0 conservé (10 chiffres)
        return d.length >= 8 ? '+225' + d : '';
    }
    if (country === 'CN') {
        if (d.startsWith('86')) d = d.slice(2);
        return d.length >= 10 ? '+86' + d : '';
    }
    return '';
}

// E.164 « détecté » : ne normalise QUE si le numéro porte déjà un préfixe
// international (+ ou 00). Sinon '' (on ne devine pas le pays). Utile pour
// les destinataires, qui peuvent être de n'importe quel pays (SN, ML, CI…).
export function toE164Detect(raw) {
    const chunk = firstPhoneChunk(raw).trim();
    if (!/^(\+|00)/.test(chunk)) return '';
    const d = chunk.replace(/\D/g, '').replace(/^00/, '');
    return d.length >= 8 ? '+' + d : '';
}

// CLÉ DE LIAISON client<->factures : les 9 derniers chiffres (partie
// « abonné »), identiques en format national OU international, quel que soit
// le pays. Ex. 0707070707 / +2250707070707 -> "707070707".
export function phoneTail(raw) {
    const d = firstPhoneChunk(raw).replace(/\D/g, '');
    if (d.length >= 9) return d.slice(-9);
    return d.length >= 8 ? d.slice(-8) : '';
}

// Pays (pour l'AFFICHAGE E.164 uniquement) par route : expéditeur = départ.
// destinataire : on NE devine PAS (multi-pays) -> détection seule.
export const ROUTE_PHONE_COUNTRY = {
    paris:   { exp: 'FR', dest: 'CI' },
    abidjan: { exp: 'FR', dest: 'CI' },
    chine:   { exp: 'CN', dest: 'CI' }
};
export function routePhoneCountries(agency) {
    return ROUTE_PHONE_COUNTRY[agency] || { exp: null, dest: null };
}
