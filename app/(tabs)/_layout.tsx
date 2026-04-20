import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { Comensal } from '@/constants/theme-comensal';

export default function GuestTabLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={Comensal.accent} size="large" />
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
        headerStyle: { backgroundColor: Comensal.surface },
        headerTitleStyle: {
          color: Comensal.text,
          fontWeight: '700',
          fontSize: 18,
          letterSpacing: 0.35,
        },
        headerShadowVisible: false,
        headerTintColor: Comensal.accent,
        tabBarActiveTintColor: Comensal.accent,
        tabBarInactiveTintColor: Comensal.textFaint,
        tabBarStyle: {
          backgroundColor: Comensal.surfaceElevated,
          borderTopWidth: 1,
          borderTopColor: Comensal.border,
          height: 66,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
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
    backgroundColor: Comensal.background,
  },
});
