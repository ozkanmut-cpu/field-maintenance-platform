import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Feather as ExpoFeather } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AttemptReason, AuthUser, clearSessionToken, confirmEfesim, completeMaintenance, createProspectVisit,
  DueTask, EfesimExtractResult, extractEfesim, HelpTarget, helpTargets, login, me, ProspectRecord,
  ProspectVisitPurpose, recordMaintenanceAttempt, restoreSessionToken, revertMaintenance, technicianDashboard,
  TechnicianDashboard, technicianHistory, TechnicianHistoryItem, myCustomers, updateCustomerEquipment, MyCustomer,
  NearbyPoint,
} from './api';
import { nearbyPoints, sortNearbyItems } from './nearby';
import { NearbyScreen } from './NearbyScreen';
import { MobileShell, PrimaryDestination } from './mobile-ux/MobileShell';
import { TaskFilter, TasksScreen } from './mobile-ux/TasksScreen';
import { TaskDetailScreen } from './mobile-ux/TaskDetailScreen';
import { CompleteMaintenanceScreen } from './mobile-ux/CompleteMaintenanceScreen';
import { AttemptScreen } from './mobile-ux/AttemptScreen';
import { CustomerDetailScreen } from './mobile-ux/CustomerDetailScreen';
import { CustomersScreen } from './mobile-ux/CustomersScreen';
import { HistoryScreen } from './mobile-ux/HistoryScreen';
import { EquipmentCounts } from './mobile-ux/equipment';
import { currentBusinessDate, historyRangeFor, HistoryPeriod, HistoryRequestCoordinator } from './mobile-ux/history';
import { locationPresentationState } from './mobile-ux/task-presentation';
import { Toast } from './mobile-ux/Feedback';
import { SubmissionIntentStore } from './mobile-ux/submission-intent';
import { assistanceRequestFields, assistedTechnicianId, DashboardRequestCoordinator, emptyAssistanceState } from './mobile-ux/assistance';

type Screen = 'TASKS' | 'TASK_DETAIL' | 'ATTEMPT' | 'NEARBY' | 'CUSTOMERS' | 'CUSTOMER' | 'EQUIPMENT_CONFIRM' | 'NEW' | 'HISTORY' | 'EFESIM_RESULT' | 'PROSPECT' | 'VISIT_SAVED' | 'SUCCESS';
type AttemptSubmitPayload = Parameters<typeof recordMaintenanceAttempt>[0];
type AttemptSubmitIntent = Pick<AttemptSubmitPayload, 'pointId' | 'assistedForTechnicianId' | 'reason' | 'note'>;
type CompletionSubmitPayload = Parameters<typeof completeMaintenance>[0];
type CompletionSubmitIntent = Pick<CompletionSubmitPayload, 'pointId' | 'assistedForTechnicianId' | 'coolerCount' | 'towerCount' | 'tapCount' | 'smarttapCount'>;

const APP_ICON = require('../assets/fici-bakim-icon.png');
const FEATHER_ALIASES: Record<string, React.ComponentProps<typeof ExpoFeather>['name']> = {
  building: 'home',
  support: 'life-buoy',
  snowflake: 'wind',
  tower: 'radio',
  tap: 'droplet',
  smarttap: 'cpu',
  refresh: 'refresh-cw',
};
function Feather({name,size=18,color='#075A96'}:{name:string;size?:number;color?:string}) {
  const iconName = FEATHER_ALIASES[name] ?? name as React.ComponentProps<typeof ExpoFeather>['name'];
  return <ExpoFeather name={iconName} size={size} color={color} />;
}

export default function CorporateApp() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [screen, setScreen] = useState<Screen>('TASKS');
  const [dashboard, setDashboard] = useState<TechnicianDashboard | null>(null);
  const [helpPeople, setHelpPeople] = useState<HelpTarget[]>([]);
  const [helpDashboard, setHelpDashboard] = useState<TechnicianDashboard | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [assistanceSelectorVisible, setAssistanceSelectorVisible] = useState(false);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<TechnicianHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('THIS_WEEK');
  const [historyDate, setHistoryDate] = useState(() => currentBusinessDate());
  const [historyDateDraft, setHistoryDateDraft] = useState(() => currentBusinessDate());
  const [historyDatePickerVisible, setHistoryDatePickerVisible] = useState(false);
  const [successPoint, setSuccessPoint] = useState('');
  const [successAssist, setSuccessAssist] = useState('');
  const [successVisitId, setSuccessVisitId] = useState<string | null>(null);
  const [successUndoExpiresAt, setSuccessUndoExpiresAt] = useState<number | null>(null);
  const [efesim, setEfesim] = useState<EfesimExtractResult | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [sapNo, setSapNo] = useState('');
  const [fieldLocation, setFieldLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [useGoogle, setUseGoogle] = useState(true);
  const [prospect, setProspect] = useState<ProspectRecord | null>(null);
  const [visitPurpose, setVisitPurpose] = useState<ProspectVisitPurpose>('SURVEY');
  const [customers, setCustomers] = useState<MyCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<MyCustomer | null>(null);
  const [pendingTask, setPendingTask] = useState<DueTask | null>(null);
  const [pendingAssist, setPendingAssist] = useState<string | undefined>();
  const [taskSearch, setTaskSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('ALL');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerSaveError, setCustomerSaveError] = useState<string | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<{ latitude:number; longitude:number; accuracyMeters?: number | null } | null>(null);
  const [nearbyItems, setNearbyItems] = useState<NearbyPoint[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const completionSubmission = useRef(new SubmissionIntentStore<CompletionSubmitIntent, CompletionSubmitPayload>());
  const completionInFlight = useRef(false);
  const attemptSubmission = useRef(new SubmissionIntentStore<AttemptSubmitIntent, AttemptSubmitPayload>());
  const attemptInFlight = useRef(false);
  const dashboardRequests = useRef<DashboardRequestCoordinator | null>(null);
  const historyRequests = useRef<HistoryRequestCoordinator | null>(null);
  if (dashboardRequests.current === null) dashboardRequests.current = new DashboardRequestCoordinator();
  if (historyRequests.current === null) {
    historyRequests.current = new HistoryRequestCoordinator({ period: 'THIS_WEEK', date: historyDate });
  }

  const google = efesim?.googleMatch;
  const strongGoogleMatch = Boolean(google?.matched && google.placeId);
  const addressText = useMemo(() => strongGoogleMatch && useGoogle ? google?.address || 'Google adres bilgisi yok' : 'Adres yok — manuel adres girişi kapalı', [google, strongGoogleMatch, useGoogle]);

  useEffect(() => { void restore(); }, []);
  useEffect(() => { if (user) void loadTasks(); }, [user]);

  async function restore() {
    try {
      const token = await restoreSessionToken();
      if (!token) return;
      const current = await me();
      if (current.role !== 'TECHNICIAN') return void clearSessionToken();
      setUser(current);
    } catch { await clearSessionToken(); }
    finally { setSessionLoading(false); }
  }

  async function signIn() {
    if (!username.trim() || password.length < 8) return Alert.alert('Giriş bilgileri eksik', 'Kullanıcı adı ve şifreni kontrol et.');
    setBusy(true);
    try {
      const session = await login(username.trim().toLowerCase(), password);
      if (session.user.role !== 'TECHNICIAN') { await clearSessionToken(); throw new Error('Bu uygulama teknisyen hesabı gerektiriyor.'); }
      setUser(session.user); setPassword(''); setScreen('TASKS');
    } catch (e) { Alert.alert('Giriş yapılamadı', message(e)); }
    finally { setBusy(false); }
  }

  async function signOut() { await clearSessionToken(); dashboardRequests.current!.exitAssistance(); setUser(null); setDashboard(null); setHelpDashboard(null); setPassword(''); setScreen('TASKS'); }
  function openAccount() {
    Alert.alert('Hesap', `${user?.name ?? ''}\nfıçıbakım v1.1`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', style: 'destructive', onPress: () => void signOut() },
    ]);
  }
  async function loadTasks(technicianId?: string) {
    const request = dashboardRequests.current!.beginRefresh(technicianId);
    if (!request) return false;
    setTasksLoading(true); setTasksError(null);
    try {
      const nextDashboard = await technicianDashboard(technicianId);
      if (!dashboardRequests.current!.commit(request)) return false;
      if (technicianId) setHelpDashboard(nextDashboard);
      else setDashboard(nextDashboard);
      void refreshDeviceLocation();
      return true;
    } catch (e) {
      if (dashboardRequests.current!.fail(request)) setTasksError(message(e));
      return false;
    } finally {
      if (dashboardRequests.current!.isCurrent(request)) setTasksLoading(false);
    }
  }
  async function refreshDeviceLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || !(await Location.hasServicesEnabledAsync())) return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDeviceLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy });
    } catch { /* Konum alınamazsa mevcut görev sırası korunur. */ }
  }
  async function openHelpSelector() {
    setAssistanceSelectorVisible(true); setAssistanceLoading(true); setAssistanceError(null);
    try { setHelpPeople(await helpTargets()); }
    catch (e) { setAssistanceError(message(e)); }
    finally { setAssistanceLoading(false); }
  }
  async function selectHelper(target: HelpTarget) {
    const request = dashboardRequests.current!.beginSelection(target.id);
    if (request.supersededRefresh) setTasksLoading(false);
    setAssistanceLoading(true); setTasksError(null);
    try {
      const nextDashboard = await technicianDashboard(target.id);
      if (!dashboardRequests.current!.commit(request)) return;
      setHelpDashboard(nextDashboard); setAssistanceSelectorVisible(false); setTaskSearch(''); setTaskFilter('ALL');
    } catch (e) {
      if (dashboardRequests.current!.fail(request)) setTasksError(message(e));
    } finally {
      if (dashboardRequests.current!.isCurrent(request)) setAssistanceLoading(false);
    }
  }
  function changeAssistance() { setAssistanceSelectorVisible(value => !value); if (!assistanceSelectorVisible) void openHelpSelector(); }
  function exitAssistance() {
    dashboardRequests.current!.exitAssistance();
    const empty = emptyAssistanceState();
    setHelpDashboard(empty.helpDashboard);
    setPendingAssist(empty.pendingAssist);
    setAssistanceSelectorVisible(empty.selectorVisible);
    setAssistanceLoading(false);
    setAssistanceError(empty.error);
    setTaskSearch('');
    setTaskFilter('ALL');
    setScreen('TASKS');
    void loadTasks();
  }
  function refreshTasks() { void loadTasks(assistedTechnicianId(helpDashboard)); }
  async function loadHistory(period = historyPeriod, selectedDate = historyDate) {
    const request = historyRequests.current!.begin({ period, date: selectedDate });
    setHistoryLoading(true); setHistoryError(null);
    try {
      const range = historyRangeFor(period, selectedDate);
      const history = await technicianHistory(range);
      const applied = historyRequests.current!.commit(request);
      if (!applied) return;
      setHistoryItems(history.items.slice().reverse());
      setHistoryPeriod(applied.period);
      setHistoryDate(applied.date);
      setHistoryDatePickerVisible(applied.period === 'DATE');
    } catch (e) {
      if (historyRequests.current!.fail(request)) setHistoryError(message(e));
    } finally {
      if (historyRequests.current!.isCurrent(request)) setHistoryLoading(false);
    }
  }
  function retryHistory() {
    const selection = historyRequests.current!.retry ?? historyRequests.current!.applied;
    void loadHistory(selection.period, selection.date);
  }
  function openHistory() { setScreen('HISTORY'); void loadHistory(historyPeriod, historyDate); }
  function selectHistoryPeriod(period: HistoryPeriod) {
    if (period === 'DATE') { setHistoryDatePickerVisible(true); return; }
    void loadHistory(period, historyDate);
  }
  function confirmRevert(item: TechnicianHistoryItem) {
    if (item.type !== 'MAINTENANCE') return;
    const name = item.point?.name ?? 'bu bakım';
    Alert.alert('Bakımı geri al', `${name} bakım kaydı geri alınacak ve görev yeniden açılacak. Emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Geri Al', style: 'destructive', onPress: () => void revertHistoryItem(item) },
    ]);
  }
  async function revertHistoryItem(item: TechnicianHistoryItem) {
    setBusy(true);
    try {
      await revertMaintenance(item.id, 'Teknisyen mobil geçmiş ekranından geri aldı');
      await loadHistory(historyPeriod, historyDate);
      await loadTasks();
      setToastMessage('Bakım kaydı geri alındı ve görev yeniden açıldı.');
    } catch (e) { setHistoryError(message(e)); }
    finally { setBusy(false); }
  }
  async function loadCustomers() {
    setCustomersLoading(true); setCustomersError(null);
    try { setCustomers(await myCustomers()); }
    catch (e) { setCustomersError(message(e)); }
    finally { setCustomersLoading(false); }
  }
  function openCustomers() { setScreen('CUSTOMERS'); void loadCustomers(); }
  async function loadNearby() {
    setNearbyLoading(true); setNearbyError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Konum izni gerekli. Yakınındaki noktaları görmek için izin ver.');
      if (!(await Location.hasServicesEnabledAsync())) throw new Error('Telefonun konum servisini açmalısın.');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDeviceLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy });
      const result = await nearbyPoints({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setNearbyItems(sortNearbyItems(result.items));
    } catch (e) { setNearbyError(message(e)); }
    finally { setNearbyLoading(false); }
  }
  async function openNearby() { setScreen('NEARBY'); await loadNearby(); }
  function openCustomer(customer: MyCustomer) { setSelectedCustomer(customer); setCustomerSaveError(null); setScreen('CUSTOMER'); }
  async function saveCustomerEquipment(values: EquipmentCounts) {
    if (!selectedCustomer) return;
    setCustomerSaving(true); setCustomerSaveError(null);
    try {
      await updateCustomerEquipment(selectedCustomer.id, values);
      const refreshed = await myCustomers();
      setCustomers(refreshed);
      const next = refreshed.find(customer => customer.id === selectedCustomer.id) ?? null;
      setSelectedCustomer(next);
      setToastMessage('Müşteri ekipman bilgileri güncellendi.');
    } catch (e) { setCustomerSaveError(message(e)); }
    finally { setCustomerSaving(false); }
  }
  function openTaskDetail(task: DueTask, assistedForTechnicianId?: string) { setPendingTask(task); setPendingAssist(assistedForTechnicianId); setScreen('TASK_DETAIL'); }
  function prepareComplete(task:DueTask, assistedForTechnicianId?:string){ completionSubmission.current.clear(); setPendingTask(task); setPendingAssist(assistedForTechnicianId); setScreen('EQUIPMENT_CONFIRM'); }
  function prepareAttempt(task: DueTask, assistedForTechnicianId?: string) { attemptSubmission.current.clear(); setAttemptError(null); setPendingTask(task); setPendingAssist(assistedForTechnicianId); setScreen('ATTEMPT'); }

  async function currentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('Konum izni gerekli.');
    if (!(await Location.hasServicesEnabledAsync())) throw new Error('Telefonun konum servisini açmalısın.');
    return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  }

  async function openDirections(task: DueTask) {
    const destination = task.latitude != null && task.longitude != null ? `${task.latitude},${task.longitude}` : [task.pointName, task.regionName].filter(Boolean).join(' ');
    try { await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`); }
    catch { Alert.alert('Harita açılamadı', 'Google Maps veya tarayıcı açılamadı.'); }
  }
  async function openCustomerDirections(customer: MyCustomer) {
    const destination = customer.address ?? [customer.name, customer.region?.name].filter(Boolean).join(' ');
    try { await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`); }
    catch { Alert.alert('Harita açılamadı', 'Google Maps veya tarayıcı açılamadı.'); }
  }
  async function openNearbyDirections(point: NearbyPoint) {
    try { await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`); }
    catch { Alert.alert('Harita açılamadı', 'Google Maps veya tarayıcı açılamadı.'); }
  }

  async function saveAttempt(task: DueTask, reason: AttemptReason, note: string, assistedForTechnicianId?: string) {
    if (attemptInFlight.current) return;
    attemptInFlight.current = true;
    const trimmedNote = note.trim();
    const intent: AttemptSubmitIntent = { pointId: task.pointId, ...assistanceRequestFields(assistedForTechnicianId), reason, ...(trimmedNote ? { note: trimmedNote } : {}) };
    setBusy(true);
    setAttemptError(null);
    try {
      let payload = attemptSubmission.current.retryPayload(intent);
      if (!payload) {
        const loc = await currentLocation();
        payload = attemptSubmission.current.remember(intent, { ...intent, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy ?? undefined, locationCapturedAt: new Date(loc.timestamp).toISOString(), idempotencyKey: `attempt-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      }
      await recordMaintenanceAttempt(payload);
      attemptSubmission.current.clear();
      setPendingTask(null); setPendingAssist(undefined); setScreen('TASKS');
      setToastMessage('Bakım yapılamadığı kaydı yönetici onayına gönderildi.');
      void loadTasks(assistedForTechnicianId);
    } catch (e) { setAttemptError(message(e)); }
    finally { attemptInFlight.current = false; setBusy(false); }
  }

  function distanceMeters(lat1:number, lon1:number, lat2:number, lon2:number) {
    const r=6371000;
    const p1=lat1*Math.PI/180, p2=lat2*Math.PI/180;
    const dp=(lat2-lat1)*Math.PI/180, dl=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  async function saveCompletedTask(task: DueTask, assistedForTechnicianId: string | undefined, payload: Readonly<CompletionSubmitPayload>) {
    const result = await completeMaintenance(payload);
    completionSubmission.current.clear();
    setSuccessPoint(task.pointName); setSuccessAssist(helpDashboard?.technician.name ?? ''); setSuccessVisitId(result.id); setSuccessUndoExpiresAt(Date.now() + 30_000); setScreen('SUCCESS'); void loadTasks(assistedForTechnicianId);
  }

  async function undoSuccessfulCompletion() {
    if (!successVisitId || !successUndoExpiresAt || Date.now() > successUndoExpiresAt) return;
    setBusy(true);
    try {
      await revertMaintenance(successVisitId, 'Teknisyen yeni kaydı geri aldı');
      setSuccessVisitId(null); setSuccessUndoExpiresAt(null); setScreen('TASKS');
      setToastMessage('Bakım kaydı geri alındı ve görev yeniden açıldı.');
      void loadTasks();
    } catch (e) { Alert.alert('Bakım geri alınamadı', message(e)); }
    finally { setBusy(false); }
  }

  async function submitCompletedTask(task: DueTask, assistedForTechnicianId: string | undefined, intent: CompletionSubmitIntent, payload: CompletionSubmitPayload) {
    setBusy(true);
    completionSubmission.current.remember(intent, payload);
    try { await saveCompletedTask(task, assistedForTechnicianId, payload); }
    catch (e) { Alert.alert('Bakım kaydedilemedi', message(e)); }
    finally { completionInFlight.current = false; setBusy(false); }
  }

  async function completeTask(task: DueTask, equipmentValues: EquipmentCounts, assistedForTechnicianId?: string) {
    if (completionInFlight.current) return;
    completionInFlight.current = true;
    const intent: CompletionSubmitIntent = { pointId: task.pointId, ...assistanceRequestFields(assistedForTechnicianId), ...equipmentValues };
    let locationReviewRequired = false;
    setBusy(true);
    try {
      const retryPayload = completionSubmission.current.retryPayload(intent);
      if (retryPayload) return await saveCompletedTask(task, assistedForTechnicianId, retryPayload);
      const loc = await currentLocation();
      const distance = task.latitude != null && task.longitude != null ? distanceMeters(loc.coords.latitude, loc.coords.longitude, task.latitude, task.longitude) : null;
      locationReviewRequired = locationPresentationState({ canonicalLatitude: task.latitude, canonicalLongitude: task.longitude, distanceMeters: distance, accuracyMeters: loc.coords.accuracy }) !== 'READY';
      const basePayload = { ...intent, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy ?? undefined, locationCapturedAt: new Date(loc.timestamp).toISOString(), deviceRecordedAt: new Date().toISOString(), equipmentConfirmed: true as const, idempotencyKey: `maintenance-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
      if (!locationReviewRequired) {
        const payload = { ...basePayload, locationPresenceConfirmed: true };
        completionSubmission.current.remember(intent, payload);
        return await saveCompletedTask(task, assistedForTechnicianId, payload);
      }
      const detail = distance === null ? 'Bu noktanın kayıtlı konumu yok.' : `Kayıtlı noktadan yaklaşık ${Math.round(distance)} metre uzaktasınız.`;
      Alert.alert('Noktada mısınız?', `${detail}\n\nYine de ${task.pointName} noktasında olduğunuzu onaylıyor musunuz?`, [
        { text: 'İptal et', style: 'cancel', onPress: () => { completionSubmission.current.clear(); completionInFlight.current = false; setBusy(false); } },
        { text: 'Hayır, ama bakımı yaptım', onPress: () => void submitCompletedTask(task, assistedForTechnicianId, intent, { ...basePayload, locationPresenceConfirmed: false }) },
        { text: 'Evet, noktadayım', onPress: () => void submitCompletedTask(task, assistedForTechnicianId, intent, { ...basePayload, locationPresenceConfirmed: true }) },
      ]);
    } catch (e) { Alert.alert('Bakım kaydedilemedi', message(e)); }
    finally { if (!locationReviewRequired) { completionInFlight.current = false; setBusy(false); } }
  }

  async function beginEfesim() {
    setBusy(true);
    try {
      const media = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!media.granted) return Alert.alert('İzin gerekli', 'EFESİM ekran görüntüsünü seçmek için fotoğraf izni gerekli.');
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8, base64: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const targetWidth = Math.min(asset.width || 1440, 1440);
      const resized = await ImageManipulator.manipulateAsync(asset.uri, asset.width && asset.width > targetWidth ? [{ resize: { width: targetWidth } }] : [], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!resized.base64) throw new Error('Ekran görüntüsü okunamadı.');
      const loc = await currentLocation(); const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }; setFieldLocation(coords);
      const result = await extractEfesim({ technicianId: user!.id, imageBase64: resized.base64, ...coords });
      setEfesim(result); setCustomerName(result.customerName ?? ''); setSapNo(result.sapNo ?? ''); setUseGoogle(result.nextStep === 'CONFIRM_GOOGLE_MATCH'); setScreen('EFESIM_RESULT');
    } catch (e) { Alert.alert('EFESİM okunamadı', message(e)); }
    finally { setBusy(false); }
  }

  async function saveProspect() {
    if (!efesim || !fieldLocation) return;
    if (efesim.duplicate) return Alert.alert('Zaten kayıtlı', 'Bu müşteri zaten sistemde.');
    if (customerName.trim().length < 2) return Alert.alert('Müşteri adı gerekli', 'Müşteri adını kontrol et.');
    setBusy(true);
    try {
      const r = await confirmEfesim({ technicianId: user!.id, customerName: customerName.trim(), sapNo: sapNo.trim() || null, googlePlaceId: strongGoogleMatch && useGoogle ? google?.placeId ?? null : null, ...fieldLocation });
      setProspect(r.prospect); setScreen('PROSPECT');
    } catch (e) { Alert.alert('Kayıt oluşturulamadı', message(e)); }
    finally { setBusy(false); }
  }

  async function saveVisit() {
    if (!prospect) return;
    setBusy(true);
    try {
      const loc = await currentLocation();
      await createProspectVisit({ prospectId: prospect.id, technicianId: user!.id, purpose: visitPurpose, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy ?? undefined, locationCapturedAt: new Date(loc.timestamp).toISOString(), idempotencyKey: `prospect-${user!.id}-${prospect.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      setScreen('VISIT_SAVED');
    } catch (e) { Alert.alert('Ziyaret kaydedilemedi', message(e)); }
    finally { setBusy(false); }
  }

  if (sessionLoading) return <SafeAreaView edges={['top','bottom']} style={styles.center}><ActivityIndicator size="large" /><Text>Oturum kontrol ediliyor...</Text></SafeAreaView>;
  if (!user) return <Login username={username} password={password} setUsername={setUsername} setPassword={setPassword} busy={busy} signIn={signIn} />;

  const title = screen === 'CUSTOMERS' || screen === 'CUSTOMER' ? 'Müşterilerim' : screen === 'NEARBY' ? 'Yakınımdakiler' : screen === 'TASK_DETAIL' ? 'İş Detayı' : screen === 'ATTEMPT' ? 'Bakım Yapılamadı' : screen === 'EQUIPMENT_CONFIRM' ? 'Bakımı Tamamla' : screen === 'NEW' || screen === 'EFESIM_RESULT' || screen === 'PROSPECT' || screen === 'VISIT_SAVED' ? 'Yeni Nokta' : screen === 'HISTORY' ? 'Geçmiş' : 'İşler';
  const activeDestination: PrimaryDestination = screen === 'CUSTOMERS' || screen === 'CUSTOMER' ? 'CUSTOMERS' : screen === 'HISTORY' ? 'HISTORY' : 'TASKS';
  function navigate(destination: PrimaryDestination) {
    if (destination === 'TASKS') setScreen('TASKS');
    if (destination === 'CUSTOMERS') void openCustomers();
    if (destination === 'HISTORY') openHistory();
  }
  const activeDashboard = helpDashboard ?? dashboard;
  const refresh = refreshTasks;
  const childScreen = ['TASK_DETAIL', 'ATTEMPT', 'EQUIPMENT_CONFIRM', 'CUSTOMER', 'SUCCESS', 'EFESIM_RESULT', 'PROSPECT', 'VISIT_SAVED'].includes(screen);
  return <SafeAreaView edges={['top','bottom']} style={styles.safe}><StatusBar style="light" /><MobileShell title={title} userName={user.name} brandImage={APP_ICON} activeDestination={activeDestination} onNavigate={navigate} onProfilePress={openAccount} showNavigation={!childScreen}>
    {screen === 'TASKS' ? <ScrollView style={styles.scroll} contentContainerStyle={styles.tasksContainer} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl accessibilityLabel="İşleri yenile" refreshing={tasksLoading} onRefresh={refresh} />}>
      <TasksScreen dashboard={activeDashboard} loading={tasksLoading} error={tasksError} search={taskSearch} filter={taskFilter} deviceLocation={deviceLocation} assistanceTargets={helpPeople} assistedForTechnicianId={assistedTechnicianId(helpDashboard)} assistanceSelectorVisible={assistanceSelectorVisible} assistanceLoading={assistanceLoading} assistanceError={assistanceError} onSearchChange={setTaskSearch} onFilterChange={setTaskFilter} onRefresh={refresh} onOpenTask={task => openTaskDetail(task, assistedTechnicianId(helpDashboard))} onOpenAssistance={() => void openHelpSelector()} onSelectAssistance={target => void selectHelper(target)} onChangeAssistance={changeAssistance} onExitAssistance={exitAssistance} onRetryAssistance={() => void openHelpSelector()} />
    </ScrollView> :
    screen === 'TASK_DETAIL' && pendingTask ? <TaskDetailScreen task={pendingTask} onBack={() => { setPendingTask(null); setPendingAssist(undefined); setScreen('TASKS'); }} onDirections={task => void openDirections(task)} onBeginCompletion={() => prepareComplete(pendingTask, pendingAssist)} onBeginAttempt={() => prepareAttempt(pendingTask, pendingAssist)} /> :
    screen === 'ATTEMPT' && pendingTask ? <AttemptScreen task={pendingTask} submitting={busy} error={attemptError} onBack={() => setScreen('TASK_DETAIL')} onIntentChange={() => attemptSubmission.current.clear()} onSubmit={(reason, note) => void saveAttempt(pendingTask, reason, note, pendingAssist)} /> :
    screen === 'EQUIPMENT_CONFIRM' && pendingTask ? <CompleteMaintenanceScreen task={pendingTask} submitting={busy} onBack={() => setScreen('TASK_DETAIL')} onIntentChange={() => completionSubmission.current.clearIfIdle(completionInFlight.current)} onSubmit={equipmentValues => void completeTask(pendingTask, equipmentValues, pendingAssist)} /> :
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" refreshControl={screen === 'CUSTOMERS' ? <RefreshControl accessibilityLabel="Müşterileri yenile" refreshing={customersLoading} onRefresh={() => void loadCustomers()} /> : screen === 'HISTORY' ? <RefreshControl accessibilityLabel="Geçmişi yenile" refreshing={historyLoading} onRefresh={() => void loadHistory(historyPeriod, historyDate)} /> : undefined}>
      {screen === 'NEARBY' && (nearbyError ? <Empty icon="alert-circle" title="Yakındaki noktalar alınamadı" text={nearbyError} /> : <NearbyScreen items={nearbyItems} origin={deviceLocation} loading={nearbyLoading} refresh={() => void loadNearby()} directions={openNearbyDirections} />)}
      {screen === 'CUSTOMERS' && <CustomersScreen customers={customers} loading={customersLoading} error={customersError} search={customerSearch} onSearchChange={setCustomerSearch} onOpenCustomer={openCustomer} onRefresh={() => void loadCustomers()} />}
      {screen === 'CUSTOMER' && selectedCustomer && <CustomerDetailScreen customer={selectedCustomer} saving={customerSaving} saveError={customerSaveError} onBack={() => setScreen('CUSTOMERS')} onDirections={customer => void openCustomerDirections(customer)} onSave={equipmentValues => void saveCustomerEquipment(equipmentValues)} />}
      {screen === 'HISTORY' && <HistoryScreen items={historyItems} loading={historyLoading} error={historyError} period={historyPeriod} datePickerVisible={historyDatePickerVisible} selectedDate={historyDateDraft} reverting={busy} onPeriodChange={selectHistoryPeriod} onDateChange={setHistoryDateDraft} onApplyDate={() => void loadHistory('DATE', historyDateDraft)} onRetry={retryHistory} onRevert={confirmRevert} />}
      {screen === 'SUCCESS' && <SuccessView point={successPoint} assisted={successAssist} undoExpiresAt={successUndoExpiresAt} undoing={busy} onUndo={successVisitId ? () => void undoSuccessfulCompletion() : undefined} done={() => { setSuccessAssist(''); setSuccessVisitId(null); setSuccessUndoExpiresAt(null); setScreen('TASKS'); }} />}
      {screen === 'NEW' && <NewPointView begin={() => void beginEfesim()} busy={busy} />}
      {screen === 'EFESIM_RESULT' && efesim && <EfesimView result={efesim} sapNo={sapNo} setSapNo={setSapNo} customerName={customerName} setCustomerName={setCustomerName} strong={strongGoogleMatch} google={google} useGoogle={useGoogle} setUseGoogle={setUseGoogle} addressText={addressText} save={() => void saveProspect()} busy={busy} />}
      {screen === 'PROSPECT' && prospect && <ProspectView prospect={prospect} purpose={visitPurpose} setPurpose={setVisitPurpose} save={() => void saveVisit()} busy={busy} />}
      {screen === 'VISIT_SAVED' && prospect && <SuccessView point={prospect.name} assisted="" title={visitPurpose === 'SURVEY' ? 'Keşif kaydedildi' : 'Kurma kaydedildi'} done={() => setScreen('TASKS')} />}
      {busy && <ActivityIndicator size="large" style={styles.loader} />}
    </ScrollView>}
  </MobileShell><Toast message={toastMessage} onDismiss={() => setToastMessage(null)} /></SafeAreaView>;
}

function SearchBox({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}) { return <View style={styles.searchBox}><Feather name="search" size={18} color="#667989" /><TextInput style={styles.searchInput} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#8795A1" autoCorrect={false} returnKeyType="search" />{value?<TouchableOpacity onPress={()=>onChange('')}><Feather name="x" size={18} color="#8795A1" /></TouchableOpacity>:null}</View>; }
function distanceMetersStatic(lat1:number,lon1:number,lat2:number,lon2:number){const r=6371000;const p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;const dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function formatDistance(m:number){return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(m<10000?1:0)} km`;}
function Login(p: { username:string; password:string; setUsername:(v:string)=>void; setPassword:(v:string)=>void; busy:boolean; signIn:()=>void }) {
  return <SafeAreaView style={styles.loginSafe}><StatusBar style="light" />
    <View style={styles.loginHero}>
      <View style={styles.loginBrandRow}><Image source={APP_ICON} style={styles.loginLogo}/><View><Text style={styles.loginBrand}>fıçıbakım</Text><Text style={styles.loginBrandSub}>SAHA BAKIM</Text></View></View>
    </View>
    <View style={styles.loginForm}>
      <Text style={styles.formLabel}>KULLANICI ADI</Text><TextInput style={styles.loginInput} value={p.username} onChangeText={p.setUsername} autoCapitalize="none" autoComplete="username" placeholder="Kullanıcı adın" placeholderTextColor="#8A99A6" />
      <Text style={styles.formLabel}>ŞİFRE</Text><TextInput style={styles.loginInput} value={p.password} onChangeText={p.setPassword} secureTextEntry autoComplete="password" placeholder="Şifren" placeholderTextColor="#8A99A6" onSubmitEditing={p.signIn} />
      <PrimaryButton title={p.busy?'GİRİŞ YAPILIYOR...':'GİRİŞ YAP'} icon="log-in" onPress={p.signIn} disabled={p.busy} />
      {p.busy && <ActivityIndicator color={BLUE} />}
    </View>
  </SafeAreaView>;
}

function NewPointView({begin,busy}:{begin:()=>void;busy:boolean}) { return <View style={styles.card}><Text style={styles.cardTitle}>Bu ziyaret ne için?</Text><View style={styles.newChoice}><Feather name="search" size={23} color={BLUE}/><View><Text style={styles.personName}>Keşif</Text><Text style={styles.personMeta}>Potansiyel müşteri</Text></View></View><View style={styles.newChoice}><Feather name="tool" size={23} color={BLUE}/><View><Text style={styles.personName}>Kurma</Text><Text style={styles.personMeta}>Yeni kurulacak nokta</Text></View></View><View style={styles.infoBox}><Feather name="info" size={17} color="#315A78"/><Text style={styles.infoText}>Devam etmek için önce EFESİM ekran görüntüsü alınır. Manuel adres girişi yoktur.</Text></View><PrimaryButton title="EFESİM EKRAN GÖRÜNTÜSÜ SEÇ" icon="image" onPress={begin} disabled={busy}/></View>; }
function EfesimView(p:any) { return <><View style={styles.card}><Text style={styles.sectionLabel}>EFESİM</Text><TextInput style={styles.input} value={p.sapNo} onChangeText={p.setSapNo} keyboardType="number-pad" placeholder="SAP No"/><TextInput style={styles.input} value={p.customerName} onChangeText={p.setCustomerName} placeholder="Müşteri adı"/></View>{p.strong?<View style={styles.card}><Text style={styles.sectionLabel}>GOOGLE MAPS EŞLEŞMESİ</Text><Text style={styles.taskName}>{p.google?.name}</Text><Text style={styles.help}>{p.google?.address||'Adres bilgisi yok'}</Text><View style={styles.choiceRow}><Choice title="BU İŞLETME" selected={p.useGoogle} onPress={()=>p.setUseGoogle(true)}/><Choice title="EŞLEŞMEDİ" selected={!p.useGoogle} onPress={()=>p.setUseGoogle(false)}/></View></View>:<View style={styles.card}><Text style={styles.sectionLabel}>GOOGLE MAPS</Text><Text style={styles.help}>Güvenilir eşleşme bulunamadı. İsim ile devam edebilirsin.</Text></View>}<View style={styles.card}><Text style={styles.sectionLabel}>ADRES</Text><Text style={styles.help}>{p.addressText}</Text><Text style={styles.locked}>Adres düzenlenemez.</Text><PrimaryButton title="ADAY MÜŞTERİYİ OLUŞTUR" icon="user-plus" onPress={p.save} disabled={p.busy}/></View></>; }
function ProspectView(p:{prospect:ProspectRecord;purpose:ProspectVisitPurpose;setPurpose:(v:ProspectVisitPurpose)=>void;save:()=>void;busy:boolean}) { return <View style={styles.card}><View style={styles.cardIcon}><Feather name="check" size={20} color={GREEN}/></View><Text style={styles.okText}>Aday müşteri hazır</Text><Text style={styles.taskName}>{p.prospect.name}</Text>{p.prospect.sapNo?<Text style={styles.help}>SAP No: {p.prospect.sapNo}</Text>:null}<Text style={styles.sectionLabel}>ZİYARET AMACI</Text><View style={styles.choiceRow}><Choice title="KEŞİF" selected={p.purpose==='SURVEY'} onPress={()=>p.setPurpose('SURVEY')}/><Choice title="KURMA" selected={p.purpose==='INSTALLATION'} onPress={()=>p.setPurpose('INSTALLATION')}/></View><PrimaryButton title={p.purpose==='SURVEY'?'KEŞİF ZİYARETİNİ KAYDET':'KURMA ZİYARETİNİ KAYDET'} icon="check-circle" onPress={p.save} disabled={p.busy}/></View>; }

function SuccessView({point,assisted,title='Bakım kaydedildi',done,onUndo,undoing,undoExpiresAt}:{point:string;assisted:string;title?:string;done:()=>void;onUndo?:()=>void;undoing?:boolean;undoExpiresAt?:number|null}) {
  const maintenanceSaved = title === 'Bakım kaydedildi';
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!undoExpiresAt) return;
    const timeout = setTimeout(() => setNow(Date.now()), Math.max(0, undoExpiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [undoExpiresAt]);
  const undoAvailable = Boolean(onUndo && undoExpiresAt && now < undoExpiresAt);
  return <View style={styles.successCard}><View style={styles.successCircle}><Feather name="check" size={38} color="#fff"/></View><Text style={styles.successTitle}>{title}</Text><Text style={styles.successPoint}>{point}</Text>{assisted?<Text style={styles.help}>{assisted} için yardım olarak kaydedildi.</Text>:null}<PrimaryButton title={maintenanceSaved ? 'SONRAKİ İŞE GEÇ' : 'İŞLERE DÖN'} icon="arrow-right" onPress={done}/>{undoAvailable ? <SecondaryButton title={undoing ? 'GERİ ALINIYOR...' : 'GERİ AL'} onPress={onUndo!} disabled={undoing}/> : null}{maintenanceSaved ? <SecondaryButton title="İŞLERE DÖN" onPress={done}/> : null}</View>;
}

function Empty({icon='inbox',title='Açık görev yok',text}:{icon?:React.ComponentProps<typeof Feather>['name'];title?:string;text?:string}) { return <View style={styles.empty}><View style={styles.emptyIcon}><Feather name={icon} size={25} color="#718493"/></View><Text style={styles.emptyTitle}>{title}</Text>{text?<Text style={styles.emptyText}>{text}</Text>:null}</View>; }
function SectionHeader({title,subtitle,action,actionIcon,onAction}:{title:string;subtitle?:string;action?:string;actionIcon?:React.ComponentProps<typeof Feather>['name'];onAction?:()=>void}) { return <View style={styles.sectionHead}><View style={styles.sectionHeadText}><Text style={styles.sectionTitle}>{title}</Text>{subtitle?<Text style={styles.sectionSubtitle}>{subtitle}</Text>:null}</View>{action&&onAction?<TouchableOpacity style={styles.sectionAction} onPress={onAction}>{actionIcon?<Feather name={actionIcon} size={14} color={BLUE}/>:null}<Text style={styles.refresh}>{action}</Text></TouchableOpacity>:null}</View>; }
function PrimaryButton({title,icon,onPress,disabled}:{title:string;icon?:React.ComponentProps<typeof Feather>['name'];onPress:()=>void;disabled?:boolean}) { return <TouchableOpacity accessibilityRole="button" style={[styles.primary,disabled&&styles.disabled]} onPress={onPress} disabled={disabled}>{icon?<Feather name={icon} size={17} color="#fff"/>:null}<Text style={styles.primaryText}>{title}</Text></TouchableOpacity>; }
function SecondaryButton({title,icon,onPress,disabled,danger}:{title:string;icon?:React.ComponentProps<typeof Feather>['name'];onPress:()=>void;disabled?:boolean;danger?:boolean}) { return <TouchableOpacity accessibilityRole="button" style={[styles.secondary,danger&&styles.secondaryDanger,disabled&&styles.disabled]} onPress={onPress} disabled={disabled}>{icon?<Feather name={icon} size={16} color={danger?'#B7372F':BLUE}/>:null}<Text style={[styles.secondaryText,danger&&styles.secondaryDangerText]}>{title}</Text></TouchableOpacity>; }
function Choice({title,selected,onPress}:{title:string;selected:boolean;onPress:()=>void}) { return <TouchableOpacity style={[styles.choice,selected&&styles.choiceSelected]} onPress={onPress}><Text style={[styles.choiceText,selected&&styles.choiceTextSelected]}>{title}</Text></TouchableOpacity>; }
function Nav({label,icon,active,onPress}:{label:string;icon:React.ComponentProps<typeof Feather>['name'];active:boolean;onPress:()=>void}) { return <TouchableOpacity accessibilityRole="button" style={styles.navItem} onPress={onPress}><View style={[styles.navIconWrap,active&&styles.navIconActive]}><Feather name={icon} size={20} color={active?BLUE:'#80909D'}/></View><Text style={[styles.navLabel,active&&styles.navActive]}>{label}</Text></TouchableOpacity>; }
function initials(name:string){return name.split(' ').filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
function message(e:unknown){return e instanceof Error?e.message:String(e);}

const BLUE='#075A96', DARK_BLUE='#064C80', BRIGHT_BLUE='#0877D1', LIGHT='#F3F6F9', TEXT='#182633', MUTED='#68798A', LINE='#E2E9EF', RED='#E7473C', ORANGE='#F39A22', GREEN='#27A867';
const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:DARK_BLUE}, shell:{flex:1,backgroundColor:LIGHT}, scroll:{flex:1}, container:{padding:18,paddingBottom:32,gap:14}, tasksContainer:{paddingBottom:32}, center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:LIGHT},
  header:{backgroundColor:DARK_BLUE,paddingHorizontal:20,paddingTop:17,paddingBottom:19,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.08)'}, headerIdentity:{flexDirection:'row',alignItems:'center',gap:11,flex:1,minWidth:0,marginRight:10}, brandImage:{width:42,height:42,borderRadius:12,backgroundColor:'#fff'}, headerCopy:{flex:1,minWidth:0}, eyebrow:{color:'#D7E8F5',fontSize:12,fontWeight:'900',letterSpacing:.4}, headerTitle:{color:'#fff',fontSize:27,fontWeight:'900',letterSpacing:-.45,marginTop:1,flexShrink:1}, headerUser:{color:'#C9DDEC',fontSize:12,marginTop:1}, logoutBtn:{borderWidth:1,borderColor:'rgba(255,255,255,.22)',backgroundColor:'rgba(255,255,255,.06)',paddingHorizontal:11,paddingVertical:9,borderRadius:10,flexDirection:'row',alignItems:'center',gap:6}, logoutText:{color:'#fff',fontSize:10,fontWeight:'900'},
  loginSafe:{flex:1,backgroundColor:LIGHT}, loginHero:{backgroundColor:DARK_BLUE,paddingHorizontal:24,paddingTop:24,paddingBottom:20}, loginBrandRow:{flexDirection:'row',alignItems:'center',gap:11}, loginLogo:{width:44,height:44,borderRadius:13,backgroundColor:'#fff'}, loginBrand:{color:'#fff',fontSize:22,fontWeight:'900',letterSpacing:-.4}, loginBrandSub:{color:'#9FC2DA',fontSize:10,fontWeight:'800',letterSpacing:1.05,marginTop:2}, loginForm:{backgroundColor:'#fff',marginHorizontal:18,marginTop:18,borderWidth:1,borderColor:LINE,borderRadius:17,padding:20,gap:10,shadowColor:'#173349',shadowOpacity:.05,shadowRadius:14,elevation:2}, formLabel:{fontSize:10,fontWeight:'900',letterSpacing:.9,color:'#718493',marginTop:3}, loginInput:{backgroundColor:'#F8FAFC',borderWidth:1,borderColor:'#D4DEE6',borderRadius:11,padding:13,fontSize:16,color:TEXT},
  summaryRow:{flexDirection:'row',gap:12}, summaryBox:{flex:1,backgroundColor:'#fff',borderRadius:15,padding:16,borderWidth:1,borderColor:LINE,shadowColor:'#173349',shadowOpacity:.025,shadowRadius:8,elevation:1}, summaryIcon:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',marginBottom:11}, summaryRed:{color:RED,fontSize:30,fontWeight:'900',letterSpacing:-.5}, summaryOrange:{color:ORANGE,fontSize:30,fontWeight:'900',letterSpacing:-.5}, summaryLabel:{color:MUTED,fontSize:12,fontWeight:'800',marginTop:1},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',gap:12,marginTop:3}, sectionHeadText:{flex:1,gap:3}, sectionTitle:{fontSize:19,fontWeight:'900',color:TEXT,letterSpacing:-.2}, sectionSubtitle:{fontSize:12,lineHeight:17,color:'#758594'}, sectionAction:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:8,borderRadius:9,backgroundColor:'#EAF4FC'}, refresh:{fontSize:10,fontWeight:'900',color:BLUE,letterSpacing:.4},
  searchBox:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D8E2E9',borderRadius:12,minHeight:46,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:9}, searchInput:{flex:1,fontSize:15,color:TEXT,paddingVertical:10},
  card:{backgroundColor:'#fff',borderRadius:15,padding:17,gap:12,borderWidth:1,borderColor:LINE,shadowColor:'#173349',shadowOpacity:.025,shadowRadius:10,elevation:1}, cardIcon:{width:38,height:38,borderRadius:11,backgroundColor:'#EAF4FC',alignItems:'center',justifyContent:'center'}, cardTitle:{fontSize:20,fontWeight:'900',color:TEXT,letterSpacing:-.25}, help:{fontSize:14,lineHeight:21,color:'#637485'},
  task:{backgroundColor:'#fff',borderRadius:16,padding:17,gap:11,borderWidth:1,borderColor:LINE,shadowColor:'#173349',shadowOpacity:.035,shadowRadius:11,elevation:1}, taskTop:{flexDirection:'row',alignItems:'center'}, statusPill:{flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:9,paddingVertical:5,borderRadius:999}, statusLate:{backgroundColor:'#FDEDEC'}, statusCurrent:{backgroundColor:'#FFF4E4'}, statusDot:{width:7,height:7,borderRadius:4}, redDot:{backgroundColor:RED}, orangeDot:{backgroundColor:ORANGE}, lateText:{color:'#B6312A',fontSize:10,fontWeight:'900',letterSpacing:.55}, currentText:{color:'#A96308',fontSize:10,fontWeight:'900',letterSpacing:.55}, taskName:{fontSize:20,fontWeight:'900',color:TEXT,letterSpacing:-.25}, metaRow:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap'}, metaDivider:{width:1,height:13,backgroundColor:'#D7E0E7',marginHorizontal:3}, taskMeta:{fontSize:12,color:'#667989'}, taskActions:{gap:9}, routeButton:{borderWidth:1,borderColor:'#BCD0DF',backgroundColor:'#F8FBFD',borderRadius:10,padding:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8}, routeText:{color:BLUE,fontSize:12,fontWeight:'900'}, primary:{backgroundColor:BRIGHT_BLUE,borderRadius:11,paddingVertical:14,paddingHorizontal:14,alignItems:'center',justifyContent:'center',minHeight:48,flexDirection:'row',gap:8,shadowColor:'#075A96',shadowOpacity:.13,shadowRadius:7,elevation:2}, primaryText:{color:'#fff',fontSize:13,fontWeight:'900',letterSpacing:.15}, failButton:{borderWidth:1,borderColor:'#E2B7B4',backgroundColor:'#FFFDFD',borderRadius:10,paddingVertical:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8}, failText:{color:'#B7372F',fontSize:13,fontWeight:'800'}, secondary:{borderWidth:1,borderColor:'#C8D8E4',backgroundColor:'#fff',borderRadius:10,paddingVertical:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,minHeight:46}, secondaryText:{color:BLUE,fontSize:13,fontWeight:'900'}, secondaryDanger:{borderColor:'#E2B7B4'}, secondaryDangerText:{color:'#B7372F'}, disabled:{opacity:.45},
  listCard:{backgroundColor:'#fff',borderRadius:15,borderWidth:1,borderColor:LINE,paddingHorizontal:16,shadowColor:'#173349',shadowOpacity:.025,shadowRadius:10,elevation:1}, personRow:{flexDirection:'row',alignItems:'center',paddingVertical:13,borderBottomWidth:1,borderBottomColor:'#EDF1F4'}, customerRow:{flexDirection:'row',alignItems:'center',paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#EDF1F4'}, avatar:{width:42,height:42,borderRadius:12,backgroundColor:'#DDEEFF',alignItems:'center',justifyContent:'center'}, avatarText:{color:BLUE,fontWeight:'900'}, customerIcon:{width:40,height:40,borderRadius:12,backgroundColor:'#FFF4E4',alignItems:'center',justifyContent:'center'}, customerIconComplete:{backgroundColor:'#E8F7EF'}, personText:{flex:1,marginLeft:11}, personName:{fontSize:15,fontWeight:'900',color:TEXT}, personMeta:{fontSize:12,color:'#758594',marginTop:2},
  assistBanner:{backgroundColor:'#FFF7DD',borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#F1DFA1'}, assistBadge:{width:38,height:38,borderRadius:11,backgroundColor:'#FFF0B7',alignItems:'center',justifyContent:'center'}, assistBody:{flex:1,marginLeft:10}, assistEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#9C7819'}, assistText:{fontSize:13,fontWeight:'900',color:'#6E5700',marginTop:2}, assistChange:{fontSize:10,fontWeight:'900',color:'#6E5700'},
  nav:{height:72,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#DDE5EB',flexDirection:'row',paddingTop:5,paddingBottom:5,shadowColor:'#173349',shadowOpacity:.06,shadowRadius:10,elevation:10}, navItem:{flex:1,alignItems:'center',justifyContent:'center',gap:3}, navIconWrap:{width:36,height:29,borderRadius:10,alignItems:'center',justifyContent:'center'}, navIconActive:{backgroundColor:'#EAF4FC'}, navLabel:{fontSize:10,color:'#80909D',fontWeight:'800'}, navActive:{color:BRIGHT_BLUE,fontWeight:'900'},
  historyRow:{flexDirection:'row',gap:12,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#EDF1F4'}, historyContent:{flex:1}, revertButton:{alignSelf:'flex-start',marginTop:9,borderWidth:1,borderColor:'#E2B7B4',borderRadius:8,paddingHorizontal:10,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:6}, revertText:{color:'#B7372F',fontSize:10,fontWeight:'900'}, historyDot:{width:36,height:36,borderRadius:11,backgroundColor:GREEN,alignItems:'center',justifyContent:'center'}, historyWarn:{backgroundColor:ORANGE}, historyTime:{fontSize:10,color:'#7A8A97',fontWeight:'800',marginBottom:2}, okText:{color:GREEN,fontSize:12,fontWeight:'900',marginTop:3}, warningText:{color:ORANGE,fontSize:12,fontWeight:'900',marginTop:3},
  equipmentRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,borderBottomWidth:1,borderBottomColor:'#EDF1F4',paddingVertical:10}, equipmentInfo:{flexDirection:'row',alignItems:'center',gap:10}, equipmentIcon:{width:34,height:34,borderRadius:10,backgroundColor:'#EAF4FC',alignItems:'center',justifyContent:'center'}, equipmentLabel:{fontSize:15,fontWeight:'800',color:TEXT}, equipmentInput:{width:88,borderWidth:1,borderColor:'#D6E0E8',backgroundColor:'#F8FAFC',borderRadius:10,padding:10,fontSize:18,textAlign:'center',fontWeight:'900',color:TEXT}, backLink:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7,minHeight:48,paddingVertical:6}, backText:{fontSize:10,fontWeight:'900',color:BLUE,letterSpacing:.5}, locationChip:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#EAF4FC',alignSelf:'flex-start',paddingHorizontal:9,paddingVertical:7,borderRadius:8}, locationText:{fontSize:11,color:BLUE,fontWeight:'800'},
  successCard:{backgroundColor:'#fff',borderRadius:17,padding:26,gap:10,alignItems:'center',borderWidth:1,borderColor:LINE,shadowColor:'#173349',shadowOpacity:.035,shadowRadius:10,elevation:1}, successCircle:{width:76,height:76,borderRadius:24,backgroundColor:GREEN,alignItems:'center',justifyContent:'center',marginBottom:6}, successEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1,color:GREEN}, successTitle:{fontSize:23,fontWeight:'900',color:TEXT,textAlign:'center'}, successPoint:{fontSize:18,fontWeight:'900',color:BLUE,textAlign:'center'}, successMetaRow:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:8}, successMeta:{fontSize:12,color:'#6E7D89',textAlign:'center'},
  empty:{backgroundColor:'#fff',borderRadius:14,padding:24,alignItems:'center',borderWidth:1,borderColor:LINE,gap:7}, emptyIcon:{width:50,height:50,borderRadius:15,backgroundColor:'#F0F4F7',alignItems:'center',justifyContent:'center',marginBottom:3}, emptyTitle:{fontSize:16,fontWeight:'900',color:'#4F6271',textAlign:'center'}, emptyText:{fontSize:12,lineHeight:18,color:'#7B8A97',textAlign:'center',maxWidth:280}, loader:{marginVertical:16},
  newChoice:{borderWidth:1,borderColor:'#DCE5EC',borderRadius:12,padding:15,flexDirection:'row',alignItems:'center',gap:14}, infoBox:{backgroundColor:'#EAF4FC',borderRadius:10,padding:12,flexDirection:'row',gap:9,alignItems:'flex-start'}, infoText:{flex:1,fontSize:13,lineHeight:19,color:'#315A78'}, sectionLabel:{fontSize:10,fontWeight:'900',letterSpacing:.9,color:'#5C7080'}, input:{borderWidth:1,borderColor:'#D6E0E8',backgroundColor:'#F8FAFC',borderRadius:10,padding:12,fontSize:16,color:TEXT}, choiceRow:{flexDirection:'row',gap:8}, choice:{flex:1,borderWidth:1,borderColor:'#C7D3DD',borderRadius:10,padding:12,alignItems:'center'}, choiceSelected:{backgroundColor:BLUE,borderColor:BLUE}, choiceText:{fontSize:11,fontWeight:'900',color:'#415565'}, choiceTextSelected:{color:'#fff'}, locked:{fontSize:12,color:'#7D8A95',fontWeight:'700'},
});
