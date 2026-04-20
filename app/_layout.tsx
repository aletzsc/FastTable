import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { DeepLinkBridge } from '@/components/deep-link-bridge';
import { AuthProvider } from '@/contexts/auth-context';
import { Comensal } from '@/constants/theme-comensal';

/** Navegación raíz: comensal e invitado (bronce / azul carbón). El stack `worker` redefine estilos propios. */
const RootNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Comensal.accent,
    background: Comensal.background,
    card: Comensal.surfaceElevated,
    text: Comensal.text,
    border: Comensal.border,
    notification: Comensal.accentMuted,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={RootNavigationTheme}>
      <AuthProvider>
        <DeepLinkBridge />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: 'Crear cuenta', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="login" options={{ title: 'Iniciar sesión', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="forgot-password" options={{ title: 'Recuperar contraseña', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="reset-password" options={{ title: 'Nueva contraseña', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="worker" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </AuthProvider>
    </ThemeProvider>
  );
}
