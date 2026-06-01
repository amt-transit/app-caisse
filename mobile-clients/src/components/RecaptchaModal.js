// reCAPTCHA Firebase « maison » via WebView (remplace expo-firebase-recaptcha,
// abandonnée). Affiche une page qui charge le widget reCAPTCHA officiel de
// Firebase ; quand l'utilisateur le résout, on renvoie le TOKEN à React Native.
//
// Usage :
//   const recaptchaRef = useRef();
//   <RecaptchaModal ref={recaptchaRef} />
//   // puis comme ApplicationVerifier :
//   const verifier = recaptchaRef.current.makeVerifier();
//   await new PhoneAuthProvider(auth).verifyPhoneNumber(e164, verifier);
//
// makeVerifier() renvoie un objet { type:'recaptcha', verify() } : verify()
// ouvre la modale, attend le token, et le résout. C'est exactement l'interface
// `ApplicationVerifier` attendue par Firebase JS SDK.
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Modal, View, ActivityIndicator, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { firebaseConfig } from '../firebase';
import { colors } from '../theme';

// Page HTML servie dans la WebView : charge le SDK Firebase (compat) + le
// reCAPTCHA « normal » (case à cocher). Le token est renvoyé via postMessage.
function buildHtml(cfg) {
  const c = JSON.stringify(cfg);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    html,body{margin:0;height:100%;font-family:-apple-system,system-ui,sans-serif;background:#fff;}
    .wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:18px;box-sizing:border-box;}
    .title{font-size:15px;color:#1A3553;font-weight:700;margin-bottom:16px;text-align:center;}
    #c{transform:scale(1);}
  </style>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  </head><body>
  <div class="wrap">
    <div class="title">Confirmez que vous n'êtes pas un robot</div>
    <div id="c"></div>
  </div>
  <script>
    function send(msg){ try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch(e){} }
    try {
      firebase.initializeApp(${c});
      var verifier = new firebase.auth.RecaptchaVerifier('c', {
        size: 'normal',
        callback: function(token){ send({ type:'token', token: token }); },
        'expired-callback': function(){ send({ type:'expired' }); }
      });
      verifier.render().then(function(){ send({ type:'ready' }); })
        .catch(function(e){ send({ type:'error', message: String(e && e.message || e) }); });
    } catch(e){ send({ type:'error', message: String(e && e.message || e) }); }
  </script>
  </body></html>`;
}

const RecaptchaModal = forwardRef(function RecaptchaModal(_props, ref) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const resolverRef = useRef(null);   // resolve du verify() en cours
  const rejecterRef = useRef(null);

  // Ouvre la modale et attend le token reCAPTCHA.
  const verify = () => new Promise((resolve, reject) => {
    resolverRef.current = resolve;
    rejecterRef.current = reject;
    setLoading(true);
    setVisible(true);
  });

  // Objet conforme à l'interface ApplicationVerifier de Firebase. Le SDK
  // appelle aussi des méthodes internes (_reset, clear, render) sur le
  // vérificateur : on les fournit (no-op / promesse) sinon il plante avec
  // « verifier._reset is not a function ».
  const makeVerifier = () => ({
    type: 'recaptcha',
    verify,
    render: () => Promise.resolve('amtc-recaptcha'), // widgetId factice
    _reset: () => {},
    clear: () => {},
    reset: () => {},
    _isInvisible: false,
  });

  useImperativeHandle(ref, () => ({ makeVerifier, verify }));

  const onMessage = (event) => {
    let msg = {};
    try { msg = JSON.parse(event.nativeEvent.data); } catch (e) { return; }
    if (msg.type === 'ready') { setLoading(false); return; }
    if (msg.type === 'token') {
      setVisible(false);
      const r = resolverRef.current; resolverRef.current = null;
      if (r) r(msg.token);
      return;
    }
    if (msg.type === 'error' || msg.type === 'expired') {
      setVisible(false);
      const rj = rejecterRef.current; rejecterRef.current = null;
      if (rj) rj(new Error(msg.message || 'reCAPTCHA expiré, réessayez.'));
    }
  };

  const cancel = () => {
    setVisible(false);
    const rj = rejecterRef.current; rejecterRef.current = null;
    if (rj) rj(new Error('Vérification annulée.'));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={s.backdrop}>
        <View style={s.box}>
          <WebView
            originWhitelist={['*']}
            source={{ html: buildHtml(firebaseConfig), baseUrl: `https://${firebaseConfig.authDomain}` }}
            onMessage={onMessage}
            javaScriptEnabled
            style={{ flex: 1, backgroundColor: 'transparent' }}
          />
          {loading && (
            <View style={s.loader}><ActivityIndicator color={colors.blue} size="large" /></View>
          )}
          <TouchableOpacity style={s.cancel} onPress={cancel}><Text style={s.cancelTxt}>Annuler</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

export default RecaptchaModal;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 18 },
  box: { backgroundColor: '#fff', borderRadius: 18, height: 360, overflow: 'hidden' },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  cancel: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line },
  cancelTxt: { color: colors.muted, fontWeight: '700' },
});
