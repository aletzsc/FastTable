import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FtColors } from '@/constants/fasttable';

export default function WorkerLayout() {
  return (
    <SafeAreaProvider>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: FtColors.surfaceElevated },
        headerTintColor: FtColors.accent,
        headerTitleStyle: { fontWeight: '700', color: FtColors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: FtColors.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="reservations" options={{ title: 'Reservas y mesas' }} />
      <Stack.Screen name="kitchen" options={{ title: 'Cocina', headerShown: false }} />
      <Stack.Screen name="gerente" options={{ title: 'Gerencia', headerShown: false }} />
    </Stack>
    </SafeAreaProvider>
  );
}
