import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { Comensal } from '@/constants/theme-comensal';

export default function WelcomeScreen() {
  const router = useRouter();
  const { session, user, staffMember, loading } = useAuth();

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={Comensal.accent} />
        <Text style={styles.muted}>Cargando…</Text>
      </SafeAreaView>
    );
  }

  if (session && user) {
    if (staffMember) return <Redirect href="/worker" />;
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Bienvenido</Text>
        <Text style={styles.brand}>FastTable</Text>
        <View style={styles.brandRule} />
        <Text style={styles.tagline}>Reserva mesa, fila y servicio en un solo lugar.</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Cuenta</Text>
          <Text style={styles.cardBody}>
            Crea una cuenta con correo y contraseña, o entra si ya te registraste.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/register')}>
            <Text style={styles.primaryBtnText}>Registrarme</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push('/login')}>
            <Text style={styles.secondaryBtnText}>Iniciar sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      }
    : { elevation: 6 };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Comensal.background },
  scroll: { padding: 24, paddingTop: 30, paddingBottom: 44 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Comensal.background,
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 3.4,
    textTransform: 'uppercase',
    color: Comensal.accentMuted,
    marginBottom: 12,
  },
  brand: {
    fontSize: 38,
    fontWeight: '700',
    color: Comensal.text,
    letterSpacing: 1.2,
  },
  brandRule: {
    marginTop: 16,
    width: 72,
    height: 3,
    borderRadius: 99,
    backgroundColor: Comensal.accent,
    opacity: 1,
  },
  tagline: { marginTop: 18, fontSize: 16, lineHeight: 25, color: Comensal.textMuted, maxWidth: 320 },
  greetingLine: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
    color: Comensal.textMuted,
    fontWeight: '500',
    maxWidth: 320,
  },
  card: {
    marginTop: 36,
    padding: 24,
    borderRadius: Comensal.radiusLg,
    backgroundColor: Comensal.surfaceElevated,
    borderWidth: 1,
    borderColor: Comensal.border,
    gap: 14,
    ...cardShadow,
  },
  cardLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Comensal.textFaint,
  },
  cardName: { fontSize: 24, fontWeight: '700', color: Comensal.text, letterSpacing: 0.2 },
  cardEmail: { fontSize: 14, color: Comensal.textMuted },
  cardBody: { fontSize: 15, lineHeight: 24, color: Comensal.textMuted },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: Comensal.accent,
    paddingVertical: 15,
    borderRadius: Comensal.radiusMd,
    alignItems: 'center',
  },
  primaryBtnText: { color: Comensal.onAccent, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: Comensal.radiusMd,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Comensal.border,
    backgroundColor: Comensal.surfaceInput,
  },
  secondaryBtnText: { color: Comensal.text, fontSize: 15, fontWeight: '500' },
  ghostBtn: { paddingVertical: 8, alignItems: 'center' },
  ghostBtnText: { fontSize: 13, color: Comensal.textMuted, textDecorationLine: 'underline' },
  ghostDisabled: { opacity: 0.6 },
  muted: { color: Comensal.textMuted, fontSize: 14 },
});
