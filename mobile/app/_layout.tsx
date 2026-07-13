import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { useNotificationResponseObserver } from '@/lib/notifications'
import { ProductStoreProvider } from '@/lib/product-store'

export const unstable_settings = { anchor: '(tabs)' }

function NotificationHandler() {
  useNotificationResponseObserver()
  return null
}

export default function RootLayout() {
  const isDark = useColorScheme() === 'dark'
  return (
    <ProductStoreProvider>
      <NotificationHandler />
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
          <Stack.Screen name="notes" options={{ title: 'Notes' }} />
          <Stack.Screen name="knowledge" options={{ title: 'Knowledge' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </ProductStoreProvider>
  )
}
