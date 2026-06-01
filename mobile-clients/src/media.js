// Utilitaires média pour le chat : sélection d'image (compressée -> dataURL) et
// upload d'un fichier (audio) vers Firebase Storage (dossier client_chat/).
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from './firebase';

// Identifiant unique sans dépendance externe (Date + aléatoire).
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Ouvre la galerie, renvoie une dataURL JPEG compressée (ou null si annulé).
// L'image part en base64 dans le message (comme la PWA), pas dans Storage.
export async function pickChatImage() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Autorisation photos refusée.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    base64: true,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets || !res.assets[0]) return null;
  const a = res.assets[0];
  if (!a.base64) return null;
  return `data:image/jpeg;base64,${a.base64}`;
}

// Upload un fichier local (audio) vers Storage et renvoie son URL publique.
// fileUri = URI local (ex. expo-av recording), contentType = 'audio/m4a'...
export async function uploadChatAudio(fileUri, contentType = 'audio/m4a') {
  const tail = (auth.currentUser?.phoneNumber || 'anon').replace(/\D/g, '').slice(-9) || 'anon';
  const ext = contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a' : 'audio';
  const path = `client_chat/${tail}/${uid()}.${ext}`;
  const resp = await fetch(fileUri);
  const blob = await resp.blob();
  const r = storageRef(storage, path);
  await uploadBytes(r, blob, { contentType });
  return await getDownloadURL(r);
}
