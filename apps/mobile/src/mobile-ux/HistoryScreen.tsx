import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { TechnicianHistoryItem } from '../api';
import {
  availableHistoryFilters,
  filterHistoryItems,
  HistoryFilter,
  HistoryPeriod,
  isBusinessDateKey,
  canTechnicianRevertHistoryItem,
} from './history';

type HistoryScreenProps = {
  items: TechnicianHistoryItem[];
  loading: boolean;
  error: string | null;
  period: HistoryPeriod;
  datePickerVisible: boolean;
  selectedDate: string;
  reverting: boolean;
  onPeriodChange: (period: HistoryPeriod) => void;
  onDateChange: (date: string) => void;
  onApplyDate: () => void;
  onRetry: () => void;
  onRevert: (item: TechnicianHistoryItem) => void;
};

export function HistoryScreen({ items, loading, error, period, datePickerVisible, selectedDate, reverting, onPeriodChange, onDateChange, onApplyDate, onRetry, onRevert }: HistoryScreenProps) {
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const filters = useMemo(() => availableHistoryFilters(items), [items]);
  const visibleItems = useMemo(() => filterHistoryItems(items, filter), [items, filter]);

  useEffect(() => {
    if (!filters.some(option => option.value === filter)) setFilter('ALL');
  }, [filter, filters]);

  return <View style={styles.screen}>
    <View style={styles.heading}><Text style={styles.title}>İşlem Geçmişi</Text><Text style={styles.subtitle}>Gerçek saha kayıtlarını dönem ve işlem türüne göre görüntüle.</Text></View>

    <View style={styles.periodRow}>
      <PeriodButton label="Bu Hafta" selected={period === 'THIS_WEEK'} onPress={() => onPeriodChange('THIS_WEEK')} />
      <PeriodButton label="Geçen Hafta" selected={period === 'LAST_WEEK'} onPress={() => onPeriodChange('LAST_WEEK')} />
      <PeriodButton label="Tarih Seç" selected={period === 'DATE'} onPress={() => onPeriodChange('DATE')} />
    </View>

    {datePickerVisible ? <View style={styles.dateCard}>
      <View style={styles.dateCopy}><Text style={styles.dateLabel}>TARİH</Text><Text style={styles.dateHelp}>YYYY-AA-GG biçiminde gir.</Text></View>
      <TextInput accessibilityLabel="Geçmiş tarihi" style={styles.dateInput} value={selectedDate} onChangeText={onDateChange} placeholder="2026-09-18" autoCapitalize="none" autoCorrect={false} maxLength={10} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Seçilen tarihi getir" style={[styles.applyButton, (!isBusinessDateKey(selectedDate) || loading) && styles.disabled]} onPress={onApplyDate} disabled={!isBusinessDateKey(selectedDate) || loading}><Text style={styles.applyText}>GETİR</Text></TouchableOpacity>
    </View> : null}

    {filters.length > 1 ? <View style={styles.filterRow}>{filters.map(option => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: option.value === filter }} style={[styles.filterChip, option.value === filter && styles.filterChipSelected]} onPress={() => setFilter(option.value)}><Text style={[styles.filterText, option.value === filter && styles.filterTextSelected]}>{option.label} ({option.count})</Text></TouchableOpacity>)}</View> : null}

    {loading && items.length === 0 ? <View accessibilityRole="progressbar" accessibilityLabel="Geçmiş yükleniyor" style={styles.statusCard}><ActivityIndicator color="#075A96" /><Text style={styles.statusTitle}>Geçmiş yükleniyor</Text><Text style={styles.statusBody}>Saha işlemlerin getiriliyor.</Text></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.errorCard}><Feather name="alert-circle" size={22} color="#B7372F" /><View style={styles.errorCopy}><Text style={styles.errorTitle}>Geçmiş yüklenemedi</Text><Text style={styles.statusBody}>{error}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Geçmişi tekrar dene" style={styles.retryButton} onPress={onRetry}><Text style={styles.retryText}>TEKRAR DENE</Text></TouchableOpacity></View></View> : null}
    {!loading && !error && items.length === 0 ? <EmptyState title="Bu dönemde işlem yok" text="Seçtiğin dönemde kaydedilmiş saha işlemi bulunmuyor." /> : null}
    {!loading && !error && items.length > 0 && visibleItems.length === 0 ? <EmptyState title="Bu filtrede işlem yok" text="Başka bir işlem türü seçebilirsin." /> : null}
    {!error && visibleItems.length > 0 ? <View style={styles.listCard}>{visibleItems.map(item => <HistoryRow key={`${item.type}-${item.id}`} item={item} reverting={reverting} onRevert={onRevert} />)}</View> : null}
  </View>;
}

function PeriodButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} style={[styles.periodButton, selected && styles.periodButtonSelected]} onPress={onPress}><Text style={[styles.periodText, selected && styles.periodTextSelected]}>{label}</Text></TouchableOpacity>;
}

function HistoryRow({ item, reverting, onRevert }: { item: TechnicianHistoryItem; reverting: boolean; onRevert: (item: TechnicianHistoryItem) => void }) {
  const presentation = itemPresentation(item);
  const name = item.point?.name ?? item.prospect?.name ?? 'İşlem';
  const canRevert = item.type === 'MAINTENANCE' && canTechnicianRevertHistoryItem(item.at);
  return <View style={styles.row}>
    <View style={[styles.icon, { backgroundColor: presentation.color }]}><Feather name={presentation.icon} size={17} color="#fff" /></View>
    <View style={styles.rowCopy}>
      <Text style={styles.dateTime}>{formatHistoryTime(item.at)}</Text>
      <Text style={styles.itemName}>{name}</Text>
      <Text style={[styles.itemType, { color: presentation.color }]}>{presentation.label}</Text>
      {item.assistedForTechnician ? <View style={styles.helpBadge}><Feather name="users" size={13} color="#8B6508" /><Text style={styles.helpText}>{item.assistedForTechnician.name} için yardım</Text></View> : null}
      {canRevert ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${name} bakımını geri al`} disabled={reverting} onPress={() => onRevert(item)} style={[styles.revertButton, reverting && styles.disabled]}><Feather name="rotate-ccw" size={15} color="#B7372F" /><Text style={styles.revertText}>GERİ AL</Text></TouchableOpacity> : null}
    </View>
  </View>;
}

function itemPresentation(item: TechnicianHistoryItem): { label: string; icon: React.ComponentProps<typeof Feather>['name']; color: string } {
  if (item.type === 'MAINTENANCE') return { label: 'Bakım yapıldı', icon: 'check', color: '#1B8051' };
  if (item.type === 'ATTEMPT') return { label: 'Bakım yapılamadı', icon: 'alert-triangle', color: '#B96B0A' };
  if (item.type === 'PROSPECT_VISIT') return { label: item.purpose === 'INSTALLATION' ? 'Aday müşteri kurulumu' : 'Aday müşteri keşfi', icon: 'user-plus', color: '#075A96' };
  return { label: 'Bakım dışı ziyaret', icon: 'map-pin', color: '#506572' };
}

function formatHistoryTime(value: string) {
  return new Date(value).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <View style={styles.statusCard}><Feather name="clock" size={24} color="#6D8291" /><Text style={styles.statusTitle}>{title}</Text><Text style={styles.statusBody}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  heading: { gap: 3 },
  title: { color: '#173349', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#607583', fontSize: 13, lineHeight: 19 },
  periodRow: { flexDirection: 'row', gap: 7 },
  periodButton: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: '#C8D8E4', backgroundColor: '#fff', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  periodButtonSelected: { borderColor: '#075A96', backgroundColor: '#EAF4FC' },
  periodText: { color: '#506572', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  periodTextSelected: { color: '#075A96', fontWeight: '900' },
  dateCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 13, padding: 12, gap: 9 },
  dateCopy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { color: '#506572', fontSize: 10, fontWeight: '900', letterSpacing: .8 },
  dateHelp: { color: '#7B8A97', fontSize: 11 },
  dateInput: { minHeight: 48, borderWidth: 1, borderColor: '#C8D8E4', borderRadius: 10, backgroundColor: '#F8FAFC', paddingHorizontal: 12, color: '#173349', fontSize: 16 },
  applyButton: { minHeight: 48, borderRadius: 10, backgroundColor: '#0877D1', alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterChip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: '#C8D8E4', borderRadius: 24, backgroundColor: '#fff' },
  filterChipSelected: { borderColor: '#075A96', backgroundColor: '#EAF4FC' },
  filterText: { color: '#506572', fontSize: 11, fontWeight: '800' },
  filterTextSelected: { color: '#075A96', fontWeight: '900' },
  statusCard: { minHeight: 150, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 7 },
  statusTitle: { color: '#173349', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  statusBody: { color: '#607583', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  errorCard: { flexDirection: 'row', gap: 10, backgroundColor: '#FFF0EF', borderWidth: 1, borderColor: '#F4C4C1', borderRadius: 14, padding: 14 },
  errorCopy: { flex: 1, gap: 4 },
  errorTitle: { color: '#A32C26', fontSize: 15, fontWeight: '900' },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 2 },
  retryText: { color: '#075A96', fontSize: 12, fontWeight: '900' },
  listCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, paddingHorizontal: 14 },
  row: { flexDirection: 'row', gap: 11, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDF1F4' },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  dateTime: { color: '#718391', fontSize: 11, fontWeight: '800', marginBottom: 2 },
  itemName: { color: '#173349', fontSize: 15, fontWeight: '900' },
  itemType: { fontSize: 12, fontWeight: '900', marginTop: 3 },
  helpBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF7DD', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 7 },
  helpText: { color: '#7A5B08', fontSize: 11, fontWeight: '800' },
  revertButton: { minHeight: 48, alignSelf: 'flex-start', marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10 },
  revertText: { color: '#B7372F', fontSize: 11, fontWeight: '900' },
  disabled: { opacity: .45 },
});
