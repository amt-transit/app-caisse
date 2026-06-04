// Police de marque AMT — Comfortaa partout (choix validé : look "app" doux et
// cohérent). On charge plusieurs graisses au démarrage (useFonts) PUIS on
// applique automatiquement la bonne variante à CHAQUE <Text>/<TextInput> selon
// sa graisse, sans toucher chaque écran. Base = Comfortaa Medium (500) pour la
// lisibilité du texte courant (comme sur le site, qui n'utilise jamais < 500).
import { Text, TextInput, StyleSheet } from 'react-native';
import { Comfortaa_500Medium, Comfortaa_600SemiBold, Comfortaa_700Bold } from '@expo-google-fonts/comfortaa';

// Map passée à useFonts() dans App.js.
export const APP_FONTS = {
  Comfortaa_500Medium,
  Comfortaa_600SemiBold,
  Comfortaa_700Bold,
};

// Choisit la variante Comfortaa selon la graisse demandée :
//  - gras (700/800/900/bold)  -> Comfortaa Bold   (titres, emphase, montants)
//  - 600                       -> Comfortaa SemiBold
//  - reste (normal/400/500)    -> Comfortaa Medium (texte courant, lisible)
function pickFamily(style) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return null; // une police explicite est déjà posée : on respecte
  const w = String(flat.fontWeight || '');
  if (w === '700' || w === '800' || w === '900' || w === 'bold') return 'Comfortaa_700Bold';
  if (w === '600') return 'Comfortaa_600SemiBold';
  return 'Comfortaa_500Medium';
}

// Applique la police par défaut en INJECTANT le style dans les props AVANT le
// rendu (args[0] = props). On lit d'abord la graisse pour choisir le bon fichier
// Comfortaa, PUIS on pose `{ fontFamily, fontWeight:'normal' }` EN DERNIER.
// Pourquoi fontWeight:'normal' ? La graisse est déjà "dans" le fichier (ex.
// Comfortaa_700Bold EST gras). Sur Android, garder un fontWeight numérique en
// plus d'une police perso fait échouer le rendu et retomber sur la police
// système (bug qui ne touchait QUE les textes en gras). Le reste du style de
// l'écran (couleur, taille, interligne…) est conservé.
function patchDefaultFont(Component) {
  if (!Component || Component.__amtFontPatched) return;
  const origRender = Component.render;
  if (typeof origRender !== 'function') return;
  Component.render = function (...args) {
    const props = args[0];
    if (props) {
      const fam = pickFamily(props.style);
      if (fam) args[0] = { ...props, style: [props.style, { fontFamily: fam, fontWeight: 'normal' }] };
    }
    return origRender.apply(this, args);
  };
  Component.__amtFontPatched = true;
}

patchDefaultFont(Text);
patchDefaultFont(TextInput);
