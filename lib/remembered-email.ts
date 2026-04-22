import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_LAST_EMAIL = 'ft:last-email';

export async function getRememberedEmail(): Promise<string> {
  const value = await AsyncStorage.getItem(KEY_LAST_EMAIL);
  return value?.trim() ?? '';
}

export async function setRememberedEmail(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean) return;
  await AsyncStorage.setItem(KEY_LAST_EMAIL, clean);
}
