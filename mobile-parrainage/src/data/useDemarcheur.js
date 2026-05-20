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
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  doc, getDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../firebase';

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
};

export function useDemarcheur() {
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async (isRefresh) => {
    setState((s) => ({
      ...s, error: '',
      loading: isRefresh ? s.loading : true,
      refreshing: !!isRefresh,
    }));
    try {
      const tok = await auth.currentUser.getIdTokenResult(true);
      const demId = tok.claims && tok.claims.demarcheurId;
      const role = tok.claims && tok.claims.role;
      // agency posé au provisioning (functions/index.js / provisionDemarcheurAuth).
      // Sert à interroger les collections suffixées (demarcheurs_<route>, etc.).
      const agency = (tok.claims && tok.claims.agency) || 'chine';

      if (role !== 'demarcheur' || !demId) {
        setState((s) => ({
          ...s, loading: false, refreshing: false,
          error: "Ce compte n'est pas un compte partenaire. Contactez votre agence.",
        }));
        return;
      }

      // Recalcule côté serveur le solde disponible (factures payées, au
      // prorata) vs potentiel, AVANT de relire les données. Non bloquant :
      // si la fonction n'est pas joignable, on affiche l'existant.
      try {
        await httpsCallable(functions, 'reconcilePartnerBalances')();
      } catch (e) { /* non bloquant : affichage des données existantes */ }

      const meSnap = await getDoc(doc(db, collName('demarcheurs', agency), demId));
      const me = meSnap.exists() ? { id: meSnap.id, ...meSnap.data() } : null;

      const [cSnap, fSnap, aSnap, tSnap, lSnap] = await Promise.all([
        getDocs(query(collection(db, collName('commissions', agency)), where('demarcheurId', '==', demId))),
        getDocs(query(collection(db, collName('demarcheurs', agency)), where('parrainId', '==', demId))),
        getDocs(query(collection(db, collName('client_affiliations', agency)), where('demarcheurId', '==', demId))),
        // Factures + livraisons dont le démarcheur est le parrain direct
        // (uniquement, pas celles de ses filleuls : règle métier exigée).
        getDocs(query(collection(db, collName('transactions', agency)), where('demarcheurId', '==', demId))),
        getDocs(query(collection(db, collName('livraisons', agency)), where('demarcheurId', '==', demId))),
      ]);

      // Livraisons archivées (colis déjà livrés). Tolérant : si la collection
      // ou les règles ne sont pas dispo, on continue avec une liste vide.
      let livArch = [];
      try {
        const aaSnap = await getDocs(query(
          collection(db, collName('livraisons_archives', agency)),
          where('demarcheurId', '==', demId)));
        livArch = aaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (_) { livArch = []; }

      // Tolérant : si les règles retrait_demandes ne sont pas encore
      // déployées (ou collection vide), on n'échoue PAS tout l'écran.
      let demandes = [];
      try {
        const dSnap = await getDocs(
          query(collection(db, collName('retrait_demandes', agency)), where('demarcheurId', '==', demId)));
        demandes = sortByDateDesc(
          dSnap.docs.map((d) => ({ id: d.id, ...d.data() })), 'dateDemande');
      } catch (_) { demandes = []; }

      const commissions = sortByDateDesc(
        cSnap.docs.map((d) => ({ id: d.id, ...d.data() })), 'dateCreation');

      setState({
        loading: false, refreshing: false, error: '',
        me,
        commissions,
        clients: aSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        filleuls: fSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        demandes,
        rawFactures: tSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        rawLivraisons: [
          ...lSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...livArch,
        ],
      });
    } catch (e) {
      setState((s) => ({
        ...s, loading: false, refreshing: false,
        error: "Impossible de charger vos données. Vérifiez votre connexion et réessayez.",
      }));
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

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
  };
}
