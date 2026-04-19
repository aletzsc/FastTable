import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ReservationModal } from '@/components/reservation-modal';
import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import { supabase } from '@/lib/supabase';

type EstadoMesa = 'libre' | 'ocupada' | 'reservada';

type Row = {
  id: string;
  codigo: string;
  capacidad: number;
  estado: EstadoMesa;
  nombreZona: string | null;
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
      .select('id, codigo, capacidad, estado, zonas ( nombre )')
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

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={FtColors.accent}
            colors={[FtColors.accent]}
          />
        }>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Salón</Text>
          <Text style={styles.heroTitle}>Mesas</Text>
          <Text style={styles.heroSub}>Elige una mesa libre y confirma día y hora.</Text>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator color={FtColors.accent} style={styles.loader} />
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
                ) : null}

                {t.estado === 'libre' && user ? (
                  <Pressable style={styles.reserveBtn} onPress={() => setReserveTable(t)}>
                    <Text style={styles.reserveBtnText}>Reservar</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <ReservationModal
        visible={reserveTable != null}
        tableCode={reserveTable?.codigo ?? ''}
        onClose={() => setReserveTable(null)}
        onConfirm={onReserveConfirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: FtColors.background },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  hero: { marginBottom: 22 },
  heroEyebrow: {
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: FtColors.accentMuted,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '300',
    color: FtColors.text,
    letterSpacing: 1,
  },
  heroSub: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: FtColors.textMuted,
    maxWidth: 300,
  },
  loader: { marginVertical: 20 },
  err: { color: FtColors.danger, marginBottom: 12, fontSize: 14 },
  empty: { fontSize: 14, color: FtColors.textMuted, marginBottom: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    backgroundColor: 'transparent',
  },
  chipOn: {
    borderColor: FtColors.accent,
    backgroundColor: 'rgba(198, 168, 92, 0.08)',
  },
  chipText: { fontSize: 12, color: FtColors.textMuted, letterSpacing: 0.2 },
  chipTextOn: { color: FtColors.accent, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
  },
  cardAccent: {
    width: 3,
    backgroundColor: FtColors.accent,
    opacity: 0.65,
  },
  cardInner: { flex: 1, paddingVertical: 16, paddingHorizontal: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableId: { fontSize: 20, fontWeight: '500', color: FtColors.text, letterSpacing: 0.5 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  badgeOk: { backgroundColor: 'rgba(125, 206, 160, 0.12)' },
  badgeBusy: { backgroundColor: 'rgba(224, 112, 110, 0.12)' },
  badgeHold: { backgroundColor: 'rgba(216, 181, 106, 0.14)' },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  badgeTxtOk: { color: FtColors.success },
  badgeTxtBusy: { color: FtColors.danger },
  badgeTxtHold: { color: FtColors.warning },
  meta: { marginTop: 8, fontSize: 13, color: FtColors.textFaint },
  resBox: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FtColors.border,
  },
  resText: { fontSize: 14, color: FtColors.text, fontWeight: '400' },
  cancelBtn: { marginTop: 10, alignSelf: 'flex-start' },
  cancelBtnText: { fontSize: 13, color: FtColors.accent, fontWeight: '500' },
  reserveBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: FtColors.accent,
    alignItems: 'center',
  },
  reserveBtnText: { color: FtColors.onAccent, fontSize: 14, fontWeight: '600', letterSpacing: 0.4 },
});
