import { Feather } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { DueTask, HelpTarget, TechnicianDashboard } from '../api';
import { filterTasks, orderTasks, weeklyTaskCounts } from './task-presentation';
import { TaskCard } from './TaskCard';

export type TaskFilter = 'ALL' | 'OVERDUE' | 'CURRENT';

type TasksScreenProps = {
  dashboard: TechnicianDashboard | null;
  loading: boolean;
  error: string | null;
  search: string;
  filter: TaskFilter;
  deviceLocation: { latitude: number; longitude: number } | null;
  assistanceTargets: HelpTarget[];
  assistedForTechnicianId?: string;
  assistanceSelectorVisible: boolean;
  assistanceLoading: boolean;
  assistanceError: string | null;
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: TaskFilter) => void;
  onRefresh: () => void;
  onOpenTask: (task: DueTask) => void;
  onOpenAssistance: () => void;
  onSelectAssistance: (target: HelpTarget) => void;
  onChangeAssistance: () => void;
  onExitAssistance: () => void;
  onRetryAssistance: () => void;
};

export function TasksScreen({ dashboard, loading, error, search, filter, deviceLocation, assistanceTargets, assistedForTechnicianId, assistanceSelectorVisible, assistanceLoading, assistanceError, onSearchChange, onFilterChange, onRefresh, onOpenTask, onOpenAssistance, onSelectAssistance, onChangeAssistance, onExitAssistance, onRetryAssistance }: TasksScreenProps) {
  const counts = dashboard ? weeklyTaskCounts(dashboard) : { overdue: 0, current: 0, total: 0 };
  const filteredTasks = useMemo(() => dashboard ? filterTasks(dashboard.due, search) : [], [dashboard, search]);
  const tasks = useMemo(() => orderTasks(filteredTasks, deviceLocation).filter(task => filter === 'ALL' || task.priority === filter), [filteredTasks, deviceLocation, filter]);

  return <View style={styles.screen}>
    {dashboard && <View style={styles.summary}>
      <View><Text style={styles.summaryEyebrow}>BU HAFTA</Text><Text style={styles.summaryTitle}>{counts.total} açık iş</Text></View>
    </View>}

    {dashboard && assistedForTechnicianId && <AssistanceBanner dashboard={dashboard} onChange={onChangeAssistance} onExit={onExitAssistance} />}

    {dashboard && !assistedForTechnicianId && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Kendi işlerim veya yardım modu seç" style={styles.ownerSelector} onPress={onOpenAssistance} disabled={assistanceLoading}>
      <Feather name="user" size={18} color="#075A96" /><Text style={styles.ownerSelectorText}>KENDİ İŞLERİM</Text><Feather name="chevron-down" size={18} color="#506572" />
    </TouchableOpacity>}

    {assistanceSelectorVisible && <View style={styles.selector}>
      <View style={styles.selectorHead}><Text style={styles.selectorTitle}>Yardım edilecek teknisyen</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Yardım seçicisini kapat" onPress={onChangeAssistance} style={styles.closeButton}><Feather name="x" size={18} color="#506572" /></TouchableOpacity></View>
      <Text style={styles.selectorHelp}>Yalnızca yöneticinin yetki verdiği ekip arkadaşların gösterilir.</Text>
      {assistanceLoading ? <ActivityIndicator accessibilityRole="progressbar" accessibilityLabel="Yardım listesi yükleniyor" color="#075A96" /> : assistanceError ? <SelectorRetryState error={assistanceError} onRetry={onRetryAssistance} /> : assistanceTargets.length === 0 ? <Text style={styles.emptySelector}>Yardım yetkisi tanımlanmamış.</Text> : assistanceTargets.map(target => <TouchableOpacity key={target.id} accessibilityRole="button" accessibilityLabel={`${target.name} için yardım modunu aç`} style={styles.target} onPress={() => onSelectAssistance(target)}><View style={styles.targetAvatar}><Text style={styles.targetInitial}>{target.name.slice(0, 1).toLocaleUpperCase('tr-TR')}</Text></View><View style={styles.targetCopy}><Text style={styles.targetName}>{target.name}</Text><Text style={styles.targetMeta}>@{target.username}</Text></View><Feather name="chevron-right" size={19} color="#7B8A97" /></TouchableOpacity>)}
    </View>}

    {dashboard && <>
      <View style={styles.filterRow}>
        <FilterChip label={`Tümü (${counts.total})`} selected={filter === 'ALL'} onPress={() => onFilterChange('ALL')} />
        <FilterChip label={`Gecikmiş (${counts.overdue})`} selected={filter === 'OVERDUE'} onPress={() => onFilterChange('OVERDUE')} />
        <FilterChip label={`Bu hafta (${counts.current})`} selected={filter === 'CURRENT'} onPress={() => onFilterChange('CURRENT')} />
      </View>
      <View style={styles.searchBox}><Feather name="search" size={18} color="#667989" /><TextInput accessibilityLabel="Görev ara" style={styles.searchInput} value={search} onChangeText={onSearchChange} placeholder="İşletme, kod, bölge veya adres ara" placeholderTextColor="#8795A1" autoCorrect={false} returnKeyType="search" />{search ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Görev aramasını temizle" style={styles.clearSearchButton} onPress={() => onSearchChange('')}><Feather name="x" size={18} color="#8795A1" /></TouchableOpacity> : null}</View>
    </>}

    {loading && !dashboard ? <TaskSkeleton /> : error ? <RetryState error={error} onRetry={onRefresh} /> : dashboard && tasks.length === 0 ? <EmptyState searched={Boolean(search.trim()) || filter !== 'ALL'} /> : tasks.map(task => <TaskCard key={task.pointId} task={task} deviceLocation={deviceLocation} search={search} onPress={onOpenTask} />)}
  </View>;
}

function AssistanceBanner({ dashboard, onChange, onExit }: { dashboard: TechnicianDashboard; onChange: () => void; onExit: () => void }) {
  return <View style={styles.assistanceBanner}><View style={styles.assistanceIcon}><Feather name="users" size={18} color="#8B6508" /></View><View style={styles.assistanceCopy}><Text style={styles.assistanceEyebrow}>YARDIM MODU</Text><Text style={styles.assistanceText}>{dashboard.technician.name} için görevler</Text></View><View style={styles.assistanceActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Yardım edilen teknisyeni değiştir" onPress={onChange} style={styles.changeButton}><Text style={styles.changeText}>DEĞİŞTİR</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Kendi işlerime dön" onPress={onExit} style={styles.exitButton}><Text style={styles.exitText}>KENDİ İŞLERİME DÖN</Text></TouchableOpacity></View></View>;
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} style={[styles.filterChip, selected && styles.filterChipSelected]} onPress={onPress}><Text style={[styles.filterLabel, selected && styles.filterLabelSelected]}>{label}</Text></TouchableOpacity>;
}

function TaskSkeleton() {
  return <View accessibilityRole="progressbar" accessibilityLabel="Görevler yükleniyor" style={styles.skeletonWrap}><Text style={styles.loadingText}>Görevler yükleniyor</Text>{[1, 2, 3].map(item => <View key={item} style={styles.skeletonCard}><View style={styles.skeletonPill} /><View style={styles.skeletonTitle} /><View style={styles.skeletonMeta} /></View>)}</View>;
}

function RetryState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <View accessibilityRole="alert" style={styles.retry}><Feather name="alert-circle" size={27} color="#B7372F" /><Text style={styles.retryTitle}>Görevler yüklenemedi</Text><Text style={styles.retryText}>{error}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Görevleri tekrar dene" style={styles.retryButton} onPress={onRetry}><Text style={styles.retryButtonText}>TEKRAR DENE</Text></TouchableOpacity></View>;
}

function SelectorRetryState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <View accessibilityRole="alert" style={styles.selectorRetry}><Text style={styles.selectorRetryTitle}>Yardım listesi yüklenemedi</Text><Text style={styles.retryText}>{error}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Yardım listesini tekrar dene" style={styles.retryButton} onPress={onRetry}><Text style={styles.retryButtonText}>TEKRAR DENE</Text></TouchableOpacity></View>;
}

function EmptyState({ searched }: { searched: boolean }) {
  return <View style={styles.retry}><Feather name={searched ? 'search' : 'check-circle'} size={27} color="#506572" /><Text style={styles.retryTitle}>{searched ? 'Sonuç bulunamadı' : 'Açık görev yok'}</Text><Text style={styles.retryText}>{searched ? 'Aramanı veya filtresini değiştirip tekrar dene.' : 'Bu haftaya ait bekleyen bakım görevin bulunmuyor.'}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 }, summary: { backgroundColor: '#fff', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#DDE5EB' }, summaryEyebrow: { fontSize: 10, color: '#5C7080', fontWeight: '900', letterSpacing: .8 }, summaryTitle: { color: '#173349', fontSize: 19, fontWeight: '900', marginTop: 2 }, ownerSelector: { minHeight: 48, backgroundColor: '#fff', borderWidth: 1, borderColor: '#C8D8E4', borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, ownerSelectorText: { color: '#173349', fontSize: 13, fontWeight: '900', flex: 1 },
  assistanceBanner: { backgroundColor: '#FFF7DD', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#F1DFA1' }, assistanceIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#FFF0B7', alignItems: 'center', justifyContent: 'center' }, assistanceCopy: { flex: 1, marginLeft: 10 }, assistanceEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: .8, color: '#9C7819' }, assistanceText: { fontSize: 13, fontWeight: '900', color: '#6E5700', marginTop: 2 }, assistanceActions: { alignItems: 'flex-end' }, changeButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }, changeText: { fontSize: 10, fontWeight: '900', color: '#6E5700' }, exitButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }, exitText: { fontSize: 10, fontWeight: '900', color: '#075A96' },
  selector: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 14, gap: 8 }, selectorHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, selectorTitle: { color: '#173349', fontSize: 15, fontWeight: '900' }, selectorHelp: { color: '#70818E', fontSize: 12, lineHeight: 17 }, closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, emptySelector: { color: '#70818E', fontSize: 12, fontWeight: '700', paddingVertical: 10 }, target: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: '#EDF1F4', paddingVertical: 8 }, targetAvatar: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#EAF4FC', alignItems: 'center', justifyContent: 'center' }, targetInitial: { color: '#075A96', fontWeight: '900' }, targetCopy: { flex: 1, marginLeft: 10 }, targetName: { color: '#173349', fontSize: 14, fontWeight: '900' }, targetMeta: { color: '#70818E', fontSize: 12, marginTop: 2 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, filterChip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#C8D8E4', borderRadius: 24, backgroundColor: '#fff' }, filterChipSelected: { backgroundColor: '#EAF4FC', borderColor: '#075A96' }, filterLabel: { color: '#506572', fontSize: 11, fontWeight: '800' }, filterLabelSelected: { color: '#075A96', fontWeight: '900' }, searchBox: { minHeight: 48, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#D6E0E8', paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, color: '#173349', fontSize: 14, paddingVertical: 9 }, clearSearchButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  skeletonWrap: { gap: 10 }, loadingText: { color: '#506572', fontWeight: '800', fontSize: 13 }, skeletonCard: { height: 132, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5ECF1', borderRadius: 14, padding: 14, gap: 12 }, skeletonPill: { width: 84, height: 18, backgroundColor: '#EEF3F6', borderRadius: 9 }, skeletonTitle: { width: '62%', height: 19, backgroundColor: '#EEF3F6', borderRadius: 5 }, skeletonMeta: { width: '82%', height: 13, backgroundColor: '#F4F7F9', borderRadius: 5 },
  retry: { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#DDE5EB', gap: 8 }, selectorRetry: { alignItems: 'center', gap: 6, paddingVertical: 8 }, retryTitle: { color: '#4F6271', fontSize: 16, fontWeight: '900', textAlign: 'center' }, selectorRetryTitle: { color: '#4F6271', fontSize: 14, fontWeight: '900', textAlign: 'center' }, retryText: { color: '#7B8A97', fontSize: 12, lineHeight: 18, textAlign: 'center' }, retryButton: { minHeight: 48, borderRadius: 10, backgroundColor: '#0877D1', paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, retryButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
