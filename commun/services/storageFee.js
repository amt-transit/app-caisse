// services/storageFee.js
//
// SOURCE UNIQUE du calcul des frais de magasinage (barème officiel).
// Toutes les pages (Magasinage, Livraison, Dashboard, Factures...) doivent
// importer cette fonction au lieu de redéfinir leur propre calcul, afin que le
// MÊME colis affiche le MÊME montant partout.
//
// Barème officiel (validé) :
//   - 7 premiers jours : gratuits ;
//   - jusqu'à 14 jours : forfait 10 000 FCFA par colis ;
//   - au-delà de 14 jours : 10 000 + 1 000 FCFA par jour supplémentaire et par
//     colis (3 000/jour pour une palette).
// Montant TOUJOURS en FCFA (concept agence d'arrivée).

/**
 * @param {string} dateString  Date d'entrée en entrepôt (ISO ou compatible Date).
 * @param {number|object} quantityOrItem  Quantité, OU l'objet colis/livraison/
 *        transaction (on lit alors quantiteRestante ?? quantite, et la
 *        description pour détecter une palette).
 * @param {Date} [compareDate]  Date de référence (défaut : maintenant).
 * @returns {{days:number, fee:number, isPalette:boolean}}
 */
export function calculateStorageFee(dateString, quantityOrItem = 1, compareDate = new Date()) {
    if (!dateString) return { days: 0, fee: 0, isPalette: false };

    let qte = 1;
    let isPalette = false;
    if (typeof quantityOrItem === 'object' && quantityOrItem !== null) {
        const o = quantityOrItem;
        qte = (o.quantiteRestante !== undefined && o.quantiteRestante !== null)
            ? parseInt(o.quantiteRestante)
            : (parseInt(o.quantite) || 1);
        const desc = [o.description, o.nature, o.info, o.desc].filter(Boolean).join(' ').toLowerCase();
        if (desc.includes('palette')) isPalette = true;
    } else {
        qte = parseInt(quantityOrItem) || 1;
    }
    if (isNaN(qte)) qte = 1; // garde-fou : valeur illisible -> 1 colis

    const tarifJour = isPalette ? 3000 : 1000;
    const arrivalDate = new Date(dateString);
    const diffTime = compareDate - arrivalDate;
    if (diffTime < 0) return { days: 0, fee: 0, isPalette };

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return { days: diffDays, fee: 0, isPalette };
    if (diffDays <= 14) return { days: diffDays, fee: 10000 * qte, isPalette };

    const extraDays = diffDays - 14;
    return { days: diffDays, fee: (10000 + extraDays * tarifJour) * qte, isPalette };
}
