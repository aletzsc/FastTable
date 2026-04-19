import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
} from '@/lib/worker-reservations-logic';
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

type SolicitudRow = {
  id: string;
  mensaje: string | null;
  creado_en: string;
  mesas: { codigo: string } | { codigo: string }[] | null;
};

type MesaAsignada = {
  id: string;
  codigo: string;
  estado: 'libre' | 'ocupada' | 'reservada';
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

function solicitudCodigo(m: SolicitudRow['mesas']): string {
  if (m == null) return '—';
  const z = Array.isArray(m) ? m[0] : m;
  return z?.codigo ?? '—';
}

export default function WorkerDashboardScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading, signOut } = useAuth();
  const [available, setAvailable] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [openReqCount, setOpenReqCount] = useState<number | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudRow[]>([]);
  const [solModal, setSolModal] = useState(false);
  const [reservas, setReservas] = useState<ReservaStaffRow[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [myMesas, setMyMesas] = useState<MesaAsignada[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!staffMember?.id) return;
    const now = new Date();

    const [tAvail, tWait, tSol, resData, mine] = await Promise.all([
      supabase.from('mesas').select('*', { count: 'exact', head: true }).eq('estado', 'libre'),
      supabase.from('fila_espera').select('*', { count: 'exact', head: true }).eq('estado', 'esperando'),
      supabase
        .from('solicitudes_servicio')
        .select('id, mensaje, creado_en, mesas ( codigo )')
        .eq('estado', 'abierta')
        .order('creado_en', { ascending: true }),
      supabase
        .from('reservas_mesa')
        .select(
          'id, id_usuario, fecha_hora_reserva, mesero_atender_a_partir_de, personas_grupo, nota, comensal_llego, ciclo, mesas ( id, codigo, estado, id_personal_atendiendo )',
        )
        .eq('ciclo', 'activa')
        .is('comensal_llego', null)
        .order('fecha_hora_reserva'),
      supabase
        .from('mesas')
        .select('id, codigo, estado')
        .eq('id_personal_atendiendo', staffMember.id)
        .order('codigo'),
    ]);

    setAvailable(tAvail.count ?? 0);
    setWaiting(tWait.count ?? 0);
    setOpenReqCount(tSol.data?.length ?? 0);
    setSolicitudes((tSol.data as SolicitudRow[]) ?? []);

    const rows = mapReservaRows((resData.data ?? []) as Record<string, unknown>[]);
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

    setMyMesas((mine.data as MesaAsignada[]) ?? []);
  }, [staffMember?.id]);

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

  const { upcoming, attend } = useMemo(() => splitReservationsByTime(reservas, new Date()), [reservas]);

  const onDeleteSolicitud = async (id: string) => {
    const { error } = await supabase.from('solicitudes_servicio').delete().eq('id', id);
    if (error) {
      Alert.alert('Solicitud', error.message);
      return;
    }
    await load();
  };

  const resolve = async (id: string, arrived: boolean) => {
    const { error } = await supabase.rpc('personal_resolver_reserva', {
      p_id_reserva: id,
      p_comensal_llego: arrived,
    });
    if (error) {
      Alert.alert('Reserva', mapStaffRpcError(error.message));
      return;
    }
    await load();
  };

  const onAtender = async (id: string) => {
    const { error } = await supabase.rpc('personal_atender_reserva', { p_id_reserva: id });
    if (error) {
      Alert.alert('Atender', mapStaffRpcError(error.message));
      return;
    }
    await load();
  };

  const onDesasignar = async (mesaId: string) => {
    const { error } = await supabase.rpc('personal_desasignar_mesa', { p_id_mesa: mesaId });
    if (error) {
      Alert.alert('Mesa', mapStaffRpcError(error.message));
      return;
    }
    await load();
  };

  const onLiberarOcupada = async (mesaId: string) => {
    const { error } = await supabase.rpc('personal_liberar_mesa_atendida', { p_id_mesa: mesaId });
    if (error) {
      Alert.alert('Mesa', mapStaffRpcError(error.message));
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

  if (!session) {
    return <Redirect href="/" />;
  }

  if (!staffMember) {
    return <Redirect href="/worker/login" />;
  }

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
        <Text style={styles.intro}>
          {roleLabel(staffMember.rol)} · {staffMember.nombre_visible}
        </Text>

        {loading && !refreshing ? <ActivityIndicator color={FtColors.accent} style={styles.loader} /> : null}

        <View style={styles.grid}>
          <View style={styles.kpi}>
            <Text style={styles.kpiValue}>{available ?? '—'}</Text>
            <Text style={styles.kpiLabel}>Mesas disponibles</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiValue}>{waiting ?? '—'}</Text>
            <Text style={styles.kpiLabel}>Personas en fila</Text>
          </View>
          <Pressable style={styles.kpi} onPress={() => setSolModal(true)}>
            <Text style={styles.kpiValue}>{openReqCount ?? '—'}</Text>
            <Text style={styles.kpiLabel}>Solicitudes abiertas</Text>
            <Text style={styles.kpiHint}>Toca para ver</Text>
          </Pressable>
          <View style={styles.kpi}>
            <Text style={styles.kpiValue}>{attend.length}</Text>
            <Text style={styles.kpiLabel}>Por atender</Text>
          </View>
        </View>

        {myMesas.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.h1}>Mis mesas</Text>
            <Text style={styles.sub}>Asignadas a ti hasta que liberes o desasignes.</Text>
            {myMesas.map((m) => (
              <View key={m.id} style={styles.cardMuted}>
                <Text style={styles.cardTitle}>
                  {m.codigo} · {m.estado === 'reservada' ? 'Reservada' : 'Ocupada'}
                </Text>
                {m.estado === 'reservada' ? (
                  <Pressable style={styles.btnGhost} onPress={() => onDesasignar(m.id)}>
                    <Text style={styles.btnGhostText}>Dejar de atender</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.btnPrimary} onPress={() => onLiberarOcupada(m.id)}>
                    <Text style={styles.btnPrimaryText}>Mesa desocupada</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.h1}>Ir a atender</Text>
          <Text style={styles.sub}>
            Desde la hora acordada puedes tomar la mesa, confirmar si el comensal llegó o no (tras 5 minutos desde
            esa hora).
          </Text>
          {attend.length === 0 ? (
            <Text style={styles.empty}>Nada pendiente en este momento.</Text>
          ) : (
            attend.map((r) => {
              const t = r.mesas;
              const code = t?.codigo ?? '—';
              const guest = names[r.id_usuario]?.trim() || 'Cliente';
              const other =
                t?.id_personal_atendiendo != null && t.id_personal_atendiendo !== staffMember.id;
              const mine = t?.id_personal_atendiendo === staffMember.id;
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
                      <View style={styles.rowBtns}>
                        <Pressable
                          style={[styles.btnSecondary, mine && styles.btnSecondaryOn]}
                          onPress={() => onAtender(r.id)}
                          disabled={other}>
                          <Text style={styles.btnSecondaryText}>{mine ? 'Atendiendo' : 'Atender'}</Text>
                        </Pressable>
                        <Pressable style={styles.btnOk} onPress={() => resolve(r.id, true)}>
                          <Text style={styles.btnOkText}>El comensal llegó</Text>
                        </Pressable>
                      </View>
                      {showNoShow ? (
                        <Pressable style={styles.btnNo} onPress={() => resolve(r.id, false)}>
                          <Text style={styles.btnNoText}>Comensal no llegó</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.hintSmall}>
                          A partir de 5 min después de la hora acordada podrás marcar “Comensal no llegó”.
                        </Text>
                      )}
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.h1}>Próximas reservas</Text>
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
        </View>

        <Pressable style={styles.navLink} onPress={() => router.push('/worker/reservations')}>
          <Text style={styles.navLinkText}>Ajustes de mesas y vista detallada →</Text>
        </Pressable>

        <Pressable style={styles.signOut} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={solModal} animationType="slide" transparent onRequestClose={() => setSolModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSolModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Solicitudes abiertas</Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {solicitudes.length === 0 ? (
                <Text style={styles.empty}>No hay solicitudes.</Text>
              ) : (
                solicitudes.map((s) => (
                  <View key={s.id} style={styles.solRow}>
                    <Text style={styles.solCode}>Mesa {solicitudCodigo(s.mesas)}</Text>
                    <Text style={styles.solMsg}>{s.mensaje?.trim() || '(Sin mensaje)'}</Text>
                    <Pressable
                      style={styles.btnPrimary}
                      onPress={() => {
                        Alert.alert('Marcar atendida', '¿Eliminar esta solicitud?', [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Atendida',
                            onPress: async () => {
                              await onDeleteSolicitud(s.id);
                            },
                          },
                        ]);
                      }}>
                      <Text style={styles.btnPrimaryText}>Marcar como atendida</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setSolModal(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FtColors.background },
  scroll: { flex: 1, backgroundColor: FtColors.background },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 14, color: FtColors.textMuted, marginBottom: 16, lineHeight: 20 },
  loader: { marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  kpi: {
    flexGrow: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 14,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
  },
  kpiValue: { fontSize: 28, fontWeight: '700', color: FtColors.accent },
  kpiLabel: { marginTop: 6, fontSize: 13, color: FtColors.textMuted },
  kpiHint: { marginTop: 4, fontSize: 11, color: FtColors.accentMuted },
  section: { marginBottom: 20 },
  h1: { fontSize: 18, fontWeight: '700', color: FtColors.text, marginBottom: 6 },
  sub: { fontSize: 13, color: FtColors.textMuted, lineHeight: 20, marginBottom: 12 },
  empty: { fontSize: 14, color: FtColors.textMuted, marginBottom: 12 },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.accent,
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
  cardTitle: { fontSize: 16, fontWeight: '700', color: FtColors.text, marginBottom: 8 },
  line: { fontSize: 14, color: FtColors.textMuted, marginBottom: 4 },
  warn: { fontSize: 13, color: FtColors.warning, marginTop: 8 },
  rowBtns: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: FtColors.border,
    backgroundColor: FtColors.surface,
  },
  btnSecondaryOn: { borderColor: FtColors.accent },
  btnSecondaryText: { fontSize: 14, fontWeight: '600', color: FtColors.text },
  btnOk: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: FtColors.success,
    alignItems: 'center',
  },
  btnOkText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnNo: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.border,
    alignItems: 'center',
  },
  btnNoText: { color: FtColors.text, fontWeight: '700', fontSize: 14 },
  btnPrimary: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: FtColors.accent,
    alignItems: 'center',
  },
  btnPrimaryText: { color: FtColors.onAccent, fontWeight: '600', fontSize: 15 },
  btnGhost: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnGhostText: { fontSize: 14, color: FtColors.accent, fontWeight: '600' },
  hintSmall: { fontSize: 11, color: FtColors.textMuted, marginTop: 10, lineHeight: 16 },
  navLink: { paddingVertical: 12, marginBottom: 8 },
  navLinkText: { fontSize: 14, color: FtColors.accent },
  signOut: { paddingVertical: 14, alignItems: 'center' },
  signOutText: { fontSize: 15, color: FtColors.textMuted, textDecorationLine: 'underline' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: FtColors.surfaceElevated,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 16,
    maxHeight: '80%',
  },
  modalScroll: { maxHeight: 420 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: FtColors.text, marginBottom: 16 },
  solRow: {
    marginBottom: 18,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.border,
  },
  solCode: { fontSize: 16, fontWeight: '700', color: FtColors.text, marginBottom: 6 },
  solMsg: { fontSize: 14, color: FtColors.textMuted, marginBottom: 12, lineHeight: 20 },
  modalClose: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 16, color: FtColors.textMuted },
});
