import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DueTask } from '../api';
import { isEquipmentComplete } from './task-presentation';
import { searchMatchLabel } from '../search';

type TaskCardProps = {
  task: DueTask;
  deviceLocation?: { latitude: number; longitude: number } | null;
  search?: string;
  onPress: (task: DueTask) => void;
};

function distanceMeters(origin: { latitude: number; longitude: number }, task: DueTask) {
  if (task.latitude == null || task.longitude == null) return null;
  const radius = 6371000;
  const latitude = origin.latitude * Math.PI / 180;
  const taskLatitude = task.latitude * Math.PI / 180;
  const latitudeDifference = (task.latitude - origin.latitude) * Math.PI / 180;
  const longitudeDifference = (task.longitude - origin.longitude) * Math.PI / 180;
  const value = Math.sin(latitudeDifference / 2) ** 2 + Math.cos(latitude) * Math.cos(taskLatitude) * Math.sin(longitudeDifference / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function formatDistance(distance: number) {
  return distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(distance < 10000 ? 1 : 0)} km`;
}

export function TaskCard({ task, deviceLocation, search = '', onPress }: TaskCardProps) {
  const overdue = task.priority === 'OVERDUE';
  const distance = deviceLocation ? distanceMeters(deviceLocation, task) : null;
  const equipmentComplete = isEquipmentComplete(task);
  const matchLabel = searchMatchLabel(search, [{ label: 'ad', value: task.pointName }, { label: 'kod', value: task.pointCode }, { label: 'bölge', value: task.regionName }, { label: 'adres', value: task.address }, ...task.aliases?.map(value => ({ label: 'eski ad', value })) ?? []]);

  return <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={`${task.pointName} iş detayını aç`}
    style={styles.card}
    onPress={() => onPress(task)}
  >
    <View style={styles.topRow}>
      <View style={[styles.status, overdue ? styles.overdueStatus : styles.currentStatus]}>
        <View style={[styles.dot, overdue ? styles.overdueDot : styles.currentDot]} />
        <Text style={[styles.statusText, overdue ? styles.overdueText : styles.currentText]}>{overdue ? 'GECİKMİŞ' : 'BU HAFTA'}{task.overduePeriods > 0 ? ` · ${task.overduePeriods} dönem` : ''}</Text>
      </View>
      <Feather name="chevron-right" size={20} color="#7B8A97" />
    </View>
    <Text style={styles.name}>{task.pointName}</Text>
    <Text style={styles.meta}>{task.pointCode} · {task.regionName}{distance != null ? ` · ${formatDistance(distance)}` : ''}</Text>
    {matchLabel ? <Text style={styles.matchText}>Eşleşme: {matchLabel}</Text> : null}
    {!equipmentComplete && <View style={styles.warning}><Feather name="tool" size={14} color="#A96308" /><Text style={styles.warningText}>Ekipman bilgisi eksik</Text></View>}
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 14, gap: 7, minHeight: 132, shadowColor: '#173349', shadowOpacity: .03, shadowRadius: 8, elevation: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  overdueStatus: { backgroundColor: '#FDEDEC' }, currentStatus: { backgroundColor: '#FFF4E4' },
  dot: { width: 7, height: 7, borderRadius: 4 }, overdueDot: { backgroundColor: '#B7372F' }, currentDot: { backgroundColor: '#A96308' },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: .35 }, overdueText: { color: '#B7372F' }, currentText: { color: '#A96308' },
  name: { color: '#173349', fontSize: 16, fontWeight: '900' }, meta: { color: '#70818E', fontSize: 12, fontWeight: '700' },
  matchText: { color: '#607583', fontSize: 11, fontWeight: '800' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }, warningText: { color: '#A96308', fontSize: 11, fontWeight: '900' },
});
