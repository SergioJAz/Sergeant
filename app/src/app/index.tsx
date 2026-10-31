import { Text, View } from 'react-native';

export default function TodayScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text accessibilityRole="header">Today</Text>
    </View>
  );
}
