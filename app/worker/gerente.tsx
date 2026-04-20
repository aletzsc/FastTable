import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import { REALTIME_GERENTE, useSupabaseRealtimeRefresh } from '@/hooks/use-supabase-realtime-refresh';
import { formatPriceFromCents } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type GerenteStats = {
  total_centavos: number;
  plato_top: { nombre: string; unidades: number } | null;
  equipo: { nombre: string; rol: string }[];
  no_disponibles: { nombre: string }[];
};

type DailyMetric = { label: string; value: number };
type LiveSnapshot = {
  mesasLibres: number;
  mesasOcupadas: number;
  mesasReservadas: number;
  solicitudesAbiertas: number;
  reservasActivas: number;
  pedidosPendientes: number;
};

function priceFromItem(raw: unknown): number {
  if (raw == null) return 0;
  const z = Array.isArray(raw) ? raw[0] : raw;
  return (z as { precio_centavos?: number })?.precio_centavos ?? 0;
}

const cardShadow =
  Platform.OS === 'ios'
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 }
    : { elevation: 4 };

function roleLabel(rol: string): string {
  switch (rol) {
    case 'anfitrion':
      return 'Anfitrión';
    case 'mesero':
      return 'Mesero';
    case 'gerente':
      return 'Gerente';
    case 'cocina':
      return 'Cocina';
    default:
      return rol;
  }
}

export default function GerenteScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading, signOut } = useAuth();
  const [stats, setStats] = useState<GerenteStats | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyMetric[]>([]);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);

    const [statsRes, pedidosRes, mesasRes, solRes, reservasRes, cocinaPendRes] = await Promise.all([
      supabase.rpc('gerente_dashboard_stats'),
      supabase
        .from('pedidos_cocina')
        .select('creado_en, cantidad, items_menu ( precio_centavos )')
        .gte('creado_en', weekStart.toISOString())
        .order('creado_en', { ascending: true }),
      supabase.from('mesas').select('estado'),
      supabase
        .from('solicitudes_servicio')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'abierta'),
      supabase
        .from('reservas_mesa')
        .select('*', { count: 'exact', head: true })
        .eq('ciclo', 'activa'),
      supabase
        .from('pedidos_cocina')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente'),
    ]);

    const { data, error } = statsRes;
    if (error) {
      if (!silent) {
        if (error.message.includes('solo_gerente')) {
          Alert.alert('Acceso', 'Solo el gerente puede ver este panel.');
        } else {
          Alert.alert('Panel', error.message);
        }
      }
      setStats(null);
      return;
    }
    setStats(data as GerenteStats);

    const byDay = new Map<string, number>();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, 0);
    }

    for (const row of pedidosRes.data ?? []) {
      const key = new Date(row.creado_en).toISOString().slice(0, 10);
      if (!byDay.has(key)) continue;
      const subtotal = row.cantidad * priceFromItem(row.items_menu);
      byDay.set(key, (byDay.get(key) ?? 0) + subtotal);
    }
    setDailyRevenue(
      [...byDay.entries()].map(([isoDay, total]) => {
        const d = new Date(`${isoDay}T00:00:00`);
        return { label: d.toLocaleDateString('es', { weekday: 'short' }), value: total };
      }),
    );

    const mesas = mesasRes.data ?? [];
    const libres = mesas.filter((m) => m.estado === 'libre').length;
    const ocupadas = mesas.filter((m) => m.estado === 'ocupada').length;
    const reservadas = mesas.filter((m) => m.estado === 'reservada').length;
    setSnapshot({
      mesasLibres: libres,
      mesasOcupadas: ocupadas,
      mesasReservadas: reservadas,
      solicitudesAbiertas: solRes.count ?? 0,
      reservasActivas: reservasRes.count ?? 0,
      pedidosPendientes: cocinaPendRes.count ?? 0,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!session || !staffMember || staffMember.rol !== 'gerente') return;
      let a = true;
      setLoading(true);
      load().finally(() => {
        if (a) setLoading(false);
      });
      return () => {
        a = false;
      };
    }, [session, staffMember, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const reloadRealtime = useCallback(() => load({ silent: true }), [load]);

  useSupabaseRealtimeRefresh(
    REALTIME_GERENTE,
    reloadRealtime,
    !!session && !!staffMember && staffMember.rol === 'gerente',
  );

  if (authLoading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={FtColors.accent} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/" />;
  }

  if (!staffMember) {
    return <Redirect href="/worker/login" />;
  }

  if (staffMember.rol !== 'gerente') {
    return <Redirect href="/worker" />;
  }

  const maxRevenue = Math.max(1, ...dailyRevenue.map((d) => d.value));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FtColors.accent} />
        }>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Gerencia</Text>
          <Text style={styles.heroTitle}>{staffMember.nombre_visible}</Text>
          <Text style={styles.heroSub}>Indicadores del restaurante (se actualizan solos al cambiar pedidos o la carta).</Text>
        </View>

        {loading && !refreshing ? <ActivityIndicator color={FtColors.accent} style={styles.loader} /> : null}

        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHead}>
            <Ionicons name="cash-outline" size={22} color={FtColors.accent} />
            <Text style={styles.cardTitle}>Ingresos (pedidos registrados)</Text>
          </View>
          <Text style={styles.bigNumber}>
            {stats != null ? formatPriceFromCents(stats.total_centavos) : '—'}
          </Text>
          <Text style={styles.cardHint}>Suma histórica de líneas en cocina × precio actual del ítem.</Text>
        </View>

        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHead}>
            <Ionicons name="trophy-outline" size={22} color={FtColors.warning} />
            <Text style={styles.cardTitle}>Platillo más pedido</Text>
          </View>
          {stats?.plato_top?.nombre ? (
            <>
              <Text style={styles.emphasis}>{stats.plato_top.nombre}</Text>
              <Text style={styles.cardHint}>
                {stats.plato_top.unidades} unidades en total (todas las mesas).
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>Aún no hay pedidos suficientes.</Text>
          )}
        </View>

        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHead}>
            <Ionicons name="bar-chart-outline" size={22} color={FtColors.accent} />
            <Text style={styles.cardTitle}>Ingresos últimos 7 días</Text>
          </View>
          <View style={styles.chartRow}>
            {dailyRevenue.map((d) => (
              <View key={d.label} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: `${Math.max(6, (d.value / maxRevenue) * 100)}%` }]} />
                </View>
                <Text style={styles.barLabel}>{d.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.cardHint}>Comparativa diaria para detectar picos de demanda.</Text>
        </View>

        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHead}>
            <Ionicons name="pulse-outline" size={22} color={FtColors.success} />
            <Text style={styles.cardTitle}>Estado operativo en vivo</Text>
          </View>
          <View style={styles.metricsGrid}>
            <View style={styles.metricPill}>
              <Text style={styles.metricValue}>{snapshot?.mesasLibres ?? '—'}</Text>
              <Text style={styles.metricLabel}>Mesas libres</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricValue}>{snapshot?.mesasOcupadas ?? '—'}</Text>
              <Text style={styles.metricLabel}>Mesas ocupadas</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricValue}>{snapshot?.mesasReservadas ?? '—'}</Text>
              <Text style={styles.metricLabel}>Mesas reservadas</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricValue}>{snapshot?.solicitudesAbiertas ?? '—'}</Text>
              <Text style={styles.metricLabel}>Solicitudes abiertas</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricValue}>{snapshot?.reservasActivas ?? '—'}</Text>
              <Text style={styles.metricLabel}>Reservas activas</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricValue}>{snapshot?.pedidosPendientes ?? '—'}</Text>
              <Text style={styles.metricLabel}>Pedidos pendientes</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHead}>
            <Ionicons name="people-outline" size={22} color={FtColors.success} />
            <Text style={styles.cardTitle}>Equipo (personal activo)</Text>
          </View>
          <Text style={styles.cardHint}>
            Listado de fichas activas en el sistema. La “sesión abierta” en el móvil no se registra aquí; esto
            refleja quién está dado de alta como personal.
          </Text>
          {(stats?.equipo ?? []).length === 0 ? (
            <Text style={styles.muted}>Sin registros.</Text>
          ) : (
            stats!.equipo.map((p, i) => (
              <View key={`${p.nombre}-${i}`} style={styles.equipoRow}>
                <Text style={styles.equipoName}>{p.nombre}</Text>
                <Text style={styles.equipoRol}>{roleLabel(p.rol)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHead}>
            <Ionicons name="close-circle-outline" size={22} color={FtColors.danger} />
            <Text style={styles.cardTitle}>Platos no disponibles</Text>
          </View>
          {(stats?.no_disponibles ?? []).length === 0 ? (
            <Text style={styles.muted}>Todo el menú está disponible para comensales.</Text>
          ) : (
            stats!.no_disponibles.map((it, i) => (
              <Text key={`${it.nombre}-${i}`} style={styles.listItem}>
                · {it.nombre}
              </Text>
            ))
          )}
        </View>

        <Pressable style={styles.linkKitchen} onPress={() => router.push('/worker/kitchen')}>
          <Ionicons name="restaurant-outline" size={18} color={FtColors.accent} />
          <Text style={styles.linkKitchenText}>Abrir cocina (mismo acceso que gerente)</Text>
          <Ionicons name="chevron-forward" size={18} color={FtColors.textMuted} />
        </Pressable>

        <Pressable style={styles.signOut} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FtColors.background },
  boot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FtColors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  loader: { marginVertical: 16 },
  hero: { marginBottom: 18 },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: FtColors.accentMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: FtColors.text, marginTop: 4 },
  heroSub: { fontSize: 14, color: FtColors.textMuted, marginTop: 6, lineHeight: 20 },
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 16,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: FtColors.text, flex: 1 },
  bigNumber: { fontSize: 28, fontWeight: '800', color: FtColors.accent, letterSpacing: 0.5 },
  emphasis: { fontSize: 18, fontWeight: '700', color: FtColors.text },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: {
    width: '100%',
    height: 86,
    borderRadius: 10,
    backgroundColor: FtColors.surface,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
  },
  barFill: {
    width: '100%',
    backgroundColor: FtColors.accent,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  barLabel: { marginTop: 6, fontSize: 11, color: FtColors.textMuted, textTransform: 'capitalize' },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  metricPill: {
    width: '31%',
    minWidth: 96,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
  },
  metricValue: { fontSize: 18, fontWeight: '800', color: FtColors.text },
  metricLabel: { marginTop: 2, fontSize: 11, color: FtColors.textMuted, lineHeight: 14 },
  cardHint: { fontSize: 12, color: FtColors.textMuted, marginTop: 8, lineHeight: 18 },
  muted: { fontSize: 14, color: FtColors.textFaint },
  equipoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.border,
  },
  equipoName: { fontSize: 15, fontWeight: '600', color: FtColors.text, flex: 1 },
  equipoRol: { fontSize: 13, color: FtColors.textMuted },
  listItem: { fontSize: 14, color: FtColors.text, marginTop: 6, lineHeight: 22 },
  linkKitchen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  linkKitchenText: { flex: 1, fontSize: 15, color: FtColors.accent, fontWeight: '600' },
  signOut: { paddingVertical: 16, alignItems: 'center' },
  signOutText: { fontSize: 15, color: FtColors.textFaint, textDecorationLine: 'underline' },
});
