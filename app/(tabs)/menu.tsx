import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { FtColors } from '@/constants/fasttable';
import { fetchLineasCuentaComensal } from '@/lib/cuenta-comensal';
import { mapCocinaRpcError } from '@/lib/cocina-errors';
import { formatPriceFromCents } from '@/lib/format';
import { fetchMesaActivaComensal, type MesaActiva } from '@/lib/mesa-activa';
import { supabase } from '@/lib/supabase';

type Item = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_centavos: number;
  disponible: boolean;
  imagen_url: string | null;
};

type Category = {
  id: string;
  nombre: string;
  orden: number;
  items_menu: Item[] | null;
};

function placeholderImage(itemId: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(itemId)}-ft/600/400`;
}

export default function MenuScreen() {
  const { user } = useAuth();
  const [sections, setSections] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mesaActiva, setMesaActiva] = useState<MesaActiva | null>(null);
  const [cuenta, setCuenta] = useState<Awaited<ReturnType<typeof fetchLineasCuentaComensal>> | null>(null);
  const [modalItem, setModalItem] = useState<Item | null>(null);
  const [qty, setQty] = useState(1);
  const [nota, setNota] = useState('');
  const [sending, setSending] = useState(false);

  const loadMesaYCuenta = useCallback(async () => {
    const m = await fetchMesaActivaComensal();
    setMesaActiva(m);
    if (m) {
      const c = await fetchLineasCuentaComensal(m.id_mesa);
      setCuenta(c);
    } else {
      setCuenta(null);
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: qError } = await supabase
      .from('categorias_menu')
      .select('id, nombre, orden, items_menu ( id, nombre, descripcion, precio_centavos, disponible, imagen_url )')
      .order('orden');
    if (qError) {
      setError(qError.message);
      setSections([]);
      return;
    }
    const sorted = (data ?? []).map((c) => ({
      ...c,
      items_menu: [...(c.items_menu ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }));
    setSections(sorted);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([load(), loadMesaYCuenta()]).finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load, loadMesaYCuenta]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadMesaYCuenta()]);
    setRefreshing(false);
  }, [load, loadMesaYCuenta]);

  const openModal = (item: Item) => {
    if (!item.disponible) return;
    if (!mesaActiva) {
      Alert.alert(
        'Mesa',
        'Solo puedes pedir cuando tu reserva está atendida y estás en mesa (el mesero debe haber confirmado tu llegada).',
      );
      return;
    }
    setModalItem(item);
    setQty(1);
    setNota('');
  };

  const enviarPedido = async () => {
    if (!modalItem || !user) return;
    setSending(true);
    try {
      const { error: rpcErr } = await supabase.rpc('crear_pedido_cocina', {
        p_id_item: modalItem.id,
        p_cantidad: qty,
        p_nota: nota.trim() || null,
      });
      if (rpcErr) {
        Alert.alert('Pedido', mapCocinaRpcError(rpcErr.message));
        return;
      }
      Alert.alert('Enviado', 'Tu pedido llegó a cocina.');
      setModalItem(null);
      await loadMesaYCuenta();
    } finally {
      setSending(false);
    }
  };

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
      <Text style={styles.eyebrow}>Carta</Text>
      <Text style={styles.intro}>Toca un plato para pedir (solo con reserva en mesa).</Text>

      {mesaActiva ? (
        <View style={styles.mesaBanner}>
          <Ionicons name="restaurant" size={18} color={FtColors.success} />
          <Text style={styles.mesaBannerText}>
            Mesa {mesaActiva.codigo} · puedes pedir a cocina
          </Text>
        </View>
      ) : (
        <View style={styles.warnBanner}>
          <Ionicons name="information-circle-outline" size={18} color={FtColors.warning} />
          <Text style={styles.warnBannerText}>
            Sin mesa activa: necesitas reserva atendida y estar sentado para pedir platos.
          </Text>
        </View>
      )}

      {mesaActiva ? (
        <View style={styles.cuentaCard}>
          <Text style={styles.cuentaTitle}>Tu cuenta</Text>
          <Text style={styles.cuentaHint}>
            Se oculta cuando el mesero marca la mesa como libre al terminar el servicio.
          </Text>
          {cuenta && cuenta.lines.length > 0 ? (
            <>
              {cuenta.lines.map((ln) => (
                <View key={ln.id} style={styles.cuentaRow}>
                  <Text style={styles.cuentaLine}>
                    {ln.cantidad}× {ln.nombre}
                  </Text>
                  <Text style={styles.cuentaSub}>{formatPriceFromCents(ln.subtotal_centavos)}</Text>
                </View>
              ))}
              <View style={styles.cuentaTotalRow}>
                <Text style={styles.cuentaTotalLabel}>Total estimado</Text>
                <Text style={styles.cuentaTotal}>{formatPriceFromCents(cuenta.total_centavos)}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.cuentaEmpty}>Aún no hay platos en tu cuenta.</Text>
          )}
        </View>
      ) : null}

      {loading && !refreshing ? (
        <ActivityIndicator color={FtColors.accent} style={styles.loader} />
      ) : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {!loading && !error && sections.length === 0 ? (
        <Text style={styles.empty}>El menú estará disponible pronto.</Text>
      ) : null}

      {sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.nombre}</Text>
          {(section.items_menu ?? []).map((item) => (
            <Pressable
              key={item.id}
              style={[styles.row, !item.disponible && styles.rowDisabled]}
              onPress={() => openModal(item)}
              disabled={!item.disponible}>
              <Image
                source={{ uri: item.imagen_url || placeholderImage(item.id) }}
                style={styles.thumb}
                contentFit="cover"
                transition={200}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.nombre}</Text>
                {item.descripcion ? <Text style={styles.itemDesc} numberOfLines={2}>{item.descripcion}</Text> : null}
                {!item.disponible ? <Text style={styles.unavailable}>No disponible</Text> : null}
              </View>
              <Text style={styles.price}>{formatPriceFromCents(item.precio_centavos)}</Text>
            </Pressable>
          ))}
        </View>
      ))}

      <Modal visible={modalItem != null} animationType="slide" transparent onRequestClose={() => setModalItem(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setModalItem(null)}>
          <View style={styles.modalSheet}>
            {modalItem ? (
              <>
                <Image
                  source={{ uri: modalItem.imagen_url || placeholderImage(modalItem.id) }}
                  style={styles.modalImg}
                  contentFit="cover"
                />
                <Text style={styles.modalTitle}>{modalItem.nombre}</Text>
                <Text style={styles.modalDesc}>{modalItem.descripcion || 'Plato de la carta.'}</Text>
                <Text style={styles.modalPrice}>{formatPriceFromCents(modalItem.precio_centavos)} c/u</Text>

                <Text style={styles.label}>Cantidad</Text>
                <View style={styles.qtyRow}>
                  <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyVal}>{qty}</Text>
                  <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.min(99, q + 1))}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>

                <Text style={styles.label}>Notas para cocina (opcional)</Text>
                <TextInput
                  value={nota}
                  onChangeText={setNota}
                  placeholder="Ej. sin cebolla, bien cocido…"
                  placeholderTextColor={FtColors.textMuted}
                  multiline
                  style={styles.notaInput}
                />

                <Pressable
                  style={[styles.sendBtn, sending && styles.sendBtnOff]}
                  onPress={enviarPedido}
                  disabled={sending}>
                  <Text style={styles.sendBtnText}>{sending ? 'Enviando…' : 'Enviar a cocina'}</Text>
                </Pressable>
                <Pressable style={styles.cancelBtn} onPress={() => setModalItem(null)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: FtColors.background },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: FtColors.accentMuted,
    marginBottom: 6,
  },
  intro: { fontSize: 15, color: FtColors.textMuted, marginBottom: 14, lineHeight: 22 },
  mesaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(125,206,160,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125,206,160,0.35)',
    marginBottom: 16,
  },
  mesaBannerText: { flex: 1, fontSize: 14, color: FtColors.success, fontWeight: '600' },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(216,181,106,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(216,181,106,0.35)',
    marginBottom: 16,
  },
  warnBannerText: { flex: 1, fontSize: 13, color: FtColors.warning, lineHeight: 19 },
  cuentaCard: {
    marginBottom: 18,
    padding: 16,
    borderRadius: 14,
    backgroundColor: FtColors.surfaceElevated,
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
  },
  cuentaTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: FtColors.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cuentaHint: { fontSize: 12, color: FtColors.textFaint, marginBottom: 12, lineHeight: 18 },
  cuentaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.borderSubtle,
  },
  cuentaLine: { flex: 1, fontSize: 14, color: FtColors.text, lineHeight: 20 },
  cuentaSub: { fontSize: 14, fontWeight: '600', color: FtColors.accent },
  cuentaTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 4,
  },
  cuentaTotalLabel: { fontSize: 15, fontWeight: '700', color: FtColors.text },
  cuentaTotal: { fontSize: 18, fontWeight: '800', color: FtColors.accent },
  cuentaEmpty: { fontSize: 14, color: FtColors.textMuted, fontStyle: 'italic' },
  loader: { marginVertical: 16 },
  err: { color: FtColors.danger, marginBottom: 12, fontSize: 14 },
  empty: { fontSize: 14, color: FtColors.textMuted },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: FtColors.textFaint,
    marginBottom: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.borderSubtle,
  },
  rowDisabled: { opacity: 0.55 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: FtColors.surface },
  itemName: { fontSize: 15, fontWeight: '600', color: FtColors.text },
  itemDesc: { fontSize: 13, color: FtColors.textMuted, marginTop: 2 },
  unavailable: { fontSize: 12, color: FtColors.warning, marginTop: 4 },
  price: { fontSize: 15, fontWeight: '600', color: FtColors.accent },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#14110e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: FtColors.border,
  },
  modalImg: { width: '100%', height: 200, borderRadius: 14, marginBottom: 14, backgroundColor: FtColors.surface },
  modalTitle: { fontSize: 22, fontWeight: '800', color: FtColors.text },
  modalDesc: { fontSize: 14, color: FtColors.textMuted, marginTop: 8, lineHeight: 21 },
  modalPrice: { fontSize: 16, fontWeight: '700', color: FtColors.accent, marginTop: 10 },
  label: { fontSize: 12, fontWeight: '700', color: FtColors.textFaint, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: FtColors.surface,
    borderWidth: 1,
    borderColor: FtColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 22, color: FtColors.text, fontWeight: '600' },
  qtyVal: { fontSize: 20, fontWeight: '800', color: FtColors.text, minWidth: 36, textAlign: 'center' },
  notaInput: {
    borderWidth: 1,
    borderColor: FtColors.border,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    color: FtColors.text,
    backgroundColor: FtColors.surface,
    textAlignVertical: 'top',
  },
  sendBtn: {
    marginTop: 20,
    backgroundColor: FtColors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  sendBtnOff: { opacity: 0.7 },
  sendBtnText: { color: FtColors.onAccent, fontWeight: '800', fontSize: 16 },
  cancelBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { color: FtColors.textMuted, fontSize: 16 },
});
