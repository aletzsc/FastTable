/** Evita resolver el index.js del paquete en runtime (Metro + DateTimePickerAndroid). */
declare module '@react-native-community/datetimepicker/src/datetimepicker' {
  import type { FC } from 'react';
  import type {
    AndroidNativeProps,
    IOSNativeProps,
    WindowsNativeProps,
  } from '@react-native-community/datetimepicker';

  const RNDateTimePicker: FC<IOSNativeProps | AndroidNativeProps | WindowsNativeProps>;
  export default RNDateTimePicker;
}
