// Charge UNE fois toutes les données du partenaire connecté et les
// partage entre les onglets (Clients, Tableau de bord, Wallet, Filleuls,
// Profil). Expose reload() et refresh() (pull-to-refresh).
import { useCallback, useEffect, useState } from 'react';
import {
  doc, getDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db, auth } from '../firebase';

const sortByDateDesc = (arr, field) =>
  arr.sort((a, b) => {
    const da = a[field] && a[field].toDate ? a[field].toDate() : new Date(a[field] || 0);
    const dbb = b[field] && b[field].toDate ? b[field].toDate() : new Date(b[field] || 0);
    return dbb - da;
  });

const EMPTY = {
  loading: true, refreshing: false, error: '',
  me: null, commissions: [], clients: [], filleuls: [], demandes: [],
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

      if (role !== 'demarcheur' || !demId) {
        setState((s) => ({
          ...s, loading: false, refreshing: false,
          error: "Ce compte n'est pas un compte partenaire. Contactez votre agence.",
        }));
        return;
      }

      const meSnap = await getDoc(doc(db, 'demarcheurs', demId));
      const me = meSnap.exists() ? { id: meSnap.id, ...meSnap.data() } : null;

      const [cSnap, fSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, 'commissions'), where('demarcheurId', '==', demId))),
        getDocs(query(collection(db, 'demarcheurs'), where('parrainId', '==', demId))),
        getDocs(query(collection(db, 'client_affiliations'), where('demarcheurId', '==', demId))),
      ]);

      // Tolérant : si les règles retrait_demandes ne sont pas encore
      // déployées (ou collection vide), on n'échoue PAS tout l'écran.
      let demandes = [];
      try {
        const dSnap = await getDocs(
          query(collection(db, 'retrait_demandes'), where('demarcheurId', '==', demId)));
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
      });
    } catch (e) {
      setState((s) => ({
        ...s, loading: false, refreshing: false,
        error: "Impossible de charger vos données. Vérifiez votre connexion et réessayez.",
      }));
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  return {
    ...state,
    reload: () => load(false),
    refresh: () => load(true),
  };
}
