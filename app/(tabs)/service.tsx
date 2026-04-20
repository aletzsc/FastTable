import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { Comensal } from '@/constants/theme-comensal';
import { supabase } from '@/lib/supabase';

export default function ServiceScreen() {
  const { user } = useAuth();
  const [tableCode, setTableCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const onCallWaiter = async () => {
    if (!user?.id) return;
    const code = tableCode.trim();
    if (!code) {
      Alert.alert('Mesa', 'Indica el código de la mesa (ej. M1).');
      return;
    }
    setBusy(true);
    try {
      const { data: table, error: tErr } = await supabase
        .from('mesas')
        .select('id')
        .eq('codigo', code)
        .maybeSingle();
      if (tErr) {
        Alert.alert('Error', tErr.message);
        return;
      }
      if (!table) {
        Alert.alert('Mesa', `No existe una mesa con código "${code}".`);
        return;
      }
      const { error } = await supabase.from('solicitudes_servicio').insert({
        id_mesa: table.id,
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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Asistencia</Text>
      <Text style={styles.intro}>Llama al personal cuando estés en mesa.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Código de mesa</Text>
        <TextInput
          value={tableCode}
          onChangeText={setTableCode}
          placeholder="Ej. M1"
          placeholderTextColor={Comensal.textMuted}
          autoCapitalize="characters"
          style={styles.input}
        />
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

      <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={onCallWaiter} disabled={busy}>
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
  intro: { fontSize: 15, color: Comensal.textMuted, marginBottom: 20, lineHeight: 22 },
  card: {
    padding: 18,
    borderRadius: Comensal.radiusMd,
    backgroundColor: Comensal.surfaceElevated,
    borderWidth: 1,
    borderColor: Comensal.border,
    marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '700', color: Comensal.text, marginBottom: 8 },
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
