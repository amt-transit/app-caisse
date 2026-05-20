// Charge UNE fois toutes les données du partenaire connecté et les
// partage entre les onglets (Clients, Tableau de bord, Wallet, Filleuls,
// Profil). Expose reload() et refresh() (pull-to-refresh).
//
// En plus des données brutes, on calcule :
//  - clients ENRICHIS : chaque client affilié reçoit ses envois (commissions
//    directes), son total facturé et le total de VOS commissions sur lui ;
//  - filleuls ENRICHIS : chaque filleul reçoit les envois qui vous ont
//    rapporté un bonus + le total de ce bonus.
//  Objectif : zéro quiproquo — le partenaire voit qui, quoi, combien.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  doc, collection, query, where, onSnapshot, getDocs,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth, functions } from '../firebase';
import { registerPushToken } from '../notifications';

// Clé AsyncStorage : sauvegarde le lien (route + id) choisi par l'utilisateur
// lorsqu'il a accès à plusieurs routes. Permet de retomber sur la bonne route
// au prochain lancement de l'app, sans devoir choisir à chaque fois.
const ACTIVE_LINK_KEY = 'amt_active_link_v1';

async function readSavedLink() {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_LINK_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && obj.agency && obj.demarcheurId) return obj;
  } catch (_) { /* corrompu : on l'ignore */ }
  return null;
}
async function writeSavedLink(link) {
  try {
    await AsyncStorage.setItem(ACTIVE_LINK_KEY, JSON.stringify(link));
  } catch (_) { /* quota / non critique */ }
}

// Même normalisation que côté web (affiliations.js) pour que les téléphones
// des commissions et des affiliations se correspondent exactement.
function normalizePhone(raw) {
  if (raw == null) return '';
  let s = String(raw).trim().replace(/\D/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.length > 10 && s.startsWith('225')) s = s.slice(3);
  if (s.length < 8) return '';
  return s;
}

// Réplique getCollectionName (agencies-config.js) pour le mobile : les
// collections du Parrainage sont isolées par route SaaS depuis mai 2026.
// L'agence du démarcheur est lue dans son custom claim (posé par
// provisionDemarcheurAuth). Fallback 'chine' pour les anciens comptes
// (seule route ayant historiquement des partenaires).
function collName(base, agency) {
  const a = String(agency || 'chine').trim();
  if (!a || a === 'paris' || a === 'abidjan' || a === 'all') return base;
  if (a.includes('_')) return `${base}_${a.split('_')[1]}`;
  return `${base}_${a}`;
}

const sortByDateDesc = (arr, field) =>
  arr.sort((a, b) => {
    const da = a[field] && a[field].toDate ? a[field].toDate() : new Date(a[field] || 0);
    const dbb = b[field] && b[field].toDate ? b[field].toDate() : new Date(b[field] || 0);
    return dbb - da;
  });

const EMPTY = {
  loading: true, refreshing: false, error: '',
  me: null, commissions: [], clients: [], filleuls: [], demandes: [],
  rawFactures: [], rawLivraisons: [],
  // Multi-route :
  links: [],         // [{agency, demarcheurId}, ...]
  activeLink: null,  // {agency, demarcheurId} actuellement utilisé
};

export function useDemarcheur() {
  const [state, setState] = useState(EMPTY);
  // Liste des unsubscribes Firestore actifs. On les coupe à chaque reload
  // (changement de route) et à l'unmount du hook pour éviter les fuites.
  const unsubsRef = useRef([]);
  const cleanup = () => {
    unsubsRef.current.forEach((u) => { try { u(); } catch (_) { /* déjà fermé */ } });
    unsubsRef.current = [];
  };

  const load = useCallback(async (isRefresh, overrideLink) => {
    cleanup(); // tue tous les listeners de la session précédente

    setState((s) => ({
      ...s, error: '',
      loading: isRefresh ? s.loading : true,
      refreshing: !!isRefresh,
    }));
    try {
      const tok = await auth.currentUser.getIdTokenResult(true);
      const role = tok.claims && tok.claims.role;

      // ── Calcul des LIENS disponibles pour ce compte ─────────────────
      let availableLinks = Array.isArray(tok.claims && tok.claims.links)
        ? tok.claims.links.filter((l) => l && l.agency && l.demarcheurId)
        : [];
      if (availableLinks.length === 0 && tok.claims && tok.claims.demarcheurId) {
        availableLinks = [{
          agency: tok.claims.agency || 'chine',
          demarcheurId: tok.claims.demarcheurId,
        }];
      }

      if (role !== 'demarcheur' || availableLinks.length === 0) {
        setState((s) => ({
          ...s, loading: false, refreshing: false,
          error: "Ce compte n'est pas un compte partenaire. Contactez votre agence.",
        }));
        return;
      }

      // ── Détermination du lien ACTIF ─────────────────────────────────
      let chosen = overrideLink;
      if (!chosen) {
        const saved = await readSavedLink();
        if (saved) chosen = availableLinks.find(
          (l) => l.agency === saved.agency && l.demarcheurId === saved.demarcheurId,
        );
      }
      if (!chosen) chosen = availableLinks[0];
      await writeSavedLink(chosen);

      const agency = chosen.agency;
      const demId = chosen.demarcheurId;

      // Recalcule côté serveur le solde disponible. Non bloquant : si la
      // fonction n'est pas joignable, le onSnapshot affichera l'existant.
      try { await httpsCallable(functions, 'reconcilePartnerBalances')(); }
      catch (e) { /* non bloquant */ }

      // Enregistre / rafraîchit le token push (non bloquant).
      registerPushToken({ demarcheurId: demId, agency }).catch(() => null);

      // ══════════════════════════════════════════════════════════════
      //  LISTENERS LIVE — chaque collection est suivie via onSnapshot.
      //  Toute création / modification côté serveur (= côté staff sur le
      //  web) est répercutée AUTOMATIQUEMENT dans l'app sans pull-to-refresh.
      //  Le 1er snapshot de `me` clôt l'état `loading` (l'écran principal
      //  s'affiche), les autres listeners alimentent les onglets au fur
      //  et à mesure.
      // ══════════════════════════════════════════════════════════════

      // Reset partiel du state pour ne pas afficher d'anciennes données
      // pendant le changement de route.
      setState((s) => ({
        ...s,
        commissions: [], clients: [], filleuls: [], demandes: [],
        rawFactures: [], rawLivraisons: [],
        links: availableLinks,
        activeLink: chosen,
      }));

      const onErr = (label) => (err) => {
        // En cas de perte des droits / collection absente : non bloquant.
        // On garde l'app fonctionnelle même si UNE collection échoue.
        console.warn('[useDemarcheur] listener', label, ':', err && err.message);
      };

      // 1) Fiche démarcheur (me) — c'est ce listener qui clôt le loading.
      unsubsRef.current.push(onSnapshot(
        doc(db, collName('demarcheurs', agency), demId),
        (snap) => {
          setState((s) => ({
            ...s,
            me: snap.exists() ? { id: snap.id, ...snap.data() } : null,
            loading: false, refreshing: false,
          }));
        },
        (err) => {
          setState((s) => ({
            ...s, loading: false, refreshing: false,
            error: "Impossible de charger votre profil.",
          }));
          onErr('me')(err);
        },
      ));

      // 2) Commissions (directes + bonus parrainage)
      unsubsRef.current.push(onSnapshot(
        query(collection(db, collName('commissions', agency)), where('demarcheurId', '==', demId)),
        (snap) => {
          const arr = sortByDateDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })), 'dateCreation');
          setState((s) => ({ ...s, commissions: arr }));
        },
        onErr('commissions'),
      ));

      // 3) Filleuls (démarcheurs ayant parrainId == moi)
      unsubsRef.current.push(onSnapshot(
        query(collection(db, collName('demarcheurs', agency)), where('parrainId', '==', demId)),
        (snap) => setState((s) => ({ ...s, filleuls: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })),
        onErr('filleuls'),
      ));

      // 4) Clients affiliés
      unsubsRef.current.push(onSnapshot(
        query(collection(db, collName('client_affiliations', agency)), where('demarcheurId', '==', demId)),
        (snap) => setState((s) => ({ ...s, clients: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })),
        onErr('clients'),
      ));

      // 5) Factures (transactions où je suis le parrain rattaché)
      unsubsRef.current.push(onSnapshot(
        query(collection(db, collName('transactions', agency)), where('demarcheurId', '==', demId)),
        (snap) => setState((s) => ({ ...s, rawFactures: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })),
        onErr('factures'),
      ));

      // 6) Livraisons actives — pas d'archives en live (lourd, peu utile).
      // Les archives sont lues UNE fois en plus pour compléter le tracking.
      unsubsRef.current.push(onSnapshot(
        query(collection(db, collName('livraisons', agency)), where('demarcheurId', '==', demId)),
        async (snap) => {
          const liv = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          // Archives : lecture ponctuelle après chaque update livraisons.
          let livArch = [];
          try {
            const aaSnap = await getDocs(query(
              collection(db, collName('livraisons_archives', agency)),
              where('demarcheurId', '==', demId)));
            livArch = aaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch (_) { livArch = []; }
          setState((s) => ({ ...s, rawLivraisons: [...liv, ...livArch] }));
        },
        onErr('livraisons'),
      ));

      // 7) Demandes de retrait (créées depuis l'app)
      unsubsRef.current.push(onSnapshot(
        query(collection(db, collName('retrait_demandes', agency)), where('demarcheurId', '==', demId)),
        (snap) => {
          const arr = sortByDateDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })), 'dateDemande');
          setState((s) => ({ ...s, demandes: arr }));
        },
        onErr('demandes'),
      ));

    } catch (e) {
      setState((s) => ({
        ...s, loading: false, refreshing: false,
        error: "Impossible de charger vos données. Vérifiez votre connexion et réessayez.",
      }));
    }
  }, []);

  useEffect(() => { load(false); }, [load]);
  // Cleanup à l'unmount : on coupe tous les listeners restants.
  useEffect(() => () => cleanup(), []);

  // ── Données enrichies (dérivées, recalculées si les données changent) ──
  const { clients, filleuls, unmatched } = useMemo(() => {
    const sum = (arr, f) => arr.reduce((t, x) => t + (Number(x[f]) || 0), 0);

    // Index des commissions : par téléphone client (ventes directes) et par
    // filleul (bonus de parrainage).
    const byPhone = {};
    const byFilleul = {};
    const matchedIds = new Set();
    state.commissions.forEach((c) => {
      if (c.type === 'parrainage' && c.filleulId) {
        (byFilleul[c.filleulId] = byFilleul[c.filleulId] || []).push(c);
        matchedIds.add(c.id);
      }
      const ph = normalizePhone(c.clientPhone);
      if (ph) {
        (byPhone[ph] = byPhone[ph] || []).push(c);
        matchedIds.add(c.id);
      }
    });

    const clientsEnriched = state.clients.map((cl) => {
      const ph = normalizePhone(cl.phone || cl.id);
      const envois = sortByDateDesc(byPhone[ph] ? [...byPhone[ph]] : [], 'dateCreation');
      return {
        ...cl,
        envois,
        nbEnvois: envois.length,
        totalFacture: sum(envois, 'montantBrut'),
        totalCommission: sum(envois, 'montantNet'),
        totalDisponible: sum(envois, 'montantDisponible'),
        totalPotentiel: sum(envois, 'montantPotentiel'),
      };
    });

    const filleulsEnriched = state.filleuls.map((f) => {
      const envois = sortByDateDesc(byFilleul[f.id] ? [...byFilleul[f.id]] : [], 'dateCreation');
      return {
        ...f,
        envois,
        nbEnvois: envois.length,
        totalBonus: sum(envois, 'montantNet'),
        totalBonusDisponible: sum(envois, 'montantDisponible'),
        totalBonusPotentiel: sum(envois, 'montantPotentiel'),
      };
    });

    // Commissions anciennes (créées avant l'ajout des infos client) qu'on ne
    // peut rattacher à aucun client/filleul : on les signale pour rester
    // 100 % transparent.
    const unmatchedComm = state.commissions.filter((c) => !matchedIds.has(c.id));

    return {
      clients: clientsEnriched,
      filleuls: filleulsEnriched,
      unmatched: unmatchedComm,
    };
  }, [state.commissions, state.clients, state.filleuls]);

  // ── Factures enrichies (chaque facture + ses livraisons + sa commission) ──
  const factures = useMemo(() => {
    const byRef = {};
    (state.rawLivraisons || []).forEach((l) => {
      if (!l.ref) return;
      (byRef[l.ref] = byRef[l.ref] || []).push(l);
    });
    const commByRef = {};
    (state.commissions || []).forEach((c) => {
      if (c.type === 'direct' && c.expeditionId) {
        commByRef[c.expeditionId] = c;
      }
    });
    const arr = (state.rawFactures || []).map((f) => {
      const ref = f.reference;
      const livraisons = (byRef[ref] || []).slice();
      const commission = commByRef[ref] || null;
      const totalPrix = Number(f.prix) || 0;
      const paye = (Number(f.montantParis) || 0) + (Number(f.montantAbidjan) || 0);
      const reste = Math.max(0, totalPrix - paye);
      // Statut paiement
      let statutPay = 'impayee';
      if (paye >= totalPrix && totalPrix > 0) statutPay = 'payee';
      else if (paye > 0) statutPay = 'acompte';
      // Statut colis le plus avancé (parmi les sous-colis livraisons)
      // Ordre logique : EN_ATTENTE < PARIS < TRANSIT < ABIDJAN < LIVRE
      const order = { EN_ATTENTE: 0, PARIS: 1, A_VENIR: 2, EN_COURS: 3, LIVRE: 4 };
      let topStatus = null;
      livraisons.forEach((l) => {
        const s = l.status === 'LIVRE' ? 'LIVRE' : (l.containerStatus || 'EN_ATTENTE');
        if (topStatus === null || (order[s] || 0) > (order[topStatus] || 0)) topStatus = s;
      });
      return {
        ...f,
        livraisons,
        commission,
        paye,
        reste,
        statutPay,
        statutColis: topStatus || 'EN_ATTENTE',
      };
    });
    return sortByDateDesc(arr, 'date');
  }, [state.rawFactures, state.rawLivraisons, state.commissions]);

  return {
    ...state,
    clients,
    filleuls,
    unmatched,
    factures,
    reload: () => load(false),
    refresh: () => load(true),
    // Change la route active (= reload des données avec un autre demarcheurId).
    // Le choix est persisté côté AsyncStorage pour le prochain lancement.
    switchRoute: (link) => load(false, link),
  };
}
