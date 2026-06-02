// Cache persistant simple (AsyncStorage) pour un affichage INSTANTANÉ.
// Principe « stale-while-revalidate » : on lit immédiatement la dernière valeur
// connue (pas d'écran blanc), puis on rafraîchit en arrière-plan et on met à
// jour le cache. Les clés sont préfixées par le numéro du client (cloisonnement).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const PREFIX = 'amtc_cache:';
function keyFor(name) {
  const tail = (auth.currentUser?.phoneNumber || 'anon').replace(/\D/g, '').slice(-9) || 'anon';
  return `${PREFIX}${tail}:${name}`;
}

// Lit une valeur en cache (ou null). Jamais d'exception remontée.
export async function getCache(name) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(name));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// Écrit une valeur en cache (best-effort).
export async function setCache(name, value) {
  try { await AsyncStorage.setItem(keyFor(name), JSON.stringify(value)); } catch (e) {}
}

// Efface tout le cache du client courant (à la déconnexion).
export async function clearCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch (e) {}
}
