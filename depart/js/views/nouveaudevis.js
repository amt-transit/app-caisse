// « Nouveau Devis » n'est plus une page séparée (elle dupliquait Nouvelle
// Facture, source d'incohérences et de double maintenance). Le raccourci du
// menu est conservé : il ouvre désormais la page Nouvelle Facture
// pré-réglée sur le type DEVIS. Toute la logique (devis = aucun encaissement
// ni commission) vit dans nouvellefacture.js, chemin DEVIS isolé.
export const NouveauDevisView = {
    render(app) {
        try { sessionStorage.setItem('nf_preset_type', 'DEVIS'); } catch (e) { /* sessionStorage indisponible */ }
        return app.renderPage('invoice-new');
    }
};
