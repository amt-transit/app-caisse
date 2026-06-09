// Centralisation des constantes globales de l'application
export const CONSTANTS = {
    TAUX_CONVERSION: 656, // Taux maison EUR <-> FCFA (656 CFA = 1 €). Surchargé au
                          // démarrage par parametres/tarifs.tauxEurCfa s'il existe.
    MAX_CBM: 68,          // Capacité d'un conteneur maritime (40HC). Surchargé au
                          // démarrage par parametres/tarifs.maxCbm s'il existe.
    // Vous pourrez ajouter d'autres constantes globales ici plus tard
};

// Pied de page société par défaut (fallback quand invoice_config.footer n'est
// pas défini). Utilisé par les générateurs de documents (facture / bon de
// livraison / etc.).
export const DEFAULT_COMPANY_FOOTER = "AMT TRANS'IT | 81 AVENUE ARISTIDE BRIAND 93240 STAINS | Tel. 0186900380 | amt.transit@gmail.com";

// CGV par défaut (fallback quand invoice_config.cgv n'est pas défini).
// NB : le "\\n" littéral est volontaire — les consommateurs font
// .replace(/\\n/g, '\n') pour obtenir les sauts de ligne.
export const DEFAULT_CGV = "1- Les temps et les délais de transports sont donnés à titre indicatifs par AMT TRANS'IT.\\n2- Les enlèvements à domicile sont gratuits dans la limite géographique.\\n3- Tous les colis et marchandises devront être intégralement payés avant la remise au destinataire.\\n4- En cas de litige, une solution amiable est privilégiée.";
