import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import { useColorScheme } from '@/hooks/use-color-scheme';

const FastTableLight = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: FtColors.accent,
    background: FtColors.background,
    card: FtColors.surface,
    text: FtColors.text,
    border: FtColors.border,
    notification: FtColors.accentMuted,
  },
};

const FastTableDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#FDBA74',
    background: '#1C1917',
    card: '#292524',
    text: '#FAFAF9',
    border: '#44403C',
    notification: '#EA580C',
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? FastTableDark : FastTableLight}>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: 'Crear cuenta', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="login" options={{ title: 'Iniciar sesión', headerBackTitle: 'Atrás' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="worker" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );
}
