import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import { REALTIME_KITCHEN, useSupabaseRealtimeRefresh } from '@/hooks/use-supabase-realtime-refresh';
import { mapCocinaRpcError } from '@/lib/cocina-errors';
import { supabase } from '@/lib/supabase';

type PedidoRow = {
  id: string;
  cantidad: number;
  nota_cliente: string | null;
  creado_en: string;
  mesas: { codigo: string } | { codigo: string }[] | null;
  items_menu: { nombre: string } | { nombre: string }[] | null;
};

type ItemDisp = {
  id: string;
  nombre: string;
  disponible: boolean;
  categorias_menu: { nombre: string } | { nombre: string }[] | null;
};

function catNombre(c: ItemDisp['categorias_menu']): string | null {
  if (c == null) return null;
  const z = Array.isArray(c) ? c[0] : c;
  return z?.nombre ?? null;
}

function mesaCodigo(m: PedidoRow['mesas']): string {
  if (m == null) return '—';
  const z = Array.isArray(m) ? m[0] : m;
  return z?.codigo ?? '—';
}

function itemNombre(i: PedidoRow['items_menu']): string {
  if (i == null) return '—';
  const z = Array.isArray(i) ? i[0] : i;
  return z?.nombre ?? '—';
}

const cardShadow =
  Platform.OS === 'ios'
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 }
    : { elevation: 4 };

export default function KitchenScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading, signOut } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [items, setItems] = useState<ItemDisp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);
  const [controlOpen, setControlOpen] = useState(false);

  const load = useCallback(async () => {
    const [pRes, iRes] = await Promise.all([
      supabase
        .from('pedidos_cocina')
        .select('id, cantidad, nota_cliente, creado_en, mesas ( codigo ), items_menu ( nombre )')
        .eq('estado', 'pendiente')
        .order('creado_en', { ascending: true }),
      supabase
        .from('items_menu')
        .select('id, nombre, disponible, categorias_menu ( nombre )')
        .order('nombre'),
    ]);
    setPedidos((pRes.data as PedidoRow[]) ?? []);
    setItems((iRes.data as ItemDisp[]) ?? []);
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

  useSupabaseRealtimeRefresh(
    REALTIME_KITCHEN,
    load,
    !!session && !!staffMember && (staffMember.rol === 'cocina' || staffMember.rol === 'gerente'),
  );

  const onListo = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await supabase.rpc('marcar_pedido_listo_cocina', { p_id_pedido: id });
      if (error) {
        Alert.alert('Cocina', mapCocinaRpcError(error.message));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const onToggleDisponible = async (item: ItemDisp, value: boolean) => {
    setToggleBusy(item.id);
    try {
      const { error } = await supabase.rpc('cocina_set_item_disponible', {
        p_id_item: item.id,
        p_disponible: value,
      });
      if (error) {
        Alert.alert('Carta', mapCocinaRpcError(error.message));
        return;
      }
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, disponible: value } : r)));
    } finally {
      setToggleBusy(null);
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

  if (staffMember.rol !== 'cocina' && staffMember.rol !== 'gerente') {
    return <Redirect href="/worker" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FtColors.accent} />
        }>
        <View style={styles.hero}>
          <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={FtColors.accent} />
            <Text style={styles.backText}>Panel mesero</Text>
          </Pressable>
          <Text style={styles.heroEyebrow}>Cocina</Text>
          <Text style={styles.heroTitle}>{staffMember.nombre_visible}</Text>
          <Text style={styles.heroSub}>Pedidos entrantes. La carta se gestiona en el centro de control.</Text>
          <Pressable style={styles.controlBtn} onPress={() => setControlOpen(true)} hitSlop={8}>
            <Ionicons name="options-outline" size={20} color={FtColors.onAccent} />
            <Text style={styles.controlBtnText}>Centro de control · disponibilidad</Text>
          </Pressable>
        </View>

        {loading && !refreshing ? <ActivityIndicator color={FtColors.accent} style={styles.loader} /> : null}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="flame-outline" size={20} color={FtColors.warning} />
            <Text style={styles.h1}>Por preparar</Text>
          </View>
          {pedidos.length === 0 ? (
            <Text style={styles.empty}>No hay pedidos pendientes.</Text>
          ) : (
            pedidos.map((p) => (
              <View key={p.id} style={[styles.pedidoCard, cardShadow]}>
                <Text style={styles.pedidoMesa}>Mesa {mesaCodigo(p.mesas)}</Text>
                <Text style={styles.pedidoPlato}>
                  {p.cantidad}× {itemNombre(p.items_menu)}
                </Text>
                {p.nota_cliente ? (
                  <View style={styles.notaBox}>
                    <Text style={styles.notaLabel}>Nota del comensal</Text>
                    <Text style={styles.notaText}>{p.nota_cliente}</Text>
                  </View>
                ) : (
                  <Text style={styles.sinNota}>Sin notas especiales</Text>
                )}
                <Text style={styles.meta}>
                  Pedido ·{' '}
                  {new Date(p.creado_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Pressable
                  style={[styles.btnListo, busyId === p.id && styles.btnDisabled]}
                  onPress={() => onListo(p.id)}
                  disabled={busyId === p.id}>
                  {busyId === p.id ? (
                    <ActivityIndicator color={FtColors.onAccent} />
                  ) : (
                    <Text style={styles.btnListoText}>Platillo listo</Text>
                  )}
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Pressable style={styles.signOut} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={controlOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setControlOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setControlOpen(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Centro de control</Text>
              <Text style={styles.modalSub}>Activa o desactiva platos en la carta del comensal.</Text>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {items.map((it) => (
                <View key={it.id} style={styles.dispRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.dispName}>{it.nombre}</Text>
                    {catNombre(it.categorias_menu) ? (
                      <Text style={styles.dispCat}>{catNombre(it.categorias_menu)}</Text>
                    ) : null}
                  </View>
                  <Switch
                    value={it.disponible}
                    onValueChange={(v) => onToggleDisponible(it, v)}
                    disabled={toggleBusy === it.id}
                    trackColor={{ false: FtColors.border, true: 'rgba(125,206,160,0.45)' }}
                    thumbColor={it.disponible ? FtColors.success : FtColors.textMuted}
                  />
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setControlOpen(false)}>
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
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  loader: { marginVertical: 16 },
  hero: { marginBottom: 18 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { fontSize: 15, color: FtColors.accent, fontWeight: '600' },
  heroEyebrow: { fontSize: 12, fontWeight: '600', color: FtColors.accentMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: FtColors.text, marginTop: 4 },
  heroSub: { fontSize: 14, color: FtColors.textMuted, marginTop: 6, lineHeight: 20 },
  controlBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: FtColors.accent,
  },
  controlBtnText: { color: FtColors.onAccent, fontWeight: '800', fontSize: 14 },
  section: { marginBottom: 28 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  h1: { fontSize: 18, fontWeight: '800', color: FtColors.text },
  empty: { fontSize: 14, color: FtColors.textMuted },
  pedidoCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    marginBottom: 14,
  },
  pedidoMesa: { fontSize: 13, fontWeight: '700', color: FtColors.accentMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  pedidoPlato: { fontSize: 21, fontWeight: '800', color: FtColors.text, marginTop: 6 },
  notaBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
  },
  notaLabel: { fontSize: 11, fontWeight: '700', color: FtColors.textFaint, marginBottom: 4, textTransform: 'uppercase' },
  notaText: { fontSize: 14, color: FtColors.text, lineHeight: 21 },
  sinNota: { fontSize: 13, color: FtColors.textFaint, marginTop: 10, fontStyle: 'italic' },
  meta: { fontSize: 12, color: FtColors.textMuted, marginTop: 10 },
  btnListo: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: FtColors.accent,
    alignItems: 'center',
  },
  btnListoText: { color: FtColors.onAccent, fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  btnDisabled: { opacity: 0.7 },
  dispRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.border,
  },
  dispName: { fontSize: 15, fontWeight: '600', color: FtColors.text },
  dispCat: { fontSize: 12, color: FtColors.textMuted, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '85%',
    backgroundColor: FtColors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: FtColors.border,
    borderBottomWidth: 0,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: FtColors.border,
    marginTop: 10,
    marginBottom: 8,
  },
  modalHeader: { paddingHorizontal: 20, paddingBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: FtColors.text },
  modalSub: { fontSize: 13, color: FtColors.textMuted, marginTop: 6, lineHeight: 19 },
  modalScroll: { maxHeight: 420, paddingHorizontal: 20 },
  modalClose: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FtColors.border,
    alignItems: 'center',
  },
  modalCloseText: { fontSize: 15, fontWeight: '600', color: FtColors.textMuted },
  signOut: { paddingVertical: 16, alignItems: 'center' },
  signOutText: { fontSize: 15, color: FtColors.textFaint, textDecorationLine: 'underline' },
});
