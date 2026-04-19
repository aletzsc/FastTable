import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import { supabase } from '@/lib/supabase';

function roleLabel(role: string): string {
  switch (role) {
    case 'anfitrion':
      return 'Anfitrión';
    case 'mesero':
      return 'Mesero';
    case 'gerente':
      return 'Gerente';
    case 'cocina':
      return 'Cocina';
    default:
      return role;
  }
}

export default function WorkerDashboardScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading, signOut } = useAuth();
  const [occupied, setOccupied] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [openReq, setOpenReq] = useState<number | null>(null);
  const [pendingVisit, setPendingVisit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [t1, t2, t3, t4] = await Promise.all([
      supabase.from('mesas').select('*', { count: 'exact', head: true }).eq('estado', 'ocupada'),
      supabase.from('fila_espera').select('*', { count: 'exact', head: true }).eq('estado', 'esperando'),
      supabase.from('solicitudes_servicio').select('*', { count: 'exact', head: true }).eq('estado', 'abierta'),
      supabase
        .from('reservas_mesa')
        .select('*', { count: 'exact', head: true })
        .eq('ciclo', 'activa')
        .is('comensal_llego', null)
        .lte('mesero_atender_a_partir_de', nowIso),
    ]);
    setOccupied(t1.count ?? 0);
    setWaiting(t2.count ?? 0);
    setOpenReq(t3.count ?? 0);
    setPendingVisit(t4.count ?? 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!session || !staffMember) return;
      let active = true;
      setLoading(true);
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [session, staffMember, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (authLoading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={FtColors.accent} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/" />;
  }

  if (!staffMember) {
    return <Redirect href="/worker/login" />;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.intro}>
        {roleLabel(staffMember.rol)} · {staffMember.nombre_visible}
      </Text>

      {loading && !refreshing ? <ActivityIndicator color={FtColors.accent} style={styles.loader} /> : null}

      <View style={styles.grid}>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{occupied ?? '—'}</Text>
          <Text style={styles.kpiLabel}>Mesas ocupadas</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{waiting ?? '—'}</Text>
          <Text style={styles.kpiLabel}>Personas en fila</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{openReq ?? '—'}</Text>
          <Text style={styles.kpiLabel}>Solicitudes abiertas</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{pendingVisit ?? '—'}</Text>
          <Text style={styles.kpiLabel}>Visitas pendientes</Text>
        </View>
      </View>

      <Pressable style={styles.navCard} onPress={() => router.push('/worker/reservations')}>
        <Text style={styles.navCardTitle}>Reservas y mesas</Text>
        <Text style={styles.navCardSub}>
          Atender comensales tras la hora reservada y cambiar estado de mesas.
        </Text>
      </Pressable>

      <Pressable style={styles.signOut} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FtColors.background },
  scroll: { flex: 1, backgroundColor: FtColors.background },
  content: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 14, color: FtColors.textMuted, marginBottom: 16, lineHeight: 20 },
  loader: { marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  kpi: {
    flexGrow: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.border,
  },
  kpiValue: { fontSize: 28, fontWeight: '700', color: FtColors.accent },
  kpiLabel: { marginTop: 6, fontSize: 13, color: FtColors.textMuted },
  navCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 16,
  },
  navCardTitle: { fontSize: 16, fontWeight: '700', color: FtColors.text, marginBottom: 6 },
  navCardSub: { fontSize: 14, color: FtColors.textMuted, lineHeight: 20 },
  signOut: { paddingVertical: 14, alignItems: 'center' },
  signOutText: { fontSize: 15, color: FtColors.textMuted, textDecorationLine: 'underline' },
});
