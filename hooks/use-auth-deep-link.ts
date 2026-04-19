import * as Linking from 'expo-linking';
import type { Href, Router } from 'expo-router';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

function parseTokensFromUrl(url: string): {
  access_token: string | null;
  refresh_token: string | null;
  type: string | null;
} {
  const hashPart = url.includes('#') ? (url.split('#')[1] ?? '') : '';
  const beforeHash = url.split('#')[0] ?? '';
  const queryPart = beforeHash.includes('?') ? (beforeHash.split('?')[1] ?? '') : '';

  const fromHash = new URLSearchParams(hashPart);
  const fromQuery = new URLSearchParams(queryPart);

  const access_token = fromHash.get('access_token') ?? fromQuery.get('access_token');
  const refresh_token = fromHash.get('refresh_token') ?? fromQuery.get('refresh_token');
  const type = fromHash.get('type') ?? fromQuery.get('type');

  return { access_token, refresh_token, type };
}

/**
 * Aplica tokens del enlace (confirmación, magic link, recuperación de contraseña).
 * Si `type === recovery`, navega a la pantalla para elegir nueva contraseña.
 */
export function useAuthDeepLink(router: Router | null) {
  useEffect(() => {
    const apply = async (url: string | null) => {
      if (!url) return;
      const { access_token, refresh_token, type } = parseTokensFromUrl(url);
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        if (type === 'recovery' && router) {
          router.replace('/reset-password' as Href);
        }
      }
    };

    void Linking.getInitialURL().then((u) => apply(u));
    const sub = Linking.addEventListener('url', (e) => void apply(e.url));
    return () => sub.remove();
  }, [router]);
}
