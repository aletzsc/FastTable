import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { FtColors } from '@/constants/fasttable';
import { formatPriceFromCents } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Item = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_centavos: number;
  disponible: boolean;
};

type Category = {
  id: string;
  nombre: string;
  orden: number;
  items_menu: Item[] | null;
};

export default function MenuScreen() {
  const [sections, setSections] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: qError } = await supabase
      .from('categorias_menu')
      .select('id, nombre, orden, items_menu ( id, nombre, descripcion, precio_centavos, disponible )')
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

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.intro}>Carta del restaurante</Text>

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
            <View key={item.id} style={[styles.row, !item.disponible && styles.rowDisabled]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.nombre}</Text>
                {item.descripcion ? <Text style={styles.itemDesc}>{item.descripcion}</Text> : null}
                {!item.disponible ? <Text style={styles.unavailable}>No disponible</Text> : null}
              </View>
              <Text style={styles.price}>{formatPriceFromCents(item.precio_centavos)}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: FtColors.background },
  content: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 14, color: FtColors.textMuted, marginBottom: 16, lineHeight: 20 },
  loader: { marginVertical: 16 },
  err: { color: '#B91C1C', marginBottom: 12, fontSize: 14 },
  empty: { fontSize: 14, color: FtColors.textMuted },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: FtColors.text,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: FtColors.border,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: FtColors.border,
  },
  rowDisabled: { opacity: 0.65 },
  itemName: { fontSize: 15, fontWeight: '600', color: FtColors.text },
  itemDesc: { fontSize: 13, color: FtColors.textMuted, marginTop: 2 },
  unavailable: { fontSize: 12, color: FtColors.warning, marginTop: 4 },
  price: { fontSize: 15, fontWeight: '600', color: FtColors.accent },
});
