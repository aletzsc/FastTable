import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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

import { ComensalGreetingLine } from '@/components/comensal-greeting-line';
import { ReservationModal } from '@/components/reservation-modal';
import { Comensal } from '@/constants/theme-comensal';
import { useAuth } from '@/contexts/auth-context';
import { REALTIME_TABLES_SCREEN, useSupabaseRealtimeRefresh } from '@/hooks/use-supabase-realtime-refresh';
import { supabase } from '@/lib/supabase';
import { tableImageUrl } from '@/lib/table-image';

type EstadoMesa = 'libre' | 'ocupada' | 'reservada';

type Row = {
  id: string;
  codigo: string;
  capacidad: number;
  estado: EstadoMesa;
  nombreZona: string | null;
  descripcion_publica: string | null;
  imagen_url: string | null;
};

type MyReservation = {
  id: string;
  id_mesa: string;
  fecha_hora_reserva: string;
};

function statusLabel(s: EstadoMesa) {
  switch (s) {
    case 'libre':
      return 'Libre';
    case 'ocupada':
      return 'Ocupada';
    case 'reservada':
      return 'Reservada';
    default:
      return s;
  }
}

function formatRpcError(message: string): string {
  if (message.includes('debe_ser_futuro') || message.includes('time_must_be_future'))
    return 'La fecha y hora deben ser futuras.';
  if (
    message.includes('mesa_no_disponible') ||
    message.includes('table_not_available') ||
    message.includes('table_not_free')
  )
    return 'Esta mesa ya no está disponible.';
  if (message.includes('mesa_ya_reservada') || message.includes('table_has_active_reservation'))
    return 'Esta mesa ya tiene una reserva activa.';
  if (
    message.includes('usuario_ya_tiene_reserva') ||
    message.includes('user_has_active_reservation')
  )
    return 'Ya tienes una reserva activa. Cancélala antes de reservar otra mesa.';
  if (message.includes('no_autenticado') || message.includes('not_authenticated'))
    return 'Inicia sesión para reservar.';
  return message;
}

export default function TablesScreen() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'todas' | EstadoMesa>('todas');
  const [rows, setRows] = useState<Row[]>([]);
  const [mine, setMine] = useState<MyReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reserveTable, setReserveTable] = useState<Row | null>(null);

  const myByTableId = useMemo(() => {
    const m = new Map<string, MyReservation>();
    for (const r of mine) {
      m.set(r.id_mesa, r);
    }
    return m;
  }, [mine]);

  const loadMine = useCallback(async () => {
    if (!user?.id) {
      setMine([]);
      return;
    }
    const { data } = await supabase
      .from('reservas_mesa')
      .select('id, id_mesa, fecha_hora_reserva')
      .eq('id_usuario', user.id)
      .eq('ciclo', 'activa');
    setMine((data as MyReservation[]) ?? []);
  }, [user?.id]);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: qError } = await supabase
      .from('mesas')
      .select('id, codigo, capacidad, estado, descripcion_publica, imagen_url, zonas ( nombre )')
      .order('codigo');
    if (qError) {
      setError(qError.message);
      setRows([]);
      return;
    }
    const mapped: Row[] =
      data?.map((r) => {
        const z = r.zonas as { nombre: string } | { nombre: string }[] | null | undefined;
        const nombreZona =
          z == null ? null : Array.isArray(z) ? (z[0]?.nombre ?? null) : (z.nombre ?? null);
        return {
          id: r.id,
          codigo: r.codigo,
          capacidad: r.capacidad,
          estado: r.estado as EstadoMesa,
          nombreZona,
          descripcion_publica: r.descripcion_publica ?? null,
          imagen_url: r.imagen_url ?? null,
        };
      }) ?? [];
    setRows(mapped);
    await loadMine();
  }, [loadMine]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useSupabaseRealtimeRefresh(REALTIME_TABLES_SCREEN, load, true);

  const onReserveConfirm = async (scheduledAt: Date, partySize: number, note: string) => {
    if (!reserveTable) return;
    const { error: rpcError } = await supabase.rpc('crear_reserva_mesa', {
      p_id_mesa: reserveTable.id,
      p_fecha_hora: scheduledAt.toISOString(),
      p_personas_grupo: partySize,
      p_nota: note || null,
    });
    if (rpcError) {
      Alert.alert('Reserva', formatRpcError(rpcError.message));
      throw new Error(rpcError.message);
    }
    await load();
  };

  const onCancelReservation = (reservationId: string) => {
    Alert.alert('Cancelar reserva', '¿Seguro que quieres cancelar?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          const { error: rpcError } = await supabase.rpc('cancelar_reserva_mesa', {
            p_id_reserva: reservationId,
          });
          if (rpcError) {
            Alert.alert('Cancelar', formatRpcError(rpcError.message));
            return;
          }
          await load();
        },
      },
    ]);
  };

  const filtered = useMemo(() => {
    if (filter === 'todas') return rows;
    return rows.filter((t) => t.estado === filter);
  }, [rows, filter]);
  const hasActiveReservation = mine.length > 0;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Comensal.accent}
            colors={[Comensal.accent]}
          />
        }>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Salón</Text>
          <Text style={styles.heroTitle}>Mesas</Text>
          <Text style={styles.heroSub}>Elige una mesa libre y confirma día y hora.</Text>
          <ComensalGreetingLine style={styles.heroGreeting} />
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator color={Comensal.accent} style={styles.loader} />
        ) : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {!loading && !error && filtered.length === 0 ? (
          <Text style={styles.empty}>No hay mesas disponibles por ahora.</Text>
        ) : null}

        <View style={styles.filters}>
          {(['todas', 'libre', 'ocupada', 'reservada'] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.chip, filter === key && styles.chipOn]}>
              <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>
                {key === 'todas' ? 'Todas' : statusLabel(key)}
              </Text>
            </Pressable>
          ))}
        </View>

        {filtered.map((t) => {
          const myRes = myByTableId.get(t.id);
          return (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardAccent} />
              <View style={styles.cardInner}>
                <View style={styles.cardTop}>
                  <Text style={styles.tableId}>{t.codigo}</Text>
                  <View
                    style={[
                      styles.badge,
                      t.estado === 'libre' && styles.badgeOk,
                      t.estado === 'ocupada' && styles.badgeBusy,
                      t.estado === 'reservada' && styles.badgeHold,
                    ]}>
                    <Text
                      style={[
                        styles.badgeText,
                        t.estado === 'libre' && styles.badgeTxtOk,
                        t.estado === 'ocupada' && styles.badgeTxtBusy,
                        t.estado === 'reservada' && styles.badgeTxtHold,
                      ]}>
                      {statusLabel(t.estado)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {t.nombreZona ?? 'Sin zona'} · {t.capacidad} plazas
                </Text>
                <View style={styles.bottomRow}>
                  <Image
                    source={{ uri: tableImageUrl(t.codigo, t.imagen_url) }}
                    style={styles.tableThumb}
                    contentFit="cover"
                    transition={160}
                  />
                  <View style={styles.sidePanel}>
                    {myRes ? (
                      <View style={styles.resBox}>
                        <Text style={styles.resText}>
                          Tu reserva ·{' '}
                          {new Date(myRes.fecha_hora_reserva).toLocaleString('es', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                        <Pressable style={styles.cancelBtn} onPress={() => onCancelReservation(myRes.id)}>
                          <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.sideHint}>
                        {t.estado === 'libre'
                          ? hasActiveReservation
                            ? 'Ya tienes una reserva activa'
                            : 'Disponible para reservar'
                          : t.estado === 'ocupada'
                            ? 'Mesa ocupada en este momento'
                            : 'Mesa apartada temporalmente'}
                      </Text>
                    )}

                    {t.estado === 'libre' && user && !myRes && !hasActiveReservation ? (
                      <Pressable style={styles.reserveBtn} onPress={() => setReserveTable(t)}>
                        <Text style={styles.reserveBtnText}>Reservar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <ReservationModal
        visible={reserveTable != null}
        tableCode={reserveTable?.codigo ?? ''}
        tableHeroImageUrl={reserveTable?.imagen_url}
        tableDescription={reserveTable?.descripcion_publica}
        zoneName={reserveTable?.nombreZona}
        capacity={reserveTable?.capacidad}
        onClose={() => setReserveTable(null)}
        onConfirm={onReserveConfirm}
      />
    </>
  );
}

const mesaCardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      }
    : { elevation: 3 };

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Comensal.background },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  hero: { marginBottom: 20 },
  heroEyebrow: {
    fontSize: 11,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    color: Comensal.accentMuted,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: Comensal.text,
    letterSpacing: 0.8,
  },
  heroSub: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    color: Comensal.textMuted,
    maxWidth: 320,
  },
  heroGreeting: { marginTop: 10, marginBottom: 0 },
  loader: { marginVertical: 20 },
  err: { color: Comensal.danger, marginBottom: 12, fontSize: 14 },
  empty: { fontSize: 14, color: Comensal.textMuted, marginBottom: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: Comensal.radiusSm,
    borderWidth: 1,
    borderColor: Comensal.border,
    backgroundColor: Comensal.surfaceInput,
  },
  chipOn: {
    borderColor: Comensal.accent,
    backgroundColor: Comensal.chipSelectedBg,
  },
  chipText: { fontSize: 12, color: Comensal.textMuted, letterSpacing: 0.2, fontWeight: '600' },
  chipTextOn: { color: Comensal.text, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: Comensal.radiusMd,
    overflow: 'hidden',
    backgroundColor: Comensal.surfaceElevated,
    borderWidth: 1,
    borderColor: Comensal.border,
    ...mesaCardShadow,
  },
  cardAccent: {
    width: 2,
    backgroundColor: Comensal.accent,
    opacity: 0.85,
  },
  cardInner: { flex: 1, paddingVertical: 18, paddingHorizontal: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableId: { fontSize: 21, fontWeight: '800', color: Comensal.text, letterSpacing: 0.3 },
  badge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: Comensal.radiusSm },
  badgeOk: { backgroundColor: Comensal.badgeOkBg },
  badgeBusy: { backgroundColor: Comensal.badgeBusyBg },
  badgeHold: { backgroundColor: Comensal.badgeHoldBg },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  badgeTxtOk: { color: Comensal.success },
  badgeTxtBusy: { color: Comensal.danger },
  badgeTxtHold: { color: Comensal.warning },
  meta: { marginTop: 8, fontSize: 13, color: Comensal.textMuted },
  bottomRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  tableThumb: {
    width: 92,
    height: 92,
    borderRadius: Comensal.radiusSm,
    backgroundColor: Comensal.heroImgFallback,
  },
  sidePanel: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 86,
  },
  sideHint: {
    fontSize: 13,
    color: Comensal.textMuted,
    lineHeight: 18,
  },
  resBox: {
    flex: 1,
    justifyContent: 'center',
  },
  resText: { fontSize: 14, color: Comensal.text, fontWeight: '500', lineHeight: 20 },
  cancelBtn: { marginTop: 8, alignSelf: 'flex-start' },
  cancelBtnText: { fontSize: 13, color: Comensal.accent, fontWeight: '500' },
  reserveBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: Comensal.radiusSm,
    backgroundColor: Comensal.accent,
    alignItems: 'center',
  },
  reserveBtnText: { color: Comensal.onAccent, fontSize: 14, fontWeight: '800', letterSpacing: 0.35 },
});
