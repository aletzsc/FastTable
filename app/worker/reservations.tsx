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
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import {
  canShowNoShow,
  mapReservaRows,
  mapStaffRpcError,
  splitReservationsByTime,
  type ReservaStaffRow,
} from '@/lib/worker-reservations-logic';
import { REALTIME_WORKER_RESERVATIONS, useSupabaseRealtimeRefresh } from '@/hooks/use-supabase-realtime-refresh';
import { supabase } from '@/lib/supabase';

function fmt(d: string) {
  return new Date(d).toLocaleString('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WorkerReservationsScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reservas, setReservas] = useState<ReservaStaffRow[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    const { data: resData } = await supabase
      .from('reservas_mesa')
      .select(
        'id, id_usuario, fecha_hora_reserva, mesero_atender_a_partir_de, personas_grupo, nota, comensal_llego, ciclo, mesas ( id, codigo, estado, id_personal_atendiendo )',
      )
      .eq('ciclo', 'activa')
      .is('comensal_llego', null)
      .order('fecha_hora_reserva');

    const rows = mapReservaRows((resData ?? []) as Record<string, unknown>[]);
    setReservas(rows);

    const userIds = [...new Set(rows.map((r) => r.id_usuario))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('perfiles').select('id, nombre_completo').in('id', userIds);
      const m: Record<string, string | null> = {};
      for (const p of profs ?? []) {
        m[p.id] = p.nombre_completo;
      }
      setNames(m);
    } else {
      setNames({});
    }
  }, []);

  const { upcoming, attend } = useMemo(
    () => splitReservationsByTime(reservas, new Date()),
    [reservas],
  );

  useFocusEffect(
    useCallback(() => {
      if (!session || !staffMember) return;
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

  useSupabaseRealtimeRefresh(
    REALTIME_WORKER_RESERVATIONS,
    load,
    !!session && !!staffMember && (staffMember.rol === 'mesero' || staffMember.rol === 'anfitrion'),
  );

  const resolve = async (id: string, arrived: boolean) => {
    const { error } = await supabase.rpc('personal_resolver_reserva', {
      p_id_reserva: id,
      p_comensal_llego: arrived,
    });
    if (error) {
      Alert.alert('Atención', mapStaffRpcError(error.message));
      return;
    }
    await load();
  };

  const onAtenderCompleta = async (id: string) => {
    const { error } = await supabase.rpc('personal_atender_reserva_completa', { p_id_reserva: id });
    if (error) {
      Alert.alert('Atender', mapStaffRpcError(error.message));
      return;
    }
    await load();
  };

  if (authLoading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={FtColors.accent} />
      </View>
    );
  }

  if (!session || !staffMember) {
    return <Redirect href="/worker/login" />;
  }

  return (
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
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>← Volver al panel</Text>
      </Pressable>

      {loading && !refreshing ? <ActivityIndicator color={FtColors.accent} style={styles.loader} /> : null}

      <Text style={styles.h1}>Reservas a atender</Text>
      <Text style={styles.sub}>
        “Atender” confirma llegada, te asigna la mesa y la marca ocupada. Abajo: comensal no llegó (tras la ventana de 5
        min).
      </Text>

      {attend.length === 0 ? (
        <Text style={styles.empty}>Nada pendiente en este momento.</Text>
      ) : (
        attend.map((r) => {
          const t = r.mesas;
          const code = t?.codigo ?? '—';
          const guest = names[r.id_usuario]?.trim() || 'Cliente';
          const other = t?.id_personal_atendiendo != null && t.id_personal_atendiendo !== staffMember.id;
          const showNoShow = canShowNoShow(r, new Date());

          return (
            <View key={r.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                Mesa {code} · {guest}
              </Text>
              <Text style={styles.line}>Hora acordada: {fmt(r.fecha_hora_reserva)}</Text>
              <Text style={styles.line}>Personas: {r.personas_grupo}</Text>
              {r.nota ? <Text style={styles.line}>Nota: {r.nota}</Text> : null}
              {other ? (
                <Text style={styles.warn}>Otro mesero está atendiendo esta mesa.</Text>
              ) : (
                <>
                  <Pressable style={styles.btnOk} onPress={() => onAtenderCompleta(r.id)}>
                    <Text style={styles.btnOkText}>Atender</Text>
                  </Pressable>
                  {showNoShow ? (
                    <Pressable style={styles.btnNo} onPress={() => resolve(r.id, false)}>
                      <Text style={styles.btnNoText}>Comensal no llegó</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.hintSmall}>
                      Tras 5 min desde la hora acordada podrás marcar “Comensal no llegó”.
                    </Text>
                  )}
                </>
              )}
            </View>
          );
        })
      )}

      <Text style={[styles.h1, styles.mt]}>Próximas reservas</Text>
      {upcoming.length === 0 ? (
        <Text style={styles.empty}>No hay reservas próximas.</Text>
      ) : (
        upcoming.map((r) => {
          const t = r.mesas;
          const guest = names[r.id_usuario]?.trim() || 'Cliente';
          return (
            <View key={r.id} style={styles.cardMuted}>
              <Text style={styles.cardTitle}>
                Mesa {t?.codigo ?? '—'} · {guest}
              </Text>
              <Text style={styles.line}>
                {fmt(r.fecha_hora_reserva)} · {r.personas_grupo} pers.
              </Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FtColors.background },
  scroll: { flex: 1, backgroundColor: FtColors.background },
  content: { padding: 18, paddingBottom: 44 },
  back: { marginBottom: 12 },
  backText: { fontSize: 15, color: FtColors.accent },
  loader: { marginBottom: 16 },
  h1: { fontSize: 19, fontWeight: '800', color: FtColors.text, marginBottom: 6 },
  sub: { fontSize: 13, color: FtColors.textMuted, lineHeight: 20, marginBottom: 12 },
  mt: { marginTop: 20 },
  empty: { fontSize: 14, color: FtColors.textMuted, marginBottom: 12 },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 12,
  },
  cardMuted: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: FtColors.text, marginBottom: 8 },
  line: { fontSize: 14, color: FtColors.textMuted, marginBottom: 4 },
  warn: { fontSize: 13, color: FtColors.warning, marginTop: 8 },
  btnOk: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: FtColors.success,
    alignItems: 'center',
  },
  btnOkText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnNo: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.border,
    alignItems: 'center',
  },
  btnNoText: { color: FtColors.text, fontWeight: '700', fontSize: 14 },
  hintSmall: { fontSize: 11, color: FtColors.textMuted, marginTop: 10, lineHeight: 16 },
});
