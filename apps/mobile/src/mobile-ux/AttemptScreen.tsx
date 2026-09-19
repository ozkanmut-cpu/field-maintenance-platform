import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { AttemptReason, DueTask } from '../api';

type AttemptScreenProps = {
  task: DueTask;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onIntentChange: () => void;
  onSubmit: (reason: AttemptReason, note: string) => void;
};

const attemptReasons: Array<{ reason: AttemptReason; label: string }> = [
  { reason: 'BUSINESS_CLOSED', label: 'İşletme kapalı' },
  { reason: 'AUTHORIZED_PERSON_UNAVAILABLE', label: 'Yetkili kişi yok' },
  { reason: 'ACCESS_FAILED', label: 'Erişim sağlanamadı' },
  { reason: 'OTHER', label: 'Diğer' },
];

export function AttemptScreen({ task, submitting, error, onBack, onIntentChange, onSubmit }: AttemptScreenProps) {
  const [reason, setReason] = useState<AttemptReason>('BUSINESS_CLOSED');
  const [note, setNote] = useState('');

  return <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="İş detayına dön" style={styles.backButton} onPress={onBack} disabled={submitting}>
        <Feather name="arrow-left" size={18} color="#075A96" /><Text style={styles.backText}>İŞ DETAYINA DÖN</Text>
      </TouchableOpacity>

      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>BAKIM YAPILAMADI</Text>
        <Text style={styles.title}>{task.pointName}</Text>
        <Text style={styles.meta}>{task.pointCode} · {task.regionName}</Text>
        <Text style={styles.body}>Nedeni seçip kaydı yöneticinin incelemesine gönder.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Neden</Text>
        <View style={styles.reasonList}>
          {attemptReasons.map(item => {
            const selected = item.reason === reason;
            return <TouchableOpacity key={item.reason} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityState={{ selected, disabled: submitting }} style={[styles.reasonOption, selected && styles.reasonOptionSelected]} onPress={() => { if (!selected) onIntentChange(); setReason(item.reason); }} disabled={submitting}>
              <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
              <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{item.label}</Text>
            </TouchableOpacity>;
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Not (isteğe bağlı)</Text>
        <TextInput accessibilityLabel="Bakım yapılamama notu" style={styles.noteInput} value={note} onChangeText={value => { onIntentChange(); setNote(value); }} editable={!submitting} multiline maxLength={500} placeholder="Ek bilgi yazabilirsin" placeholderTextColor="#8795A1" textAlignVertical="top" />
      </View>

      <View style={styles.locationCard} accessibilityRole="alert">
        <Feather name="map-pin" size={18} color="#075A96" />
        <View style={styles.locationCopy}>
          <Text style={styles.locationTitle}>Konum bilgisi gönderilecek</Text>
          <Text style={styles.locationText}>Göndermeden önce cihazının mevcut konumu, konumun alındığı zamanı ve doğruluk bilgisini kayda ekleyeceğiz.</Text>
        </View>
      </View>

      <View style={styles.pendingCard} accessibilityRole="alert">
        <Feather name="clock" size={18} color="#864E09" />
        <Text style={styles.pendingText}>Görev, yönetici karar verene kadar açık kalır. Yönetici onaylarsa kapanır.</Text>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </ScrollView>

    <View style={styles.stickyActions}>
      <TouchableOpacity testID="maintenance-attempt-save" accessibilityRole="button" accessibilityLabel="Bakım yapılamadı kaydını gönder" accessibilityState={{ disabled: submitting, busy: submitting }} style={[styles.primaryAction, submitting && styles.disabled]} onPress={() => onSubmit(reason, note)} disabled={submitting}>
        <Feather name="send" size={18} color="#fff" /><Text style={styles.primaryActionText}>{submitting ? 'GÖNDERİLİYOR...' : 'YÖNETİCİ ONAYINA GÖNDER'}</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, scroll: { flex: 1 }, content: { padding: 16, paddingBottom: 18, gap: 12 },
  backButton: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 }, backText: { color: '#075A96', fontSize: 11, fontWeight: '900', letterSpacing: .5 },
  heroCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 16, gap: 6 }, eyebrow: { color: '#A96308', fontSize: 10, fontWeight: '900', letterSpacing: .7 }, title: { color: '#173349', fontSize: 22, fontWeight: '900' }, meta: { color: '#70818E', fontSize: 13, fontWeight: '700' }, body: { color: '#506572', fontSize: 13, lineHeight: 19, marginTop: 4 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 15, gap: 10 }, cardTitle: { color: '#173349', fontSize: 16, fontWeight: '900' }, reasonList: { gap: 8 }, reasonOption: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#DDE5EB', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, reasonOptionSelected: { borderColor: '#0877D1', backgroundColor: '#EAF4FC' }, radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#8795A1', alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: '#0877D1' }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0877D1' }, reasonText: { color: '#506572', fontSize: 14, fontWeight: '800' }, reasonTextSelected: { color: '#075A96', fontWeight: '900' },
  noteInput: { minHeight: 110, borderWidth: 1, borderColor: '#C8D8E4', borderRadius: 10, padding: 12, color: '#173349', fontSize: 14, lineHeight: 20 },
  locationCard: { flexDirection: 'row', gap: 10, backgroundColor: '#EAF4FC', borderWidth: 1, borderColor: '#C8DFF0', borderRadius: 12, padding: 13 }, locationCopy: { flex: 1, gap: 3 }, locationTitle: { color: '#075A96', fontWeight: '900', fontSize: 13 }, locationText: { color: '#315A78', fontSize: 13, lineHeight: 18 },
  pendingCard: { flexDirection: 'row', gap: 10, backgroundColor: '#FFF3DE', borderWidth: 1, borderColor: '#F2C475', borderRadius: 12, padding: 13 }, pendingText: { flex: 1, color: '#805C2F', fontSize: 13, lineHeight: 18, fontWeight: '800' }, error: { color: '#B7372F', fontSize: 13, fontWeight: '800' },
  stickyActions: { backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#DDE5EB', padding: 12 }, primaryAction: { minHeight: 48, borderRadius: 10, backgroundColor: '#0877D1', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, primaryActionText: { color: '#fff', fontSize: 13, fontWeight: '900' }, disabled: { opacity: .55 },
});
