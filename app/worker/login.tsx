import { useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import { supabase } from '@/lib/supabase';

export default function WorkerLoginScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading || !session) return;
    if (staffMember) {
      if (staffMember.rol === 'cocina') router.replace('/worker/kitchen');
      else if (staffMember.rol === 'gerente') router.replace('/worker/gerente');
      else router.replace('/worker');
    }
  }, [authLoading, session, staffMember, router]);

  const onSubmit = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !password) {
      Alert.alert('Datos incompletos', 'Introduce correo y contraseña del personal.');
      return;
    }
    setBusy(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email: e, password });
      if (signErr) {
        Alert.alert('Acceso', signErr.message);
        return;
      }
      const uid = data.user?.id;
      if (!uid) {
        Alert.alert('Acceso', 'No se obtuvo el usuario.');
        return;
      }
      const { data: row } = await supabase
        .from('personal')
        .select('id, rol')
        .eq('id_usuario', uid)
        .eq('activo', true)
        .maybeSingle();
      if (!row) {
        await supabase.auth.signOut();
        Alert.alert(
          'Sin permiso',
          'Esta cuenta no está registrada como personal. Consulta con el administrador del restaurante.',
        );
        return;
      }
      if (row.rol === 'cocina') {
        router.replace('/worker/kitchen');
      } else if (row.rol === 'gerente') {
        router.replace('/worker/gerente');
      } else {
        router.replace('/worker');
      }
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Cargando…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Acceso solo para el personal del restaurante.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Correo</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="empleado@restaurante.com"
            placeholderTextColor={FtColors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
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

        <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={onSubmit} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? 'Entrando…' : 'Entrar'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: FtColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FtColors.background },
  scroll: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 14, color: FtColors.textMuted, marginBottom: 20, lineHeight: 20 },
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
  primaryBtnText: { color: FtColors.onAccent, fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.65 },
  muted: { color: FtColors.textMuted, fontSize: 14 },
});
