import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Confirmation links open here from any device; must be listed in Supabase Auth > URL Configuration.
export const WEB_APP_URL = 'https://sergiojaz.github.io/sergeant-web/';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase config: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in app/.env (see app/.env.example).'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Static web export renders in Node, where AsyncStorage's web backend has no window.
    storage: typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web signs in from the email confirmation link's #access_token.
    detectSessionInUrl: typeof window !== 'undefined' && Platform.OS === 'web',
  },
});
