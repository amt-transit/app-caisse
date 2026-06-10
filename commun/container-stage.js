// Vocabulaire UNIFIÉ des étapes de vie d'un conteneur, partagé par Confection,
// Bateaux départ et Suivi conteneurs (D — statuts unifiés). Une seule source de
// vérité : préparation → scellé → embarqué → en mer → transbordement → arrivé →
// dédouané → livré. Chaque page affiche le MÊME libellé / la MÊME couleur.

export const CONTAINER_STAGES = {
    PREPARATION:    { label: 'En préparation',  emoji: '🏗️', color: '#64748b' },
    SCELLE:         { label: 'Scellé (prêt)',   emoji: '🔒', color: '#0891b2' },
    EMBARQUE:       { label: 'Embarqué',        emoji: '🚢', color: '#2563eb' },
    EN_MER:         { label: 'En mer',          emoji: '🌊', color: '#0ea5e9' },
    TRANSBORDEMENT: { label: 'Transbordement',  emoji: '🔄', color: '#7c3aed' },
    ARRIVE:         { label: 'Arrivé',          emoji: '⚓', color: '#0d9488' },
    DEDOUANE:       { label: 'Dédouané',        emoji: '🛃', color: '#16a34a' },
    LIVRE:          { label: 'Livré',           emoji: '📦', color: '#15803d' },
};

// trackingStatus (ShipsGo / frise Suivi) -> étape canonique.
const TS_MAP = {
    PREPARATION: 'PREPARATION', PREP: 'PREPARATION',
    EMBARQUE: 'EMBARQUE', LOADED: 'EMBARQUE',
    CHARGE: 'SCELLE', GTIN: 'SCELLE', GATE_IN: 'SCELLE', // entré au port / scellé (pas encore embarqué)
    EN_TRANSIT: 'EN_MER', TRANSIT: 'EN_MER', EN_MER: 'EN_MER',
    TRANSBORDEMENT: 'TRANSBORDEMENT', TRANSSHIPMENT: 'TRANSBORDEMENT',
    ARRIVE: 'ARRIVE', ARRIVED: 'ARRIVE',
    DEDOUANE: 'DEDOUANE', CUSTOMS: 'DEDOUANE',
    LIVRAISON: 'LIVRE', LIVRE: 'LIVRE', DELIVERED: 'LIVRE',
};

// Déduit l'étape d'un conteneur depuis son état. Priorité au suivi ShipsGo
// (trackingStatus) ; sinon on dérive de l'état logistique (statut / bateau).
// opts: { boat, allDelivered }
export function getContainerStage(c = {}, opts = {}) {
    const { boat, allDelivered } = opts;
    let key;
    if (allDelivered) {
        key = 'LIVRE';
    } else {
        const ts = String(c.trackingStatus || '').toUpperCase();
        const boatStatus = boat ? String(boat.status || '').toUpperCase() : '';
        if (ts && TS_MAP[ts]) key = TS_MAP[ts];
        else if (boatStatus === 'ARRIVE') key = 'ARRIVE';
        else if (c.boatId || (boatStatus && boatStatus !== 'EN_CONFECTION')) key = 'EMBARQUE';
        else if (c.status === 'EN_ATTENTE_BATEAU') key = 'SCELLE';
        else key = 'PREPARATION';
    }
    return { key, ...CONTAINER_STAGES[key] };
}

// Badge HTML prêt à insérer (même rendu partout).
export function containerStageBadgeHtml(c, opts) {
    const s = getContainerStage(c, opts);
    return `<span style="display:inline-block; padding:3px 10px; border-radius:12px; background:${s.color}; color:#fff; font-size:12px; font-weight:700; white-space:nowrap;">${s.emoji} ${s.label}</span>`;
}
