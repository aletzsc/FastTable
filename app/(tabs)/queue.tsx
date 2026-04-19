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

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
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

  const load = useCallback(async () => {
    if (!user?.id) return;
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
          tintColor={FtColors.accent}
          colors={[FtColors.accent]}
        />
      }>
      <Text style={styles.eyebrow}>Espera</Text>
      <Text style={styles.intro}>Entra en la fila o revisa tu posición.</Text>

      {loading && !refreshing ? <ActivityIndicator color={FtColors.accent} /> : null}

      <View style={styles.card}>
        <Text style={styles.label}>Tu posición</Text>
        <Text style={styles.big}>{position != null ? String(position) : '—'}</Text>
        <Text style={styles.meta}>
          {myEntryId ? 'Estás en la fila.' : 'Aún no estás en la fila.'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Personas en el grupo</Text>
        <TextInput
          value={partySize}
          onChangeText={setPartySize}
          keyboardType="number-pad"
          placeholder="2"
          placeholderTextColor={FtColors.textMuted}
          style={styles.input}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Nota (opcional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ej. silla para niño, alergias…"
          placeholderTextColor={FtColors.textMuted}
          multiline
          style={[styles.input, styles.inputMulti]}
        />
      </View>

      {!myEntryId ? (
        <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={onJoin} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? '…' : 'Unirme a la fila'}</Text>
        </Pressable>
      ) : (
        <Pressable style={[styles.secondaryBtn, busy && styles.btnDisabled]} onPress={onLeave} disabled={busy}>
          <Text style={styles.secondaryBtnText}>{busy ? '…' : 'Salir de la fila'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FtColors.background },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: FtColors.accentMuted,
    marginBottom: 6,
  },
  intro: { fontSize: 15, color: FtColors.textMuted, marginBottom: 18, lineHeight: 22 },
  card: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    marginBottom: 12,
  },
  label: { fontSize: 13, fontWeight: '600', color: FtColors.text, marginBottom: 8 },
  big: { fontSize: 40, fontWeight: '700', color: FtColors.accent },
  meta: { fontSize: 13, color: FtColors.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: FtColors.text,
    backgroundColor: FtColors.surface,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: FtColors.accent,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: FtColors.onAccent, fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: FtColors.border,
    backgroundColor: FtColors.surfaceElevated,
    marginTop: 4,
  },
  secondaryBtnText: { color: FtColors.text, fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.65 },
});
