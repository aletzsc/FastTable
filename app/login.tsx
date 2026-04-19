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

import { FtColors } from '@/constants/fasttable';
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
        Alert.alert('No se pudo iniciar sesión', error.message);
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
              placeholderTextColor={FtColors.textMuted}
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
              placeholderTextColor={FtColors.textMuted}
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

          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Volver</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FtColors.background },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 40 },
  lead: { fontSize: 14, lineHeight: 20, color: FtColors.textMuted, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: FtColors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: FtColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: FtColors.text,
    backgroundColor: FtColors.surface,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: FtColors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: FtColors.onAccent, fontSize: 16, fontWeight: '600' },
  backLink: { marginTop: 20, alignItems: 'center' },
  backLinkText: { fontSize: 15, color: FtColors.accent },
});
