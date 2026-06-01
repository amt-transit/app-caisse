// Calendrier des places disponibles (Dépôt/Récup). Charge getRdvAvailability
// pour le mois affiché ; chaque jour montre les places restantes. Jours passés
// et jours pleins/off non sélectionnables. Renvoie la date choisie (YYYY-MM-DD).
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import { api } from '../api';

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export default function AvailabilityCalendar({ selected, onSelect }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [days, setDays] = useState({});   // 'YYYY-MM-DD' -> places (-1 = off)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getRdvAvailability(year, month).then((r) => { if (alive) { setDays(r.days || {}); setLoading(false); } })
      .catch(() => { if (alive) { setDays({}); setLoading(false); } });
    return () => { alive = false; };
  }, [year, month]);

  const nav = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const todayStr = today.toISOString().slice(0, 10);
  const nbDays = new Date(year, month + 1, 0).getDate();
  let firstDow = new Date(year, month, 1).getDay(); firstDow = firstDow === 0 ? 6 : firstDow - 1; // Lun en tête
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= nbDays; d++) cells.push(d);

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <TouchableOpacity onPress={() => nav(-1)} style={s.nav}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
        <Text style={s.month}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={() => nav(1)} style={s.nav}><Text style={s.navTxt}>›</Text></TouchableOpacity>
      </View>
      <View style={s.dowRow}>{DOW.map((d, i) => <Text key={i} style={s.dow}>{d}</Text>)}</View>
      {loading ? <ActivityIndicator color={colors.blue} style={{ marginVertical: 20 }} /> : (
        <View style={s.grid}>
          {cells.map((d, i) => {
            if (d === null) return <View key={i} style={s.cellEmpty} />;
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const places = days[ds];          // -1 = off ; undefined = ?
            const isPast = ds < todayStr;
            const isOff = places === -1;
            const isFull = typeof places === 'number' && places === 0;
            const disabled = isPast || isOff || isFull;
            const isSel = ds === selected;
            return (
              <TouchableOpacity key={i} disabled={disabled} onPress={() => onSelect(ds)}
                style={[s.cell, disabled && s.cellOff, !disabled && s.cellOk, isSel && s.cellSel]} activeOpacity={0.7}>
                <Text style={[s.cellN, isSel && { color: '#fff' }]}>{d}</Text>
                <Text style={[s.cellP, isSel && { color: '#fff' }]}>{isOff ? '✕' : (typeof places === 'number' ? places : '…')}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <Text style={s.legend}>Chiffre = places disponibles ce jour. ✕ = fermé.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nav: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  navTxt: { fontSize: 20, color: colors.blue, fontWeight: '800' },
  month: { fontWeight: '700', color: colors.ink, textTransform: 'capitalize' },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellEmpty: { width: `${100 / 7}%`, height: 44 },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  cellOk: { backgroundColor: '#f0fdf4' },
  cellOff: { opacity: 0.4 },
  cellSel: { backgroundColor: colors.green },
  cellN: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  cellP: { fontSize: 9, color: colors.green, marginTop: 1 },
  legend: { fontSize: 11, color: colors.muted, marginTop: 8 },
});
