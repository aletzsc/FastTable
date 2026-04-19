import * as Linking from 'expo-linking';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

function parseTokensFromUrl(url: string): { access_token: string | null; refresh_token: string | null } {
  const hashPart = url.includes('#') ? (url.split('#')[1] ?? '') : '';
  const beforeHash = url.split('#')[0] ?? '';
  const queryPart = beforeHash.includes('?') ? (beforeHash.split('?')[1] ?? '') : '';

  const fromHash = new URLSearchParams(hashPart);
  const fromQuery = new URLSearchParams(queryPart);

  const access_token = fromHash.get('access_token') ?? fromQuery.get('access_token');
  const refresh_token = fromHash.get('refresh_token') ?? fromQuery.get('refresh_token');

  return { access_token, refresh_token };
}

export function useAuthDeepLink() {
  useEffect(() => {
    const apply = async (url: string | null) => {
      if (!url) return;
      const { access_token, refresh_token } = parseTokensFromUrl(url);
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }
    };

    void Linking.getInitialURL().then((u) => apply(u));
    const sub = Linking.addEventListener('url', (e) => void apply(e.url));
    return () => sub.remove();
  }, []);
}
