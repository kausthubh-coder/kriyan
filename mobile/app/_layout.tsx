import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ConvexClientProvider } from '@/lib/convex';
import { useNotifications } from '@/lib/notifications';
import { DesignColors } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function NotificationHandler() {
  // Initialize notification listeners
  useNotifications();
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Customize the dark theme with our design colors
  const customDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: DesignColors.primary,
      background: DesignColors.background,
      card: DesignColors.surface,
      text: DesignColors.textPrimary,
      border: DesignColors.glassBorder,
    },
  };

  return (
    <ConvexClientProvider>
      <NotificationHandler />
      <ThemeProvider value={isDark ? customDarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{
              presentation: 'modal',
              title: 'Task',
              headerStyle: {
                backgroundColor: isDark ? DesignColors.surface : '#fff',
              },
              headerTintColor: isDark ? DesignColors.textPrimary : '#11181C',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="note-modal"
            options={{
              presentation: 'modal',
              title: 'Note',
              headerStyle: {
                backgroundColor: isDark ? DesignColors.surface : '#fff',
              },
              headerTintColor: isDark ? DesignColors.textPrimary : '#11181C',
              headerShown: false,
            }}
          />
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </ConvexClientProvider>
  );
}
