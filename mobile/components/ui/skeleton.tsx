import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SkeletonProps {
  style?: ViewStyle;
}

export function Skeleton({ style }: SkeletonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  return <View style={[styles.skeleton, { backgroundColor: colors.surface }, style]} />;
}

const styles = StyleSheet.create({
  skeleton: {
    height: 16,
    borderRadius: 8,
    opacity: 0.6,
  },
});
