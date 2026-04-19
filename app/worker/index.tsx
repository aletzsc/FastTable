import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import {
  canShowNoShow,
  mapReservaRows,
  mapStaffRpcError,
  splitReservationsByTime,
  type ReservaStaffRow,
} from '@/lib/worker-reservations-logic';
import { REALTIME_WORKER_DASHBOARD, useSupabaseRealtimeRefresh } from '@/hooks/use-supabase-realtime-refresh';
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

type MesaToggle = {
  id: string;
  codigo: string;
  estado: 'libre' | 'ocupada' | 'reservada';
  id_personal_atendiendo: string | null;
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

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      }
    : { elevation: 6 };

export default function WorkerDashboardScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading, signOut } = useAuth();
  const [available, setAvailable] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [openReqCount, setOpenReqCount] = useState<number | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudRow[]>([]);
  const [solModal, setSolModal] = useState(false);
  const [mesasModal, setMesasModal] = useState(false);
  const [reservasModal, setReservasModal] = useState(false);
  const [allMesas, setAllMesas] = useState<MesaToggle[]>([]);
  const [reservas, setReservas] = useState<ReservaStaffRow[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [myMesas, setMyMesas] = useState<MesaAsignada[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mesaBusy, setMesaBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffMember?.id) return;
    const [tAvail, tWait, tSol, resData, mine, todas] = await Promise.all([
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
      supabase.from('mesas').select('id, codigo, estado, id_personal_atendiendo').order('codigo'),
    ]);

    setAvailable(tAvail.count ?? 0);
    setWaiting(tWait.count ?? 0);
    setOpenReqCount(tSol.data?.length ?? 0);
    setSolicitudes((tSol.data as SolicitudRow[]) ?? []);
    setAllMesas((todas.data as MesaToggle[]) ?? []);

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

  useSupabaseRealtimeRefresh(
    REALTIME_WORKER_DASHBOARD,
    load,
    !!session &&
      !!staffMember &&
      (staffMember.rol === 'mesero' || staffMember.rol === 'anfitrion'),
  );

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

  const onAtenderCompleta = async (id: string) => {
    const { error } = await supabase.rpc('personal_atender_reserva_completa', { p_id_reserva: id });
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

  const onToggleMesaWalkIn = async (m: MesaToggle) => {
    if (m.estado === 'reservada') return;
    setMesaBusy(m.id);
    try {
      if (m.estado === 'libre') {
        const { error } = await supabase.rpc('personal_marcar_mesa_libre_ocupada', {
          p_id_mesa: m.id,
          p_ocupar: true,
        });
        if (error) Alert.alert('Mesa', mapStaffRpcError(error.message));
        else await load();
      } else {
        const { error } = await supabase.rpc('personal_marcar_mesa_libre_ocupada', {
          p_id_mesa: m.id,
          p_ocupar: false,
        });
        if (error) Alert.alert('Mesa', mapStaffRpcError(error.message));
        else await load();
      }
    } finally {
      setMesaBusy(null);
    }
  };

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

  if (staffMember.rol === 'cocina') {
    return <Redirect href="/worker/kitchen" />;
  }

  if (staffMember.rol === 'gerente') {
    return <Redirect href="/worker/gerente" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{roleLabel(staffMember.rol)}</Text>
          <Text style={styles.heroTitle}>{staffMember.nombre_visible}</Text>
          <Text style={styles.heroSub}>Panel de sala</Text>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator color={FtColors.accent} style={styles.loader} />
        ) : null}

        <View style={styles.kpiRow}>
          <Pressable
            style={[styles.kpiCard, cardShadow]}
            onPress={() => setMesasModal(true)}
            android_ripple={{ color: 'rgba(198,168,92,0.2)' }}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="restaurant-outline" size={22} color={FtColors.accent} />
            </View>
            <Text style={styles.kpiValue}>{available ?? '—'}</Text>
            <Text style={styles.kpiLabel}>Mesas libres</Text>
            <Text style={styles.kpiTap}>Toca para ocupar / liberar</Text>
          </Pressable>

          <View style={[styles.kpiCard, cardShadow]}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="people-outline" size={22} color={FtColors.success} />
            </View>
            <Text style={styles.kpiValue}>{waiting ?? '—'}</Text>
            <Text style={styles.kpiLabel}>En fila</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <Pressable
            style={[styles.kpiCard, cardShadow]}
            onPress={() => setSolModal(true)}
            android_ripple={{ color: 'rgba(198,168,92,0.2)' }}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={FtColors.warning} />
            </View>
            <Text style={styles.kpiValue}>{openReqCount ?? '—'}</Text>
            <Text style={styles.kpiLabel}>Solicitudes</Text>
            <Text style={styles.kpiTap}>Solo tus mesas asignadas</Text>
          </Pressable>

          <Pressable
            style={[styles.kpiCard, styles.kpiCardAccent, cardShadow]}
            onPress={() => setReservasModal(true)}
            android_ripple={{ color: 'rgba(198,168,92,0.25)' }}>
            <View style={[styles.kpiIconWrap, styles.kpiIconWrapOn]}>
              <Ionicons name="calendar-outline" size={22} color={FtColors.onAccent} />
            </View>
            <Text style={[styles.kpiValue, styles.kpiValueOn]}>{attend.length}</Text>
            <Text style={[styles.kpiLabel, styles.kpiLabelOn]}>Reservas a atender</Text>
            <Text style={styles.kpiTapOn}>Hora llegada · una acción</Text>
          </Pressable>
        </View>

        {myMesas.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Ionicons name="bookmark-outline" size={18} color={FtColors.accent} />
              <Text style={styles.h1}>Mis mesas</Text>
            </View>
            <Text style={styles.sub}>Seguimiento de mesas bajo tu cuidado.</Text>
            {myMesas.map((m) => (
              <View key={m.id} style={[styles.myCard, cardShadow]}>
                <View style={styles.myCardTop}>
                  <Text style={styles.myCode}>{m.codigo}</Text>
                  <View
                    style={[
                      styles.badge,
                      m.estado === 'reservada' ? styles.badgeRes : styles.badgeOcc,
                    ]}>
                    <Text style={styles.badgeText}>
                      {m.estado === 'reservada' ? 'Reservada' : 'Ocupada'}
                    </Text>
                  </View>
                </View>
                {m.estado === 'reservada' ? (
                  <Pressable style={styles.btnGhost} onPress={() => onDesasignar(m.id)}>
                    <Text style={styles.btnGhostText}>Dejar de atender</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.btnSolid} onPress={() => onLiberarOcupada(m.id)}>
                    <Text style={styles.btnSolidText}>Marcar mesa libre</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="time-outline" size={18} color={FtColors.textMuted} />
            <Text style={styles.h1Muted}>Próximas reservas</Text>
          </View>
          {upcoming.length === 0 ? (
            <Text style={styles.empty}>No hay reservas próximas.</Text>
          ) : (
            upcoming.map((r) => {
              const t = r.mesas;
              const guest = names[r.id_usuario]?.trim() || 'Cliente';
              return (
                <View key={r.id} style={[styles.upCard, cardShadow]}>
                  <Text style={styles.upTitle}>
                    {t?.codigo ?? '—'} · {guest}
                  </Text>
                  <Text style={styles.upMeta}>
                    {fmt(r.fecha_hora_reserva)} · {r.personas_grupo} pers.
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <Pressable style={styles.linkRow} onPress={() => router.push('/worker/reservations')}>
          <Text style={styles.linkText}>Vista detallada de reservas</Text>
          <Ionicons name="chevron-forward" size={18} color={FtColors.accentMuted} />
        </Pressable>

        <Pressable style={styles.signOut} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={mesasModal} animationType="slide" transparent onRequestClose={() => setMesasModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMesasModal(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalGrab} />
            <Text style={styles.modalTitle}>Mesas de la sala</Text>
            <Text style={styles.modalSub}>
              Ocupar o liberar mesas sin reserva activa. Las reservadas se gestionan en “Reservas a atender”.
            </Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {allMesas.map((m) => {
                const busy = mesaBusy === m.id;
                const other =
                  m.id_personal_atendiendo != null && m.id_personal_atendiendo !== staffMember.id;
                if (m.estado === 'reservada') {
                  return (
                    <View key={m.id} style={styles.mesaRow}>
                      <Text style={styles.mesaCode}>{m.codigo}</Text>
                      <Text style={styles.mesaLocked}>Reservada · usa reservas</Text>
                    </View>
                  );
                }
                if (m.estado === 'libre') {
                  return (
                    <View key={m.id} style={styles.mesaRow}>
                      <Text style={styles.mesaCode}>{m.codigo}</Text>
                      <Pressable
                        style={[styles.mesaBtn, styles.mesaBtnFill]}
                        disabled={busy}
                        onPress={() => onToggleMesaWalkIn(m)}>
                        {busy ? (
                          <ActivityIndicator color={FtColors.onAccent} size="small" />
                        ) : (
                          <Text style={styles.mesaBtnFillText}>Ocupar</Text>
                        )}
                      </Pressable>
                    </View>
                  );
                }
                return (
                  <View key={m.id} style={styles.mesaRow}>
                    <Text style={styles.mesaCode}>{m.codigo}</Text>
                    {other ? (
                      <Text style={styles.mesaLocked}>Otro mesero</Text>
                    ) : (
                      <Pressable
                        style={styles.mesaBtn}
                        disabled={busy}
                        onPress={() => onToggleMesaWalkIn(m)}>
                        {busy ? (
                          <ActivityIndicator color={FtColors.accent} size="small" />
                        ) : (
                          <Text style={styles.mesaBtnText}>Liberar</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setMesasModal(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={solModal} animationType="slide" transparent onRequestClose={() => setSolModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSolModal(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalGrab} />
            <Text style={styles.modalTitle}>Solicitudes de servicio</Text>
            <Text style={styles.modalSub}>Clientes que llaman desde su mesa asignada a ti.</Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {solicitudes.length === 0 ? (
                <Text style={styles.empty}>No hay solicitudes abiertas.</Text>
              ) : (
                solicitudes.map((s) => (
                  <View key={s.id} style={styles.solRow}>
                    <Text style={styles.solCode}>Mesa {solicitudCodigo(s.mesas)}</Text>
                    <Text style={styles.solMsg}>{s.mensaje?.trim() || '(Sin mensaje)'}</Text>
                    <Pressable
                      style={styles.btnSolid}
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
                      <Text style={styles.btnSolidText}>Marcar como atendida</Text>
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

      <Modal
        visible={reservasModal}
        animationType="slide"
        transparent
        onRequestClose={() => setReservasModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReservasModal(false)}>
          <View style={[styles.modalSheet, styles.modalSheetTall]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalGrab} />
            <Text style={styles.modalTitle}>Reservas a atender</Text>
            <Text style={styles.modalSub}>
              Un solo “Atender” confirma llegada, te asigna la mesa y la marca ocupada. El apartado inferior es si no
              comparece el comensal (tras la ventana de 5 min).
            </Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {attend.length === 0 ? (
                <Text style={styles.empty}>Nada pendiente en este momento.</Text>
              ) : (
                attend.map((r) => {
                  const t = r.mesas;
                  const code = t?.codigo ?? '—';
                  const guest = names[r.id_usuario]?.trim() || 'Cliente';
                  const other =
                    t?.id_personal_atendiendo != null && t.id_personal_atendiendo !== staffMember.id;
                  const showNoShow = canShowNoShow(r, new Date());

                  return (
                    <View key={r.id} style={styles.resCard}>
                      <Text style={styles.resTitle}>
                        Mesa {code} · {guest}
                      </Text>
                      <Text style={styles.resLine}>Hora: {fmt(r.fecha_hora_reserva)}</Text>
                      <Text style={styles.resLine}>Personas: {r.personas_grupo}</Text>
                      {r.nota ? <Text style={styles.resLine}>Nota: {r.nota}</Text> : null}
                      {other ? (
                        <Text style={styles.warn}>Otro mesero está atendiendo esta mesa.</Text>
                      ) : (
                        <>
                          <Pressable
                            style={styles.btnSolid}
                            onPress={() => onAtenderCompleta(r.id)}
                            disabled={other}>
                            <Text style={styles.btnSolidText}>Atender</Text>
                          </Pressable>
                          <View style={styles.divider} />
                          <Text style={styles.resSectionLabel}>Si no comparece</Text>
                          {showNoShow ? (
                            <Pressable style={styles.btnOutline} onPress={() => resolve(r.id, false)}>
                              <Text style={styles.btnOutlineText}>Comensal no llegó</Text>
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
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setReservasModal(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FtColors.background },
  boot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FtColors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 48 },
  loader: { marginVertical: 12 },
  hero: { marginBottom: 22, paddingTop: 4 },
  heroEyebrow: { fontSize: 12, fontWeight: '600', color: FtColors.accentMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTitle: { fontSize: 28, fontWeight: '800', color: FtColors.text, marginTop: 4, letterSpacing: -0.5 },
  heroSub: { fontSize: 14, color: FtColors.textMuted, marginTop: 6 },
  kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    minHeight: 128,
    padding: 16,
    borderRadius: 18,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
  },
  kpiCardAccent: {
    backgroundColor: FtColors.accent,
    borderColor: FtColors.accentMuted,
  },
  kpiIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  kpiIconWrapOn: { backgroundColor: 'rgba(18,16,14,0.25)' },
  kpiValue: { fontSize: 30, fontWeight: '800', color: FtColors.text, letterSpacing: -1 },
  kpiValueOn: { color: FtColors.onAccent },
  kpiLabel: { marginTop: 4, fontSize: 13, fontWeight: '600', color: FtColors.textMuted },
  kpiLabelOn: { color: 'rgba(18,16,14,0.85)' },
  kpiTap: { marginTop: 8, fontSize: 11, color: FtColors.accentMuted, fontWeight: '500' },
  kpiTapOn: { marginTop: 8, fontSize: 11, color: 'rgba(18,16,14,0.75)', fontWeight: '500' },
  section: { marginTop: 8, marginBottom: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  h1: { fontSize: 17, fontWeight: '800', color: FtColors.text },
  h1Muted: { fontSize: 17, fontWeight: '700', color: FtColors.textMuted },
  sub: { fontSize: 13, color: FtColors.textMuted, lineHeight: 20, marginBottom: 14 },
  empty: { fontSize: 14, color: FtColors.textMuted, marginBottom: 12 },
  myCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 12,
  },
  myCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  myCode: { fontSize: 20, fontWeight: '800', color: FtColors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeRes: { backgroundColor: 'rgba(216,181,106,0.2)' },
  badgeOcc: { backgroundColor: 'rgba(125,206,160,0.18)' },
  badgeText: { fontSize: 12, fontWeight: '700', color: FtColors.text },
  btnGhost: { paddingVertical: 10, alignItems: 'center' },
  btnGhostText: { fontSize: 14, color: FtColors.accent, fontWeight: '700' },
  btnSolid: {
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: FtColors.accent,
    alignItems: 'center',
  },
  btnSolidText: { color: FtColors.onAccent, fontWeight: '800', fontSize: 15 },
  upCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    marginBottom: 10,
  },
  upTitle: { fontSize: 15, fontWeight: '700', color: FtColors.text },
  upMeta: { fontSize: 13, color: FtColors.textMuted, marginTop: 4 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FtColors.border,
  },
  linkText: { fontSize: 15, fontWeight: '600', color: FtColors.accent },
  signOut: { paddingVertical: 16, alignItems: 'center' },
  signOutText: { fontSize: 15, color: FtColors.textFaint, textDecorationLine: 'underline' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#14110e',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: FtColors.border,
  },
  modalSheetTall: { maxHeight: '88%' },
  modalGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: FtColors.border,
    marginBottom: 12,
  },
  modalScroll: { maxHeight: 420 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: FtColors.text, marginBottom: 6 },
  modalSub: { fontSize: 13, color: FtColors.textMuted, lineHeight: 19, marginBottom: 14 },
  mesaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.border,
  },
  mesaCode: { fontSize: 17, fontWeight: '800', color: FtColors.text },
  mesaLocked: { fontSize: 13, color: FtColors.textMuted, flex: 1, textAlign: 'right', marginLeft: 12 },
  mesaBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FtColors.accent,
    minWidth: 100,
    alignItems: 'center',
  },
  mesaBtnText: { fontSize: 14, fontWeight: '700', color: FtColors.accent },
  mesaBtnFill: { backgroundColor: FtColors.accent, borderColor: FtColors.accent },
  mesaBtnFillText: { fontSize: 14, fontWeight: '800', color: FtColors.onAccent },
  solRow: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.border,
  },
  solCode: { fontSize: 16, fontWeight: '800', color: FtColors.text, marginBottom: 6 },
  solMsg: { fontSize: 14, color: FtColors.textMuted, marginBottom: 12, lineHeight: 21 },
  modalClose: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 16, color: FtColors.textMuted, fontWeight: '600' },
  resCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 14,
  },
  resTitle: { fontSize: 16, fontWeight: '800', color: FtColors.text, marginBottom: 8 },
  resLine: { fontSize: 14, color: FtColors.textMuted, marginBottom: 4 },
  warn: { fontSize: 13, color: FtColors.warning, marginTop: 8 },
  divider: { height: 1, backgroundColor: FtColors.border, marginVertical: 14 },
  resSectionLabel: { fontSize: 12, fontWeight: '700', color: FtColors.textFaint, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  btnOutline: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FtColors.danger,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  btnOutlineText: { color: FtColors.danger, fontWeight: '800', fontSize: 15 },
  hintSmall: { fontSize: 12, color: FtColors.textMuted, lineHeight: 17 },
});
