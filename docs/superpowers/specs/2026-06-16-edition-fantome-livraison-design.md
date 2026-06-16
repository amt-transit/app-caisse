# Édition fantôme (inline) — page Livraison

Date : 2026-06-16
Fichier principal concerné : `arrivee/js/views/livraison.js`
Statut : design validé par le maintainer (compagnon visuel brainstorming).

## 1. Objectif

La saisie/correction des informations colis dans la page **Livraison** est lente :
il faut ouvrir un panneau d'édition pour chaque colis, et on ne voit pas d'un coup
d'œil les champs encore vides (tél, adresse…). 

On remplace ce mode par **l'édition « fantôme » (inline)** : chaque champ modifiable
se modifie **directement sur place**, les champs **vides ressortent** visuellement,
et l'enregistrement est **automatique** quand on quitte le champ.

Douleur principale visée (validée) : « on ne voit pas ce qui manque » + « tous les
champs doivent être modifiables ».

## 2. Périmètre

- **Où** : vue **Liste** (tableau, ordinateur) **ET** vue **Fiches** (téléphone).
- **Champs éditables en fantôme** : `Qté`, `Expéditeur`, `Lieu de livraison`,
  `Destinataire`, `Numéro`, `Description`, `Info`.
- **Hors périmètre (inchangés)** :
  - **Montant** et **Statut** : gardent leurs actions dédiées (Encaisser, Livré).
    Pas d'édition fantôme (données financières/état sensibles).
  - **Conteneur** : reste géré par « Attribuer » + la synchro existante
    (`syncContainersOnly` / `confirmAssignContainer`), à cause de la logique de
    propagation vers la transaction. Pas en édition fantôme dans cette première version.

## 3. Comportement (modèle d'interaction)

### États visuels d'une cellule éditable
- **Repos** : ressemble à du texte simple (effet « fantôme », pas de bordure de champ).
- **Survol** : léger fond + soulignement pointillé + curseur texte → indique qu'on peut éditer.
- **Vide** : fond orange clair + libellé « à compléter… » (repère « ce qui manque »).
- **Active (en édition)** : la cellule s'entoure d'un **cadre bleu** net (anti-erreur :
  on voit exactement où on tape).
- **Vient d'être enregistrée** : petit **✓ vert** bref.

### Saisie
- **Clic** sur une cellule → elle devient éditable (cadre bleu), curseur dedans.
- **Tab** → passe à la cellule éditable suivante de la ligne (saisie en série).
- **Échap** → annule la saisie en cours, revient à l'ancienne valeur (pas d'enregistrement).

### Enregistrement (auto + Annuler)
- En **quittant** la cellule (clic ailleurs, Tab, ou Entrée) :
  - si la valeur a changé → **enregistrement automatique** (`updateDoc`) + ✓ vert ;
  - si inchangée → rien.
- Après chaque enregistrement, un **toast « ↶ Annuler »** apparaît ~5 secondes :
  un clic restaure l'ancienne valeur (re-`updateDoc`). Plusieurs modifications =
  le toast cible la dernière ; chaque cellule mémorise sa valeur précédente.

## 4. Règles métier à respecter (réutiliser l'existant)

- **Synchro fiche Client** : modifier `Numéro`, `Lieu` ou `Destinataire`/`Expéditeur`
  doit aussi mettre à jour la fiche `clients` correspondante (règle existante,
  cf. mémoire process-livraison-maritime / fonctions `updateDeliveryLocation`,
  `updateDeliveryRecipient`). On réutilise ces fonctions de sauvegarde plutôt que
  d'en écrire de nouvelles quand elles existent.
- **Numéro** : conserver la normalisation/extraction du téléphone existante
  (regex CI, retrait du n° du nom, `phoneTail`/E164).
- **Lieu de livraison** : conserver la **détection de commune** (`detectCommune`)
  et la mise à jour de la commune affichée.
- **Qté** : numérique (entier ≥ 0).
- **isDeleted / agency / shippingMode** : ne pas toucher ; l'édition ne modifie que
  le champ concerné.

## 5. Approche technique (haut niveau)

- **Liste (tableau)** : dans le rendu des lignes (vue « Liste » de livraison.js),
  rendre les cellules éditables comme des éléments éditables sur place
  (input « nu » stylé comme du texte, ou `contenteditable`), avec :
  - `onFocus` → état actif (cadre bleu) + mémoriser la valeur initiale ;
  - `onBlur` / Entrée → comparer, si changé appeler la fonction de sauvegarde du
    champ (réutiliser `updateDeliveryLocation`, `updateDeliveryRecipient`, etc., ou
    une fonction générique `saveField(id, champ, valeur)` qui route vers la bonne
    logique + synchro client) ;
  - `Escape` → restaurer la valeur initiale.
- **Fiches (mobile)** : appliquer le même principe aux champs de la fiche compacte.
- **Champ vide** : style « à compléter » quand la valeur est vide/`—`.
- **Annuler** : un utilitaire toast réutilisable qui garde `{id, champ, ancienneValeur}`
  et permet le retour arrière.
- **Cohérence** : les fonctions de sauvegarde existantes restent la **source unique**
  de la logique (pas de duplication de la normalisation tél / sync client).
- **Édition concurrente** : `onSnapshot` rafraîchit déjà la liste ; éviter d'écraser
  la cellule en cours d'édition lors d'un refresh (ne pas re-rendre la cellule qui a
  le focus).

## 6. Risques & garde-fous

- **Saisie dans la mauvaise case** → cadre bleu net sur la cellule active.
- **Faute de frappe enregistrée** → toast Annuler (5 s) + Échap avant de quitter.
- **Re-render pendant la frappe** (onSnapshot) → ne pas remplacer la cellule focalisée.
- **Mobile** : champs assez grands au toucher ; clavier adapté (numérique pour Qté/Numéro).

## 7. Hors scope (à ne pas faire dans cette version)

- Édition fantôme du Conteneur, du Montant, du Statut.
- Édition multi-lignes simultanée / copier-coller en masse type tableur.
- Historique des modifications.

## 8. Critère de réussite

Le secrétariat peut compléter/corriger n'importe quel champ d'un colis (tél, lieu,
nom, description, info, qté, expéditeur) **directement** dans la liste ou la fiche,
**sans ouvrir de panneau**, **voit immédiatement** les champs vides, et chaque
modification est **enregistrée automatiquement** (avec possibilité d'annuler), tout
en gardant la synchro avec la fiche Client et sans toucher au financier/statut.
