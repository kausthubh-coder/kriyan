import React from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  Alert,
  Linking,
} from 'react-native';
import { useQuery } from 'convex/react';
import * as Notifications from 'expo-notifications';

import { api } from '../../../convex/_generated/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, DesignColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface SettingsRowProps {
  icon: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  colors: typeof Colors.dark;
}

function SettingsRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  showChevron = true,
  colors,
}: SettingsRowProps) {
  const content = (
    <View style={[styles.settingsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.iconContainer, { backgroundColor: (iconColor || colors.primary) + '20' }]}>
        <IconSymbol size={18} name={icon as any} color={iconColor || colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <ThemedText style={styles.rowTitle}>{title}</ThemedText>
        {subtitle && (
          <ThemedText style={[styles.rowSubtitle, { color: colors.textMuted }]}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      <View style={styles.rowRight}>
        {value && (
          <ThemedText style={[styles.rowValue, { color: colors.textSecondary }]}>
            {value}
          </ThemedText>
        )}
        {showChevron && onPress && (
          <IconSymbol size={16} name="chevron.right" color={colors.textMuted} />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function SettingsSection({ title, children, colors }: { title: string; children: React.ReactNode; colors: typeof Colors.dark }) {
  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</ThemedText>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const settings = useQuery(api.settings.get);

  const handleNotificationSettings = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Notifications Disabled',
        'Would you like to enable notifications in Settings?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    } else {
      Alert.alert('Notifications', 'Notifications are enabled');
    }
  };

  const handleOpenConvex = () => {
    Linking.openURL('https://dashboard.convex.dev');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* App Info */}
        <View style={styles.header}>
          <View style={[styles.appIcon, { backgroundColor: colors.primary }]}>
            <ThemedText style={styles.appIconText}>K</ThemedText>
          </View>
          <ThemedText style={styles.appName}>Kriyan</ThemedText>
          <ThemedText style={[styles.appVersion, { color: colors.textMuted }]}>
            Version 1.0.0
          </ThemedText>
        </View>

        {/* Notifications */}
        <SettingsSection title="NOTIFICATIONS" colors={colors}>
          <SettingsRow
            icon="bell.fill"
            iconColor={colors.warning}
            title="Push Notifications"
            subtitle={settings?.expoPushToken ? 'Connected' : 'Not connected'}
            onPress={handleNotificationSettings}
            colors={colors}
          />
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection title="APPEARANCE" colors={colors}>
          <SettingsRow
            icon="moon.fill"
            iconColor="#6366f1"
            title="Theme"
            value={colorScheme === 'dark' ? 'Dark' : 'Light'}
            showChevron={false}
            colors={colors}
          />
        </SettingsSection>

        {/* Data */}
        <SettingsSection title="DATA" colors={colors}>
          <SettingsRow
            icon="cloud.fill"
            iconColor={colors.accent}
            title="Convex Dashboard"
            subtitle="Manage your database"
            onPress={handleOpenConvex}
            colors={colors}
          />
        </SettingsSection>

        {/* About */}
        <SettingsSection title="ABOUT" colors={colors}>
          <SettingsRow
            icon="info.circle.fill"
            iconColor={colors.textSecondary}
            title="About Kriyan"
            subtitle="Personal Second Brain"
            showChevron={false}
            colors={colors}
          />
        </SettingsSection>

        {/* Footer */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: colors.textMuted }]}>
            Built with Convex, Expo & React Native
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  appIconText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
  },
  appVersion: {
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  sectionContent: {
    gap: 8,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    fontSize: 14,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 13,
  },
});
