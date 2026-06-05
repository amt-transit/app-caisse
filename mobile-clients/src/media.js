// Utilitaires média pour le chat : sélection d'image (compressée -> dataURL) et
// upload d'un fichier (audio) vers Firebase Storage (dossier client_chat/).
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { auth } from './firebase';

// Bucket Firebase Storage (cf. config). Upload via l'API REST -> pas besoin du
// module natif @react-native-firebase/storage (cassé sur ce build).
const STORAGE_BUCKET = 'caisse-amt-perso.firebasestorage.app';

// Identifiant unique sans dépendance externe (Date + aléatoire).
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// On ne demande PAS le base64 au picker (les photos d'appareil sont énormes) :
// on récupère l'URI, puis on REDIMENSIONNE + recompresse pour garantir un
// fichier léger (< limite Firestore de 1 Mo) quelle que soit la source.
const PICK_OPTS = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsEditing: false };

// Redimensionne à 1000px max de large + JPEG q0.55 -> dataURL (~100-200 Ko).
async function shrinkToDataUrl(uri) {
  if (!uri) return null;
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1000 } }],   // hauteur auto (ratio conservé)
    { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}
const firstUri = (res) => (res.canceled || !res.assets || !res.assets[0]) ? null : res.assets[0].uri;

// Choisir une image dans la GALERIE -> dataURL JPEG redimensionnée (ou null).
export async function pickChatImage() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Autorisation photos refusée.');
  return shrinkToDataUrl(firstUri(await ImagePicker.launchImageLibraryAsync(PICK_OPTS)));
}

// Prendre une PHOTO avec l'appareil -> dataURL JPEG redimensionnée (ou null).
export async function takeChatPhoto() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Autorisation appareil photo refusée.');
  return shrinkToDataUrl(firstUri(await ImagePicker.launchCameraAsync(PICK_OPTS)));
}

// Photo de PROFIL : avatar carré 400px (largement sous la limite 600 Ko serveur).
async function avatarFromUri(uri) {
  if (!uri) return null;
  const out = await ImageManipulator.manipulateAsync(
    uri, [{ resize: { width: 400 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}
export async function pickAvatarFromLibrary() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Autorisation photos refusée.');
  return avatarFromUri(firstUri(await ImagePicker.launchImageLibraryAsync({ ...PICK_OPTS, allowsEditing: true, aspect: [1, 1] })));
}
export async function takeAvatarPhoto() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Autorisation appareil photo refusée.');
  return avatarFromUri(firstUri(await ImagePicker.launchCameraAsync({ ...PICK_OPTS, allowsEditing: true, aspect: [1, 1] })));
}

// Upload un fichier local (audio) vers Storage et renvoie son URL publique.
// fileUri = URI local (ex. expo-av recording), contentType = 'audio/m4a'...
export async function uploadChatAudio(fileUri, contentType = 'audio/m4a') {
  const tail = (auth.currentUser?.phoneNumber || 'anon').replace(/\D/g, '').slice(-9) || 'anon';
  const ext = contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a' : 'audio';
  const path = `client_chat/${tail}/${uid()}.${ext}`;
  // Upload via l'API REST Firebase Storage (jeton d'identité en en-tête).
  // expo-file-system envoie les octets bruts du fichier local -> fiable en RN.
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const res = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status < 200 || res.status >= 300) throw new Error('Envoi du vocal impossible (' + res.status + ').');
  let meta = {};
  try { meta = JSON.parse(res.body || '{}'); } catch (_) {}
  const dlToken = meta.downloadTokens || '';
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media${dlToken ? '&token=' + dlToken : ''}`;
}
