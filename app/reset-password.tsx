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

import { useAuth } from '@/contexts/auth-context';
import { Comensal } from '@/constants/theme-comensal';
import { formatAuthErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!session) {
      Alert.alert('Sesión', 'Abre primero el enlace que te enviamos por correo.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Contraseña', 'Usa al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Contraseña', 'Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert('Error', formatAuthErrorMessage(error.message));
        return;
      }
      Alert.alert('Listo', 'Tu contraseña se actualizó. Ya puedes usar la app con normalidad.', [
        { text: 'Continuar', onPress: () => router.replace('/') },
      ]);
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
            {session
              ? 'Elige una contraseña nueva para tu cuenta.'
              : 'Para continuar, abre el enlace «Restablecer contraseña» del correo en este dispositivo.'}
          </Text>

          {session ? (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Nueva contraseña</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor={Comensal.textMuted}
                  secureTextEntry
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Confirmar contraseña</Text>
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Repite la contraseña"
                  placeholderTextColor={Comensal.textMuted}
                  secureTextEntry
                  style={styles.input}
                />
              </View>

              <Pressable
                style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
                onPress={onSubmit}
                disabled={busy}>
                <Text style={styles.primaryBtnText}>{busy ? 'Guardando…' : 'Guardar contraseña'}</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable onPress={() => router.replace('/forgot-password')} style={styles.link}>
            <Text style={styles.linkText}>Pedir otro enlace</Text>
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
  link: { marginTop: 18, alignItems: 'center' },
  linkText: { fontSize: 15, color: Comensal.accent },
  backLink: { marginTop: 12, alignItems: 'center' },
  backLinkText: { fontSize: 15, color: Comensal.textMuted },
});
