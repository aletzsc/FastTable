import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePicker from '@react-native-community/datetimepicker/src/datetimepicker';

import { Comensal } from '@/constants/theme-comensal';
import { tableImageUrl } from '@/lib/table-image';

type Props = {
  visible: boolean;
  tableCode: string;
  /** Imagen de cabecera (URL). Si falta, se usa un placeholder. */
  tableHeroImageUrl?: string | null;
  /** Texto descriptivo de la mesa para el comensal. */
  tableDescription?: string | null;
  zoneName?: string | null;
  capacity?: number;
  onClose: () => void;
  onConfirm: (scheduledAt: Date, partySize: number, note: string) => Promise<void>;
};

const minFutureDate = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
};

export function ReservationModal({
  visible,
  tableCode,
  tableHeroImageUrl,
  tableDescription,
  zoneName,
  capacity,
  onClose,
  onConfirm,
}: Props) {
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    d.setSeconds(0, 0);
    return d;
  });
  const [partySize, setPartySize] = useState('2');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAndroidDate, setShowAndroidDate] = useState(false);
  const [showAndroidTime, setShowAndroidTime] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    d.setSeconds(0, 0);
    setWhen(d);
    setPartySize('2');
    setNote('');
    setShowAndroidDate(false);
    setShowAndroidTime(false);
  }, [visible]);

  const onIosChange = (_e: DateTimePickerEvent, date?: Date) => {
    if (date) setWhen(date);
  };

  const onAndroidDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowAndroidDate(false);
    if (!selected) return;
    const n = new Date(when);
    n.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    setWhen(n);
    setShowAndroidTime(true);
  };

  const onAndroidTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowAndroidTime(false);
    if (!selected) return;
    const n = new Date(when);
    n.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setWhen(n);
  };

  const submit = async () => {
    const n = parseInt(partySize, 10);
    if (Number.isNaN(n) || n < 1) return;
    if (when.getTime() <= Date.now()) {
      Alert.alert('Fecha y hora', 'Elige un momento futuro.');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(when, n, note.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const formattedWhen = when.toLocaleString('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
      {...(Platform.OS === 'android' ? { hardwareAccelerated: false } : {})}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.sheetHandle} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            <Image
              source={{ uri: tableImageUrl(tableCode, tableHeroImageUrl) }}
              style={styles.heroImg}
              contentFit="cover"
              transition={200}
            />
            <Text style={styles.kicker}>Mesa {tableCode}</Text>
            <Text style={styles.title}>Reserva</Text>
            {zoneName != null || capacity != null ? (
              <Text style={styles.metaLine}>
                {[zoneName, capacity != null ? `${capacity} plazas` : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            <Text style={styles.desc}>
              {tableDescription?.trim() ||
                'Descripción de la mesa: podrás personalizarla desde el panel del restaurante.'}
            </Text>

            <Text style={styles.sectionLabel}>Datos de la reserva</Text>
            <Text style={styles.lead}>Elige fecha, hora y tamaño del grupo.</Text>

            <Text style={styles.label}>Fecha y hora</Text>
            {Platform.OS === 'ios' ? (
              <View style={styles.iosPickerShell}>
                <DateTimePicker
                  value={when}
                  mode="datetime"
                  display="inline"
                  onChange={onIosChange}
                  locale="es_ES"
                  themeVariant="dark"
                  accentColor={Comensal.accent}
                  minimumDate={minFutureDate()}
                  style={styles.iosPicker}
                />
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.dateTrigger}
                  onPress={() => {
                    setShowAndroidTime(false);
                    setShowAndroidDate(true);
                  }}>
                  <Text style={styles.dateTriggerText}>{formattedWhen}</Text>
                  <Text style={styles.dateTriggerHint}>Toca para cambiar</Text>
                </Pressable>
                {showAndroidDate ? (
                  <DateTimePicker
                    value={when}
                    mode="date"
                    display="default"
                    onChange={onAndroidDateChange}
                    minimumDate={minFutureDate()}
                  />
                ) : null}
                {showAndroidTime ? (
                  <DateTimePicker
                    value={when}
                    mode="time"
                    display="default"
                    onChange={onAndroidTimeChange}
                    is24Hour
                  />
                ) : null}
              </>
            )}

            <Text style={styles.label}>Personas</Text>
            <TextInput
              value={partySize}
              onChangeText={setPartySize}
              keyboardType="number-pad"
              style={styles.input}
              placeholder="2"
              placeholderTextColor={Comensal.textFaint}
            />

            <Text style={styles.label}>Nota</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Opcional"
              placeholderTextColor={Comensal.textFaint}
              style={[styles.input, styles.inputMulti]}
              multiline
            />

            <View style={styles.actions}>
              <Pressable style={styles.secondary} onPress={onClose} disabled={busy}>
                <Text style={styles.secondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.primary, busy && styles.primaryDisabled]}
                onPress={submit}
                disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={Comensal.onAccent} />
                ) : (
                  <Text style={styles.primaryText}>Confirmar</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Comensal.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Comensal.surfaceElevated,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: Platform.OS === 'ios' ? '88%' : '92%',
    borderWidth: 1,
    borderColor: Comensal.borderSubtle,
    borderBottomWidth: 0,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Comensal.border,
    marginTop: 10,
    marginBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 40 : 32,
  },
  heroImg: {
    width: '100%',
    height: 190,
    borderRadius: Comensal.radiusMd,
    marginBottom: 16,
    backgroundColor: Comensal.heroImgFallback,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Comensal.accentMuted,
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: Comensal.text,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  metaLine: { fontSize: 13, color: Comensal.textFaint, marginBottom: 10 },
  desc: {
    fontSize: 14,
    color: Comensal.textMuted,
    lineHeight: 22,
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Comensal.accentMuted,
    marginBottom: 6,
  },
  lead: {
    fontSize: 14,
    color: Comensal.textMuted,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.3,
    color: Comensal.textFaint,
    marginBottom: 8,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  iosPickerShell: {
    overflow: 'hidden',
    alignItems: 'center',
    marginHorizontal: 0,
    marginBottom: 8,
    minHeight: 380,
    justifyContent: 'center',
  },
  iosPicker: {
    width: '100%',
    maxWidth: 340,
    height: 380,
  },
  dateTrigger: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: Comensal.radiusSm,
    borderWidth: 1,
    borderColor: Comensal.border,
    backgroundColor: Comensal.surfaceInput,
  },
  dateTriggerText: {
    fontSize: 17,
    color: Comensal.text,
    fontWeight: '400',
  },
  dateTriggerHint: {
    fontSize: 12,
    color: Comensal.textFaint,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Comensal.border,
    borderRadius: Comensal.radiusSm,
    backgroundColor: Comensal.surfaceInput,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: Comensal.text,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  secondary: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Comensal.border,
  },
  secondaryText: { fontSize: 15, color: Comensal.textMuted, fontWeight: '500' },
  primary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: Comensal.accent,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.65 },
  primaryText: { fontSize: 15, fontWeight: '600', color: Comensal.onAccent, letterSpacing: 0.3 },
});
