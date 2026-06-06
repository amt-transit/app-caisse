# Plan — Module « Réception Colis » (routes SaaS, ex. Chine)

> Document de référence. Rédigé pour être lisible par le maintainer (non
> technique) ET par un développeur. On valide ce plan AVANT de coder, puis on
> construit par phases (une phase = des commits = une validation localhost).

---

## 1. Objectif

Suivre le **cycle de vie d'un colis** depuis sa **réception à l'entrepôt d'origine**
(ex. Chine) jusqu'à son **arrivée à destination**. On veut savoir, à tout moment :
à qui appartient le colis, son poids, son volume, s'il part par bateau ou avion,
s'il part seul ou attend d'autres marchandises, et **où il en est** (reçu, chargé,
embarqué, en transit, arrivé). Plus une **alerte** si un colis traîne trop
longtemps à l'entrepôt.

---

## 2. Principes (à retenir)

1. **Indépendant de la facture, MAIS réutilisable par elle (sens unique).** Un
   colis peut être reçu, pesé, photographié et expédié **sans qu'aucune facture
   existe** (la fiche colis est un enregistrement à part). **EN REVANCHE, au
   moment de CRÉER la facture** d'un client, on pourra **récupérer directement les
   données de réception** (poids, volume, colis reçus du client) pour **concevoir
   la facture sans tout re-saisir**. Lien à **sens unique** (réception → facture) :
   la réception ne dépend jamais d'une facture ; c'est la facture qui pioche dans
   la réception. (La **réception est le cœur** de ce module — c'est elle qui a
   motivé l'ajout ; la réutilisation en facturation est un bonus à fort gain de
   temps.)
2. **Rattaché au client existant par son NUMÉRO** (ancre téléphone, comme les
   factures) → pas de doublon, historique unifié, et l'app Clients pourra
   retrouver les colis du client (phase 2).
3. **Modèle de route SaaS réutilisable.** On le construit générique ; il
   s'active pour la Chine et toute future route d'origine. La collection est
   isolée par route via `getCollectionName('receptions')` → `receptions_chine`.
4. **Une seule fiche suit le colis** de la réception (Chine) jusqu'à l'arrivée :
   le staff Chine gère Reçu → Embarqué, le staff destination coche « Arrivé ».

---

## 3. La « fiche colis » (champs)

- **Propriétaire** : nom + numéro → `ownerName`, `ownerPhone`, `ownerPhoneTail`
  (rattaché à la base clients par le téléphone). Si le client n'existe pas, on
  propose de le créer.
- **Poids** (kg) · **Volume** (CBM / m³)
- **Mode** : 🚢 maritime | ✈️ aérien
- **Photo** du colis (le client la verra en phase 2)
- **Groupage** : « part seul » OU « attend d'autres colis » (+ étiquette de lot /
  commande optionnelle pour regrouper plusieurs colis d'un même client)
- **Date de réception** + **durée à l'entrepôt** (compteur auto)
- **Statut** (voir pipeline) + **historique horodaté** de chaque étape
- **Conteneur** (numéro/réf) une fois chargé
- **Contenu / nature** (ex. chaussures, textile, électronique) · **Nombre de cartons**
- **Fournisseur / boutique en Chine** (origine) · **N° de suivi Chine** (tracking du
  fournisseur, pour identifier le colis à la réception)
- **Valeur déclarée** (optionnel) · **Référence colis** (auto, ex. initiales-numéro)
- **Produits** : liste (désignation, qté, poids, volume) — surtout pour les colis
  groupés ; le poids/volume du colis = **somme** des produits.
- **Facture liée** (`factureRef`) : **requise avant le chargement conteneur**.
- Champs techniques : `agency` (multi-tenant), `isDeleted` (suppression douce)

---

## 4. Pipeline de statuts (étapes horodatées)

```
  Reçu  →  (En attente de groupage)  →  Chargé conteneur  →  Embarqué (bateau/avion)
        →  En transit  →  Arrivé à destination  →  (Livré)
```

- Chaque passage d'étape **enregistre la date/heure** → on sait toujours où en
  est le colis et **depuis quand**.
- « En attente de groupage » est optionnel (seulement si le colis attend d'autres
  marchandises).
- Reçu → Embarqué = côté **Chine**. Arrivé → Livré = côté **destination**.
- **Colis à grouper** : démarre en « En attente de groupage » ; on lui **ajoute /
  retire des produits** (désignation, qté, poids, volume → poids/volume du colis =
  somme des produits). Il **ne s'avance PAS en un clic** : il faut confirmer
  « ✓ Regroupement terminé ».
- **CONTRÔLE : pas de « Chargé conteneur » sans FACTURE liée** au colis (vérifiée
  dans les transactions de la route). Lien manuel pour l'instant (Détail → Lier la
  facture) ; sera automatisé en Phase 1.5.

---

## 5. Alerte « trop long à l'entrepôt »

- Seuil **par défaut : 30 jours** (modifiable plus tard dans les réglages de
  l'agence).
- Si un colis est **encore à l'entrepôt** (pas encore embarqué) **et** que sa
  durée dépasse le seuil → **badge d'alerte** visible dans la liste (ex. 🔴).
- Objectif : repérer les colis oubliés / en souffrance.

---

## 6. La liste / l'écran (côté staff)

- Une page **« Réception Colis »** (nouveau menu, affiché pour les routes SaaS).
- Liste des colis avec : propriétaire, poids, volume, mode, durée, statut, alerte.
- **Recherche** (nom / numéro / référence) + **filtres** (statut, mode, alertes).
- **Pagination** (50/page, comme les autres pages lourdes).
- Bouton **« Recevoir un colis »** (formulaire : client par numéro, poids, volume,
  mode, groupage, photo).
- Sur chaque colis : faire **avancer le statut**, voir la **photo**, l'historique.

---

## 7. Phases de construction (une phase = commits = validation)

### Phase 1 — MVP côté staff
- Collection `receptions` (via `getCollectionName`) + la fiche.
- Formulaire « Recevoir un colis » (rattachement client par numéro, poids,
  volume, mode, groupage, photo via l'upload HTTPS déjà en place).
- Liste + recherche + filtres + pagination.
- Avancement du statut (pipeline) + historique horodaté.
- Durée à l'entrepôt + alerte au-delà du seuil (défaut 30 j).
- Nouveau menu « Réception Colis » pour la route Chine.

### Phase 1.5 — Réutilisation à la FACTURATION (sens unique réception → facture)
- À la **création d'une facture** d'un client, proposer ses **colis reçus**
  (retrouvés par le **numéro**) → le staff sélectionne les colis à facturer.
- **Pré-remplir** la facture avec les données de réception : poids, volume,
  désignation/nombre de colis. Gain de temps, zéro re-saisie.
- Reste **découplé** : on lit la réception, on ne la modifie pas ; la facture
  garde sa propre vie.

### Phase 2 — Intégration app Clients + notifications
- L'app Clients lit les colis du client **par son numéro** → il voit « colis reçu
  + photo + statut qui avance ».
- Notification au client à la réception (et/ou aux étapes clés).

### Plus tard (optionnel)
- Seuil d'alerte configurable dans les réglages.

---

## 8. Côté technique (pour le dev)

- **Collection** : `getCollectionName('receptions')` (toujours, pour l'isolation
  SaaS). Docs avec `agency` + `isDeleted` (filtrer côté client pour ne pas exclure
  les docs sans le champ — piège Firestore connu).
- **Vue** : un module `View` réutilisable (ex. `commun/vues/reception-colis.js`),
  affiché via la config menus pour les agences de route SaaS.
- **Lien client** : `phoneTail` du numéro (services `commun/services/phone.js`).
- **Photo** : upload via l'API REST Firebase Storage (méthode déjà construite pour
  les vocaux), dossier `receptions/<route>/<id>`.
- **Suivi de durée** : à partir de `dateReception`.

---

## 9. Lignes rouges / non-objectifs

- ❌ Ne PAS coupler à la facture / aux `transactions` (module indépendant).
- ❌ Ne PAS créer de doublon client : toujours rattacher par le **numéro**.
- ❌ Ne PAS coder en dur le nom de collection : toujours `getCollectionName`.
- ❌ Phase 1 = staff uniquement ; l'app Clients vient en phase 2.

---

## 10. Checklist de validation (après chaque phase)

- [ ] La page s'ouvre (route Chine), aucune erreur console (F12).
- [ ] Recevoir un colis : client retrouvé par numéro, photo OK, colis dans la liste.
- [ ] Faire avancer le statut : l'étape et sa date s'enregistrent.
- [ ] La durée s'affiche ; l'alerte apparaît au-delà du seuil.
- [ ] Recherche / filtres / pagination OK.
- [ ] Isolation SaaS : les colis n'apparaissent que pour la bonne route.
