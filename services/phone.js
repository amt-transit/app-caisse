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
