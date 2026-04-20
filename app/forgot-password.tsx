import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

import { Comensal } from '@/constants/theme-comensal';
import { formatAuthErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) {
      Alert.alert('Correo', 'Introduce un correo válido.');
      return;
    }
    setBusy(true);
    try {
      const redirectTo = Linking.createURL('/reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo });
      if (error) {
        Alert.alert('Recuperación', formatAuthErrorMessage(error.message));
        return;
      }
      Alert.alert(
        'Revisa tu correo',
        'Si existe una cuenta con ese correo, te enviamos un enlace para elegir una nueva contraseña. ' +
          'Abre el enlace en este dispositivo (misma app FastTable).',
        [{ text: 'Entendido', onPress: () => router.back() }],
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>
            Te enviaremos un enlace para restablecer la contraseña. Sirve para comensales y para trabajadores
            (mismo inicio de sesión).
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={Comensal.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          <Text style={styles.hint}>
            En Supabase → Authentication → URL configuration, añade como URL de redirección permitida la que usa
            esta app (por ejemplo fasttable://… al abrir el enlace en el móvil).
          </Text>

          <Pressable
            style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={busy}>
            <Text style={styles.primaryBtnText}>{busy ? 'Enviando…' : 'Enviar enlace'}</Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Volver</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Comensal.background },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 28, paddingBottom: 44 },
  lead: { fontSize: 15, lineHeight: 24, color: Comensal.textMuted, marginBottom: 22 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: Comensal.text, marginBottom: 8, letterSpacing: 0.2 },
  input: {
    borderWidth: 1,
    borderColor: Comensal.border,
    borderRadius: Comensal.radiusMd,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Comensal.text,
    backgroundColor: Comensal.surfaceInput,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: Comensal.textFaint,
    marginBottom: 16,
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: Comensal.accent,
    paddingVertical: 15,
    borderRadius: Comensal.radiusMd,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: Comensal.onAccent, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  backLink: { marginTop: 20, alignItems: 'center' },
  backLinkText: { fontSize: 15, color: Comensal.accent },
});
