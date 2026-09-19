import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DueTask } from '../api';
import { isEquipmentComplete } from './task-presentation';
import { formatTaskDueDate } from './task-detail-presentation';

type TaskDetailScreenProps = {
  task: DueTask;
  onBack: () => void;
  onDirections: (task: DueTask) => void;
  onBeginCompletion: () => void;
  onBeginAttempt: () => void;
};

export function TaskDetailScreen({ task, onBack, onDirections, onBeginCompletion, onBeginAttempt }: TaskDetailScreenProps) {
  const equipmentComplete = isEquipmentComplete(task);

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="İşlere dön" style={styles.backButton} onPress={onBack}>
        <Feather name="arrow-left" size={18} color="#075A96" /><Text style={styles.backText}>İŞLERE DÖN</Text>
      </TouchableOpacity>

      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>{task.priority === 'OVERDUE' ? 'GECİKMİŞ BAKIM' : 'BU HAFTANIN BAKIMI'}</Text>
        <Text style={styles.title}>{task.pointName}</Text>
        <Text style={styles.meta}>{task.pointCode} · {task.regionName}</Text>
        <Text style={styles.due}>Planlanan aralık: {formatTaskDueDate(task.dueStart)} – {formatTaskDueDate(task.dueEnd)}</Text>
      </View>

      <DetailCard icon="map-pin" title="Adres">
        <Text style={styles.body}>{task.address ?? 'Adres bilgisi henüz yok.'}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${task.pointName} için yol tarifi al`} style={styles.inlineAction} onPress={() => onDirections(task)}>
          <Feather name="navigation" size={17} color="#075A96" /><Text style={styles.inlineActionText}>YOL TARİFİ AL</Text>
        </TouchableOpacity>
      </DetailCard>

      <DetailCard icon="tool" title="Ekipman">
        <Text style={[styles.body, !equipmentComplete && styles.warningText]}>{equipmentComplete ? 'Ekipman bilgisi tamam.' : 'Ekipman bilgisi eksik'}</Text>
      </DetailCard>
    </ScrollView>

    <View style={styles.stickyActions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Bakımı tamamlamaya başla" style={styles.primaryAction} onPress={onBeginCompletion}>
        <Feather name="check-circle" size={18} color="#fff" /><Text style={styles.primaryActionText}>BAKIMI TAMAMLA</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Bakım yapılamadı kaydı oluştur" style={styles.attemptAction} onPress={onBeginAttempt}>
        <Feather name="alert-triangle" size={18} color="#A96308" /><Text style={styles.attemptActionText}>BAKIM YAPILAMADI</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${task.pointName} için yol tarifi al`} style={styles.secondaryAction} onPress={() => onDirections(task)}>
        <Feather name="navigation" size={18} color="#075A96" /><Text style={styles.secondaryActionText}>YOL TARİFİ</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

function DetailCard({ icon, title, children }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; children: React.ReactNode }) {
  return <View style={styles.card}><View style={styles.cardHeading}><View style={styles.icon}><Feather name={icon} size={18} color="#075A96" /></View><Text style={styles.cardTitle}>{title}</Text></View>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 18, gap: 12 },
  backButton: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#075A96', fontSize: 11, fontWeight: '900', letterSpacing: .5 },
  heroCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 16, gap: 6 },
  eyebrow: { color: '#A96308', fontSize: 10, fontWeight: '900', letterSpacing: .7 },
  title: { color: '#173349', fontSize: 22, fontWeight: '900' },
  meta: { color: '#70818E', fontSize: 13, fontWeight: '700' },
  due: { color: '#4F6271', fontSize: 13, fontWeight: '800', marginTop: 4 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 15, gap: 10 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF4FC', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#173349', fontSize: 15, fontWeight: '900' },
  body: { color: '#506572', fontSize: 13, lineHeight: 19 },
  warningText: { color: '#A96308', fontWeight: '900' },
  inlineAction: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
  inlineActionText: { color: '#075A96', fontSize: 11, fontWeight: '900' },
  stickyActions: { backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#DDE5EB', padding: 12, gap: 8 },
  primaryAction: { minHeight: 48, borderRadius: 10, backgroundColor: '#0877D1', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryActionText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  attemptAction: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#F2C475', backgroundColor: '#FFF8ED', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  attemptActionText: { color: '#A96308', fontSize: 12, fontWeight: '900' },
  secondaryAction: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#C8D8E4', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  secondaryActionText: { color: '#075A96', fontSize: 12, fontWeight: '900' },
});
