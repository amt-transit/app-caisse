# Plan de rangement du site AMT Trans'it

> Document de référence — rédigé pour préparer la réorganisation des dossiers du
> site web, **sans changer de technologie** (on reste en JavaScript « vanille »,
> sans framework, sans build). Pensé pour être lisible par une tierce personne
> qui reprendrait la maintenance.

---

## 1. Objectif

Rendre le projet **plus clair et plus facile à reprendre** :

- `paris/` → **`depart/`** et `abidjan/` → **`arrivee/`** (noms parlants).
- Tous les fichiers communs regroupés dans un seul dossier **`commun/`**.
- Le style centralisé : **un seul `style.css`** + **un seul `responsive.css`**.
- Tout passe par le système de **vues** déjà en place (modules `View`).

---

## 2. Les 3 garanties (à retenir)

1. **La base de données n'est PAS touchée.** ✅
   Les noms de dossiers et la base (Firestore) sont deux mondes séparés. Les
   collections (`transactions`, `livraisons`…) sont décidées par le **code**
   (`agencies-config.js` + `getCollectionName`), jamais par le nom des dossiers.

2. **Les applications mobiles ne sont PAS impactées.** ✅
   `mobile-clients/` et `mobile-parrainage/` parlent directement à Firebase, pas
   aux fichiers du site. **Aucun nouveau build** d'app n'est nécessaire.

3. **Le site n'a pas de « build ».** ✅
   Réorganiser = mettre à jour les chemins des fichiers, puis re-déployer sur
   Vercel (push Git). Rien à compiler.

---

## 3. 🚩 Lignes rouges — ce qu'on ne touche JAMAIS

- ❌ Ne **pas** renommer les **identifiants d'agence** (`paris`, `abidjan`) :
  ces mots sont stockés **dans les données** et dans `firestore.rules`. On
  renomme les **dossiers**, pas les identifiants.
- ❌ Ne **pas** modifier la logique de `getCollectionName()` ni
  `agencies-config.js` (le routage des collections).
- ❌ Ne **pas** toucher `functions/`, `firestore.rules`, `firestore.indexes`,
  ni les apps mobiles : hors périmètre.
- ❌ Ne **pas** tout faire d'un coup. Une étape = un commit = une validation.

---

## 4. État actuel (constaté)

```
racine/
  index.html, login.html, suivi.html, verify.html, livreurscan.html  (pages)
  style.css, responsive.css                      (styles globaux — déjà 2 fichiers)
  app.js, auth-guard.js, utils.js, agencies-config.js, constants.js,
  agency-money.js, shipping-mode.js, login.js, profil-view.js, …       (JS communs)
  paris/      → 43 fichiers .js (+ css/, js/utils/, js/views/)  + 2 .css
  abidjan/    → 26 fichiers .js (js/views/)
  shared/     → 11 fichiers .js (views/)
  services/   → 9 fichiers .js
  clients/    → app web client (PWA séparée)     ← on n'y touche pas ici
  scripts/, functions/, firebase-data/, police/, mobile-clients/, mobile-parrainage/
  vercel.json (redirige /paris et /abidjan vers /index.html)
```

**Bonne nouvelle :** il y a déjà `style.css` + `responsive.css` à la racine.
Le seul « éparpillement » de CSS restant est dans `paris/css/` (2 fichiers) à
fusionner.

---

## 5. Structure cible (objectif)

```
racine/
  index.html, login.html, suivi.html, verify.html, livreurscan.html   (pages — restent à la racine, exigé par Vercel)
  vercel.json, firebase.json, firestore.rules, …                      (config — racine)

  css/
    style.css            ← style.css racine + paris/css fusionnés
    responsive.css       ← responsive global unique

  commun/                ← TOUT le commun au même endroit
    vues/                ← ex-shared/views
    services/            ← ex-services
    agencies-config.js, constants.js, utils.js, auth-guard.js, app.js,
    agency-money.js, shipping-mode.js, …                              (JS communs)

  depart/                ← ex-paris
    vues/                ← ex-paris/js/views
    utils/               ← ex-paris/js/utils

  arrivee/               ← ex-abidjan
    vues/                ← ex-abidjan/js/views

  clients/               ← app web client (PWA) — inchangée
  scripts/, functions/, firebase-data/, police/, mobile-*/           ← inchangés
  mockups/               ← ranger les mockup-*.html (ou supprimer)
```

---

## 6. Plan par étapes (une étape = un commit = une validation)

> **Avant tout :** créer une branche Git dédiée (`git checkout -b rangement-site`)
> pour ne jamais risquer le site en ligne. On ne fusionne sur `main` qu'à la fin,
> une fois tout validé.

### Étape 0 — Préparation
- Créer la branche `rangement-site`.
- Vérifier que le site marche sur localhost **avant** de commencer (point de
  référence).

### Étape 1 — Le dossier `css/`
- Créer `css/`, y déplacer `style.css` et `responsive.css`.
- Fusionner les 2 CSS de `paris/css/` dedans (⚠️ partie la plus délicate :
  vérifier qu'aucun style n'en écrase un autre).
- Mettre à jour les `<link rel="stylesheet">` dans **toutes les pages .html**.
- **Valider sur localhost** → commit « css regroupé ».

### Étape 2 — Le dossier `commun/`
- Créer `commun/`, y déplacer `shared/views` (→ `commun/vues`), `services/`
  (→ `commun/services`) et les JS communs de la racine.
- Mettre à jour **tous les chemins d'import** qui pointaient vers
  `shared/…`, `services/…` ou les JS racine.
- Mettre à jour les `<script src>` dans `index.html` (ordre de chargement :
  `utils.js` → `auth-guard.js` → `app.js`).
- **Valider sur localhost** → commit « dossier commun ».

### Étape 3 — `paris/` → `depart/`
- Renommer le dossier `paris/` en `depart/`.
- Mettre à jour **tous les imports** qui contenaient `paris/`.
- Mettre à jour `vercel.json` : **garder** les redirections `/paris` (anciens
  liens/favoris) **mais** elles pointent toujours vers `/index.html` (rien à
  changer côté redirection, juste vérifier).
- Vérifier `auth-guard.js` (il redirige les users hors des vieux dossiers).
- **Valider sur localhost** → commit « paris → depart ».

### Étape 4 — `abidjan/` → `arrivee/`
- Même chose que l'étape 3, pour `abidjan/` → `arrivee/`.
- **Valider sur localhost** → commit « abidjan → arrivee ».

### Étape 5 — Nettoyage
- Déplacer les `mockup-*.html` / `mockups-*.html` dans `mockups/` (ou supprimer
  s'ils ne servent plus).
- Supprimer les fichiers morts repérés en chemin.
- **Valider sur localhost** → commit « nettoyage ».

### Étape 6 — Mise en ligne
- Relire l'ensemble, re-tester chaque grande page (connexion, dashboard,
  livraisons, caisse, devis, chat…).
- Fusionner `rangement-site` sur `main` → push → Vercel redéploie.
- Garder les redirections `/paris` `/abidjan` dans `vercel.json` au moins
  quelques mois (anciens favoris des utilisateurs).

---

## 7. Le point le plus délicat : les chemins d'import

En JavaScript « vanille », un import est un **chemin de fichier**. Si on déplace
un fichier sans corriger les imports qui pointent vers lui → **écran blanc**
(pas d'erreur visible à l'avance, pas de build pour prévenir).

**Méthode sûre :** après chaque déplacement, faire une recherche globale du
nom de dossier déplacé (ex. `shared/`, `paris/`) et corriger **chaque**
occurrence, puis recharger le site et vérifier la console du navigateur (F12)
— aucune erreur rouge « 404 / Failed to load module ».

---

## 8. Checklist de validation (à refaire après CHAQUE étape)

- [ ] Le site s'ouvre sur localhost (pas d'écran blanc).
- [ ] Console du navigateur (F12) : **aucune** erreur rouge.
- [ ] Connexion OK.
- [ ] Tableau de bord OK (départ ET arrivée).
- [ ] Une page « lourde » testée (Livraisons ou Caisse).
- [ ] Le style s'affiche correctement (couleurs, logo, responsive sur mobile).
- [ ] Commit Git fait, avec un message clair.

---

## 9. Note pour la tierce personne (future maintenance)

- Le site est une **SPA en JS ES modules**, **sans build ni framework**. On édite
  un fichier, on rafraîchit, ça marche. (Servir la racine en statique — l'équipe
  utilise VS Code Live Server, port 5502.)
- Backend = **Firebase** (Firestore + Auth + Cloud Functions v2).
- Multi-agences : routage des collections via `getCollectionName()` +
  `agencies-config.js`. **Toujours** passer par là pour les collections par
  agence (ne pas coder un nom en dur).
- Déploiement : site sur **Vercel** (push Git), Functions via Firebase CLI.
- Voir `CLAUDE.md` à la racine pour le détail complet de l'architecture.

---

*Estimation : environ 2 à 4 jours de travail prudent (étapes 1 à 6), réparties
sur plusieurs sessions, avec validation à chaque étape. Risque faible si on
respecte « une étape = un commit = une validation ». Aucun impact base de
données, aucun rebuild d'application.*
