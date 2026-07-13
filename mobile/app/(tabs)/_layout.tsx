import { Tabs } from 'expo-router'

import { HapticTab } from '@/components/haptic-tab'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function TabLayout() {
  const colors = Colors[useColorScheme() ?? 'light']
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: colors.tabIconSelected, tabBarInactiveTintColor: colors.tabIconDefault,
      headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false,
      tabBarButton: HapticTab, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: ({ color }) => <IconSymbol size={24} name="checkmark.circle.fill" color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} /> }} />
      <Tabs.Screen name="agent" options={{ title: 'Agent', tabBarIcon: ({ color }) => <IconSymbol size={24} name="paperplane.fill" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color }) => <IconSymbol size={24} name="ellipsis" color={color} /> }} />
    </Tabs>
  )
}
