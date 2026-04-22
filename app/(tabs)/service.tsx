import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ComensalGreetingLine } from '@/components/comensal-greeting-line';
import { useAuth } from '@/contexts/auth-context';
import { Comensal } from '@/constants/theme-comensal';
import { fetchMesaActivaComensal, type MesaActiva } from '@/lib/mesa-activa';
import { supabase } from '@/lib/supabase';

export default function ServiceScreen() {
  const { user } = useAuth();
  const [mesaActiva, setMesaActiva] = useState<MesaActiva | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadMesa = useCallback(async () => {
    if (!user?.id) {
      setMesaActiva(null);
      return;
    }
    const mesa = await fetchMesaActivaComensal(user.id);
    setMesaActiva(mesa);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadMesa().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [loadMesa]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMesa();
    setRefreshing(false);
  }, [loadMesa]);

  const onCallWaiter = async () => {
    if (!user?.id) return;
    if (!mesaActiva?.id_mesa) {
      Alert.alert('Mesa', 'No tienes una mesa activa para solicitar servicio.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from('solicitudes_servicio').insert({
        id_mesa: mesaActiva.id_mesa,
        id_usuario: user.id,
        mensaje: message.trim() || null,
        estado: 'abierta',
      });
      if (error) {
        Alert.alert('No se pudo enviar', error.message);
        return;
      }
      Alert.alert('Listo', 'El personal verá tu solicitud en el panel.');
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Comensal.accent}
          colors={[Comensal.accent]}
        />
      }>
      <Text style={styles.eyebrow}>Asistencia</Text>
      <Text style={styles.intro}>Llama al personal cuando estés en mesa.</Text>
      <ComensalGreetingLine style={styles.greetingLine} />

      <View style={styles.card}>
        <Text style={styles.label}>Tu mesa actual</Text>
        {loading ? (
          <ActivityIndicator color={Comensal.accent} />
        ) : mesaActiva ? (
          <Text style={styles.fixedValue}>Mesa {mesaActiva.codigo}</Text>
        ) : (
          <Text style={styles.metaWarning}>No tienes mesa activa en este momento.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Mensaje para el mesero (opcional)</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Ej. traer agua, cuenta, cubiertos…"
          placeholderTextColor={Comensal.textMuted}
          multiline
          style={[styles.input, styles.inputMulti]}
        />
      </View>

      <Pressable
        style={[styles.primaryBtn, (busy || !mesaActiva) && styles.btnDisabled]}
        onPress={onCallWaiter}
        disabled={busy || !mesaActiva}>
        <Text style={styles.primaryBtnText}>{busy ? 'Enviando…' : 'Llamar al mesero'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Comensal.background },
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
  label: { fontSize: 13, fontWeight: '700', color: Comensal.text, marginBottom: 8 },
  fixedValue: { fontSize: 20, color: Comensal.accent, fontWeight: '800' },
  metaWarning: { fontSize: 14, color: Comensal.warning, lineHeight: 20 },
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
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: Comensal.accent,
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: Comensal.onAccent, fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.65 },
});
