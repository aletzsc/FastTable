import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
// Entry de plataforma (datetimepicker.ios.js / .android.js): evita index.js que importa DateTimePickerAndroid
// y falla en Metro con "Unable to resolve ./DateTimePickerAndroid".
import DateTimePicker from '@react-native-community/datetimepicker/src/datetimepicker';

import { FtColors } from '@/constants/fasttable';

type Props = {
  visible: boolean;
  tableCode: string;
  onClose: () => void;
  onConfirm: (scheduledAt: Date, partySize: number, note: string) => Promise<void>;
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
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    d.setSeconds(0, 0);
    setWhen(d);
    setPartySize('2');
    setNote('');
    setShowDate(false);
    setShowTime(false);
  }, [visible]);

  const applyDate = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowDate(false);
    if (selected) {
      const n = new Date(when);
      n.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setWhen(n);
      if (Platform.OS === 'android') setShowTime(true);
    }
  };

  const applyTime = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowTime(false);
    if (selected) {
      const n = new Date(when);
      n.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setWhen(n);
    }
  };

  const submit = async () => {
    const n = parseInt(partySize, 10);
    if (Number.isNaN(n) || n < 1) return;
    setBusy(true);
    try {
      await onConfirm(when, n, note.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Reservar mesa {tableCode}</Text>
          <Text style={styles.label}>Fecha y hora</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={when}
              mode="datetime"
              display="spinner"
              onChange={(_e: DateTimePickerEvent, d?: Date) => d && setWhen(d)}
              locale="es"
            />
          ) : (
            <>
              <Pressable style={styles.dateBtn} onPress={() => setShowDate(true)}>
                <Text style={styles.dateBtnText}>
                  {when.toLocaleString('es', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </Pressable>
              {showDate ? (
                <DateTimePicker value={when} mode="date" display="default" onChange={applyDate} />
              ) : null}
              {showTime ? (
                <DateTimePicker value={when} mode="time" display="default" onChange={applyTime} />
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
            placeholderTextColor={FtColors.textMuted}
          />

          <Text style={styles.label}>Nota (opcional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ej. cumpleaños, sillita para bebé…"
            placeholderTextColor={FtColors.textMuted}
            style={[styles.input, styles.inputMulti]}
            multiline
          />

          <Text style={styles.hint}>
            El personal recibirá la visita en la mesa unos minutos después de la hora acordada.
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={onClose} disabled={busy}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, busy && styles.primaryDisabled]}
              onPress={submit}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#FFFBEB" />
              ) : (
                <Text style={styles.primaryText}>Confirmar</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: FtColors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  title: { fontSize: 18, fontWeight: '700', color: FtColors.text, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: FtColors.text, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: FtColors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: FtColors.text,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: FtColors.textMuted, marginTop: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  secondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FtColors.border,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 16, fontWeight: '600', color: FtColors.text },
  primary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: FtColors.accent,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.7 },
  primaryText: { fontSize: 16, fontWeight: '600', color: '#FFFBEB' },
  dateBtn: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FtColors.border,
    backgroundColor: FtColors.background,
  },
  dateBtnText: { fontSize: 16, color: FtColors.text },
});
