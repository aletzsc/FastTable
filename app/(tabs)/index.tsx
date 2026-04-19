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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.intro}>Disponibilidad de mesas y reservas.</Text>

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
              <View style={styles.cardTop}>
                <Text style={styles.tableId}>{t.codigo}</Text>
                <View
                  style={[
                    styles.badge,
                    t.estado === 'libre' && styles.badgeOk,
                    t.estado === 'ocupada' && styles.badgeBusy,
                    t.estado === 'reservada' && styles.badgeHold,
                  ]}>
                  <Text style={styles.badgeText}>{statusLabel(t.estado)}</Text>
                </View>
              </View>
              <Text style={styles.meta}>Zona: {t.nombreZona ?? '—'}</Text>
              <Text style={styles.meta}>Asientos: {t.capacidad}</Text>

              {myRes ? (
                <View style={styles.resBox}>
                  <Text style={styles.resText}>
                    Tu reserva:{' '}
                    {new Date(myRes.fecha_hora_reserva).toLocaleString('es', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Pressable style={styles.cancelBtn} onPress={() => onCancelReservation(myRes.id)}>
                    <Text style={styles.cancelBtnText}>Cancelar reserva</Text>
                  </Pressable>
                </View>
              ) : null}

              {t.estado === 'libre' && user ? (
                <Pressable style={styles.reserveBtn} onPress={() => setReserveTable(t)}>
                  <Text style={styles.reserveBtnText}>Reservar esta mesa</Text>
                </Pressable>
              ) : null}
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
  content: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 14, color: FtColors.textMuted, marginBottom: 16, lineHeight: 20 },
  loader: { marginVertical: 16 },
  err: { color: '#B91C1C', marginBottom: 12, fontSize: 14 },
  empty: { fontSize: 14, color: FtColors.textMuted, marginBottom: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: FtColors.border,
    backgroundColor: FtColors.surface,
  },
  chipOn: { borderColor: FtColors.accent, backgroundColor: '#FFF7ED' },
  chipText: { fontSize: 13, color: FtColors.text },
  chipTextOn: { color: FtColors.accent, fontWeight: '600' },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableId: { fontSize: 20, fontWeight: '700', color: FtColors.text },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  badgeOk: { backgroundColor: '#DCFCE7' },
  badgeBusy: { backgroundColor: '#FEE2E2' },
  badgeHold: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 12, fontWeight: '600', color: FtColors.text },
  meta: { marginTop: 6, fontSize: 14, color: FtColors.textMuted },
  resBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: FtColors.border,
  },
  resText: { fontSize: 14, color: FtColors.text, fontWeight: '600' },
  cancelBtn: { marginTop: 10, alignSelf: 'flex-start' },
  cancelBtnText: { fontSize: 14, color: '#B91C1C', fontWeight: '600' },
  reserveBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: FtColors.accent,
    alignItems: 'center',
  },
  reserveBtnText: { color: '#FFFBEB', fontSize: 15, fontWeight: '600' },
});
