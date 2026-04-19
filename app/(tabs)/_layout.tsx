import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';

export default function GuestTabLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={FtColors.accent} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: FtColors.surface },
        headerTitleStyle: { color: FtColors.text, fontWeight: '600' },
        headerShadowVisible: false,
        tabBarActiveTintColor: FtColors.accent,
        tabBarInactiveTintColor: FtColors.textMuted,
        tabBarStyle: {
          backgroundColor: FtColors.surface,
          borderTopColor: FtColors.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mesas',
          tabBarLabel: 'Mesas',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Fila',
          tabBarLabel: 'Fila',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menú',
          tabBarLabel: 'Menú',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="service"
        options={{
          title: 'Servicio',
          tabBarLabel: 'Servicio',
          tabBarIcon: ({ color, size }) => <Ionicons name="hand-left-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: FtColors.background,
  },
});
