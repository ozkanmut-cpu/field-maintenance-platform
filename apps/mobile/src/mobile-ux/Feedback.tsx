import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { scheduleToastDismiss } from './toast-lifecycle';

export type ToastTone = 'success' | 'warning' | 'error';

export function Toast({ message, tone = 'success', onDismiss, durationMs = 4000 }: { message: string | null; tone?: ToastTone; onDismiss?: () => void; durationMs?: number }) {
  useEffect(() => scheduleToastDismiss(message, onDismiss, durationMs), [message, durationMs]);
  if (!message) return null;
  return <View pointerEvents="none" accessibilityRole="alert" style={[styles.toast, tone === 'success' ? styles.success : tone === 'warning' ? styles.warning : styles.error]}>
    <Text style={styles.message}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 18, right: 18, bottom: 88, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center', shadowColor: '#173349', shadowOpacity: .16, shadowRadius: 12, elevation: 8 },
  success: { backgroundColor: '#19794A' },
  warning: { backgroundColor: '#A96308' },
  error: { backgroundColor: '#B7372F' },
  message: { color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
