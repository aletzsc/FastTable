import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type ProfileRow = Database['public']['Tables']['perfiles']['Row'];
type StaffRow = Database['public']['Tables']['personal']['Row'];

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  staffMember: StaffRow | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshStaff: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [staffMember, setStaffMember] = useState<StaffRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      setProfile(null);
      return;
    }
    setProfile(data);
  }, []);

  const loadStaff = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('personal')
      .select('*')
      .eq('id_usuario', userId)
      .eq('activo', true)
      .maybeSingle();
    if (error) {
      setStaffMember(null);
      return;
    }
    setStaffMember(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        await Promise.all([loadProfile(s.user.id), loadStaff(s.user.id)]);
      } else {
        setProfile(null);
        setStaffMember(null);
      }
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setLoading(true);
        void Promise.all([loadProfile(s.user.id), loadStaff(s.user.id)]).finally(() => {
          setLoading(false);
        });
      } else {
        setProfile(null);
        setStaffMember(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, loadStaff]);

  const refreshProfile = useCallback(async () => {
    const id = session?.user?.id;
    if (id) await loadProfile(id);
  }, [session?.user?.id, loadProfile]);

  const refreshStaff = useCallback(async () => {
    const id = session?.user?.id;
    if (id) await loadStaff(id);
  }, [session?.user?.id, loadStaff]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setStaffMember(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      staffMember,
      loading,
      refreshProfile,
      refreshStaff,
      signOut,
    }),
    [session, profile, staffMember, loading, refreshProfile, refreshStaff, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
