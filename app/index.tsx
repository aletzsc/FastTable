import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';

export default function WelcomeScreen() {
  const router = useRouter();
  const { session, user, profile, loading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setSigningOut(false);
    }, []),
  );

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={FtColors.accent} />
        <Text style={styles.muted}>Cargando…</Text>
      </SafeAreaView>
    );
  }

  const displayName = profile?.nombre_completo?.trim() || user?.email?.split('@')[0] || 'Invitado';
  const email = user?.email ?? '';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Bienvenido</Text>
        <Text style={styles.brand}>FastTable</Text>
        <View style={styles.brandRule} />
        <Text style={styles.tagline}>Reserva mesa, fila y servicio en un solo lugar.</Text>

        {session && user ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Sesión</Text>
            <Text style={styles.cardName}>{displayName}</Text>
            {email ? <Text style={styles.cardEmail}>{email}</Text> : null}
            <Pressable style={styles.primaryBtn} onPress={() => router.push('/(tabs)')}>
              <Text style={styles.primaryBtnText}>Entrar como comensal</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.push('/worker/login')}>
              <Text style={styles.secondaryBtnText}>Iniciar sesión como trabajador</Text>
            </Pressable>
            <Pressable
              style={[styles.ghostBtn, signingOut && styles.ghostDisabled]}
              onPress={onSignOut}
              disabled={signingOut}>
              <Text style={styles.ghostBtnText}>{signingOut ? 'Cerrando…' : 'Cerrar sesión'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Cuenta</Text>
            <Text style={styles.cardBody}>
              Crea una cuenta con correo y contraseña, o entra si ya te registraste.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.push('/register')}>
              <Text style={styles.primaryBtnText}>Registrarme</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.push('/login')}>
              <Text style={styles.secondaryBtnText}>Ya tengo cuenta</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.push('/worker/login')}>
              <Text style={styles.secondaryBtnText}>Soy trabajador</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FtColors.background },
  scroll: { padding: 24, paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: FtColors.background,
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: FtColors.accentMuted,
    marginBottom: 8,
  },
  brand: {
    fontSize: 36,
    fontWeight: '300',
    color: FtColors.text,
    letterSpacing: 2,
  },
  brandRule: {
    marginTop: 14,
    width: 48,
    height: 2,
    backgroundColor: FtColors.accent,
    opacity: 0.85,
    borderRadius: 1,
  },
  tagline: { marginTop: 16, fontSize: 15, lineHeight: 22, color: FtColors.textMuted, maxWidth: 300 },
  card: {
    marginTop: 32,
    padding: 22,
    borderRadius: 16,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    gap: 12,
  },
  cardLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: FtColors.textMuted },
  cardName: { fontSize: 22, fontWeight: '600', color: FtColors.text },
  cardEmail: { fontSize: 15, color: FtColors.textMuted },
  cardBody: { fontSize: 15, lineHeight: 22, color: FtColors.text },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: FtColors.accent,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryBtnText: { color: FtColors.onAccent, fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: FtColors.border,
    backgroundColor: FtColors.surface,
  },
  secondaryBtnText: { color: FtColors.text, fontSize: 16, fontWeight: '600' },
  ghostBtn: { paddingVertical: 8, alignItems: 'center' },
  ghostBtnText: { fontSize: 14, color: FtColors.textMuted, textDecorationLine: 'underline' },
  ghostDisabled: { opacity: 0.6 },
  muted: { color: FtColors.textMuted, fontSize: 14 },
});
