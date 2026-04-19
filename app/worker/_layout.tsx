import { Stack } from 'expo-router';

import { FtColors } from '@/constants/fasttable';

export default function WorkerLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: FtColors.surface },
        headerTintColor: FtColors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: FtColors.background },
      }}>
      <Stack.Screen name="login" options={{ title: 'Acceso trabajador' }} />
      <Stack.Screen name="index" options={{ title: 'Panel del local' }} />
      <Stack.Screen name="reservations" options={{ title: 'Reservas y mesas' }} />
    </Stack>
  );
}
