import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { Btn, useTheme } from '@/lib/ui';

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const t = useTheme();
  const inputStyle = { borderWidth: 1.5, borderColor: t.border, borderRadius: 8, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.field } as const;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode() {
    setCreating(!creating);
    setError(null);
    setMessage(null);
    setConfirm('');
  }

  async function submit() {
    const action = creating ? 'signUp' : 'signIn';
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (creating && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await (action === 'signIn' ? signIn : signUp)(email.trim(), password);
    setBusy(false);
    if (result.error) setError(result.error);
    // With email confirmation on, sign-up returns no session until the link is clicked.
    else if (action === 'signUp') setMessage('Account created. Check your email if confirmation is required.');
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: t.bg }}>
    <View style={{ width: '100%', maxWidth: 400, padding: 28, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '700', color: t.text }}>
        Sergeant
      </Text>
      <Text style={{ color: t.muted, marginBottom: 4 }}>{creating ? 'Create your account' : 'Sign in to continue'}</Text>
      <TextInput
        accessibilityLabel="Email"
        placeholder="Email"
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
        style={inputStyle}
      />
      <TextInput
        accessibilityLabel="Password"
        placeholder="Password"
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        autoComplete={creating ? 'new-password' : 'password'}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        style={inputStyle}
      />
      {creating ? (
        <TextInput
          accessibilityLabel="Confirm password"
          placeholder="Confirm password"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoComplete="new-password"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          editable={!busy}
          style={inputStyle}
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: t.danger, fontWeight: '600' }}>
          {error}
        </Text>
      ) : null}
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: t.text }}>{message}</Text> : null}
      {busy ? <ActivityIndicator accessibilityLabel="Loading" color={t.primary} /> : null}
      <Btn title={creating ? 'Create account' : 'Sign in'} onPress={submit} disabled={busy} />
      <Btn secondary title={creating ? 'Back to sign in' : 'Create account'} onPress={switchMode} disabled={busy} />
    </View>
    </View>
  );
}
