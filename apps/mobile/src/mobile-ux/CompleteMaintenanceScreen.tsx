import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DueTask } from '../api';
import { EquipmentCounts, EquipmentInput, equipmentDiff, equipmentFields, equipmentInputChangesIntent, equipmentInputFrom, hasRecordedEquipment, parseEquipment } from './equipment';
import { completionDateBounds, isAllowedCompletionDate } from './completion-date';

type CompleteMaintenanceScreenProps = {
  task: DueTask;
  submitting: boolean;
  onBack: () => void;
  onIntentChange: () => void;
  onSubmit: (equipment: EquipmentCounts, performedOn: string) => void;
};

export function CompleteMaintenanceScreen({ task, submitting, onBack, onIntentChange, onSubmit }: CompleteMaintenanceScreenProps) {
  const recordedEquipment = hasRecordedEquipment(task);
  const initialEquipment = () => equipmentInputFrom(task, 0);
  const [editing, setEditing] = useState(() => !hasRecordedEquipment(task));
  const [equipment, setEquipment] = useState<EquipmentInput>(initialEquipment);
  const [performedOn, setPerformedOn] = useState(() => completionDateBounds().max);
  const [error, setError] = useState<string | null>(null);
  const writeLocked = useRef(false);
  const parsed = useMemo(() => parseEquipment(equipment), [equipment]);
  const diff = 'values' in parsed ? equipmentDiff(task, parsed.values) : [];

  useEffect(() => {
    if (!submitting) writeLocked.current = false;
  }, [submitting]);

  function submit() {
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    if (!isAllowedCompletionDate(performedOn)) {
      setError(`Bakım tarihi ${completionDateBounds().min} ile ${completionDateBounds().max} arasında olmalı.`);
      return;
    }
    setError(null);
    writeLocked.current = true;
    onSubmit(parsed.values, performedOn);
  }

  function resetEditing() {
    if (writeLocked.current || submitting) return;
    const initial = initialEquipment();
    if (equipmentInputChangesIntent(equipment, initial)) onIntentChange();
    setEquipment(initial);
    setError(null);
    setEditing(false);
  }

  function changeCount(key: keyof EquipmentCounts, value: string) {
    if (writeLocked.current || submitting) return;
    const next = { ...equipment, [key]: value };
    if (equipmentInputChangesIntent(equipment, next)) onIntentChange();
    setEquipment(next);
  }

  function stepCount(key: keyof EquipmentCounts, direction: -1 | 1) {
    const current = Number(equipment[key]);
    const next = Number.isSafeInteger(current) ? Math.max(0, current + direction) : 0;
    changeCount(key, String(next));
  }

  return <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="İş detayına dön" style={styles.backButton} onPress={onBack} disabled={submitting}>
        <Feather name="arrow-left" size={18} color="#075A96" /><Text style={styles.backText}>İŞ DETAYINA DÖN</Text>
      </TouchableOpacity>

      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>BAKIM</Text>
        <Text style={styles.title}>{task.pointName}</Text>
        <Text style={styles.meta}>{task.pointCode} · {task.regionName}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bakım tarihi</Text>
        <TextInput accessibilityLabel="Bakım tarihi" style={styles.dateInput} value={performedOn} onChangeText={setPerformedOn} editable={!submitting} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" maxLength={10} placeholder="YYYY-AA-GG" placeholderTextColor="#8795A1" />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}><Text style={styles.cardTitle}>Ekipman</Text></View>
        {!editing ? <EquipmentConfirmation equipment={equipment} /> : <EquipmentEditor equipment={equipment} submitting={submitting} onChange={changeCount} onStep={stepCount} />}
      </View>

      {editing && diff.length > 0 && <View style={styles.diffCard}>
        <Text style={styles.diffTitle}>DEĞİŞİKLİKLER</Text>
        {diff.map(change => <Text key={change.key} style={styles.diffText}>{change.label}: {change.before ?? 'Kayıt yok'} → {change.after}</Text>)}
      </View>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </ScrollView>

    <View style={styles.stickyActions}>
      <TouchableOpacity testID="complete-maintenance-save" accessibilityRole="button" accessibilityLabel="Bakımı kaydet" accessibilityState={{ disabled: submitting, busy: submitting }} style={[styles.primaryAction, submitting && styles.disabled]} onPress={submit} disabled={submitting}>
        <Feather name="check-circle" size={18} color="#fff" /><Text style={styles.primaryActionText}>{submitting ? 'KAYDEDİLİYOR...' : 'BAKIMI KAYDET'}</Text>
      </TouchableOpacity>
      {editing && recordedEquipment ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ekipman düzenlemesini iptal et" style={styles.secondaryAction} onPress={resetEditing} disabled={submitting}>
        <Text style={styles.secondaryActionText}>DÜZENLEMEYİ İPTAL ET</Text>
      </TouchableOpacity> : !editing && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ekipman adetlerini düzenle" style={styles.secondaryAction} onPress={() => setEditing(true)} disabled={submitting}>
        <Text style={styles.secondaryActionText}>DÜZENLE</Text>
      </TouchableOpacity>}
    </View>
  </View>;
}

function EquipmentConfirmation({ equipment }: { equipment: EquipmentInput }) {
  return <View style={styles.equipmentList}>{equipmentFields.map(({ key, label }) => <View key={key} style={styles.equipmentRow}><Text style={styles.equipmentLabel}>{label}</Text><Text style={styles.count}>{equipment[key] || 'Kayıt yok'}</Text></View>)}</View>;
}

function EquipmentEditor({ equipment, submitting, onChange, onStep }: { equipment: EquipmentInput; submitting: boolean; onChange: (key: keyof EquipmentCounts, value: string) => void; onStep: (key: keyof EquipmentCounts, direction: -1 | 1) => void }) {
  return <View style={styles.equipmentList}>{equipmentFields.map(({ key, label }) => <View key={key} style={styles.editorRow}>
    <Text style={styles.equipmentLabel}>{label}</Text>
    <View style={styles.stepper}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} adedini azalt`} accessibilityState={{ disabled: submitting }} style={styles.stepButton} onPress={() => onStep(key, -1)} disabled={submitting}><Feather name="minus" size={18} color="#075A96" /></TouchableOpacity>
      <TextInput accessibilityLabel={`${label} adedi`} style={styles.input} value={equipment[key]} onChangeText={value => onChange(key, value)} editable={!submitting} keyboardType="number-pad" inputMode="numeric" selectTextOnFocus />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} adedini artır`} accessibilityState={{ disabled: submitting }} style={styles.stepButton} onPress={() => onStep(key, 1)} disabled={submitting}><Feather name="plus" size={18} color="#075A96" /></TouchableOpacity>
    </View>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, scroll: { flex: 1 }, content: { padding: 16, paddingBottom: 18, gap: 12 },
  backButton: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 }, backText: { color: '#075A96', fontSize: 11, fontWeight: '900', letterSpacing: .5 },
  heroCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 16, gap: 6 }, eyebrow: { color: '#075A96', fontSize: 10, fontWeight: '900', letterSpacing: .7 }, title: { color: '#173349', fontSize: 22, fontWeight: '900' }, meta: { color: '#70818E', fontSize: 13, fontWeight: '700' }, body: { color: '#506572', fontSize: 13, lineHeight: 19, marginTop: 4 },
  reviewCard: { flexDirection: 'row', gap: 10, backgroundColor: '#FFF3DE', borderWidth: 1, borderColor: '#F2C475', borderRadius: 12, padding: 13 }, reviewCopy: { flex: 1, gap: 3 }, reviewTitle: { color: '#864E09', fontWeight: '900', fontSize: 13 }, reviewText: { color: '#805C2F', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 15, gap: 10 }, cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardTitle: { color: '#173349', fontSize: 16, fontWeight: '900' }, confirmed: { color: '#075A96', fontSize: 10, fontWeight: '900' },
  dateInput: { minHeight: 48, borderWidth: 1, borderColor: '#C8D8E4', borderRadius: 10, paddingHorizontal: 12, color: '#173349', fontSize: 15, fontWeight: '800' },
  equipmentList: { gap: 1 }, equipmentRow: { minHeight: 48, borderTopWidth: 1, borderColor: '#EDF1F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, editorRow: { minHeight: 56, borderTopWidth: 1, borderColor: '#EDF1F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, equipmentLabel: { color: '#334E60', fontSize: 14, fontWeight: '800' }, count: { color: '#173349', fontSize: 16, fontWeight: '900' }, stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#C8D8E4', borderRadius: 10, overflow: 'hidden' }, stepButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F8FB' }, input: { width: 52, height: 48, color: '#173349', fontSize: 16, fontWeight: '900', textAlign: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#C8D8E4' },
  diffCard: { backgroundColor: '#EAF4FC', borderWidth: 1, borderColor: '#C8DFF0', borderRadius: 12, padding: 13, gap: 4 }, diffTitle: { color: '#075A96', fontSize: 10, fontWeight: '900', letterSpacing: .5 }, diffText: { color: '#315A78', fontSize: 13, fontWeight: '700' }, error: { color: '#B7372F', fontSize: 13, fontWeight: '800' },
  stickyActions: { backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#DDE5EB', padding: 12, gap: 8 }, primaryAction: { minHeight: 48, borderRadius: 10, backgroundColor: '#0877D1', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, primaryActionText: { color: '#fff', fontSize: 13, fontWeight: '900' }, secondaryAction: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#C8D8E4', alignItems: 'center', justifyContent: 'center' }, secondaryActionText: { color: '#075A96', fontSize: 12, fontWeight: '900' }, disabled: { opacity: .55 },
});
