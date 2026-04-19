import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
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
          placeholderTextColor={FtColors.textMuted}
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
          placeholderTextColor={FtColors.textMuted}
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
  scroll: { flex: 1, backgroundColor: FtColors.background },
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
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: FtColors.accent,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: FtColors.onAccent, fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.65 },
});
