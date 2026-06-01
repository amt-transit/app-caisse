# AMT Clients — application mobile (React Native / Expo)

Version **native** de l'app Client (jumelle de la PWA `clients/`). Même backend
Firebase (`caisse-amt-perso`), mêmes Cloud Functions (`us-central1`). Aucun
accès Firestore direct : tout passe par les fonctions (getMyInvoices,
getMyChat, getMyProfile, computeQuote, createClientRequest…).

## Lancer en développement
```bash
cd mobile-clients
npm install
npx expo start          # puis ouvrir dans Expo Go (téléphone) ou un émulateur
```

## Connexion (compte de démonstration)
- Numéro : **07 48 52 88 24** (indicatif 🇨🇮 +225) — numéro de test Firebase
- Code SMS : **111111**
- Puis créer un code PIN (4 chiffres)

> La connexion SMS utilise `expo-firebase-recaptcha` (un reCAPTCHA s'affiche au
> 1er envoi). On pourra basculer vers `@react-native-firebase/auth` (100% natif,
> sans reCAPTCHA) plus tard — seul l'écran de connexion changera.

## État du portage
- [x] Étape 1 — Connexion SMS + PIN + accès aux Cloud Functions (écran de test)
- [ ] Navigation + onglets (Accueil, Suivi, Dépôt, Devis, Chat, Profil)
- [ ] Push notifications (token Expo enregistré sur le profil)
- [ ] PDF facture + photos chat
- [ ] Build EAS (APK de test)

## Build (plus tard)
`eas build --profile preview` (voir eas.json à créer, comme mobile-parrainage).
