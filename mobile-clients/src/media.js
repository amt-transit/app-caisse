// Utilitaires média pour le chat : sélection d'image (compressée -> dataURL) et
// upload d'un fichier (audio) vers Firebase Storage (dossier client_chat/).
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from './firebase';

// Identifiant unique sans dépendance externe (Date + aléatoire).
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const PICK_OPTS = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, base64: true, allowsEditing: false };
const toDataUrl = (res) => {
  if (res.canceled || !res.assets || !res.assets[0] || !res.assets[0].base64) return null;
  return `data:image/jpeg;base64,${res.assets[0].base64}`;
};

// Choisir une image dans la GALERIE -> dataURL JPEG compressée (ou null).
export async function pickChatImage() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Autorisation photos refusée.');
  return toDataUrl(await ImagePicker.launchImageLibraryAsync(PICK_OPTS));
}

// Prendre une PHOTO avec l'appareil -> dataURL JPEG compressée (ou null).
export async function takeChatPhoto() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Autorisation appareil photo refusée.');
  return toDataUrl(await ImagePicker.launchCameraAsync(PICK_OPTS));
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
