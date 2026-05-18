import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ScreenScroll, ScreenTitle, Card, SectionTitle, Row, Badge, Empty, PrimaryButton,
} from '../components/ui';
import { colors, spacing, radius, shadow, fcfa, fdate } from '../theme';

const METHODS = [
  { key: 'Orange Money', icon: 'phone-portrait-outline' },
  { key: 'Wave', icon: 'water-outline' },
];

function demandeTone(st) {
  if (st === 'paye' || st === 'traite' || st === 'transfere') return ['paid', 'Transféré'];
  if (st === 'refuse' || st === 'rejete') return ['bad', 'Refusée'];
  return ['wait', 'En attente'];
}

export default function WalletScreen({ data }) {
  const { me, commissions, demandes, refreshing, refresh, reload } = data;
  const solde = Number(me?.soldeDisponible || 0);

  const [decided, setDecided] = useState(null); // null | 'yes' | 'no'
  const [method, setMethod] = useState('Orange Money');
  const [numero, setNumero] = useState(me?.telephone ? String(me.telephone) : '');
  const [amountType, setAmountType] = useState('total'); // 'total' | 'partiel'
  const [amountInput, setAmountInput] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const amount = amountType === 'total' ? solde : parseFloat(amountInput) || 0;
  const valid = !!method && numero.trim().length >= 8 && amount > 0 && amount <= solde;

  const submit = async () => {
    if (!valid || !me) return;
    setError('');
    setSending(true);
    try {
      await addDoc(collection(db, 'retrait_demandes'), {
        demarcheurId: me.id,
        montant: Number(amount),
        moyenPaiement: method,
        numero: numero.trim(),
        type: amountType, // 'total' | 'partiel'
        statut: 'en_attente',
        demandeurNom: `${me.prenom || ''} ${me.nom || ''}`.trim(),
        source: 'mobile',
        dateDemande: serverTimestamp(),
      });
      setDone(true);
      reload(); // recharge solde + liste des demandes
    } catch (e) {
      setError("Échec de l'envoi de la demande. Vérifiez votre connexion et réessayez.");
    } finally {
      setSending(false);
    }
  };

  const resetFlow = () => {
    setDecided(null); setDone(false); setError('');
    setAmountType('total'); setAmountInput('');
  };

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <ScreenTitle icon="wallet" title="Wallet" subtitle="Vos gains de partenariat AMT" />

      {/* Solde */}
      <View style={[styles.hero, shadow.gold]}>
        <Text style={styles.heroLabel}>SOLDE DISPONIBLE</Text>
        <Text style={styles.heroValue}>{fcfa(solde)}</Text>
        <View style={styles.heroSplit}>
          <View>
            <Text style={styles.heroMiniL}>Total généré</Text>
            <Text style={styles.heroMiniV}>{fcfa(me?.totalGagne)}</Text>
          </View>
          <View>
            <Text style={styles.heroMiniL}>Déjà retiré</Text>
            <Text style={styles.heroMiniV}>{fcfa(me?.totalRetire)}</Text>
          </View>
        </View>
      </View>

      {/* Décision / formulaire */}
      {done ? (
        <Card style={styles.pad}>
          <View style={styles.okIcon}>
            <Ionicons name="checkmark-circle" size={42} color={colors.green} />
          </View>
          <Text style={styles.okTitle}>Demande enregistrée ✅</Text>
          <Text style={styles.okText}>
            Votre demande de transfert de {fcfa(amount)} vers votre compte {method} a bien été reçue.
            {'\n\n'}Le transfert sera effectué sous <Text style={{ color: colors.gold, fontWeight: '800' }}>2 jours ouvrés</Text> après réception.
          </Text>
          <PrimaryButton label="Terminé" icon="checkmark" onPress={resetFlow} />
        </Card>
      ) : solde <= 0 ? (
        <Card style={styles.pad}>
          <Text style={styles.infoText}>
            Vous n'avez pas encore de solde à transférer. Vos commissions apparaîtront ici dès qu'elles seront validées.
          </Text>
        </Card>
      ) : decided === null ? (
        <Card style={styles.pad}>
          <Text style={styles.qTitle}>Que souhaitez-vous faire de vos gains ?</Text>
          <Text style={styles.qSub}>
            Vous pouvez demander le transfert de votre solde vers Orange Money ou Wave.
          </Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.choice, styles.choiceYes]}
              activeOpacity={0.85}
              onPress={() => setDecided('yes')}
            >
              <Ionicons name="cash-outline" size={20} color="#1A1206" />
              <Text style={styles.choiceYesT}>OUI, transférer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choice, styles.choiceNo]}
              activeOpacity={0.85}
              onPress={() => setDecided('no')}
            >
              <Ionicons name="time-outline" size={20} color={colors.text} />
              <Text style={styles.choiceNoT}>NON, plus tard</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ) : decided === 'no' ? (
        <Card style={styles.pad}>
          <Text style={styles.infoText}>
            Pas de souci 👍 Votre argent reste disponible dans votre Wallet. Vous pourrez demander le transfert quand vous voudrez.
          </Text>
          <PrimaryButton label="Faire une demande" icon="arrow-forward" onPress={() => setDecided('yes')} />
        </Card>
      ) : (
        <Card style={styles.pad}>
          <Text style={styles.formLabel}>Méthode de transfert</Text>
          <View style={styles.segRow}>
            {METHODS.map((m) => {
              const on = method === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.seg, on && styles.segOn]}
                  activeOpacity={0.85}
                  onPress={() => setMethod(m.key)}
                >
                  <Ionicons name={m.icon} size={18} color={on ? '#1A1206' : colors.textDim} />
                  <Text style={[styles.segT, { color: on ? '#1A1206' : colors.textDim }]}>{m.key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.formLabel}>Numéro {method}</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex : 07 00 00 00 00"
            placeholderTextColor={colors.textFaint}
            keyboardType="phone-pad"
            value={numero}
            onChangeText={setNumero}
          />

          <Text style={styles.formLabel}>Montant à transférer</Text>
          <View style={styles.segRow}>
            <TouchableOpacity
              style={[styles.seg, amountType === 'total' && styles.segOn]}
              activeOpacity={0.85}
              onPress={() => setAmountType('total')}
            >
              <Text style={[styles.segT, { color: amountType === 'total' ? '#1A1206' : colors.textDim }]}>
                Totalité ({fcfa(solde)})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.seg, amountType === 'partiel' && styles.segOn]}
              activeOpacity={0.85}
              onPress={() => setAmountType('partiel')}
            >
              <Text style={[styles.segT, { color: amountType === 'partiel' ? '#1A1206' : colors.textDim }]}>
                Montant précis
              </Text>
            </TouchableOpacity>
          </View>

          {amountType === 'partiel' && (
            <TextInput
              style={styles.input}
              placeholder={`Montant en FCFA (max ${fcfa(solde)})`}
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              value={amountInput}
              onChangeText={setAmountInput}
            />
          )}

          {error ? <Text style={styles.err}>{error}</Text> : null}
          {amountType === 'partiel' && amountInput !== '' && amount > solde ? (
            <Text style={styles.err}>Le montant dépasse votre solde disponible.</Text>
          ) : null}

          <Text style={styles.note}>
            <Ionicons name="time-outline" size={12} color={colors.gold} />
            {'  '}Une fois validée, le transfert est effectué sous <Text style={{ fontWeight: '800', color: colors.gold }}>2 jours ouvrés</Text>.
          </Text>

          <PrimaryButton
            label={`Demander ${fcfa(amount)}`}
            icon="paper-plane"
            busy={sending}
            disabled={!valid}
            onPress={() => {
              Alert.alert(
                'Confirmer la demande',
                `Transférer ${fcfa(amount)} vers ${method} (${numero.trim()}) ?`,
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Confirmer', onPress: submit },
                ]
              );
            }}
          />
          <TouchableOpacity style={styles.cancel} onPress={resetFlow}>
            <Text style={styles.cancelT}>Annuler</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* Historique des demandes */}
      <SectionTitle icon="receipt-outline" title="Mes demandes de retrait" count={demandes.length} />
      <Card>
        {demandes.length === 0 && <Empty text="Aucune demande pour l'instant." />}
        {demandes.map((d, i, arr) => {
          const [tone, txt] = demandeTone(d.statut);
          return (
            <Row
              key={d.id}
              last={i === arr.length - 1}
              icon="swap-horizontal-outline"
              iconBg={colors.bgChip}
              iconColor={colors.gold}
              main={fcfa(d.montant)}
              sub={`${d.moyenPaiement || '—'} · ${fdate(d.dateDemande)}`}
              right={<Badge text={txt} tone={tone} />}
            />
          );
        })}
      </Card>

      {/* Historique commissions */}
      <SectionTitle icon="wallet-outline" title="Mes commissions" count={commissions.length} />
      <Card>
        {commissions.length === 0 && <Empty text="Aucune commission enregistrée." />}
        {commissions.slice(0, 30).map((c, i, arr) => {
          const paid = c.statut === 'paye' || c.statut === 'retire';
          return (
            <Row
              key={c.id}
              last={i === arr.length - 1}
              icon={c.type === 'parrainage' ? 'gift-outline' : 'cash-outline'}
              iconBg={paid ? colors.greenDeep : colors.amberDeep}
              iconColor={paid ? colors.green : colors.amber}
              main={fcfa(c.montantNet)}
              sub={`${c.type === 'parrainage' ? 'Bonus parrainage' : 'Commission directe'} · ${fdate(c.dateCreation)}`}
              right={<Badge text={paid ? 'Payée' : 'En attente'} tone={paid ? 'paid' : 'wait'} />}
            />
          );
        })}
        {commissions.length > 30 && <Empty text={`… et ${commissions.length - 30} de plus`} />}
      </Card>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    padding: spacing.xl, marginBottom: spacing.lg,
  },
  heroLabel: { color: '#5A3F05', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  heroValue: { color: '#1A1206', fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  heroSplit: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(26,18,6,0.18)',
  },
  heroMiniL: { color: '#5A3F05', fontSize: 11, fontWeight: '700' },
  heroMiniV: { color: '#1A1206', fontSize: 15, fontWeight: '800', marginTop: 2 },

  pad: { padding: spacing.xl },
  qTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  qSub: { color: colors.textDim, fontSize: 13, marginTop: 6, marginBottom: spacing.lg },
  choiceRow: { flexDirection: 'row', gap: spacing.md },
  choice: {
    flex: 1, height: 52, borderRadius: radius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  choiceYes: { backgroundColor: colors.gold },
  choiceYesT: { color: '#1A1206', fontWeight: '800', fontSize: 14 },
  choiceNo: {
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
  },
  choiceNoT: { color: colors.text, fontWeight: '700', fontSize: 14 },

  infoText: { color: colors.textDim, fontSize: 14, lineHeight: 21, marginBottom: spacing.md },

  formLabel: {
    color: colors.textDim, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  segRow: { flexDirection: 'row', gap: spacing.sm },
  seg: {
    flex: 1, minHeight: 46, borderRadius: radius.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
    paddingHorizontal: 6,
  },
  segOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  segT: { fontSize: 12.5, fontWeight: '700' },
  input: {
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.sm, paddingHorizontal: spacing.lg, height: 50,
    color: colors.text, fontSize: 15, marginTop: spacing.sm,
  },
  err: { color: colors.redSoft, fontSize: 13, marginTop: spacing.md, fontWeight: '600' },
  note: {
    color: colors.textDim, fontSize: 12, lineHeight: 18,
    marginTop: spacing.lg, marginBottom: spacing.xs,
  },
  cancel: { alignItems: 'center', padding: spacing.md, marginTop: spacing.xs },
  cancelT: { color: colors.textDim, fontWeight: '600' },

  okIcon: { alignItems: 'center', marginBottom: spacing.md },
  okTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  okText: {
    color: colors.textDim, fontSize: 14, lineHeight: 22,
    textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.md,
  },
});
