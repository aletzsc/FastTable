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
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import { REALTIME_INVENTARIO, useSupabaseRealtimeRefresh } from '@/hooks/use-supabase-realtime-refresh';
import { supabase } from '@/lib/supabase';

type Ingrediente = {
  id: string;
  nombre: string;
  cantidad_disponible: number;
  unidad_medida: string;
  stock_minimo: number | null;
};

type MovRow = {
  id: string;
  tipo: string;
  delta_cantidad: number;
  nota: string | null;
  creado_en: string;
  ingredientes: { nombre: string } | { nombre: string }[] | null;
};

function ingNombre(m: MovRow['ingredientes']): string {
  if (m == null) return '—';
  const z = Array.isArray(m) ? m[0] : m;
  return z?.nombre ?? '—';
}

function fmtQty(n: number): string {
  const s = n.toFixed(4).replace(/\.?0+$/, '');
  return s.length > 0 ? s : '0';
}

function mapAlmacenError(msg: string): string {
  if (msg.includes('solo_gerente')) return 'Solo gerencia puede modificar el almacén.';
  if (msg.includes('cantidad_invalida_almacen')) return 'La cantidad de entrada debe ser mayor que cero.';
  if (msg.includes('cantidad_negativa')) return 'La cantidad ajustada no puede ser negativa.';
  if (msg.includes('ingrediente_no_encontrado')) return 'Ingrediente no encontrado.';
  return msg;
}

const cardShadow =
  Platform.OS === 'ios'
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8 }
    : { elevation: 4 };

export default function InventarioScreen() {
  const router = useRouter();
  const { session, staffMember, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Ingrediente[]>([]);
  const [movs, setMovs] = useState<MovRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [entradaOpen, setEntradaOpen] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [sel, setSel] = useState<Ingrediente | null>(null);
  const [cantStr, setCantStr] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setSchemaError(null);
    const [ingRes, movRes] = await Promise.all([
      supabase.from('ingredientes').select('id, nombre, cantidad_disponible, unidad_medida, stock_minimo').order('nombre'),
      supabase
        .from('movimientos_almacen')
        .select('id, tipo, delta_cantidad, nota, creado_en, ingredientes ( nombre )')
        .order('creado_en', { ascending: false })
        .limit(50),
    ]);
    if (ingRes.error) {
      const m = ingRes.error.message ?? '';
      if (m.includes('ingredientes') && (m.includes('does not exist') || m.includes('schema cache'))) {
        setSchemaError(
          'Falta el esquema de inventario en la base de datos. En Supabase SQL Editor ejecuta el script supabase/05_inventario.sql después de 01 (y 04 si aplica).',
        );
      } else {
        setSchemaError(m);
      }
      setRows([]);
      setMovs([]);
      return;
    }
    if (movRes.error) {
      setMovs([]);
    } else {
      setMovs((movRes.data as MovRow[]) ?? []);
    }
    setRows((ingRes.data as Ingrediente[]) ?? []);
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

  const reloadRt = useCallback(() => load(), [load]);
  useSupabaseRealtimeRefresh(
    REALTIME_INVENTARIO,
    reloadRt,
    !!session && staffMember?.rol === 'gerente',
  );

  const openEntrada = (r: Ingrediente) => {
    setSel(r);
    setCantStr('');
    setNota('');
    setEntradaOpen(true);
  };

  const openAjuste = (r: Ingrediente) => {
    setSel(r);
    setCantStr(fmtQty(r.cantidad_disponible));
    setNota('');
    setAjusteOpen(true);
  };

  const submitEntrada = async () => {
    if (!sel) return;
    const q = Number(String(cantStr).replace(',', '.'));
    if (!Number.isFinite(q) || q <= 0) {
      Alert.alert('Cantidad', 'Indica una cantidad numérica mayor que cero.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('gerente_almacen_entrada', {
        p_id_ingrediente: sel.id,
        p_cantidad: q,
        p_nota: nota.trim() || null,
      });
      if (error) {
        Alert.alert('Almacén', mapAlmacenError(error.message));
        return;
      }
      setEntradaOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const submitAjuste = async () => {
    if (!sel) return;
    const q = Number(String(cantStr).replace(',', '.'));
    if (!Number.isFinite(q) || q < 0) {
      Alert.alert('Cantidad', 'Indica la cantidad total disponible (número ≥ 0).');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('gerente_almacen_ajuste', {
        p_id_ingrediente: sel.id,
        p_nueva_cantidad: q,
        p_nota: nota.trim() || null,
      });
      if (error) {
        Alert.alert('Almacén', mapAlmacenError(error.message));
        return;
      }
      setAjusteOpen(false);
      await load();
    } finally {
      setBusy(false);
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

  if (staffMember.rol !== 'gerente') {
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
            <Text style={styles.backText}>Gerencia</Text>
          </Pressable>
          <Text style={styles.heroEyebrow}>Solo gerente</Text>
          <Text style={styles.heroTitle}>Inventario</Text>
          <Text style={styles.heroSub}>
            Entradas de mercancía y ajustes físicos. Los pedidos de comensales descuentan stock según recetas
            (script 05).
          </Text>
        </View>

        {loading && !refreshing ? <ActivityIndicator color={FtColors.accent} style={styles.loader} /> : null}

        {schemaError ? (
          <View style={[styles.card, cardShadow]}>
            <Text style={styles.errText}>{schemaError}</Text>
          </View>
        ) : null}

        {!schemaError && rows.length === 0 && !loading ? (
          <Text style={styles.muted}>No hay ingredientes registrados.</Text>
        ) : null}

        {!schemaError
          ? rows.map((r) => (
              <View key={r.id} style={[styles.card, cardShadow]}>
                <Text style={styles.ingName}>{r.nombre}</Text>
                <Text style={styles.ingStock}>
                  {fmtQty(Number(r.cantidad_disponible))} {r.unidad_medida}
                  {r.stock_minimo != null ? ` · mín. ${fmtQty(Number(r.stock_minimo))}` : ''}
                </Text>
                <View style={styles.rowBtns}>
                  <Pressable style={styles.btnSecondary} onPress={() => openEntrada(r)}>
                    <Text style={styles.btnSecondaryText}>Entrada</Text>
                  </Pressable>
                  <Pressable style={styles.btnPrimary} onPress={() => openAjuste(r)}>
                    <Text style={styles.btnPrimaryText}>Ajustar total</Text>
                  </Pressable>
                </View>
              </View>
            ))
          : null}

        {!schemaError && movs.length > 0 ? (
          <View style={[styles.card, cardShadow]}>
            <Text style={styles.cardTitle}>Últimos movimientos</Text>
            {movs.map((m) => (
              <View key={m.id} style={styles.movRow}>
                <Text style={styles.movLine}>
                  {ingNombre(m.ingredientes)} · {m.tipo} · {fmtQty(Number(m.delta_cantidad))}
                </Text>
                {m.nota ? <Text style={styles.movNote}>{m.nota}</Text> : null}
                <Text style={styles.movDate}>
                  {new Date(m.creado_en).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={entradaOpen} animationType="fade" transparent onRequestClose={() => setEntradaOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !busy && setEntradaOpen(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Entrada de almacén</Text>
            {sel ? <Text style={styles.modalSub}>{sel.nombre}</Text> : null}
            <Text style={styles.modalLabel}>Cantidad a sumar ({sel?.unidad_medida ?? 'u.'})</Text>
            <TextInput
              value={cantStr}
              onChangeText={setCantStr}
              keyboardType="decimal-pad"
              placeholder="Ej. 2.5"
              placeholderTextColor={FtColors.textMuted}
              style={styles.input}
            />
            <Text style={styles.modalLabel}>Nota (opcional)</Text>
            <TextInput
              value={nota}
              onChangeText={setNota}
              placeholder="Proveedor, lote…"
              placeholderTextColor={FtColors.textMuted}
              style={styles.input}
            />
            <Pressable style={[styles.modalOk, busy && styles.modalOkOff]} onPress={submitEntrada} disabled={busy}>
              <Text style={styles.modalOkText}>{busy ? 'Guardando…' : 'Registrar entrada'}</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => setEntradaOpen(false)}>
              <Text style={styles.modalCancel}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={ajusteOpen} animationType="fade" transparent onRequestClose={() => setAjusteOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !busy && setAjusteOpen(false)}>
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Ajuste de inventario</Text>
            {sel ? <Text style={styles.modalSub}>{sel.nombre}</Text> : null}
            <Text style={styles.modalLabel}>Cantidad total en almacén ({sel?.unidad_medida ?? 'u.'})</Text>
            <TextInput
              value={cantStr}
              onChangeText={setCantStr}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={FtColors.textMuted}
              style={styles.input}
            />
            <Text style={styles.modalLabel}>Nota (opcional)</Text>
            <TextInput
              value={nota}
              onChangeText={setNota}
              placeholder="Conteo físico…"
              placeholderTextColor={FtColors.textMuted}
              style={styles.input}
            />
            <Pressable style={[styles.modalOk, busy && styles.modalOkOff]} onPress={submitAjuste} disabled={busy}>
              <Text style={styles.modalOkText}>{busy ? 'Guardando…' : 'Guardar ajuste'}</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => setAjusteOpen(false)}>
              <Text style={styles.modalCancel}>Cancelar</Text>
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
  hero: { marginBottom: 14 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  backText: { fontSize: 15, fontWeight: '600', color: FtColors.accent },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: FtColors.accentMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: FtColors.text, marginTop: 4 },
  heroSub: { fontSize: 14, color: FtColors.textMuted, marginTop: 8, lineHeight: 20 },
  muted: { color: FtColors.textMuted, marginBottom: 12 },
  errText: { color: FtColors.danger, fontSize: 14, lineHeight: 20 },
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.border,
    marginBottom: 14,
  },
  ingName: { fontSize: 16, fontWeight: '700', color: FtColors.text },
  ingStock: { fontSize: 14, color: FtColors.textMuted, marginTop: 6 },
  rowBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FtColors.border,
    alignItems: 'center',
  },
  btnSecondaryText: { fontWeight: '700', color: FtColors.text },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: FtColors.accent,
    alignItems: 'center',
  },
  btnPrimaryText: { fontWeight: '700', color: FtColors.onAccent },
  cardTitle: { fontSize: 15, fontWeight: '800', color: FtColors.text, marginBottom: 12 },
  movRow: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: FtColors.borderSubtle },
  movLine: { fontSize: 13, color: FtColors.text, fontWeight: '600' },
  movNote: { fontSize: 12, color: FtColors.textMuted, marginTop: 4 },
  movDate: { fontSize: 11, color: FtColors.textFaint, marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: FtColors.surfaceElevated,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: FtColors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: FtColors.text },
  modalSub: { fontSize: 14, color: FtColors.textMuted, marginTop: 6 },
  modalLabel: { fontSize: 12, color: FtColors.textFaint, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: FtColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: FtColors.text,
    fontSize: 16,
  },
  modalOk: {
    marginTop: 18,
    backgroundColor: FtColors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalOkOff: { opacity: 0.6 },
  modalOkText: { fontWeight: '800', color: FtColors.onAccent },
  modalCancel: { textAlign: 'center', marginTop: 14, color: FtColors.accent, fontWeight: '600' },
});
