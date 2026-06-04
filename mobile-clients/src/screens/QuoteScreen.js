// Onglet DEVIS : simulateur. Tarifs = facture (computeQuote côté serveur).
// Le client choisit route + mode + produits du catalogue (prix/CBM connus) ;
// en aérien, saisit poids + dimensions. Résultat en €/FCFA.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Card, SectionTitle, Btn, Loading, Empty } from '../components/ui';
import { colors, fcfa } from '../theme';
import { api } from '../api';
import { useLang, tr } from '../i18n';

const eur = (v) => `${(Number(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

export default function QuoteScreen({ agencies = [] }) {
  const { t } = useLang();
  const [routes, setRoutes] = useState(null);
  const [routeId, setRouteId] = useState('');
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [expanded, setExpanded] = useState(null); // id du devis enregistré déplié
  const [mode, setMode] = useState('maritime');
  const [aerienType, setAerienType] = useState('normal');
  const [items, setItems] = useState([blankItem()]);
  const [result, setResult] = useState(null);
  const [calc, setCalc] = useState(false);
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  function blankItem() { return { desc: '', qty: '1', poids: '', lng: '', lrg: '', haut: '', parfum: false }; }

  const loadSaved = async () => { try { const r = await api.getMyQuotes(); setSaved(r.quotes || []); } catch (e) {} };

  useEffect(() => {
    (async () => {
      try {
        const r = await api.getQuoteConfig();
        const rts = r.routes || [];
        setRoutes(rts);
        // Pré-sélection : la route où le client EXPÉDIE (depuis son compte).
        const dep = agencies.filter(a => a.role === 'exp' || a.role === 'both').map(a => a.agency);
        const pref = rts.find(x => dep.includes(x.id)) || rts[0];
        if (pref) setRouteId(pref.id);
      } catch (e) { setRoutes([]); }
    })();
    loadSaved();
  }, []);

  // Enregistre le devis affiché (avec le nom de la route pour s'y retrouver).
  const saveQuote = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const rt = routes.find(r => r.id === routeId);
      await api.saveMyQuote({
        route: routeId, mode, aerienType, items,
        currency: result.currency, totalEur: result.totalEur, totalCfa: result.totalCfa, lines: result.lines,
        label: `${rt ? rt.name : routeId} · ${mode === 'aerien' ? 'Aérien' : 'Maritime'}`,
      });
      await loadSaved();
      setSavedOpen(true);
      Alert.alert(tr('Devis'), tr('Devis enregistré ✅. Retrouvez-le dans « Mes devis enregistrés ».'));
    } catch (e) { Alert.alert(tr('Devis'), tr("Enregistrement impossible.")); }
    finally { setSaving(false); }
  };
  const delQuote = (id) => {
    Alert.alert(tr('Supprimer ce devis ?'), null, [
      { text: tr('Annuler'), style: 'cancel' },
      { text: tr('Supprimer'), style: 'destructive', onPress: async () => { try { await api.deleteMyQuote(id); await loadSaved(); } catch (e) {} } },
    ]);
  };

  if (routes === null) return <Loading text={t('Chargement du simulateur…')} />;
  if (routes.length === 0) return <Empty icon="🧾" text={t('Tarification indisponible pour le moment.')} />;

  const route = routes.find(r => r.id === routeId) || routes[0];
  const isChine = route.model === 'chine';
  const isAerien = mode === 'aerien';
  const catalog = (isAerien ? route.productsAerien : route.productsMaritime) || [];

  // Libellé d'un produit AVEC son prix unitaire (maritime ; l'aérien est au poids).
  const puLabel = (p) => {
    if (isAerien) return p.desc;
    if (isChine) { const v = Math.round((Number(p.dim) || 0) * (route.tarifs.cbmChine || 0)); return v ? `${p.desc} · ${v.toLocaleString('fr-FR')} F` : p.desc; }
    return p.price ? `${p.desc} · ${Number(p.price).toLocaleString('fr-FR')} €` : p.desc;
  };

  const setItem = (i, k, v) => setItems(arr => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems(arr => [...arr, blankItem()]);
  const delItem = (i) => setItems(arr => arr.filter((_, idx) => idx !== i));

  const compute = async () => {
    setCalc(true);
    try {
      const r = await api.computeQuote({ route: routeId, mode, aerienType, items });
      setResult(r);
    } catch (e) { setResult(null); }
    finally { setCalc(false); }
  };

  let tarifNote = '';
  if (!isAerien && isChine) tarifNote = `${t('Maritime')} : ${(route.tarifs.cbmChine || 0).toLocaleString('fr-FR')} FCFA / m³`;
  else if (!isAerien) tarifNote = `${t('Maritime')} : ${t('prix catalogue par article (€)')}`;
  else if (isChine) tarifNote = `${t('Aérien')} : ${(route.tarifs.kgAerienNormal || 0).toLocaleString('fr-FR')} / ${(route.tarifs.kgAerienExpress || 0).toLocaleString('fr-FR')} FCFA/kg`;
  else tarifNote = `${t('Aérien')} : ${route.tarifs.kgStdEur} €/kg · ${route.tarifs.kgParfumEur} €/kg (${t('parfum')})`;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <SectionTitle>{t('Simulateur de devis')}</SectionTitle>
        <Text style={s.lbl}>{t('Pays / route de départ')}</Text>
        {routes.length > 1 && !showAllRoutes ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Chip active label={`${route.flag || ''} ${route.name}`} onPress={() => setShowAllRoutes(true)} />
            <TouchableOpacity onPress={() => setShowAllRoutes(true)}><Text style={s.changeLink}>{t('Changer de pays de départ ›')}</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={s.chips}>
            {routes.map(r => (
              <Chip key={r.id} active={r.id === routeId} label={`${r.flag || ''} ${r.name}`} onPress={() => { setRouteId(r.id); setResult(null); setShowAllRoutes(false); }} />
            ))}
          </View>
        )}
        <Text style={s.lbl}>{t("Mode d'expédition")}</Text>
        <View style={s.chips}>
          <Chip active={mode === 'maritime'} label={t('🚢 Maritime')} onPress={() => { setMode('maritime'); setResult(null); }} />
          <Chip active={mode === 'aerien'} label={t('✈️ Aérien')} onPress={() => { setMode('aerien'); setResult(null); }} />
        </View>
        {isAerien && isChine && (
          <>
            <Text style={s.lbl}>{t('Type aérien')}</Text>
            <View style={s.chips}>
              <Chip active={aerienType === 'normal'} label={t('Normal')} onPress={() => setAerienType('normal')} />
              <Chip active={aerienType === 'express'} label={t('Express')} onPress={() => setAerienType('express')} />
            </View>
          </>
        )}
        <Text style={s.note}>{tarifNote}</Text>
        {isAerien && (
          <View style={s.aero}>
            <Text style={s.aeroT}>{t('✈️ Tarification au poids facturé')}</Text>
            <Text style={s.aeroTxt}>
              {t('Le prix se base sur le')} <Text style={s.b}>{t('poids facturé')}</Text> = {t('le plus élevé entre le')} <Text style={s.b}>{t('poids réel')}</Text> {t('et le')} <Text style={s.b}>{t('poids volumétrique')}</Text> ({t('Longueur × largeur × hauteur en cm ÷')} {route.tarifs.volDiviseur || 5000}).{'\n'}
              {t("⚠️ Ce mode de calcul est")} <Text style={s.b}>{t("imposé par l'aéroport")}</Text> {t("(les compagnies aériennes), ce n'est pas un choix d'AMT. Renseignez le")} <Text style={s.b}>{t('poids ET les dimensions')}</Text> {t('pour une estimation juste.')}
            </Text>
          </View>
        )}
      </Card>

      <SectionTitle>{t('Articles')}</SectionTitle>
      {catalog.length === 0 && !isAerien && (
        <Text style={s.warn}>{t('Aucun produit au catalogue de cette route pour ce mode.')}</Text>
      )}
      {items.map((it, i) => (
        <Card key={i}>
          <Text style={s.lbl}>{t('Produit')}{isAerien ? t(' (optionnel)') : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {catalog.map((p, idx) => (
                <Chip key={idx} active={it.desc === p.desc} label={puLabel(p)} onPress={() => setItem(i, 'desc', p.desc)} small />
              ))}
            </View>
          </ScrollView>
          <View style={s.grid}>
            <Field label={t('Quantité')} value={it.qty} onChange={(v) => setItem(i, 'qty', v)} />
            {isAerien && <Field label={t('Poids (kg)')} value={it.poids} onChange={(v) => setItem(i, 'poids', v)} />}
          </View>
          {isAerien && (
            <View style={s.grid}>
              <Field label={t('Long (cm)')} value={it.lng} onChange={(v) => setItem(i, 'lng', v)} />
              <Field label={t('Larg (cm)')} value={it.lrg} onChange={(v) => setItem(i, 'lrg', v)} />
              <Field label={t('Haut (cm)')} value={it.haut} onChange={(v) => setItem(i, 'haut', v)} />
            </View>
          )}
          {isAerien && !isChine && (
            <TouchableOpacity style={s.parfum} onPress={() => setItem(i, 'parfum', !it.parfum)}>
              <Text style={{ fontSize: 16 }}>{it.parfum ? '☑️' : '⬜'}</Text>
              <Text style={s.parfumTxt}>{t('Parfum / alcool (tarif majoré)')}</Text>
            </TouchableOpacity>
          )}
          {items.length > 1 && <TouchableOpacity onPress={() => delItem(i)}><Text style={s.del}>{t('🗑 Retirer')}</Text></TouchableOpacity>}
        </Card>
      ))}
      <Btn label={t('+ Ajouter un article')} kind="ghost" onPress={addItem} />
      <Btn label={t("Calculer l'estimation")} onPress={compute} busy={calc} />

      {result && (
        <Card style={{ marginTop: 14 }}>
          <SectionTitle>{t('Estimation')}</SectionTitle>
          <Text style={s.total}>{result.currency === 'EUR' ? `${eur(result.totalEur)}  (${fcfa(result.totalCfa)})` : fcfa(result.totalCfa)}</Text>
          {(result.lines || []).map((l, i) => (
            <Text key={i} style={s.line}>• {l.desc || t('Article')} — {l.detail} = {l.currency === 'EUR' ? eur(l.amount) : fcfa(l.amount)}</Text>
          ))}
          <Text style={s.note}>{t('Estimation indicative, hors frais éventuels. Tarifs identiques à la facturation.')}</Text>
          <Btn label={t('💾 Enregistrer ce devis')} kind="gold" onPress={saveQuote} busy={saving} />
        </Card>
      )}

      {/* Mes devis enregistrés */}
      {saved.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <TouchableOpacity onPress={() => setSavedOpen(o => !o)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionTitle>{t('Mes devis enregistrés')} ({saved.length})</SectionTitle>
            <Text style={{ color: colors.blue, fontWeight: '800', fontSize: 16 }}>{savedOpen ? '▾' : '▸'}</Text>
          </TouchableOpacity>
          {savedOpen && saved.map((q, i) => {
            const open = expanded === (q.id || i);
            return (
              <View key={q.id || i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line } : null}>
                <View style={s.qrow}>
                  <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => setExpanded(open ? null : (q.id || i))} activeOpacity={0.7}>
                    <Text style={s.qlabel}>{q.label || t('Devis')} {open ? '▾' : '▸'}</Text>
                    <Text style={s.qsub}>{q.currency === 'EUR' ? eur(q.totalEur) : fcfa(q.totalCfa)} · {fdate(q.createdAt)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => delQuote(q.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={s.qdel}>🗑</Text></TouchableOpacity>
                </View>
                {open && (
                  <View style={s.qdetail}>
                    {(q.items || []).map((it, k) => (
                      <Text key={k} style={s.qitem}>• {it.qty || 1}× {it.desc || t('Article')}{it.poids ? ` · ${it.poids} kg` : ''}{(it.lng || it.lrg || it.haut) ? ` · ${it.lng || '?'}×${it.lrg || '?'}×${it.haut || '?'} cm` : ''}{it.parfum ? ` · ${tr('parfum/alcool')}` : ''}</Text>
                    ))}
                    {(q.lines || []).map((l, k) => (
                      <Text key={'l' + k} style={s.qcalc}>↳ {l.detail} = {l.currency === 'EUR' ? eur(l.amount) : fcfa(l.amount)}</Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

const fdate = (v) => { try { return new Date(v).toLocaleDateString('fr-FR'); } catch (e) { return ''; } };

function Chip({ active, label, onPress, small }) {
  return (
    <TouchableOpacity style={[cs.chip, active && cs.chipOn, small && { paddingVertical: 7 }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[cs.chipTxt, active && cs.chipTxtOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}
function Field({ label, value, onChange }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.lbl}>{label}</Text>
      <TextInput style={s.input} value={String(value)} onChangeText={onChange} keyboardType="numeric" placeholderTextColor={colors.muted} />
    </View>
  );
}

const cs = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: '#fff' },
  chipOn: { borderColor: colors.blue, backgroundColor: '#eef4fb' },
  chipTxt: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.blue },
});
const s = StyleSheet.create({
  lbl: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  note: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 18 },
  warn: { fontSize: 13, color: colors.red, marginBottom: 10 },
  grid: { flexDirection: 'row', gap: 10 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 11, fontSize: 14, color: colors.ink },
  parfum: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  parfumTxt: { color: colors.ink, fontSize: 13 },
  del: { color: colors.red, fontWeight: '700', textAlign: 'right', marginTop: 8 },
  total: { fontSize: 24, fontWeight: '800', color: colors.blue, marginBottom: 8 },
  line: { fontSize: 12.5, color: colors.muted, marginBottom: 4, lineHeight: 18 },
  qrow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  qlabel: { fontWeight: '700', color: colors.blue, fontSize: 14 },
  qsub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  qdel: { fontSize: 18 },
  qdetail: { paddingBottom: 12, paddingLeft: 4 },
  qitem: { fontSize: 12.5, color: colors.ink, marginBottom: 3, lineHeight: 18 },
  qcalc: { fontSize: 11.5, color: colors.muted, marginBottom: 2, marginLeft: 10, lineHeight: 17 },
  changeLink: { color: colors.blue, fontWeight: '700', fontSize: 13 },
  b: { fontWeight: '800', color: colors.ink },
  aero: { backgroundColor: '#EEF4FB', borderWidth: 1, borderColor: '#cfe0f3', borderRadius: 12, padding: 12, marginTop: 12 },
  aeroT: { color: colors.blue, fontWeight: '800', fontSize: 13, marginBottom: 4 },
  aeroTxt: { color: '#33506f', fontSize: 12, lineHeight: 18 },
});
