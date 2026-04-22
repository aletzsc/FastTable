import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { Comensal } from '@/constants/theme-comensal';
import { supabase } from '@/lib/supabase';

export default function MoreScreen() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDetail, setIssueDetail] = useState('');
  const [sending, setSending] = useState(false);

  const onReportIssue = async () => {
    if (!user?.id) return;
    const title = issueTitle.trim();
    const detail = issueDetail.trim();
    if (!title || !detail) {
      Alert.alert('Reporte', 'Escribe un título y una descripción del problema.');
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from('reportes_problema').insert({
        id_usuario: user.id,
        nombre_usuario: profile?.nombre_completo?.trim() || user.email?.split('@')[0] || 'Comensal',
        titulo: title,
        descripcion: detail,
        estado: 'abierto',
      });
      if (error) {
        Alert.alert('Reporte', error.message);
        return;
      }
      setIssueTitle('');
      setIssueDetail('');
      Alert.alert('Reporte enviado', 'El gerente lo verá en su bandeja.');
    } finally {
      setSending(false);
    }
  };

  const onSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Cuenta y soporte</Text>
      <Text style={styles.title}>Más opciones</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>¿Hubo un problema?</Text>
        <Text style={styles.sectionHint}>Envíalo y le llegará al gerente.</Text>
        <TextInput
          value={issueTitle}
          onChangeText={setIssueTitle}
          placeholder="Título breve"
          placeholderTextColor={Comensal.textMuted}
          style={styles.input}
          maxLength={90}
        />
        <TextInput
          value={issueDetail}
          onChangeText={setIssueDetail}
          placeholder="Describe lo ocurrido..."
          placeholderTextColor={Comensal.textMuted}
          multiline
          style={[styles.input, styles.textarea]}
          maxLength={700}
        />
        <Pressable style={[styles.primaryBtn, sending && styles.btnDisabled]} onPress={onReportIssue} disabled={sending}>
          <Text style={styles.primaryBtnText}>{sending ? 'Enviando…' : 'Enviar reporte'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sesión</Text>
        <Pressable style={styles.ghostBtn} onPress={onSignOut}>
          <Text style={styles.ghostBtnText}>Cerrar sesión</Text>
        </Pressable>
      </View>
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
  title: { fontSize: 24, color: Comensal.text, fontWeight: '800', marginBottom: 12 },
  card: {
    padding: 16,
    borderRadius: Comensal.radiusMd,
    backgroundColor: Comensal.surfaceElevated,
    borderWidth: 1,
    borderColor: Comensal.border,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Comensal.text },
  sectionHint: { fontSize: 13, color: Comensal.textMuted, marginTop: 4, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: Comensal.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: Comensal.text,
    backgroundColor: Comensal.surfaceInput,
    marginBottom: 10,
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: Comensal.accent,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryBtnText: { color: Comensal.onAccent, fontSize: 15, fontWeight: '800' },
  ghostBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  ghostBtnText: { color: Comensal.textMuted, fontSize: 14, textDecorationLine: 'underline' },
  btnDisabled: { opacity: 0.7 },
});
