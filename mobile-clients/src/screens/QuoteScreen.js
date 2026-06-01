// Onglet DEVIS : simulateur. Tarifs = facture (computeQuote côté serveur).
// Le client choisit route + mode + produits du catalogue (prix/CBM connus) ;
// en aérien, saisit poids + dimensions. Résultat en €/FCFA.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Card, SectionTitle, Btn, Loading, Empty } from '../components/ui';
import { colors, fcfa } from '../theme';
import { api } from '../api';

const eur = (v) => `${(Number(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

export default function QuoteScreen() {
  const [routes, setRoutes] = useState(null);
  const [routeId, setRouteId] = useState('');
  const [mode, setMode] = useState('maritime');
  const [aerienType, setAerienType] = useState('normal');
  const [items, setItems] = useState([blankItem()]);
  const [result, setResult] = useState(null);
  const [calc, setCalc] = useState(false);

  function blankItem() { return { desc: '', qty: '1', poids: '', lng: '', lrg: '', haut: '', parfum: false }; }

  useEffect(() => {
    (async () => {
      try { const r = await api.getQuoteConfig(); setRoutes(r.routes || []); if (r.routes?.[0]) setRouteId(r.routes[0].id); }
      catch (e) { setRoutes([]); }
    })();
  }, []);

  if (routes === null) return <Loading text="Chargement du simulateur…" />;
  if (routes.length === 0) return <Empty icon="🧾" text="Tarification indisponible pour le moment." />;

  const route = routes.find(r => r.id === routeId) || routes[0];
  const isChine = route.model === 'chine';
  const isAerien = mode === 'aerien';
  const catalog = (isAerien ? route.productsAerien : route.productsMaritime) || [];

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
  if (!isAerien && isChine) tarifNote = `Maritime : ${(route.tarifs.cbmChine || 0).toLocaleString('fr-FR')} FCFA / m³`;
  else if (!isAerien) tarifNote = `Maritime : prix catalogue par article (€)`;
  else if (isChine) tarifNote = `Aérien : ${(route.tarifs.kgAerienNormal || 0).toLocaleString('fr-FR')} / ${(route.tarifs.kgAerienExpress || 0).toLocaleString('fr-FR')} FCFA/kg`;
  else tarifNote = `Aérien : ${route.tarifs.kgStdEur} €/kg · ${route.tarifs.kgParfumEur} €/kg (parfum)`;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <SectionTitle>Simulateur de devis</SectionTitle>
        <Text style={s.lbl}>Pays / route de départ</Text>
        <View style={s.chips}>
          {routes.map(r => (
            <Chip key={r.id} active={r.id === routeId} label={`${r.flag || ''} ${r.name}`} onPress={() => { setRouteId(r.id); setResult(null); }} />
          ))}
        </View>
        <Text style={s.lbl}>Mode d'expédition</Text>
        <View style={s.chips}>
          <Chip active={mode === 'maritime'} label="🚢 Maritime" onPress={() => { setMode('maritime'); setResult(null); }} />
          <Chip active={mode === 'aerien'} label="✈️ Aérien" onPress={() => { setMode('aerien'); setResult(null); }} />
        </View>
        {isAerien && isChine && (
          <>
            <Text style={s.lbl}>Type aérien</Text>
            <View style={s.chips}>
              <Chip active={aerienType === 'normal'} label="Normal" onPress={() => setAerienType('normal')} />
              <Chip active={aerienType === 'express'} label="Express" onPress={() => setAerienType('express')} />
            </View>
          </>
        )}
        <Text style={s.note}>{tarifNote}</Text>
      </Card>

      <SectionTitle>Articles</SectionTitle>
      {catalog.length === 0 && !isAerien && (
        <Text style={s.warn}>Aucun produit au catalogue de cette route pour ce mode.</Text>
      )}
      {items.map((it, i) => (
        <Card key={i}>
          <Text style={s.lbl}>Produit{isAerien ? ' (optionnel)' : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {catalog.map((p, idx) => (
                <Chip key={idx} active={it.desc === p.desc} label={p.desc} onPress={() => setItem(i, 'desc', p.desc)} small />
              ))}
            </View>
          </ScrollView>
          <View style={s.grid}>
            <Field label="Quantité" value={it.qty} onChange={(v) => setItem(i, 'qty', v)} />
            {isAerien && <Field label="Poids (kg)" value={it.poids} onChange={(v) => setItem(i, 'poids', v)} />}
          </View>
          {isAerien && (
            <View style={s.grid}>
              <Field label="Long (cm)" value={it.lng} onChange={(v) => setItem(i, 'lng', v)} />
              <Field label="Larg (cm)" value={it.lrg} onChange={(v) => setItem(i, 'lrg', v)} />
              <Field label="Haut (cm)" value={it.haut} onChange={(v) => setItem(i, 'haut', v)} />
            </View>
          )}
          {isAerien && !isChine && (
            <TouchableOpacity style={s.parfum} onPress={() => setItem(i, 'parfum', !it.parfum)}>
              <Text style={{ fontSize: 16 }}>{it.parfum ? '☑️' : '⬜'}</Text>
              <Text style={s.parfumTxt}>Parfum / alcool (tarif majoré)</Text>
            </TouchableOpacity>
          )}
          {items.length > 1 && <TouchableOpacity onPress={() => delItem(i)}><Text style={s.del}>🗑 Retirer</Text></TouchableOpacity>}
        </Card>
      ))}
      <Btn label="+ Ajouter un article" kind="ghost" onPress={addItem} />
      <Btn label="Calculer l'estimation" onPress={compute} busy={calc} />

      {result && (
        <Card style={{ marginTop: 14 }}>
          <SectionTitle>Estimation</SectionTitle>
          <Text style={s.total}>{result.currency === 'EUR' ? `${eur(result.totalEur)}  (${fcfa(result.totalCfa)})` : fcfa(result.totalCfa)}</Text>
          {(result.lines || []).map((l, i) => (
            <Text key={i} style={s.line}>• {l.desc || 'Article'} — {l.detail} = {l.currency === 'EUR' ? eur(l.amount) : fcfa(l.amount)}</Text>
          ))}
          <Text style={s.note}>Estimation indicative, hors frais éventuels. Tarifs identiques à la facturation.</Text>
        </Card>
      )}
    </ScrollView>
  );
}

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
});
