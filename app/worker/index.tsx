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
import { textoSaludoStaff } from '@/lib/greeting';
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

type WaitlistEntry = {
  id: string;
  id_usuario: string | null;
  nombre_cliente: string | null;
  personas_grupo: number;
  nota: string | null;
  unido_en: string;
  id_mesa_asignada: string | null;
};

type MeseroOption = {
  id: string;
  nombre_visible: string;
};

type MeseroLoad = {
  id: string;
  nombre_visible: string;
  mesasAtendidas: number;
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

function formatGuestName(
  name: string | null | undefined,
  userId: string | null,
  queueName: string | null | undefined,
): string {
  const queueClean = queueName?.trim();
  if (queueClean) return queueClean;
  const cleaned = name?.trim();
  if (cleaned) return cleaned;
  if (userId) return `Usuario ${userId.slice(0, 8)}`;
  return 'Sin nombre';
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
  const [waitlistModal, setWaitlistModal] = useState(false);
  const [allMesas, setAllMesas] = useState<MesaToggle[]>([]);
  const [reservas, setReservas] = useState<ReservaStaffRow[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [myMesas, setMyMesas] = useState<MesaAsignada[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [waitlistNames, setWaitlistNames] = useState<Record<string, string | null>>({});
  const [meseros, setMeseros] = useState<MeseroOption[]>([]);
  const [meseroLoads, setMeseroLoads] = useState<MeseroLoad[]>([]);
  const [selectedMesaByEntry, setSelectedMesaByEntry] = useState<Record<string, string>>({});
  const [selectedMeseroByEntry, setSelectedMeseroByEntry] = useState<Record<string, string>>({});
  const [selectedMeseroByReserva, setSelectedMeseroByReserva] = useState<Record<string, string>>({});
  const [assigningEntryId, setAssigningEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mesaBusy, setMesaBusy] = useState<string | null>(null);
  const isHost = staffMember?.rol === 'anfitrion' || staffMember?.rol === 'gerente';
  const isWaiter = staffMember?.rol === 'mesero';

  const load = useCallback(async () => {
    if (!staffMember?.id) return;
    const [tAvail, tWait, tSol, resData, mine, todas, filaData, meserosData, mesasConMesero] = await Promise.all([
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
      supabase
        .from('fila_espera')
        .select('id, id_usuario, nombre_cliente, personas_grupo, nota, unido_en, id_mesa_asignada')
        .eq('estado', 'esperando')
        .order('unido_en', { ascending: true }),
      supabase
        .from('personal')
        .select('id, nombre_visible')
        .eq('activo', true)
        .eq('rol', 'mesero')
        .order('nombre_visible'),
      supabase.from('mesas').select('id_personal_atendiendo').not('id_personal_atendiendo', 'is', null),
    ]);

    setAvailable(tAvail.count ?? 0);
    setWaiting(tWait.count ?? 0);
    setOpenReqCount(tSol.data?.length ?? 0);
    setSolicitudes((tSol.data as SolicitudRow[]) ?? []);
    setAllMesas((todas.data as MesaToggle[]) ?? []);
    if (filaData.error) {
      setWaitlist([]);
      Alert.alert('Fila', filaData.error.message);
    } else {
      const fila = (filaData.data as WaitlistEntry[]) ?? [];
      setWaitlist(fila);
      const waitUserIds = [...new Set(fila.map((f) => f.id_usuario).filter((id): id is string => !!id))];
      if (waitUserIds.length > 0) {
        const { data: waitProfs } = await supabase
          .from('perfiles')
          .select('id, nombre_completo')
          .in('id', waitUserIds);
        const wm: Record<string, string | null> = {};
        for (const p of waitProfs ?? []) wm[p.id] = p.nombre_completo;
        setWaitlistNames(wm);
      } else {
        setWaitlistNames({});
      }
    }

    const meserosList = (meserosData.data as MeseroOption[]) ?? [];
    setMeseros(meserosList);
    const assignedCounts = new Map<string, number>();
    for (const row of (mesasConMesero.data ?? []) as { id_personal_atendiendo: string | null }[]) {
      if (!row.id_personal_atendiendo) continue;
      assignedCounts.set(row.id_personal_atendiendo, (assignedCounts.get(row.id_personal_atendiendo) ?? 0) + 1);
    }
    setMeseroLoads(
      meserosList.map((mesero) => ({
        id: mesero.id,
        nombre_visible: mesero.nombre_visible,
        mesasAtendidas: assignedCounts.get(mesero.id) ?? 0,
      })),
    );

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
      (staffMember.rol === 'mesero' || staffMember.rol === 'anfitrion' || staffMember.rol === 'gerente'),
  );

  const { upcoming, attend } = useMemo(() => splitReservationsByTime(reservas, new Date()), [reservas]);
  const now = new Date();
  const attendOrdered = useMemo(
    () =>
      [...attend].sort(
        (a, b) =>
          new Date(a.fecha_hora_reserva).getTime() - new Date(b.fecha_hora_reserva).getTime(),
      ),
    [attend],
  );

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
    const meseroId = selectedMeseroByReserva[id];
    if (isHost && !meseroId) {
      Alert.alert('Atender', 'Selecciona el mesero responsable antes de atender la reserva.');
      return;
    }
    const { error } = await supabase.rpc(
      isHost ? 'personal_atender_reserva_completa_asignando_mesero' : 'personal_atender_reserva_completa',
      isHost ? { p_id_reserva: id, p_id_mesero: meseroId } : { p_id_reserva: id },
    );
    if (error) {
      Alert.alert('Atender', mapStaffRpcError(error.message));
      return;
    }
    setSelectedMeseroByReserva((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await load();
  };

  const onMeseroMarcarAtendido = async (mesaId: string) => {
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

  const onAssignWaitlist = async (entry: WaitlistEntry) => {
    const mesaId = selectedMesaByEntry[entry.id];
    const meseroId = selectedMeseroByEntry[entry.id];
    if (!mesaId || !meseroId) {
      Alert.alert('Fila', 'Selecciona una mesa disponible y un mesero antes de asignar.');
      return;
    }
    setAssigningEntryId(entry.id);
    try {
      const { error } = await supabase.rpc('personal_sentar_desde_fila', {
        p_id_fila: entry.id,
        p_id_mesa: mesaId,
        p_id_mesero: meseroId,
      });
      if (error) {
        const missingRpc =
          error.message.includes('Could not find the function public.personal_sentar_desde_fila') ||
          error.message.includes('PGRST202');
        if (!missingRpc) {
          Alert.alert('Asignación', mapStaffRpcError(error.message));
          return;
        }

        // Fallback temporal para proyectos donde aún no se ejecutó el patch SQL.
        const { data: mesaUpdated, error: mesaError } = await supabase
          .from('mesas')
          .update({
            estado: 'ocupada',
            id_personal_atendiendo: meseroId,
          })
          .eq('id', mesaId)
          .eq('estado', 'libre')
          .select('id')
          .maybeSingle();
        if (mesaError) {
          Alert.alert('Asignación', mapStaffRpcError(mesaError.message));
          return;
        }
        if (!mesaUpdated) {
          Alert.alert('Asignación', 'La mesa ya no está libre, intenta con otra.');
          return;
        }

        const { data: filaUpdated, error: filaError } = await supabase
          .from('fila_espera')
          .update({
            estado: 'sentado',
            sentado_en: new Date().toISOString(),
            id_mesa_asignada: mesaId,
          })
          .eq('id', entry.id)
          .eq('estado', 'esperando')
          .select('id')
          .maybeSingle();
        if (filaError) {
          Alert.alert('Asignación', mapStaffRpcError(filaError.message));
          return;
        }
        if (!filaUpdated) {
          Alert.alert('Asignación', 'Ese comensal ya no está en espera.');
          return;
        }
      }

      setSelectedMesaByEntry((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      setSelectedMeseroByEntry((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      await load();
    } finally {
      setAssigningEntryId(null);
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
    return <Redirect href="/login" />;
  }

  if (staffMember.rol === 'cocina') {
    return <Redirect href="/worker/kitchen" />;
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
        {staffMember.rol === 'gerente' ? (
          <Pressable style={styles.backRow} onPress={() => router.replace('/worker/gerente')}>
            <Ionicons name="chevron-back" size={18} color={FtColors.accent} />
            <Text style={styles.backText}>Volver a panel gerente</Text>
          </Pressable>
        ) : null}

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{roleLabel(staffMember.rol)}</Text>
          <Text style={styles.heroTitle}>{staffMember.nombre_visible}</Text>
          <Text style={styles.heroSub}>{isHost ? 'Panel de recepción' : 'Panel de mesero'}</Text>
          <Text style={styles.heroGreeting}>{textoSaludoStaff(staffMember.nombre_visible)}</Text>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator color={FtColors.accent} style={styles.loader} />
        ) : null}

        <View style={[styles.roleTipCard, cardShadow]}>
          <Ionicons
            name={isHost ? 'people-circle-outline' : 'restaurant-outline'}
            size={18}
            color={FtColors.accent}
          />
          <Text style={styles.roleTipText}>
            {isHost
              ? 'Prioriza fila y reservas; define siempre mesa y mesero responsable.'
              : 'Concéntrate en solicitudes y cierre de servicio de tus mesas atendidas.'}
          </Text>
        </View>

        <View style={styles.kpiRow}>
          {isHost ? (
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
          ) : (
            <View style={[styles.kpiCard, cardShadow]}>
              <View style={styles.kpiIconWrap}>
                <Ionicons name="restaurant-outline" size={22} color={FtColors.accent} />
              </View>
              <Text style={styles.kpiValue}>{available ?? '—'}</Text>
              <Text style={styles.kpiLabel}>Mesas libres</Text>
              <Text style={styles.kpiTap}>Gestionado por recepción</Text>
            </View>
          )}

          <Pressable
            style={[styles.kpiCard, cardShadow]}
            disabled={staffMember.rol !== 'anfitrion'}
            onPress={() => {
              if (staffMember.rol === 'anfitrion') setWaitlistModal(true);
            }}
            android_ripple={{ color: 'rgba(198,168,92,0.2)' }}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="people-outline" size={22} color={FtColors.success} />
            </View>
            <Text style={styles.kpiValue}>{waiting ?? '—'}</Text>
            <Text style={styles.kpiLabel}>En fila</Text>
            {staffMember.rol === 'anfitrion' ? <Text style={styles.kpiTap}>Toca para gestionar fila</Text> : null}
          </Pressable>
        </View>

        <View style={styles.kpiRow}>
          {isWaiter ? (
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
          ) : (
            <Pressable
              style={[styles.kpiCard, styles.kpiCardAccent, cardShadow]}
              onPress={() => setWaitlistModal(true)}
              android_ripple={{ color: 'rgba(198,168,92,0.25)' }}>
              <View style={[styles.kpiIconWrap, styles.kpiIconWrapOn]}>
                <Ionicons name="people-outline" size={22} color={FtColors.onAccent} />
              </View>
              <Text style={[styles.kpiValue, styles.kpiValueOn]}>{waiting ?? '—'}</Text>
              <Text style={[styles.kpiLabel, styles.kpiLabelOn]}>Fila por asignar</Text>
              <Text style={styles.kpiTapOn}>Mesa + mesero por turno</Text>
            </Pressable>
          )}
          {isHost ? (
            <Pressable
              style={[styles.kpiCard, styles.kpiCardAccent, cardShadow]}
              onPress={() => setReservasModal(true)}
              android_ripple={{ color: 'rgba(198,168,92,0.25)' }}>
              <View style={[styles.kpiIconWrap, styles.kpiIconWrapOn]}>
                <Ionicons name="calendar-outline" size={22} color={FtColors.onAccent} />
              </View>
              <Text style={[styles.kpiValue, styles.kpiValueOn]}>{attendOrdered.length}</Text>
              <Text style={[styles.kpiLabel, styles.kpiLabelOn]}>Reservas a atender</Text>
              <Text style={styles.kpiTapOn}>Llegada / no llegó</Text>
            </Pressable>
          ) : (
            <View style={[styles.kpiCard, cardShadow]}>
              <View style={styles.kpiIconWrap}>
                <Ionicons name="bookmark-outline" size={22} color={FtColors.accent} />
              </View>
              <Text style={styles.kpiValue}>{myMesas.length}</Text>
              <Text style={styles.kpiLabel}>Mis mesas</Text>
              <Text style={styles.kpiTap}>Mesas actualmente asignadas a ti</Text>
            </View>
          )}
        </View>

        {isWaiter && myMesas.length > 0 ? (
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
                {m.estado === 'ocupada' ? (
                  <Pressable style={styles.btnSolid} onPress={() => onMeseroMarcarAtendido(m.id)}>
                    <Text style={styles.btnSolidText}>Marcar atendido / terminar servicio</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.myHint}>Esperando llegada del comensal.</Text>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {isHost ? (
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
        ) : null}

        {isHost ? (
          <Pressable style={styles.linkRow} onPress={() => router.push('/worker/reservations')}>
            <Text style={styles.linkText}>Vista detallada de reservas</Text>
            <Ionicons name="chevron-forward" size={18} color={FtColors.accentMuted} />
          </Pressable>
        ) : null}

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

      <Modal
        visible={waitlistModal}
        animationType="slide"
        transparent
        onRequestClose={() => setWaitlistModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setWaitlistModal(false)}>
          <View style={[styles.modalSheet, styles.modalSheetTall]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalGrab} />
            <Text style={styles.modalTitle}>Fila de espera</Text>
            <Text style={styles.modalSub}>
              Ordenada por llegada. Elige mesa libre y mesero para sentar a cada grupo.
            </Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.staffLoadCard}>
                <Text style={styles.staffLoadTitle}>Meseros en linea</Text>
                {meseroLoads.length === 0 ? (
                  <Text style={styles.empty}>No hay meseros activos.</Text>
                ) : (
                  meseroLoads.map((m) => (
                    <View key={m.id} style={styles.staffLoadRow}>
                      <Text style={styles.staffLoadName}>{m.nombre_visible}</Text>
                      <Text style={styles.staffLoadCount}>{m.mesasAtendidas} mesas</Text>
                    </View>
                  ))
                )}
              </View>

              {waitlist.length === 0 ? (
                <Text style={styles.empty}>No hay comensales en espera.</Text>
              ) : (
                waitlist.map((entry, index) => {
                  const guestName = formatGuestName(
                    entry.id_usuario ? waitlistNames[entry.id_usuario] : null,
                    entry.id_usuario,
                    entry.nombre_cliente,
                  );
                  const freeMesas = allMesas.filter((m) => m.estado === 'libre');
                  const selectedMesa = selectedMesaByEntry[entry.id];
                  const selectedMesero = selectedMeseroByEntry[entry.id];

                  return (
                    <View key={entry.id} style={styles.waitCard}>
                      <Text style={styles.waitOrder}>Turno #{index + 1}</Text>
                      <Text style={styles.waitName}>{guestName}</Text>
                      <Text style={styles.waitMeta}>
                        {entry.personas_grupo} personas · Llegada {fmt(entry.unido_en)}
                      </Text>
                      {entry.nota ? <Text style={styles.waitMeta}>Nota: {entry.nota}</Text> : null}

                      <Text style={styles.waitLabel}>Mesa disponible</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceRow}>
                        {freeMesas.length === 0 ? (
                          <Text style={styles.empty}>Sin mesas libres.</Text>
                        ) : (
                          freeMesas.map((mesa) => (
                            <Pressable
                              key={mesa.id}
                              style={[styles.choiceChip, selectedMesa === mesa.id && styles.choiceChipActive]}
                              onPress={() =>
                                setSelectedMesaByEntry((prev) => ({
                                  ...prev,
                                  [entry.id]: mesa.id,
                                }))
                              }>
                              <Text
                                style={[
                                  styles.choiceChipText,
                                  selectedMesa === mesa.id && styles.choiceChipTextActive,
                                ]}>
                                {mesa.codigo}
                              </Text>
                            </Pressable>
                          ))
                        )}
                      </ScrollView>

                      <Text style={styles.waitLabel}>Mesero responsable</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceRow}>
                        {meseroLoads.length === 0 ? (
                          <Text style={styles.empty}>Sin meseros en linea.</Text>
                        ) : (
                          meseroLoads.map((mesero) => (
                            <Pressable
                              key={mesero.id}
                              style={[styles.choiceChip, selectedMesero === mesero.id && styles.choiceChipActive]}
                              onPress={() =>
                                setSelectedMeseroByEntry((prev) => ({
                                  ...prev,
                                  [entry.id]: mesero.id,
                                }))
                              }>
                              <Text
                                style={[
                                  styles.choiceChipText,
                                  selectedMesero === mesero.id && styles.choiceChipTextActive,
                                ]}>
                                {mesero.nombre_visible} ({mesero.mesasAtendidas})
                              </Text>
                            </Pressable>
                          ))
                        )}
                      </ScrollView>

                      <Pressable
                        style={[styles.btnSolid, assigningEntryId === entry.id && styles.btnDisabled]}
                        disabled={assigningEntryId === entry.id}
                        onPress={() => onAssignWaitlist(entry)}>
                        <Text style={styles.btnSolidText}>
                          {assigningEntryId === entry.id ? 'Asignando...' : 'Asignar mesa y mesero'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setWaitlistModal(false)}>
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
              {attendOrdered.length === 0 ? (
                <Text style={styles.empty}>Nada pendiente en este momento.</Text>
              ) : (
                attendOrdered.map((r) => {
                  const t = r.mesas;
                  const code = t?.codigo ?? '—';
                  const guest = names[r.id_usuario]?.trim() || 'Cliente';
                  const other =
                    t?.id_personal_atendiendo != null && t.id_personal_atendiendo !== staffMember.id;
                  const showNoShow = canShowNoShow(r, now);
                  const isLate = new Date(r.fecha_hora_reserva).getTime() < now.getTime();

                  return (
                    <View key={r.id} style={styles.resCard}>
                      <Text style={styles.resTitle}>
                        Mesa {code} · {guest}
                      </Text>
                      <Text style={[styles.resBadge, isLate ? styles.resBadgeLate : styles.resBadgeSoon]}>
                        {isLate ? 'Prioridad alta' : 'Próxima'}
                      </Text>
                      <Text style={styles.resLine}>Hora: {fmt(r.fecha_hora_reserva)}</Text>
                      <Text style={styles.resLine}>Personas: {r.personas_grupo}</Text>
                      {r.nota ? <Text style={styles.resLine}>Nota: {r.nota}</Text> : null}
                      {other ? (
                        <Text style={styles.warn}>Otro mesero está atendiendo esta mesa.</Text>
                      ) : (
                        <>
                          {isHost ? (
                            <>
                              <Text style={styles.resSectionLabel}>Mesero responsable</Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceRow}>
                                {meseroLoads.length === 0 ? (
                                  <Text style={styles.empty}>Sin meseros en linea.</Text>
                                ) : (
                                  meseroLoads.map((mesero) => (
                                    <Pressable
                                      key={mesero.id}
                                      style={[
                                        styles.choiceChip,
                                        selectedMeseroByReserva[r.id] === mesero.id && styles.choiceChipActive,
                                      ]}
                                      onPress={() =>
                                        setSelectedMeseroByReserva((prev) => ({
                                          ...prev,
                                          [r.id]: mesero.id,
                                        }))
                                      }>
                                      <Text
                                        style={[
                                          styles.choiceChipText,
                                          selectedMeseroByReserva[r.id] === mesero.id &&
                                            styles.choiceChipTextActive,
                                        ]}>
                                        {mesero.nombre_visible} ({mesero.mesasAtendidas})
                                      </Text>
                                    </Pressable>
                                  ))
                                )}
                              </ScrollView>
                            </>
                          ) : null}
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
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 14, color: FtColors.accent, fontWeight: '700' },
  roleTipCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    marginBottom: 12,
  },
  roleTipText: { flex: 1, fontSize: 13, color: FtColors.textMuted, lineHeight: 19, fontWeight: '600' },
  hero: { marginBottom: 22, paddingTop: 4 },
  heroEyebrow: { fontSize: 12, fontWeight: '600', color: FtColors.accentMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTitle: { fontSize: 28, fontWeight: '800', color: FtColors.text, marginTop: 4, letterSpacing: -0.5 },
  heroSub: { fontSize: 14, color: FtColors.textMuted, marginTop: 6, lineHeight: 20 },
  heroGreeting: {
    fontSize: 14,
    color: FtColors.textMuted,
    marginTop: 10,
    lineHeight: 20,
    fontWeight: '500',
  },
  kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    minHeight: 132,
    padding: 16,
    borderRadius: 18,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
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
  kpiLabel: { marginTop: 4, fontSize: 13, fontWeight: '700', color: FtColors.textMuted },
  kpiLabelOn: { color: 'rgba(18,16,14,0.85)' },
  kpiTap: { marginTop: 8, fontSize: 11, color: FtColors.accentMuted, fontWeight: '600' },
  kpiTapOn: { marginTop: 8, fontSize: 11, color: 'rgba(18,16,14,0.8)', fontWeight: '700' },
  section: { marginTop: 10, marginBottom: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  h1: { fontSize: 17, fontWeight: '800', color: FtColors.text },
  h1Muted: { fontSize: 17, fontWeight: '700', color: FtColors.textMuted },
  sub: { fontSize: 13, color: FtColors.textMuted, lineHeight: 20, marginBottom: 16 },
  empty: { fontSize: 14, color: FtColors.textMuted, marginBottom: 12 },
  myCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    marginBottom: 12,
  },
  myCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  myCode: { fontSize: 20, fontWeight: '800', color: FtColors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeRes: { backgroundColor: 'rgba(216,181,106,0.2)' },
  badgeOcc: { backgroundColor: 'rgba(125,206,160,0.18)' },
  badgeText: { fontSize: 12, fontWeight: '700', color: FtColors.text },
  myHint: { fontSize: 12, color: FtColors.textMuted, lineHeight: 18 },
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
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
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
  resBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  resBadgeSoon: { color: FtColors.accent, backgroundColor: 'rgba(124,140,255,0.16)' },
  resBadgeLate: { color: FtColors.warning, backgroundColor: 'rgba(240,189,115,0.2)' },
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
  staffLoadCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 14,
  },
  staffLoadTitle: { fontSize: 14, fontWeight: '800', color: FtColors.text, marginBottom: 8 },
  staffLoadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  staffLoadName: { fontSize: 14, color: FtColors.text, fontWeight: '600' },
  staffLoadCount: { fontSize: 13, color: FtColors.textMuted, fontWeight: '700' },
  waitCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 12,
  },
  waitOrder: { fontSize: 12, color: FtColors.accentMuted, textTransform: 'uppercase', letterSpacing: 1.1 },
  waitName: { fontSize: 16, fontWeight: '800', color: FtColors.text, marginTop: 4 },
  waitMeta: { fontSize: 13, color: FtColors.textMuted, marginTop: 4, lineHeight: 19 },
  waitLabel: { fontSize: 12, fontWeight: '700', color: FtColors.textFaint, marginTop: 10, marginBottom: 8 },
  choiceRow: { marginBottom: 8 },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: FtColors.border,
    backgroundColor: FtColors.surface,
    marginRight: 8,
  },
  choiceChipActive: { borderColor: FtColors.accent, backgroundColor: 'rgba(216,181,106,0.2)' },
  choiceChipText: { fontSize: 13, fontWeight: '700', color: FtColors.textMuted },
  choiceChipTextActive: { color: FtColors.text },
  btnDisabled: { opacity: 0.65 },
});
