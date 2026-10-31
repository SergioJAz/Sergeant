import { useState } from 'react';
import { ActivityIndicator, Button, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/lib/auth';

const inputStyle = { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10 } as const;

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(action: 'signIn' | 'signUp') {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
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
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 24 }}>
        Sign in
      </Text>
      <TextInput
        accessibilityLabel="Email"
        placeholder="Email"
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
        autoCapitalize="none"
        autoComplete="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        style={inputStyle}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: '#c00' }}>
          {error}
        </Text>
      ) : null}
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
      {busy ? <ActivityIndicator accessibilityLabel="Loading" /> : null}
      <Button title="Sign in" onPress={() => submit('signIn')} disabled={busy} />
      <Button title="Create account" onPress={() => submit('signUp')} disabled={busy} />
    </View>
  );
}
