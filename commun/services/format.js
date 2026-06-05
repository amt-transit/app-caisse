// Formatage monétaire centralisé (source unique).
//
// Avant : la formule Intl.NumberFormat(...XOF/EUR...).replace(...) était copiée
// ~25 fois (formatCFA / formatMoneyLocal). Ici une seule définition.
//
// IMPORTANT : formatMoney ne CONVERTIT pas les montants — il ajoute seulement
// le symbole de devise de l'agence active (EUR pour 'paris' ou route en EUR,
// sinon FCFA/XOF). Le stockage interne reste en FCFA ; la conversion ÷ TAUX
// quand on veut afficher en EUR est faite par l'appelant (comme avant).

import { AGENCIES } from '../../agencies-config.js';

// EUR si agence historique 'paris' OU route SaaS dont la devise configurée
// est EUR. (Même règle que l'ancien app.formatMoneyLocal / les copies des vues.)
export function isEurAgency() {
    const ag = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
    if (ag === 'paris') return true;
    const a = AGENCIES && AGENCIES[ag];
    return !!(a && a.currency === 'EUR');
}

export function formatMoney(amount, forceCfa = false) {
    if (isEurAgency() && !forceCfa) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
            .format(amount || 0).replace(/[  ]/g, ' ').replace(/\s*\/\s*/g, ' ');
    }
    return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' })
        .format(amount || 0).replace(/[  ]/g, ' ').replace(/\s*\/\s*/g, ' ');
}
