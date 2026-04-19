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
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePicker from '@react-native-community/datetimepicker/src/datetimepicker';

import { FtColors } from '@/constants/fasttable';

type Props = {
  visible: boolean;
  tableCode: string;
  onClose: () => void;
  onConfirm: (scheduledAt: Date, partySize: number, note: string) => Promise<void>;
};

const minFutureDate = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
};

export function ReservationModal({ visible, tableCode, onClose, onConfirm }: Props) {
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
            <Text style={styles.kicker}>Mesa {tableCode}</Text>
            <Text style={styles.title}>Reserva</Text>
            <Text style={styles.lead}>Confirma hora y tamaño del grupo.</Text>

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
                  accentColor={FtColors.accent}
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
              placeholderTextColor={FtColors.textFaint}
            />

            <Text style={styles.label}>Nota</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Opcional"
              placeholderTextColor={FtColors.textFaint}
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
                  <ActivityIndicator color={FtColors.onAccent} />
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
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: FtColors.surfaceElevated,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: Platform.OS === 'ios' ? '88%' : '92%',
    borderWidth: 1,
    borderColor: FtColors.borderSubtle,
    borderBottomWidth: 0,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: FtColors.border,
    marginTop: 10,
    marginBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 40 : 32,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FtColors.accentMuted,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '300',
    color: FtColors.text,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  lead: {
    fontSize: 14,
    color: FtColors.textMuted,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.3,
    color: FtColors.textFaint,
    marginBottom: 8,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  iosPickerShell: {
    overflow: 'hidden',
    marginHorizontal: -16,
    marginBottom: 8,
    minHeight: 380,
    justifyContent: 'center',
  },
  iosPicker: {
    width: '100%',
    height: 380,
  },
  dateTrigger: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.border,
  },
  dateTriggerText: {
    fontSize: 17,
    color: FtColors.text,
    fontWeight: '400',
  },
  dateTriggerHint: {
    fontSize: 12,
    color: FtColors.textFaint,
    marginTop: 4,
  },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FtColors.border,
    paddingVertical: 12,
    fontSize: 16,
    color: FtColors.text,
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
    borderColor: FtColors.border,
  },
  secondaryText: { fontSize: 15, color: FtColors.textMuted, fontWeight: '500' },
  primary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: FtColors.accent,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.65 },
  primaryText: { fontSize: 15, fontWeight: '600', color: FtColors.onAccent, letterSpacing: 0.3 },
});
