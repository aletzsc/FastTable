import { useRouter } from 'expo-router';

import { useAuthDeepLink } from '@/hooks/use-auth-deep-link';

/** Montar junto al Stack del root (no como pantalla en `app/`). */
export function DeepLinkBridge() {
  const router = useRouter();
  useAuthDeepLink(router);
  return null;
}
