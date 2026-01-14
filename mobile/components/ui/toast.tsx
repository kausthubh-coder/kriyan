import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ToastProps {
  title: string;
  description?: string;
  variant?: 'success' | 'error' | 'info';
}

export function Toast({ title, description, variant = 'info' }: ToastProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const variantStyles = {
    success: { backgroundColor: `${colors.success}20`, textColor: colors.success },
    error: { backgroundColor: `${colors.error}20`, textColor: colors.error },
    info: { backgroundColor: colors.surface, textColor: colors.text },
  };

  const currentVariant = variantStyles[variant];

  return (
    <View style={[styles.toast, { backgroundColor: currentVariant.backgroundColor }]}
      >
      <Text style={[styles.title, { color: currentVariant.textColor }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    padding: 12,
    borderRadius: 12,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
  },
});
