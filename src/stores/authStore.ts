import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile, Role } from '../types';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      set({ user: session.user, session, profile, loading: false, initialized: true });
    } else {
      set({ loading: false, initialized: true });
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        (async () => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          set({ user: session.user, session, profile, loading: false });
        })();
      } else {
        set({ user: null, session: null, profile: null, loading: false });
      }
    });
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false });
      throw error;
    }
  },

  signUp: async (email: string, password: string, fullName: string) => {
    set({ loading: true });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      set({ loading: false });
      throw error;
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null });
  },

  updateProfile: async (updates: Partial<Profile>) => {
    const { profile } = get();
    if (!profile) return;
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id);
    if (error) throw error;
    set({ profile: { ...profile, ...updates } });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    set({ profile });
  },
}));

export function hasRole(minRole: Role): boolean {
  const { profile } = useAuthStore.getState();
  if (!profile) return false;
  const hierarchy: Record<Role, number> = { team_member: 0, admin: 1, super_admin: 2 };
  return hierarchy[profile.role] >= hierarchy[minRole];
}
