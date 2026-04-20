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
import { useRouter } from 'expo-router';

import { Comensal } from '@/constants/theme-comensal';
import { formatAuthErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !password) {
      Alert.alert('Faltan datos', 'Introduce correo y contraseña.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) {
        Alert.alert('No se pudo iniciar sesión', formatAuthErrorMessage(error.message));
        return;
      }
      router.replace('/');
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
          <Text style={styles.lead}>Introduce el correo y la contraseña de tu cuenta.</Text>

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

          <View style={styles.field}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={Comensal.textMuted}
              secureTextEntry
              style={styles.input}
            />
          </View>

          <Pressable
            style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={busy}>
            <Text style={styles.primaryBtnText}>{busy ? 'Entrando…' : 'Iniciar sesión'}</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/forgot-password')} style={styles.secondaryLink}>
            <Text style={styles.secondaryLinkText}>¿Olvidaste tu contraseña?</Text>
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
  primaryBtn: {
    marginTop: 12,
    backgroundColor: Comensal.accent,
    paddingVertical: 15,
    borderRadius: Comensal.radiusMd,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: Comensal.onAccent, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  secondaryLink: { marginTop: 16, alignItems: 'center' },
  secondaryLinkText: { fontSize: 15, color: Comensal.textMuted, textDecorationLine: 'underline' },
  backLink: { marginTop: 20, alignItems: 'center' },
  backLinkText: { fontSize: 15, color: Comensal.accent },
});
