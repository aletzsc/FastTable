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

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const n = name.trim();
    const e = email.trim().toLowerCase();
    if (!n || !e || !password) {
      Alert.alert('Faltan datos', 'Completa nombre, correo y contraseña.');
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
      const { data, error } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          emailRedirectTo: Linking.createURL('/'),
          data: { nombre_completo: n, full_name: n },
        },
      });
      if (error) {
        Alert.alert('Registro', formatAuthErrorMessage(error.message));
        return;
      }

      const uid = data.user?.id;
      if (uid) {
        await supabase.from('perfiles').update({ nombre_completo: n }).eq('id', uid);
      }

      if (data.session) {
        router.replace('/(tabs)');
        return;
      }

      Alert.alert(
        'Revisa tu correo',
        'Te enviamos un enlace para confirmar tu cuenta. Cuando lo abras, volverás a la app. Luego puedes entrar con «Ya tengo cuenta».',
        [{ text: 'Entendido', onPress: () => router.replace('/') }],
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
          <Text style={styles.lead}>Crea tu cuenta para reservar mesa, ver el menú y pedir servicio.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ej. Ana García"
              placeholderTextColor={Comensal.textMuted}
              autoCapitalize="words"
              style={styles.input}
            />
          </View>

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
            <Text style={styles.primaryBtnText}>{busy ? 'Creando cuenta…' : 'Crear cuenta'}</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/forgot-password')} style={styles.secondaryLink}>
            <Text style={styles.secondaryLinkText}>¿Olvidaste tu contraseña?</Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/')} style={styles.backLink}>
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
