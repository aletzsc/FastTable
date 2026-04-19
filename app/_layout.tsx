import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';

const FastTableTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: FtColors.accent,
    background: FtColors.background,
    card: FtColors.surfaceElevated,
    text: FtColors.text,
    border: FtColors.border,
    notification: FtColors.accentMuted,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={FastTableTheme}>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: 'Crear cuenta', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="login" options={{ title: 'Iniciar sesión', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="worker" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </AuthProvider>
    </ThemeProvider>
  );
}
