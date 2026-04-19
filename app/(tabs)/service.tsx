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
      <Text style={styles.intro}>Pide ayuda al equipo del salón cuando lo necesites.</Text>

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
  content: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 14, color: FtColors.textMuted, marginBottom: 16, lineHeight: 20 },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 12,
  },
  label: { fontSize: 13, fontWeight: '600', color: FtColors.text, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: FtColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: FtColors.text,
    backgroundColor: FtColors.background,
  },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: FtColors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#FFFBEB', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.65 },
});
