# AMT Parrainage — App mobile (Expo)

Espace **Parrain / Filleul** : consultation (lecture seule) de l'historique des
clients affiliés, du solde et des filleuls. Même projet Firebase que l'app web
(`caisse-amt-perso`).

## État actuel : B1 — scaffold (connexion uniquement)

Fait :
- Projet Expo (SDK 52) + Firebase JS SDK
- Persistance d'auth via AsyncStorage
- Écran de **connexion email / mot de passe** fonctionnel
- Écran d'accueil placeholder (affiche l'email connecté + déconnexion)

**Pas encore** (dépend de la Phase A back-end) :
- Affichage des données (solde, clients affiliés, filleuls)

## Démarrer

```bash
cd mobile-parrainage
npm install
npx expo install --fix   # aligne les versions natives sur l'SDK Expo
npx expo start           # puis 'a' (Android), 'i' (iOS) ou Expo Go
```

> La connexion teste contre le **Firebase de prod**. Pour se connecter il faut
> un compte démarcheur — créé en Phase A2 (Cloud Function de provisioning).
> Tant que A2 n'est pas faite, tester avec un compte Firebase Auth existant.

## Roadmap

| Phase | Quoi | Où |
|---|---|---|
| A1 | Lien client↔démarcheur (par client, persistant) + code parrain à la facturation | app web (`nouvellefacture`, `parrainage`) |
| A2 | Cloud Function `provisionDemarcheurAuth` (admin crée le compte, stocke `authUid` sur `demarcheurs`) | `functions/` |
| A3 | Règles Firestore : un démarcheur ne lit QUE son périmètre (sa fiche, ses commissions, ses filleuls, ses clients) | `firestore.rules` |
| B3 | Résolution `auth.uid` → fiche `demarcheurs` (via `authUid`) | ce projet |
| B4 | Écrans lecture seule : Solde/Total · Mes clients & expéditions · Mes filleuls + activité | ce projet |

## Architecture

```
App.js                      gate auth (Login vs Home)
src/firebase.js             init Firebase (auth + Firestore), même config que le web
src/auth/AuthContext.js     contexte auth (user, login, logout)
src/screens/LoginScreen.js  connexion email/mot de passe
src/screens/HomeScreen.js   placeholder post-connexion (données = B4)
```
