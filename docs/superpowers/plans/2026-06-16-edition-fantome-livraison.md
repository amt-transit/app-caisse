# Édition fantôme (inline) — page Livraison — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer la saisie des champs colis de la page Livraison en « édition fantôme » : chaque champ se modifie sur place (style texte), les champs vides ressortent, enregistrement auto en quittant la case avec bouton Annuler, en vue Liste ET Fiches.

**Architecture:** La vue Liste a DÉJÀ des `<input>` éditables avec sauvegarde auto (`onchange` = au blur) et des fonctions de sauvegarde par champ (`updateDelivery*`, dans `arrivee/js/views/livraison.js`). On ajoute (1) un style « fantôme » partagé, (2) le surlignage des champs vides, (3) un retour visuel ✓ + toast Annuler, (4) l'Expéditeur éditable en Liste, (5) l'édition directe dans les Fiches, (6) une protection anti-écrasement pendant le rafraîchissement `onSnapshot`. Pas de nouvelle logique de sauvegarde : on réutilise l'existant.

**Tech Stack:** Vanilla JS ES modules (pas de build, pas de framework), Firebase Firestore (`onSnapshot`/`updateDoc`), CSS dans `css/style.css` + `css/responsive.css`. **Pas de suite de tests dans ce repo** → chaque tâche se vérifie **manuellement sur localhost** (Live Server :5502), puis commit.

**Fichiers concernés :**
- `arrivee/js/views/livraison.js` — rendu Liste (`renderTable`, ~ligne 2363 ; ligne de tableau ~2731-2761 ; helper `renderInput` ~2693), rendu Fiches (`renderCards` ~2775 ; panneau `lv-edit` ~2806 ; `lvToggleCardEdit` ~2896), fonctions de sauvegarde `updateDelivery*` (~4257-4435), `syncDestinataireToClients` (~4211), `detectCommune` (~5802), exposition window (~5835 et ~6052).
- `css/style.css` — styles « fantôme » (nouvelle section).

---

## Convention de vérification (ce repo n'a pas de tests)

Chaque tâche se termine par :
1. **Vérif localhost** : ouvrir `index.html` via Live Server, aller à **Arrivée → Livraison → En cours**, basculer Liste/Fiches, et observer le comportement décrit.
2. **Commit** une fois la vérif OK.

Remplace le cycle « write failing test / run pytest » : ici la « vérification » est visuelle/manuelle sur la vraie page.

---

## Task 1 : Style « fantôme » partagé (CSS)

Objectif : les champs éditables ressemblent à du texte au repos, se révèlent au survol, s'entourent de bleu en édition, et les vides ressortent en orange.

**Files:**
- Modify: `css/style.css` (ajouter une section en fin de fichier)

- [ ] **Step 1 : Ajouter la section CSS**

Ajouter à la fin de `css/style.css` :

```css
/* ─── Édition fantôme (inline) — page Livraison ─────────────────────────
   Un champ éditable ressemble à du texte ; il se révèle au survol, s'entoure
   de bleu en édition, et ressort en orange quand il est vide. */
.lv-ghost {
    border: 1px solid transparent;
    background: transparent;
    padding: 4px 6px;
    border-radius: 6px;
    font: inherit;
    color: #1e293b;
    width: 100%;
    box-sizing: border-box;
    transition: background .12s, border-color .12s;
    cursor: text;
}
.lv-ghost:hover { background: #f1f5f9; border-color: #e2e8f0; }
.lv-ghost:focus { outline: none; background: #eff6ff; border: 2px solid #3b82f6; padding: 3px 5px; }
/* Champ vide → « à compléter » (repère « ce qui manque ») */
.lv-ghost.lv-empty {
    background: #fffbeb;
    border: 1px dashed #f59e0b;
    color: #b45309;
}
.lv-ghost.lv-empty::placeholder { color: #b45309; opacity: 1; }
/* Petit ✓ d'enregistrement (ajouté à côté du champ) */
.lv-saved-tick {
    color: #16a34a; font-size: 11px; font-weight: 700; margin-left: 6px;
    opacity: 0; transition: opacity .15s;
}
.lv-saved-tick.show { opacity: 1; }
/* Toast Annuler */
.lv-undo-toast {
    position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
    background: #1e293b; color: #fff; padding: 9px 14px; border-radius: 10px;
    display: flex; align-items: center; gap: 12px; font-size: 13px;
    box-shadow: 0 10px 25px -8px rgba(0,0,0,.35); z-index: 12000;
}
.lv-undo-toast button {
    background: #f59e0b; color: #1e293b; border: 0; padding: 5px 12px;
    border-radius: 7px; font-weight: 700; cursor: pointer; font-family: inherit;
}
```

- [ ] **Step 2 : Vérif localhost** — (le style ne s'applique pas encore, aucune classe `lv-ghost` posée) : juste s'assurer que la page Livraison s'ouvre sans erreur console après l'ajout CSS.

- [ ] **Step 3 : Commit**

```bash
git add css/style.css
git commit -m "Livraison edition fantome: styles inline (ghost, vide, tick, undo)"
```

---

## Task 2 : Helper JS partagé — focus, ✓ et Annuler

Objectif : une brique réutilisable qui (a) mémorise l'ancienne valeur au focus, (b) affiche le ✓, (c) affiche le toast Annuler. Appelée par les champs et par les fonctions de sauvegarde.

**Files:**
- Modify: `arrivee/js/views/livraison.js` (ajouter les helpers près des autres helpers, ex. juste avant `detectCommune` ~ligne 5802 ; les exposer dans `Object.assign(window,…)` ~5835)

- [ ] **Step 1 : Ajouter les helpers**

```javascript
// ── Édition fantôme : focus, retour ✓, et Annuler ──────────────────────
// Au focus d'un champ ghost : mémorise la valeur d'origine (pour Annuler/Échap)
function lvGhostFocus(input) {
    input.dataset.lvOld = input.value;
}
// Échap : restaure la valeur d'origine sans enregistrer
function lvGhostKey(ev, input) {
    if (ev.key === 'Escape') { input.value = input.dataset.lvOld ?? input.value; input.blur(); }
}
// Met à jour la classe « vide » d'un champ
function lvGhostMarkEmpty(input) {
    const empty = String(input.value || '').trim() === '';
    input.classList.toggle('lv-empty', empty);
}
let _lvUndoTimer = null;
// Affiche un toast « Annuler » qui rappelle saveFn(oldValue) si cliqué
function lvUndo(label, oldValue, restoreFn) {
    const prev = document.querySelector('.lv-undo-toast');
    if (prev) prev.remove();
    if (_lvUndoTimer) clearTimeout(_lvUndoTimer);
    const el = document.createElement('div');
    el.className = 'lv-undo-toast';
    el.innerHTML = `<span>${label} modifié</span><button>↶ Annuler</button>`;
    el.querySelector('button').onclick = () => { restoreFn(oldValue); el.remove(); };
    document.body.appendChild(el);
    _lvUndoTimer = setTimeout(() => el.remove(), 5000);
}
// Affiche brièvement le ✓ à côté d'un champ (par id de colis + nom de champ)
function lvTick(id, field) {
    const tick = document.querySelector(`.lv-saved-tick[data-id="${id}"][data-field="${field}"]`);
    if (!tick) return;
    tick.classList.add('show');
    setTimeout(() => tick.classList.remove('show'), 1500);
}
```

- [ ] **Step 2 : Exposer aux `onclick`/`onfocus` inline**

Dans le premier `Object.assign(window, { … })` (~ligne 5835), ajouter :
```javascript
lvGhostFocus, lvGhostKey, lvGhostMarkEmpty, lvUndo, lvTick,
```

- [ ] **Step 3 : Vérif localhost** — recharger : aucune erreur console (`lvGhostFocus` etc. existent sur `window`). Taper dans la console : `typeof window.lvGhostFocus === 'function'` → `true`.

- [ ] **Step 4 : Commit**

```bash
git add arrivee/js/views/livraison.js
git commit -m "Livraison edition fantome: helpers focus/tick/undo"
```

---

## Task 3 : Appliquer le « fantôme » aux champs de la vue LISTE

Objectif : les `<input>` existants de la ligne (Qté, Lieu, Destinataire, Numéro, Description, Info) deviennent « fantômes » + marquage vide + focus mémorisé + ✓.

**Files:**
- Modify: `arrivee/js/views/livraison.js` — helper `renderInput` (~2693) et/ou les `<td>` de la ligne (~2737-2752)

- [ ] **Step 1 : Modifier le rendu des champs**

Pour CHAQUE input éditable de la ligne (Lieu, Destinataire, Numéro, Description, Info, Qté), ajouter : la classe `lv-ghost` (+ `lv-empty` si vide), `placeholder="à compléter"`, `onfocus="lvGhostFocus(this)"`, `onkeydown="lvGhostKey(event,this)"`, `oninput="lvGhostMarkEmpty(this)"`, et un `<span class="lv-saved-tick" data-id="${d.id}" data-field="…">✓ enregistré</span>` juste après l'input. Exemple pour le Lieu :

```html
<td>
  <input type="text" class="lv-ghost ${ (d.lieuLivraison||'').trim()===''?'lv-empty':'' }"
         value="${lvEsc(d.lieuLivraison||'')}" placeholder="à compléter"
         onfocus="lvGhostFocus(this)" onkeydown="lvGhostKey(event,this)" oninput="lvGhostMarkEmpty(this)"
         onchange="updateDeliveryLocation('${d.id}', this.value)">
  <span class="lv-saved-tick" data-id="${d.id}" data-field="lieu">✓</span>
</td>
```

Faire de même pour : Destinataire (`updateDeliveryRecipient`, field `dest`), Numéro (`updateDeliveryPhone`, field `num`), Description (`updateDeliveryDescription`, field `desc`), Info (`updateDeliveryInfo`, field `info`), Qté (`updateDeliveryQuantity`, field `qte`, garder `type="number"`). **NE PAS** toucher Montant ni Statut (hors scope).

- [ ] **Step 2 : Vérif localhost** — Liste : les champs ressemblent à du texte ; au survol fond gris ; au clic cadre bleu ; un champ vide est orange « à compléter ». Modifier un Lieu puis cliquer ailleurs → la valeur reste (déjà enregistrée par `onchange`).

- [ ] **Step 3 : Commit**

```bash
git add arrivee/js/views/livraison.js
git commit -m "Livraison: champs Liste en edition fantome + marquage vide"
```

---

## Task 4 : Rendre l'EXPÉDITEUR éditable en vue Liste

Objectif : aujourd'hui l'Expéditeur est du texte brut (`<td>${d.expediteur||''}</td>`) ; le rendre éditable comme les autres (fonction `updateDeliveryExpediteur` existe déjà).

**Files:**
- Modify: `arrivee/js/views/livraison.js` — `<td>` Expéditeur dans la ligne (~2737)

- [ ] **Step 1 : Remplacer le `<td>` Expéditeur**

```html
<td>
  <input type="text" class="lv-ghost ${ (d.expediteur||'').trim()===''?'lv-empty':'' }"
         value="${lvEsc(d.expediteur||'')}" placeholder="à compléter"
         onfocus="lvGhostFocus(this)" onkeydown="lvGhostKey(event,this)" oninput="lvGhostMarkEmpty(this)"
         onchange="updateDeliveryExpediteur('${d.id}', this.value)">
  <span class="lv-saved-tick" data-id="${d.id}" data-field="exp">✓</span>
</td>
```

- [ ] **Step 2 : Vérif localhost** — modifier l'Expéditeur d'un colis en Liste → enregistré (recharger pour confirmer la persistance).

- [ ] **Step 3 : Commit**

```bash
git add arrivee/js/views/livraison.js
git commit -m "Livraison: Expediteur editable en vue Liste"
```

---

## Task 5 : Retour ✓ + toast Annuler depuis les fonctions de sauvegarde

Objectif : après chaque enregistrement d'un champ, afficher le ✓ et proposer Annuler (restaure l'ancienne valeur). On capte l'ancienne valeur dans la fonction (elle lit déjà le colis courant `deliveries.find`).

**Files:**
- Modify: `arrivee/js/views/livraison.js` — fonctions `updateDeliveryLocation` (~4257), `updateDeliveryRecipient` (~4299), `updateDeliveryExpediteur` (~4312), `updateDeliveryPhone` (~4322), `updateDeliveryQuantity` (~4362), `updateDeliveryInfo` (~4405), `updateDeliveryDescription` (~4415)

- [ ] **Step 1 : Pattern à appliquer dans chaque fonction**

Au DÉBUT de la fonction, capter l'ancienne valeur du champ AVANT l'écriture ; à la FIN (après le `updateDoc`/batch réussi), appeler `lvTick` + `lvUndo`. Exemple pour `updateDeliveryLocation(id, newLocation)` :

```javascript
function updateDeliveryLocation(id, newLocation) {
    const d = deliveries.find(x => x.id === id);
    const oldVal = d ? (d.lieuLivraison || '') : '';
    // … (code existant : updateDoc { lieuLivraison, commune } + syncDestinataireToClients + propagation) …
    // À la fin, après la sauvegarde :
    lvTick(id, 'lieu');
    if (newLocation !== oldVal) lvUndo('Lieu', oldVal, (v) => updateDeliveryLocation(id, v));
}
```

Appliquer le même schéma (champ → label → field id) :
- `updateDeliveryRecipient` → `lvTick(id,'dest')` + `lvUndo('Destinataire', oldVal, v=>updateDeliveryRecipient(id,v))`
- `updateDeliveryExpediteur` → `lvTick(id,'exp')` + `lvUndo('Expéditeur', …)`
- `updateDeliveryPhone` → `lvTick(id,'num')` + `lvUndo('Numéro', …)`
- `updateDeliveryQuantity` → `lvTick(id,'qte')` + `lvUndo('Quantité', …)`
- `updateDeliveryInfo` → `lvTick(id,'info')` + `lvUndo('Info', …)`
- `updateDeliveryDescription` → `lvTick(id,'desc')` + `lvUndo('Description', …)`

NB : pour les fonctions `async` (phone, qty, description), appeler `lvTick`/`lvUndo` après le `await` de commit.

- [ ] **Step 2 : Vérif localhost** — modifier un Lieu → ✓ apparaît + toast « Lieu modifié / Annuler ». Cliquer Annuler → l'ancienne valeur revient. Le toast disparaît seul après 5 s.

- [ ] **Step 3 : Commit**

```bash
git add arrivee/js/views/livraison.js
git commit -m "Livraison: retour visuel ✓ + Annuler apres sauvegarde champ"
```

---

## Task 6 : Protéger l'édition pendant le rafraîchissement temps réel

Objectif : `renderTable()` fait `tbody.innerHTML = …` (~ligne 2769) à chaque `onSnapshot`. Si un champ a le focus, l'écrasement casse la saisie. On reporte le re-rendu tant qu'un champ ghost est en édition.

**Files:**
- Modify: `arrivee/js/views/livraison.js` — début de `renderTable` (~2363) et un blur global

- [ ] **Step 1 : Garde anti-écrasement dans `renderTable`**

Au tout début de `renderTable()` :

```javascript
// Édition fantôme : ne pas écraser un champ en cours de saisie.
const _ae = document.activeElement;
if (_ae && _ae.classList && _ae.classList.contains('lv-ghost')) {
    window._lvPendingRender = true;
    return;
}
```

- [ ] **Step 2 : Re-render différé au blur**

Là où les champs perdent le focus, déclencher le rendu en attente. Le plus simple : dans `renderTable` après avoir posé `tbody.innerHTML`, (ré)installer un listener unique, OU ajouter à chaque input `onblur="lvAfterBlur()"`. Ajouter le helper + l'exposer :

```javascript
function lvAfterBlur() {
    if (window._lvPendingRender) { window._lvPendingRender = false; filterDeliveries(); }
}
```
et ajouter `onblur="lvAfterBlur()"` aux inputs ghost (Tasks 3/4), et `lvAfterBlur` dans le `Object.assign(window,…)`.

- [ ] **Step 3 : Vérif localhost** — commencer à taper dans un champ ; pendant la frappe, si une mise à jour temps réel survient (ex. modifier le même colis depuis un autre onglet), le champ n'est PAS effacé ; en quittant, la liste se met à jour.

- [ ] **Step 4 : Commit**

```bash
git add arrivee/js/views/livraison.js
git commit -m "Livraison: ne pas ecraser un champ en cours d'edition (refresh temps reel)"
```

---

## Task 7 : Édition fantôme directe dans les FICHES (mobile)

Objectif : aujourd'hui la fiche montre du texte + un ✏️ qui révèle le panneau `lv-edit`. On rend les champs directement éditables dans la fiche (mêmes champs : Destinataire, Numéro, Lieu, Info, + Expéditeur, Description), avec le style fantôme et le marquage vide. On garde la même sauvegarde (`updateDelivery*`).

**Files:**
- Modify: `arrivee/js/views/livraison.js` — `renderCards` (~2775), template carte (~2876-2892), panneau `lv-edit` (~2806)

- [ ] **Step 1 : Rendre les champs de la carte éditables en place**

Dans le template carte, remplacer les affichages texte des champs éditables par des `input.lv-ghost` (mêmes attributs `onfocus/onkeydown/oninput/onchange/onblur` + tick que Task 3), empilés et libellés. Exemple pour le Lieu dans la carte :

```html
<div class="lv-c-field">
  <span class="lv-c-lbl">📍 Lieu</span>
  <input type="text" class="lv-ghost ${ (d.lieuLivraison||'').trim()===''?'lv-empty':'' }"
         value="${lvEsc(d.lieuLivraison||'')}" placeholder="à compléter"
         onfocus="lvGhostFocus(this)" onkeydown="lvGhostKey(event,this)" oninput="lvGhostMarkEmpty(this)"
         onblur="lvAfterBlur()" onchange="updateDeliveryLocation('${d.id}', this.value)">
</div>
```

Faire de même pour Destinataire, Numéro, Info, Expéditeur, Description. Le bouton ✏️ et le panneau `lv-edit` masqué deviennent inutiles → les retirer (ou laisser le ✏️ comme simple ancre si d'autres usages). `lvToggleCardEdit` (~2896) peut être supprimée si plus référencée (vérifier ses usages avant suppression).

- [ ] **Step 2 : CSS carte (champs empilés)**

Ajouter à `css/style.css` :
```css
.lv-c-field { display:flex; align-items:center; gap:8px; margin-top:4px; }
.lv-c-field .lv-c-lbl { font-size:11px; color:#64748b; min-width:78px; flex-shrink:0; }
.lv-c-field .lv-ghost { font-size:13px; }
```

- [ ] **Step 3 : Protéger aussi `renderCards`** — ajouter la même garde anti-écrasement qu'en Task 6 au début de `renderCards` (si `document.activeElement` est un `.lv-ghost` dans les cartes → `window._lvPendingRender=true; return;`).

- [ ] **Step 4 : Vérif localhost (mode Fiches)** — basculer en Fiches : chaque champ est éditable directement (sans ✏️) ; vide = orange ; modifier → enregistré + ✓/Annuler ; sur petit écran, champs assez grands au toucher.

- [ ] **Step 5 : Commit**

```bash
git add arrivee/js/views/livraison.js css/style.css
git commit -m "Livraison: edition fantome directe dans les Fiches (mobile)"
```

---

## Task 8 : Vérification d'ensemble + finitions

**Files:** aucun changement obligatoire ; corrections éventuelles dans `arrivee/js/views/livraison.js` / `css/style.css`.

- [ ] **Step 1 : Parcours complet localhost**
  - Liste (ordi) : éditer chaque champ (Qté, Expéditeur, Lieu, Destinataire, Numéro, Description, Info), vérifier ✓ + Annuler + persistance après rechargement.
  - Fiches (mobile, fenêtre étroite) : idem.
  - Vérifier que **Montant** et **Statut** gardent leurs actions dédiées (non éditables en fantôme).
  - Vérifier la **synchro Client** : modifier le tél/lieu d'un colis → la fiche Client correspondante est mise à jour (page Clients).
  - Vérifier la **détection commune** : saisir un lieu « Cocody … » → commune = COCODY.
  - Numéro : la mise en forme/normalisation du téléphone fonctionne toujours.

- [ ] **Step 2 : Vérifier qu'aucune fonction supprimée n'est encore référencée** (`lvToggleCardEdit` si retirée) — recherche dans le fichier.

- [ ] **Step 3 : Commit final si corrections**

```bash
git add -A
git commit -m "Livraison edition fantome: finitions + verifications"
```

---

## Auto-revue (couverture vs spec)

- Voir ce qui manque (vides surlignés) → Task 1 (`lv-empty`) + Tasks 3/4/7. ✓
- Tous les champs éditables (Qté, Expéditeur, Lieu, Destinataire, Numéro, Description, Info) → Tasks 3/4 (Liste) + Task 7 (Fiches). ✓
- Liste + Fiches → Tasks 3/4/6 (Liste) + Task 7 (Fiches). ✓
- Auto-save en quittant + Annuler → `onchange` existant + Task 5 (`lvUndo`) + Échap (Task 2). ✓
- Montant/Statut/Conteneur hors scope → non touchés (Tasks 3/7 le précisent). ✓
- Synchro Client + commune + normalisation tél → réutilise l'existant (`updateDelivery*` inchangées dans leur logique). ✓
- Anti-écrasement temps réel → Task 6 + Task 7 step 3. ✓
