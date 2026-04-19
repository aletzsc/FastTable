import { useCallback, useState } from 'react';
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
import { supabase } from '@/lib/supabase';

type EstadoMesa = 'libre' | 'ocupada' | 'reservada';

type ResRow = {
  id: string;
  id_usuario: string;
  fecha_hora_reserva: string;
  mesero_atender_a_partir_de: string;
  personas_grupo: number;
  nota: string | null;
  comensal_llego: boolean | null;
  ciclo: string;
  mesas: { id: string; codigo: string; estado: EstadoMesa } | null;
};

type TableRow = {
  id: string;
  codigo: string;
  estado: EstadoMesa;
};

function fmt(d: string) {
  return new Date(d).toLocaleString('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapWaiterErr(msg: string) {
  if (msg.includes('solo_personal') || msg.includes('staff_only')) return 'Sin permiso de personal.';
  if (msg.includes('ya_atendida') || msg.includes('already_resolved')) return 'Esta reserva ya fue atendida.';
  return msg;
}

export default function WorkerReservationsScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attention, setAttention] = useState<ResRow[]>([]);
  const [upcoming, setUpcoming] = useState<ResRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();

    const { data: resData } = await supabase
      .from('reservas_mesa')
      .select(
        'id, id_usuario, fecha_hora_reserva, mesero_atender_a_partir_de, personas_grupo, nota, comensal_llego, ciclo, mesas ( id, codigo, estado )',
      )
      .eq('ciclo', 'activa')
      .is('comensal_llego', null)
      .order('fecha_hora_reserva');

    const rows: ResRow[] = (resData ?? []).map((raw: Record<string, unknown>) => {
      const dt = raw.mesas as
        | { id: string; codigo: string; estado: EstadoMesa }
        | { id: string; codigo: string; estado: EstadoMesa }[]
        | null;
      const mesas = Array.isArray(dt) ? dt[0] ?? null : dt;
      return {
        id: raw.id as string,
        id_usuario: raw.id_usuario as string,
        fecha_hora_reserva: raw.fecha_hora_reserva as string,
        mesero_atender_a_partir_de: raw.mesero_atender_a_partir_de as string,
        personas_grupo: raw.personas_grupo as number,
        nota: (raw.nota as string | null) ?? null,
        comensal_llego: (raw.comensal_llego as boolean | null) ?? null,
        ciclo: raw.ciclo as string,
        mesas,
      };
    });
    const needAttention = rows.filter((r) => r.mesero_atender_a_partir_de <= nowIso);
    const soon = rows.filter((r) => r.mesero_atender_a_partir_de > nowIso);
    setAttention(needAttention);
    setUpcoming(soon);

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

    const { data: tdata } = await supabase.from('mesas').select('id, codigo, estado').order('codigo');
    setTables((tdata as TableRow[]) ?? []);
  }, []);

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

  const resolve = async (id: string, arrived: boolean) => {
    const { error } = await supabase.rpc('personal_resolver_reserva', {
      p_id_reserva: id,
      p_comensal_llego: arrived,
    });
    if (error) {
      Alert.alert('Atención', mapWaiterErr(error.message));
      return;
    }
    await load();
  };

  const setTableStatus = async (id: string, estado: EstadoMesa) => {
    const { error } = await supabase
      .from('mesas')
      .update({ estado, actualizado_en: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      Alert.alert('Mesa', error.message);
      return;
    }
    await load();
  };

  const statusLabel = useCallback((s: EstadoMesa) => {
    if (s === 'libre') return 'Libre';
    if (s === 'ocupada') return 'Ocupada';
    return 'Reservada';
  }, []);

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>← Volver al panel</Text>
      </Pressable>

      {loading && !refreshing ? <ActivityIndicator color={FtColors.accent} style={styles.loader} /> : null}

      <Text style={styles.h1}>Ir a atender</Text>
      <Text style={styles.sub}>
        Aparecen cuando pasaron 5 minutos desde la hora reservada. Confirma si el comensal llegó y el
        estado de la mesa.
      </Text>

      {attention.length === 0 ? (
        <Text style={styles.empty}>Nada pendiente en este momento.</Text>
      ) : (
        attention.map((r) => {
          const t = r.mesas;
          const code = t?.codigo ?? '—';
          const guest = names[r.id_usuario]?.trim() || 'Cliente';
          return (
            <View key={r.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                Mesa {code} · {guest}
              </Text>
              <Text style={styles.line}>Hora acordada: {fmt(r.fecha_hora_reserva)}</Text>
              <Text style={styles.line}>Personas: {r.personas_grupo}</Text>
              {r.nota ? <Text style={styles.line}>Nota: {r.nota}</Text> : null}
              <View style={styles.rowBtns}>
                <Pressable style={styles.btnOk} onPress={() => resolve(r.id, true)}>
                  <Text style={styles.btnOkText}>Llegó</Text>
                </Pressable>
                <Pressable style={styles.btnNo} onPress={() => resolve(r.id, false)}>
                  <Text style={styles.btnNoText}>No llegó</Text>
                </Pressable>
              </View>
              <Text style={styles.hintSmall}>
                «Llegó» deja la mesa ocupada. «No llegó» libera la mesa.
              </Text>
            </View>
          );
        })
      )}

      <Text style={[styles.h1, styles.mt]}>Próximas reservas</Text>
      {upcoming.length === 0 ? (
        <Text style={styles.empty}>No hay reservas próximas sin atender.</Text>
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
              <Text style={styles.waitUntil}>El aviso para ir a la mesa será después de esta hora.</Text>
            </View>
          );
        })
      )}

      <Text style={[styles.h1, styles.mt]}>Estado de mesas</Text>
      <Text style={styles.sub}>Marca libre u ocupada cuando lo necesites.</Text>

      {tables.map((t) => (
        <View key={t.id} style={styles.tableRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tableCode}>{t.codigo}</Text>
            <Text style={styles.tableStatus}>Ahora: {statusLabel(t.estado)}</Text>
          </View>
          <View style={styles.tableActions}>
            <Pressable style={styles.tbFree} onPress={() => setTableStatus(t.id, 'libre')}>
              <Text style={styles.tbFreeText}>Libre</Text>
            </Pressable>
            <Pressable style={styles.tbOcc} onPress={() => setTableStatus(t.id, 'ocupada')}>
              <Text style={styles.tbOccText}>Ocupada</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FtColors.background },
  scroll: { flex: 1, backgroundColor: FtColors.background },
  content: { padding: 16, paddingBottom: 40 },
  back: { marginBottom: 12 },
  backText: { fontSize: 15, color: FtColors.accent },
  loader: { marginBottom: 16 },
  h1: { fontSize: 18, fontWeight: '700', color: FtColors.text, marginBottom: 6 },
  sub: { fontSize: 13, color: FtColors.textMuted, lineHeight: 20, marginBottom: 12 },
  mt: { marginTop: 20 },
  empty: { fontSize: 14, color: FtColors.textMuted, marginBottom: 12 },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.accent,
    marginBottom: 12,
  },
  cardMuted: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: FtColors.text, marginBottom: 8 },
  line: { fontSize: 14, color: FtColors.textMuted, marginBottom: 4 },
  waitUntil: { fontSize: 12, color: FtColors.textMuted, marginTop: 6, fontStyle: 'italic' },
  rowBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btnOk: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: FtColors.success,
    alignItems: 'center',
  },
  btnOkText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnNo: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#E7E5E4',
    alignItems: 'center',
  },
  btnNoText: { color: FtColors.text, fontWeight: '700', fontSize: 15 },
  hintSmall: { fontSize: 11, color: FtColors.textMuted, marginTop: 10, lineHeight: 16 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: FtColors.border,
  },
  tableCode: { fontSize: 17, fontWeight: '700', color: FtColors.text },
  tableStatus: { fontSize: 13, color: FtColors.textMuted, marginTop: 2 },
  tableActions: { flexDirection: 'row', gap: 8 },
  tbFree: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: FtColors.border,
    backgroundColor: FtColors.background,
  },
  tbFreeText: { fontSize: 13, fontWeight: '600', color: FtColors.text },
  tbOcc: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: FtColors.accent,
  },
  tbOccText: { fontSize: 13, fontWeight: '600', color: '#FFFBEB' },
});
