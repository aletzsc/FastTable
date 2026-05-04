import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ComensalGreetingLine } from '@/components/comensal-greeting-line';
import { useAuth } from '@/contexts/auth-context';
import { Comensal } from '@/constants/theme-comensal';
import { REALTIME_QUEUE_TAB, useSupabaseRealtimeRefresh } from '@/hooks/use-supabase-realtime-refresh';
import { supabase } from '@/lib/supabase';

export default function QueueScreen() {
  const { user } = useAuth();
  const [partySize, setPartySize] = useState('2');
  const [note, setNote] = useState('');
  const [position, setPosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [myEntryId, setMyEntryId] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<'esperando' | 'sentado' | 'cancelado' | null>(null);
  const [assignedMesaCode, setAssignedMesaCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data: mineRow, error: mineErr } = await supabase
      .from('fila_espera')
      .select('id, estado, id_mesa_asignada, mesas:id_mesa_asignada ( codigo, estado )')
      .eq('id_usuario', user.id)
      .order('unido_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mineErr) {
      Alert.alert('Fila', mineErr.message);
      setMyStatus(null);
      setAssignedMesaCode(null);
    } else {
      const mesaRaw = mineRow?.mesas as
        | { codigo: string; estado: 'libre' | 'ocupada' | 'reservada' }
        | { codigo: string; estado: 'libre' | 'ocupada' | 'reservada' }[]
        | null
        | undefined;
      const mesa = Array.isArray(mesaRaw) ? mesaRaw[0] : mesaRaw;
      const status = (mineRow?.estado as 'esperando' | 'sentado' | 'cancelado' | undefined) ?? null;
      if (status === 'sentado' && mesa?.estado !== 'ocupada') {
        setMyStatus(null);
        setAssignedMesaCode(null);
      } else {
        setMyStatus(status);
        setAssignedMesaCode(mesa?.codigo ?? null);
      }
    }

    const { data: minePosition, error: posErr } = await supabase.rpc('comensal_mi_posicion_fila');
    if (posErr) {
      const missingFunction = posErr.code === '42883';
      if (!missingFunction) {
        Alert.alert('Fila', posErr.message);
      }
      // Fallback legacy para instalaciones sin la RPC nueva.
      const { data: waiting, error: wErr } = await supabase
        .from('fila_espera')
        .select('id, id_usuario, unido_en')
        .eq('estado', 'esperando')
        .order('unido_en', { ascending: true });
      if (wErr) {
        Alert.alert('Fila', wErr.message);
        setPosition(null);
        setMyEntryId(null);
        return;
      }
      const list = waiting ?? [];
      const mine = list.find((e) => e.id_usuario === user.id);
      setMyEntryId(mine?.id ?? null);
      if (mine) {
        const idx = list.findIndex((e) => e.id === mine.id);
        setPosition(idx >= 0 ? idx + 1 : null);
      } else {
        setPosition(null);
      }
      return;
    }

    const rpcRow = Array.isArray(minePosition) ? minePosition[0] : minePosition;
    const rpcPosition =
      typeof rpcRow?.queue_position === 'number'
        ? rpcRow.queue_position
        : typeof rpcRow?.position === 'number'
          ? rpcRow.position
          : null;
    setMyEntryId(rpcRow?.entry_id ?? null);
    setPosition(rpcPosition);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useSupabaseRealtimeRefresh(REALTIME_QUEUE_TAB, load, !!user?.id);

  const onJoin = async () => {
    if (!user?.id) return;
    const n = parseInt(partySize, 10);
    if (Number.isNaN(n) || n < 1) {
      Alert.alert('Personas', 'Indica un número válido.');
      return;
    }
    setBusy(true);
    try {
      const { data: myProfile } = await supabase
        .from('perfiles')
        .select('nombre_completo')
        .eq('id', user.id)
        .maybeSingle();
      const nombreCliente =
        myProfile?.nombre_completo?.trim() ||
        (typeof user.user_metadata?.nombre_completo === 'string' ? user.user_metadata.nombre_completo.trim() : '') ||
        (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '') ||
        user.email?.split('@')[0] ||
        null;

      const { data: existing } = await supabase
        .from('fila_espera')
        .select('id')
        .eq('id_usuario', user.id)
        .eq('estado', 'esperando')
        .maybeSingle();
      if (existing) {
        Alert.alert('Fila', 'Ya estás en la fila de espera.');
        await load();
        return;
      }
      const { error } = await supabase.from('fila_espera').insert({
        id_usuario: user.id,
        nombre_cliente: nombreCliente,
        personas_grupo: n,
        nota: note.trim() || null,
        estado: 'esperando',
      });
      if (error) {
        Alert.alert('No se pudo unir', error.message);
        return;
      }
      setNote('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    if (!myEntryId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('fila_espera')
        .update({ estado: 'cancelado', cancelado_en: new Date().toISOString() })
        .eq('id', myEntryId);
      if (error) {
        Alert.alert('Fila', error.message);
        return;
      }
      setMyEntryId(null);
      setPosition(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Comensal.accent}
          colors={[Comensal.accent]}
        />
      }>
      <Text style={styles.eyebrow}>Espera</Text>
      <Text style={styles.intro}>Entra en la fila o revisa tu posición.</Text>
      <ComensalGreetingLine style={styles.greetingLine} />

      {loading && !refreshing ? <ActivityIndicator color={Comensal.accent} /> : null}

      <View style={styles.card}>
        <Text style={styles.label}>Tu posición</Text>
        <Text style={styles.big}>{position != null ? String(position) : '—'}</Text>
        <Text style={styles.meta}>
          {myStatus === 'sentado'
            ? `Ya te sentaron${assignedMesaCode ? ` en la mesa ${assignedMesaCode}` : ''}.`
            : myEntryId
              ? 'Estás en la fila.'
              : 'Aún no estás en la fila.'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Personas en el grupo</Text>
        <TextInput
          value={partySize}
          onChangeText={setPartySize}
          keyboardType="number-pad"
          placeholder="2"
          placeholderTextColor={Comensal.textMuted}
          style={styles.input}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Nota (opcional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ej. silla para niño, alergias…"
          placeholderTextColor={Comensal.textMuted}
          multiline
          style={[styles.input, styles.inputMulti]}
        />
      </View>

      {!myEntryId && myStatus !== 'sentado' ? (
        <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={onJoin} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? '…' : 'Unirme a la fila'}</Text>
        </Pressable>
      ) : myEntryId ? (
        <Pressable style={[styles.secondaryBtn, busy && styles.btnDisabled]} onPress={onLeave} disabled={busy}>
          <Text style={styles.secondaryBtnText}>{busy ? '…' : 'Salir de la fila'}</Text>
        </Pressable>
      ) : (
        <View style={styles.card}>
          <Text style={styles.meta}>Tu grupo ya fue asignado por recepción. Puedes ir al menú para pedir.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Comensal.background },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: Comensal.accentMuted,
    marginBottom: 8,
  },
  intro: { fontSize: 15, color: Comensal.textMuted, marginBottom: 6, lineHeight: 22 },
  greetingLine: { marginBottom: 14 },
  card: {
    padding: 18,
    borderRadius: Comensal.radiusMd,
    backgroundColor: Comensal.surfaceElevated,
    borderWidth: 1,
    borderColor: Comensal.border,
    marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '700', color: Comensal.text, marginBottom: 8, letterSpacing: 0.2 },
  big: { fontSize: 44, fontWeight: '800', color: Comensal.accent },
  meta: { fontSize: 13, color: Comensal.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: Comensal.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Comensal.text,
    backgroundColor: Comensal.surfaceInput,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: Comensal.accent,
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: Comensal.onAccent, fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Comensal.border,
    backgroundColor: Comensal.surfaceInput,
    marginTop: 4,
  },
  secondaryBtnText: { color: Comensal.text, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.65 },
});
