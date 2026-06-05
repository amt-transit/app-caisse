# Plan B — Envoyer les SMS de connexion en Côte d'Ivoire (sans Firebase)

> Document préparé pour étude. Objectif : si le support Firebase ne débloque pas
> l'envoi de SMS vers la Côte d'Ivoire (+225), on remplace **uniquement la partie
> « envoi du code par SMS »** par un service qui livre bien en CI. Le reste de
> l'app (et du site) ne change pas.

---

## 1. Le contexte

- Firebase **refuse d'envoyer** les SMS vers les numéros ivoiriens (+225) — le
  compteur ne bouge même pas (blocage interne Google), erreur `-39`.
- La France (+33) fonctionne.
- **La même limite touche aussi l'app web cliente** (`/clients/`).
- Notre clientèle est **majoritairement en Côte d'Ivoire** → c'est bloquant.

**Donc :** on garde Firebase pour TOUT le reste (comptes, données, sécurité),
mais on envoie le **code SMS** via un autre service, plus fiable en CI.

---

## 2. Comment ça marcherait (même principe pour tous les services)

Aujourd'hui, Firebase fait 3 choses d'un coup : générer le code, l'envoyer par
SMS, et connecter l'utilisateur. Dans le Plan B, on refait ça nous-mêmes
proprement, en **3 petites briques côté serveur** (Cloud Functions) :

1. **Envoi** : l'app demande un code pour un numéro → une Cloud Function
   `envoyerCode(numéro)` génère un code à 6 chiffres, le range (chiffré, avec une
   expiration ~5 min) et l'envoie via le **service SMS choisi**.
2. **Vérification** : l'app envoie le code tapé → une Cloud Function
   `verifierCode(numéro, code)` contrôle, puis **crée une session Firebase**
   (jeton personnalisé) pour connecter l'utilisateur — exactement comme avant.
3. L'app se connecte avec ce jeton. **Tout le reste de l'app est inchangé.**

> 🔒 **Règle de sécurité (comme pour Wave) :** la **clé secrète** du service SMS
> reste **côté serveur** (un « secret » Firebase), **jamais dans l'application**.

**Bon à savoir :** ce changement ne touche **que l'écran de connexion** (2 appels).
Et il **resservira tel quel pour le site web** → un seul travail, deux apps réglées.

---

## 3. Le comparatif

> 💶 Prix **indicatifs** (à confirmer auprès de chaque fournisseur au moment du
> choix). 1 € ≈ 656 FCFA.

| Service | Fiabilité en CI | Simplicité | Prix indicatif / SMS | Type | Remarques |
|---|---|---|---|---|---|
| **Orange SMS API** (Orange CI) | ⭐⭐⭐⭐ Excellente (opérateur local) | Moyenne (inscription + contrat) | ~15–30 FCFA | Passerelle SMS | Idéal si beaucoup de clients Orange ; livre aussi les autres opérateurs. Démarches d'ouverture un peu administratives. Support FR. |
| **Agrégateur local ivoirien** (ex. **LeTexto**, mTarget, Bizao…) | ⭐⭐⭐⭐ Très bonne (multi-opérateurs CI : Orange, MTN, Moov) | **Bonne** (compte rapide, paiement en FCFA / mobile money) | ~15–35 FCFA | Passerelle SMS | **Support en français**, facturation locale FCFA. Le plus « terrain » pour la CI. Maturité de l'API variable selon le prestataire. |
| **Africa's Talking** | ⭐⭐⭐⭐ Bonne (spécialiste Afrique) | **Bonne** (API claire, docs, bac à sable) | ~20–35 FCFA | Passerelle SMS | Bon compromis technique. Inscription d'un « expéditeur » (sender ID) à prévoir. Support EN. |
| **Twilio Verify** | ⭐⭐⭐ Variable (routes internationales) | **Très bonne** (gère le code à ta place) | ~30–80 FCFA (en USD) | API OTP clé en main | Le **plus simple à coder** (génère + envoie + vérifie le code). Mais **le plus cher**, en USD, et livraison CI parfois moins régulière que le local. |
| **Vonage Verify** | ⭐⭐⭐ Variable | Très bonne | ~30–80 FCFA (en USD) | API OTP clé en main | Équivalent Twilio. Mêmes avantages/limites. |

---

## 4. Ma recommandation

Pour une activité **centrée sur la Côte d'Ivoire**, l'ordre conseillé :

1. **🥇 Un acteur local multi-opérateurs** (LeTexto / Africa's Talking / Orange) :
   meilleure **livraison réelle** vers tous les opérateurs ivoiriens (Orange, MTN,
   Moov), **prix bas**, facturation pratique. C'est le bon choix « métier ».
   - **LeTexto / local** si tu veux le **support en français** et payer en FCFA.
   - **Africa's Talking** si tu veux l'**API la plus propre** techniquement.
   - **Orange SMS API** si une **grosse part** de tes clients est chez Orange CI.

2. **🥈 Twilio Verify** seulement si tu veux **le plus simple à mettre en place**
   et que le **surcoût** (et la livraison internationale) ne te gênent pas.

> 👉 Le **vrai critère décisif = la livraison réelle**. Idéalement, on ouvre un
> compte **d'essai gratuit** chez 1 ou 2 candidats et on **envoie un vrai SMS de
> test** vers un numéro Orange CI + un numéro MTN/Moov avant de trancher.

---

## 5. Ce que ça implique concrètement

- **Effort de développement** : modéré. ~2 petites Cloud Functions + la
  modification de l'écran de connexion. Le cœur de l'app n'est pas touché.
- **Coût** : un abonnement « à la consommation » (tu paies les SMS envoyés).
  Avec ~15–35 FCFA/SMS en local, c'est très raisonnable.
- **Démarches** : créer un compte chez le fournisseur, faire valider un **nom
  d'expéditeur** (sender ID, ex. « AMT TRANSIT »), recharger un crédit SMS.
- **Sécurité** : clé secrète **côté serveur uniquement** (secret Firebase).
- **Bonus** : la même solution **corrige aussi le site web client**.

---

## 6. Points d'attention

- **Validation du nom d'expéditeur** : en CI, l'affichage d'un « expéditeur »
  alphanumérique (ex. « AMT TRANSIT ») peut demander une **autorisation** auprès
  de l'opérateur/agrégateur (quelques jours). Sinon, un numéro court est utilisé.
- **Anti-fraude** : on garde une **limite** (ex. pas plus de X codes par numéro
  et par heure) pour éviter les abus et la surconsommation.
- **On garde Firebase** pour les comptes et la sécurité — on ne remplace **que**
  l'envoi du SMS.

---

## 7. Prochaine étape (à décider ensemble)

1. **Attendre la réponse du support Firebase** (en cours). Si Google débloque la
   CI → **rien à faire**, on garde tout tel quel.
2. Si Google ne débloque pas → **choisir 1 ou 2 services** ci-dessus, ouvrir un
   **essai gratuit**, et **tester un vrai SMS** vers Orange/MTN/Moov CI.
3. Une fois le service validé → je mets en place les 2 Cloud Functions + l'écran
   de connexion (mobile **et** web).

*Aucune urgence à implémenter tant que le support n'a pas répondu. Ce document
sert juste à être prêt et à décider vite le moment venu.*
