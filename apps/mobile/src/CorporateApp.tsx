import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Feather as ExpoFeather } from '@expo/vector-icons';
import { ActivityIndicator, Alert, BackHandler, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AttemptReason, AuthUser, clearSessionToken, confirmEfesim, completeMaintenance, createProspectVisit,
  DueTask, EfesimExtractResult, extractEfesim, HelpTarget, helpTargets, login, me, ProspectRecord,
  ProspectVisitPurpose, recordMaintenanceAttempt, restoreSessionToken, revertMaintenance, technicianDashboard,
  TechnicianDashboard, technicianHistory, TechnicianHistoryItem, myCustomers, updateCustomerEquipment, MyCustomer,
  NearbyPoint,
} from './api';
import { matchesSearch } from './search';
import { nearbyPoints, sortNearbyItems } from './nearby';
import { NearbyScreen } from './NearbyScreen';
import { type MobileScreen, popScreen, primaryTabs, pushScreen } from './mobile-navigation';

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
  const [screen, setScreen] = useState<MobileScreen>('TASKS');
  const screenRef = useRef<MobileScreen>('TASKS');
  const screenHistoryRef = useRef<MobileScreen[]>([]);
  const [dashboard, setDashboard] = useState<TechnicianDashboard | null>(null);
  const [helpPeople, setHelpPeople] = useState<HelpTarget[]>([]);
  const [helpDashboard, setHelpDashboard] = useState<TechnicianDashboard | null>(null);
  const [historyItems, setHistoryItems] = useState<TechnicianHistoryItem[]>([]);
  const [successPoint, setSuccessPoint] = useState('');
  const [successAssist, setSuccessAssist] = useState('');
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
  const [equipment, setEquipment] = useState({ coolerCount:'', towerCount:'', tapCount:'', smarttapCount:'' });
  const [taskSearch, setTaskSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [deviceLocation, setDeviceLocation] = useState<{ latitude:number; longitude:number } | null>(null);
  const [nearbyItems, setNearbyItems] = useState<NearbyPoint[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  const google = efesim?.googleMatch;
  const strongGoogleMatch = Boolean(google?.matched && google.placeId);
  const addressText = useMemo(() => strongGoogleMatch && useGoogle ? google?.address || 'Google adres bilgisi yok' : 'Adres yok — manuel adres girişi kapalı', [google, strongGoogleMatch, useGoogle]);

  const resetNavigation = useCallback((next: MobileScreen = 'TASKS') => {
    screenHistoryRef.current = [];
    screenRef.current = next;
    setScreen(next);
  }, []);
  const navigate = useCallback((next: MobileScreen, replace = false) => {
    const current = screenRef.current;
    if (current === next) return;
    if (!replace) screenHistoryRef.current = pushScreen(screenHistoryRef.current, current, next);
    screenRef.current = next;
    setScreen(next);
  }, []);
  const goBack = useCallback(() => {
    const previous = popScreen(screenHistoryRef.current, screenRef.current);
    if (!previous) return false;
    screenHistoryRef.current = previous.history;
    screenRef.current = previous.screen;
    setScreen(previous.screen);
    return true;
  }, []);

  useEffect(() => { void restore(); }, []);
  useEffect(() => { if (user) void loadTasks(); }, [user]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => goBack());
    return () => subscription.remove();
  }, [goBack]);

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
      setUser(session.user); setPassword(''); resetNavigation();
    } catch (e) { Alert.alert('Giriş yapılamadı', message(e)); }
    finally { setBusy(false); }
  }

  async function signOut() { await clearSessionToken(); setUser(null); setDashboard(null); setPassword(''); resetNavigation(); }
  async function loadTasks() {
    try {
      setDashboard(await technicianDashboard());
      void refreshDeviceLocation();
    } catch (e) { Alert.alert('Görevler alınamadı', message(e)); }
  }
  async function refreshDeviceLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || !(await Location.hasServicesEnabledAsync())) return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDeviceLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch { /* Konum alınamazsa mevcut görev sırası korunur. */ }
  }
  async function openHelp() { setBusy(true); try { setHelpPeople(await helpTargets()); setHelpDashboard(null); navigate('HELP'); } catch (e) { Alert.alert('Yardım listesi alınamadı', message(e)); } finally { setBusy(false); } }
  async function selectHelper(target: HelpTarget) { setBusy(true); try { setHelpDashboard(await technicianDashboard(target.id)); } catch (e) { Alert.alert('Görevler alınamadı', message(e)); } finally { setBusy(false); } }
  async function openHistory() { setBusy(true); try { const h = await technicianHistory(); setHistoryItems(h.items.slice().reverse()); navigate('HISTORY'); } catch (e) { Alert.alert('Geçmiş alınamadı', message(e)); } finally { setBusy(false); } }
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
      const h = await technicianHistory();
      setHistoryItems(h.items.slice().reverse());
      await loadTasks();
      Alert.alert('Geri alındı', 'Bakım kaydı geri alındı ve görev yeniden açıldı.');
    } catch (e) { Alert.alert('Geri alınamadı', message(e)); }
    finally { setBusy(false); }
  }
  function equipmentFrom(value: { coolerCount?:number|null; towerCount?:number|null; tapCount?:number|null; smarttapCount?:number|null }) {
    setEquipment({ coolerCount:value.coolerCount==null?'':String(value.coolerCount), towerCount:value.towerCount==null?'':String(value.towerCount), tapCount:value.tapCount==null?'':String(value.tapCount), smarttapCount:value.smarttapCount==null?'':String(value.smarttapCount) });
  }
  function parsedEquipment() {
    if (Object.values(equipment).some(v => !v.trim())) throw new Error('Soğutucu, kule, musluk ve SmartTap adetlerinin tamamını gir.');
    const values = Object.fromEntries(Object.entries(equipment).map(([k,v])=>[k, Number(v)])) as {coolerCount:number;towerCount:number;tapCount:number;smarttapCount:number};
    if (Object.values(values).some(v=>!Number.isInteger(v)||v<0)) throw new Error('Tüm ekipman adetlerini 0 veya daha büyük tam sayı olarak gir.');
    return values;
  }
  async function openCustomers() { setBusy(true); try { setCustomers(await myCustomers()); navigate('CUSTOMERS'); } catch(e){ Alert.alert('Müşteriler alınamadı',message(e)); } finally{ setBusy(false); } }
  async function loadNearby() {
    setNearbyLoading(true); setNearbyError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Konum izni gerekli. Yakınındaki noktaları görmek için izin ver.');
      if (!(await Location.hasServicesEnabledAsync())) throw new Error('Telefonun konum servisini açmalısın.');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDeviceLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const result = await nearbyPoints({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setNearbyItems(sortNearbyItems(result.items));
    } catch (e) { setNearbyError(message(e)); }
    finally { setNearbyLoading(false); }
  }
  async function openNearby() { navigate('NEARBY'); await loadNearby(); }
  function openCustomer(customer:MyCustomer){ setSelectedCustomer(customer); equipmentFrom(customer); navigate('CUSTOMER'); }
  async function saveCustomerEquipment(){ if(!selectedCustomer)return; setBusy(true); try { const values=parsedEquipment(); await updateCustomerEquipment(selectedCustomer.id,values); const refreshed=await myCustomers(); setCustomers(refreshed); const next=refreshed.find(x=>x.id===selectedCustomer.id)??null; setSelectedCustomer(next); if(next) equipmentFrom(next); Alert.alert('Kaydedildi','Müşteri ekipman bilgileri güncellendi.'); } catch(e){ Alert.alert('Kaydedilemedi',message(e)); } finally{setBusy(false);} }
  function prepareComplete(task:DueTask, assistedForTechnicianId?:string){ setPendingTask(task); setPendingAssist(assistedForTechnicianId); equipmentFrom(task); navigate('EQUIPMENT_CONFIRM'); }

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
  async function openNearbyDirections(point: NearbyPoint) {
    try { await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`); }
    catch { Alert.alert('Harita açılamadı', 'Google Maps veya tarayıcı açılamadı.'); }
  }

  function attemptReason(task: DueTask, assistedForTechnicianId?: string) {
    const items: Array<{ text: string; reason: AttemptReason }> = [
      { text: 'İşletme kapalı', reason: 'BUSINESS_CLOSED' }, { text: 'Yetkili kişi yok', reason: 'AUTHORIZED_PERSON_UNAVAILABLE' },
      { text: 'Erişim sağlanamadı', reason: 'ACCESS_FAILED' }, { text: 'Diğer', reason: 'OTHER' },
    ];
    Alert.alert('Bakım yapılamadı', 'Nedeni seç. Kayıt admin onayına düşer ve görev şimdilik açık kalır.', [...items.map(i => ({ text: i.text, onPress: () => void saveAttempt(task, i.reason, assistedForTechnicianId) })), { text: 'Vazgeç', style: 'cancel' }]);
  }

  async function saveAttempt(task: DueTask, reason: AttemptReason, assistedForTechnicianId?: string) {
    setBusy(true);
    try {
      const loc = await currentLocation();
      await recordMaintenanceAttempt({ pointId: task.pointId, assistedForTechnicianId, reason, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy ?? undefined, locationCapturedAt: new Date(loc.timestamp).toISOString(), idempotencyKey: `attempt-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      Alert.alert('Admin onayına gönderildi', 'Görev açık kalacak. Yönetici onaylarsa kapanacak.');
    } catch (e) { Alert.alert('Kayıt oluşturulamadı', message(e)); }
    finally { setBusy(false); }
  }

  function distanceMeters(lat1:number, lon1:number, lat2:number, lon2:number) {
    const r=6371000;
    const p1=lat1*Math.PI/180, p2=lat2*Math.PI/180;
    const dp=(lat2-lat1)*Math.PI/180, dl=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  async function saveCompletedTask(task: DueTask, assistedForTechnicianId: string | undefined, loc: Awaited<ReturnType<typeof currentLocation>>, locationPresenceConfirmed = true) {
    const equipmentValues = parsedEquipment();
    await completeMaintenance({ pointId: task.pointId, assistedForTechnicianId, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy ?? undefined, locationPresenceConfirmed, locationCapturedAt: new Date(loc.timestamp).toISOString(), deviceRecordedAt: new Date().toISOString(), ...equipmentValues, equipmentConfirmed: true, idempotencyKey: `maintenance-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    setSuccessPoint(task.pointName); setSuccessAssist(helpDashboard?.technician.name ?? ''); navigate('SUCCESS', true); setHelpDashboard(null); await loadTasks();
  }

  async function completeTask(task: DueTask, assistedForTechnicianId?: string) {
    setBusy(true);
    try {
      const loc = await currentLocation();
      const distance = task.latitude != null && task.longitude != null ? distanceMeters(loc.coords.latitude, loc.coords.longitude, task.latitude, task.longitude) : null;
      if (distance !== null && distance <= 250) {
        await saveCompletedTask(task, assistedForTechnicianId, loc);
        return;
      }
      const detail = distance === null ? 'Bu noktanın kayıtlı konumu yok.' : `Kayıtlı noktadan yaklaşık ${Math.round(distance)} metre uzaktasınız.`;
      Alert.alert('Noktada mısınız?', `${detail}\n\nYine de ${task.pointName} noktasında olduğunuzu onaylıyor musunuz?`, [
        { text: 'İptal et', style: 'cancel' },
        { text: 'Hayır, ama bakımı yaptım', onPress: () => void saveCompletedTask(task, assistedForTechnicianId, loc, false).catch(e => Alert.alert('Bakım kaydedilemedi', message(e))) },
        { text: 'Evet, noktadayım', onPress: () => void saveCompletedTask(task, assistedForTechnicianId, loc, true).catch(e => Alert.alert('Bakım kaydedilemedi', message(e))) },
      ]);
    } catch (e) { Alert.alert('Bakım kaydedilemedi', message(e)); }
    finally { setBusy(false); }
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
      setEfesim(result); setCustomerName(result.customerName ?? ''); setSapNo(result.sapNo ?? ''); setUseGoogle(result.nextStep === 'CONFIRM_GOOGLE_MATCH'); navigate('EFESIM_RESULT');
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
      setProspect(r.prospect); navigate('PROSPECT');
    } catch (e) { Alert.alert('Kayıt oluşturulamadı', message(e)); }
    finally { setBusy(false); }
  }

  async function saveVisit() {
    if (!prospect) return;
    setBusy(true);
    try {
      const loc = await currentLocation();
      await createProspectVisit({ prospectId: prospect.id, technicianId: user!.id, purpose: visitPurpose, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy ?? undefined, locationCapturedAt: new Date(loc.timestamp).toISOString(), idempotencyKey: `prospect-${user!.id}-${prospect.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      navigate('VISIT_SAVED');
    } catch (e) { Alert.alert('Ziyaret kaydedilemedi', message(e)); }
    finally { setBusy(false); }
  }

  if (sessionLoading) return <SafeAreaView edges={['top','bottom']} style={styles.center}><ActivityIndicator size="large" /><Text>Oturum kontrol ediliyor...</Text></SafeAreaView>;
  if (!user) return <Login username={username} password={password} setUsername={setUsername} setPassword={setPassword} busy={busy} signIn={signIn} />;

  const title = screen === 'CUSTOMERS' || screen === 'CUSTOMER' ? 'Müşterilerim' : screen === 'NEARBY' ? 'Yakınımdakiler' : screen === 'EQUIPMENT_CONFIRM' ? 'Ekipman Kontrolü' : screen === 'HELP' ? 'Yardım Et' : screen === 'NEW' || screen === 'EFESIM_RESULT' || screen === 'PROSPECT' || screen === 'VISIT_SAVED' ? 'Yeni Nokta' : screen === 'HISTORY' ? 'Geçmiş' : 'İşler';
  return <SafeAreaView edges={['top','bottom']} style={styles.safe}><StatusBar style="light" /><View style={styles.shell}>
    <View style={styles.header}>
      <View style={styles.headerIdentity}>
        <Image source={APP_ICON} style={styles.brandImage} />
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>fıçıbakım</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64} style={styles.headerTitle}>{title}</Text><Text style={styles.headerUser}>{user.name}</Text></View>
      </View>
      <TouchableOpacity accessibilityRole="button" style={styles.logoutBtn} onPress={() => void signOut()}>
        <Feather name="log-out" size={18} color="#fff" /><Text style={styles.logoutText}>ÇIKIŞ</Text>
      </TouchableOpacity>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {screen === 'TASKS' && <TaskList dashboard={dashboard} busy={busy} refresh={() => void loadTasks()} search={taskSearch} setSearch={setTaskSearch} deviceLocation={deviceLocation} onHelp={() => void openHelp()} onDirections={openDirections} onAttempt={task => attemptReason(task)} onComplete={task => prepareComplete(task)} />}
      {screen === 'NEARBY' && (nearbyError ? <Empty icon="alert-circle" title="Yakındaki noktalar alınamadı" text={nearbyError} /> : <NearbyScreen items={nearbyItems} origin={deviceLocation} loading={nearbyLoading} refresh={() => void loadNearby()} directions={openNearbyDirections} />)}
      {screen === 'HELP' && <HelpView people={helpPeople} dashboard={helpDashboard} busy={busy} select={selectHelper} change={() => setHelpDashboard(null)} onDirections={openDirections} onAttempt={task => attemptReason(task, helpDashboard?.technician.id)} onComplete={task => prepareComplete(task, helpDashboard?.technician.id)} />}
      {screen === 'CUSTOMERS' && <CustomersView customers={customers} search={customerSearch} setSearch={setCustomerSearch} open={openCustomer} />}
      {screen === 'CUSTOMER' && selectedCustomer && <CustomerView customer={selectedCustomer} equipment={equipment} setEquipment={setEquipment} save={() => void saveCustomerEquipment()} back={goBack} busy={busy} />}
      {screen === 'EQUIPMENT_CONFIRM' && pendingTask && <EquipmentConfirmView task={pendingTask} equipment={equipment} setEquipment={setEquipment} confirm={() => void completeTask(pendingTask,pendingAssist)} cancel={() => { setPendingTask(null); setPendingAssist(undefined); goBack(); }} busy={busy} />}
      {screen === 'HISTORY' && <HistoryView items={historyItems} busy={busy} onRevert={confirmRevert} />}
      {screen === 'SUCCESS' && <SuccessView point={successPoint} assisted={successAssist} done={() => { setSuccessAssist(''); resetNavigation(); }} />}
      {screen === 'NEW' && <NewPointView begin={() => void beginEfesim()} busy={busy} />}
      {screen === 'EFESIM_RESULT' && efesim && <EfesimView result={efesim} sapNo={sapNo} setSapNo={setSapNo} customerName={customerName} setCustomerName={setCustomerName} strong={strongGoogleMatch} google={google} useGoogle={useGoogle} setUseGoogle={setUseGoogle} addressText={addressText} save={() => void saveProspect()} busy={busy} />}
      {screen === 'PROSPECT' && prospect && <ProspectView prospect={prospect} purpose={visitPurpose} setPurpose={setVisitPurpose} save={() => void saveVisit()} busy={busy} />}
      {screen === 'VISIT_SAVED' && prospect && <SuccessView point={prospect.name} assisted="" title={visitPurpose === 'SURVEY' ? 'Keşif kaydedildi' : 'Kurma kaydedildi'} done={resetNavigation} />}
      {busy && <ActivityIndicator size="large" style={styles.loader} />}
    </ScrollView>
    <View style={styles.nav} accessibilityRole="tablist">{primaryTabs.map((tab) => <Nav key={tab.screen} label={tab.label} icon={tab.icon} active={tab.screen === 'TASKS' ? screen === 'TASKS' || screen === 'SUCCESS' || screen === 'EQUIPMENT_CONFIRM' || screen === 'HELP' : tab.screen === 'CUSTOMERS' ? screen === 'CUSTOMERS' || screen === 'CUSTOMER' : screen === 'HISTORY'} onPress={() => tab.screen === 'CUSTOMERS' ? void openCustomers() : tab.screen === 'HISTORY' ? void openHistory() : resetNavigation('TASKS')} />)}</View>
  </View></SafeAreaView>;
}

function SearchBox({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}) { return <View style={styles.searchBox}><Feather name="search" size={18} color="#667989" /><TextInput style={styles.searchInput} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#8795A1" autoCorrect={false} returnKeyType="search" />{value?<TouchableOpacity onPress={()=>onChange('')}><Feather name="x" size={18} color="#8795A1" /></TouchableOpacity>:null}</View>; }
function distanceMetersStatic(lat1:number,lon1:number,lat2:number,lon2:number){const r=6371000;const p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;const dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function formatDistance(m:number){return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(m<10000?1:0)} km`;}
function Login(p: { username:string; password:string; setUsername:(v:string)=>void; setPassword:(v:string)=>void; busy:boolean; signIn:()=>void }) {
  return <SafeAreaView style={styles.loginSafe}><StatusBar style="light" />
    <View style={styles.loginHero}>
      <View style={styles.loginBrandRow}><Image source={APP_ICON} style={styles.loginLogo}/><View><Text style={styles.loginBrand}>fıçıbakım</Text><Text style={styles.loginBrandSub}>SAHA BAKIM</Text></View></View>
      <View style={styles.loginIntro}><Text style={styles.loginTitle}>fıçıbakım’a hoş geldin</Text><Text style={styles.loginSub}>Daha iyi servis, daha iyi bira. Bakım görevlerini ve saha işlemlerini tek yerden yönet.</Text></View>
    </View>
    <View style={styles.loginForm}>
      <Text style={styles.formLabel}>KULLANICI ADI</Text><TextInput style={styles.loginInput} value={p.username} onChangeText={p.setUsername} autoCapitalize="none" autoComplete="username" placeholder="Kullanıcı adın" placeholderTextColor="#8A99A6" />
      <Text style={styles.formLabel}>ŞİFRE</Text><TextInput style={styles.loginInput} value={p.password} onChangeText={p.setPassword} secureTextEntry autoComplete="password" placeholder="Şifren" placeholderTextColor="#8A99A6" onSubmitEditing={p.signIn} />
      <PrimaryButton title={p.busy?'GİRİŞ YAPILIYOR...':'GİRİŞ YAP'} icon="log-in" onPress={p.signIn} disabled={p.busy} />
      {p.busy && <ActivityIndicator color={BLUE} />}
    </View>
  </SafeAreaView>;
}

function TaskList(p:{dashboard:TechnicianDashboard|null;busy:boolean;refresh:()=>void;search:string;setSearch:(v:string)=>void;deviceLocation:{latitude:number;longitude:number}|null;onHelp:()=>void;onDirections:(t:DueTask)=>void;onAttempt:(t:DueTask)=>void;onComplete:(t:DueTask)=>void}) {
  const tasks = useMemo(() => {
    const filtered = (p.dashboard?.due ?? []).filter(t => matchesSearch(p.search, [t.pointName, t.pointCode, t.regionName, t.address ?? '', ...(t.aliases ?? [])]));
    return filtered.slice().sort((a,b) => {
      const priority = Number(a.priority !== 'OVERDUE') - Number(b.priority !== 'OVERDUE');
      if (priority) return priority;
      if (!p.deviceLocation) return 0;
      const da = a.latitude != null && a.longitude != null ? distanceMetersStatic(p.deviceLocation.latitude,p.deviceLocation.longitude,a.latitude,a.longitude) : Number.POSITIVE_INFINITY;
      const db = b.latitude != null && b.longitude != null ? distanceMetersStatic(p.deviceLocation.latitude,p.deviceLocation.longitude,b.latitude,b.longitude) : Number.POSITIVE_INFINITY;
      return da-db;
    });
  }, [p.dashboard,p.search,p.deviceLocation]);
  return <><Summary dashboard={p.dashboard} /><View style={styles.sectionHead}><Text style={styles.sectionTitle}>Görev Listesi</Text><View style={styles.sectionActions}><TouchableOpacity onPress={p.onHelp} accessibilityRole="button" accessibilityLabel="Yardım Et"><Text style={styles.refresh}>YARDIM ET</Text></TouchableOpacity><TouchableOpacity onPress={p.refresh}><Text style={styles.refresh}>YENİLE</Text></TouchableOpacity></View></View><SearchBox value={p.search} onChange={p.setSearch} placeholder="İşletme adı, kod, bölge, adres veya eski ad ara" />{!p.dashboard ? <ActivityIndicator /> : tasks.length === 0 ? <Empty icon={p.search.trim()?'search':'inbox'} title={p.search.trim()?'Sonuç bulunamadı':'Açık görev yok'} text={p.search.trim()?'Arama ifadesini değiştirip tekrar dene.':undefined} /> : tasks.map(t => <Task key={t.pointId} task={t} busy={p.busy} deviceLocation={p.deviceLocation} onDirections={p.onDirections} onAttempt={p.onAttempt} onComplete={p.onComplete} />)}</>;
}
function HelpView(p:{people:HelpTarget[];dashboard:TechnicianDashboard|null;busy:boolean;select:(t:HelpTarget)=>void;change:()=>void;onDirections:(t:DueTask)=>void;onAttempt:(t:DueTask)=>void;onComplete:(t:DueTask)=>void}) {
  if (!p.dashboard) return <View style={styles.card}>
    <View style={styles.cardIcon}><Feather name="user-plus" size={20} color={BLUE}/></View><Text style={styles.cardTitle}>Kime yardım edeceksin?</Text><Text style={styles.help}>Yalnızca yöneticinin sana yardım yetkisi verdiği teknisyenleri görebilirsin.</Text>
    {p.people.length===0?<Empty icon="users" title="Yardım yetkisi tanımlanmamış" text="Yöneticin yardım yetkisi tanımladığında ekip arkadaşların burada görünecek."/>:p.people.map(t=><TouchableOpacity key={t.id} style={styles.personRow} onPress={()=>p.select(t)}><View style={styles.avatar}><Text style={styles.avatarText}>{initials(t.name)}</Text></View><View style={styles.personText}><Text style={styles.personName}>{t.name}</Text><Text style={styles.personMeta}>@{t.username}</Text></View><Feather name="chevron-right" size={20} color="#8A99A6"/></TouchableOpacity>)}
  </View>;
  return <><View style={styles.assistBanner}><View style={styles.assistBadge}><Feather name="users" size={17} color="#8B6508" /></View><View style={styles.assistBody}><Text style={styles.assistEyebrow}>YARDIM MODU</Text><Text style={styles.assistText}>{p.dashboard.technician.name} için görevler</Text></View><TouchableOpacity onPress={p.change}><Text style={styles.assistChange}>DEĞİŞTİR</Text></TouchableOpacity></View><Summary dashboard={p.dashboard}/>{p.dashboard.due.length===0?<Empty icon="check-circle" title="Açık görev yok" text="Bu teknisyen için bekleyen bakım görevi bulunmuyor."/>:p.dashboard.due.map(t=><Task key={t.pointId} task={t} busy={p.busy} onDirections={p.onDirections} onAttempt={p.onAttempt} onComplete={p.onComplete}/>)}</>;
}

function Summary({dashboard}:{dashboard:TechnicianDashboard|null}) {
  return <View style={styles.summaryRow}>
    <View style={styles.summaryBox}><View style={[styles.summaryIcon,{backgroundColor:'#FDEDEC'}]}><Feather name="alert-circle" size={18} color={RED}/></View><Text style={styles.summaryRed}>{dashboard?.overdue ?? '—'}</Text><Text style={styles.summaryLabel}>Gecikmiş</Text></View>
    <View style={styles.summaryBox}><View style={[styles.summaryIcon,{backgroundColor:'#FFF4E4'}]}><Feather name="calendar" size={18} color={ORANGE}/></View><Text style={styles.summaryOrange}>{dashboard?.current ?? '—'}</Text><Text style={styles.summaryLabel}>Bu dönem</Text></View>
  </View>;
}

function Task({task,busy,deviceLocation,onDirections,onAttempt,onComplete}:{task:DueTask;busy:boolean;deviceLocation?:{latitude:number;longitude:number}|null;onDirections:(t:DueTask)=>void;onAttempt:(t:DueTask)=>void;onComplete:(t:DueTask)=>void}) {
  const late=task.priority==='OVERDUE';
  const distance=deviceLocation&&task.latitude!=null&&task.longitude!=null?distanceMetersStatic(deviceLocation.latitude,deviceLocation.longitude,task.latitude,task.longitude):null;
  return <View style={styles.task}>
    <View style={styles.taskTop}><View style={[styles.statusPill,late?styles.statusLate:styles.statusCurrent]}><View style={[styles.statusDot,late?styles.redDot:styles.orangeDot]}/><Text style={late?styles.lateText:styles.currentText}>{late?'GECİKMİŞ':'BU DÖNEM'}{task.overduePeriods>0?` · ${task.overduePeriods} dönem`:''}</Text></View></View>
    <Text style={styles.taskName}>{task.pointName}</Text><View style={styles.metaRow}><Feather name="hash" size={14} color="#7B8A97"/><Text style={styles.taskMeta}>{task.pointCode}</Text><View style={styles.metaDivider}/><Feather name="map-pin" size={14} color="#7B8A97"/><Text style={styles.taskMeta}>{task.regionName}</Text>{distance!=null?<><View style={styles.metaDivider}/><Feather name="crosshair" size={14} color="#7B8A97"/><Text style={styles.taskMeta}>{formatDistance(distance)}</Text></>:null}</View>
    <View style={styles.taskActions}><TouchableOpacity style={styles.routeButton} onPress={()=>onDirections(task)} disabled={busy}><Feather name="navigation" size={16} color={BLUE}/><Text style={styles.routeText}>Yol tarifi</Text></TouchableOpacity><PrimaryButton title="BAKIM YAPILDI" icon="check" onPress={()=>onComplete(task)} disabled={busy}/></View>
    <TouchableOpacity style={styles.failButton} onPress={()=>onAttempt(task)} disabled={busy}><Feather name="alert-triangle" size={16} color="#B7372F"/><Text style={styles.failText}>Bakım yapılamadı</Text></TouchableOpacity>
  </View>;
}
function EquipmentFields({equipment,setEquipment}:{equipment:{coolerCount:string;towerCount:string;tapCount:string;smarttapCount:string};setEquipment:(v:any)=>void}) {
  const row=(key:keyof typeof equipment,label:string,icon:React.ComponentProps<typeof Feather>['name'])=><View style={styles.equipmentRow}><View style={styles.equipmentInfo}><View style={styles.equipmentIcon}><Feather name={icon} size={17} color={BLUE}/></View><Text style={styles.equipmentLabel}>{label}</Text></View><TextInput style={styles.equipmentInput} value={equipment[key]} onChangeText={v=>setEquipment({...equipment,[key]:v.replace(/[^0-9]/g,'')})} keyboardType="number-pad" placeholder="0" placeholderTextColor="#9AA7B2" /></View>;
  return <View style={styles.card}>{row('coolerCount','Soğutucu','snowflake')}{row('towerCount','Kule','tower')}{row('tapCount','Musluk','tap')}{row('smarttapCount','SmartTap','smarttap')}</View>;
}

function CustomersView({customers,search,setSearch,open}:{customers:MyCustomer[];search:string;setSearch:(v:string)=>void;open:(c:MyCustomer)=>void}) {
  const visible=customers.filter(c=>matchesSearch(search, [c.name, c.code, c.region?.name ?? '', c.address ?? '', ...(c.aliases ?? [])]));
  return <><SectionHeader title="Müşterilerim" subtitle="Ekipman bilgilerini bakım zamanı gelmeden tamamlayabilirsin"/><SearchBox value={search} onChange={setSearch} placeholder="Müşteri adı, kod, bölge, adres veya eski ad ara" />{customers.length===0?<Empty icon="users" title="Atanmış müşteri yok" text="Aktif müşterilerin burada listelenecek."/>:visible.length===0?<Empty icon="search" title="Sonuç bulunamadı" text="Arama ifadesini değiştirip tekrar dene."/>:<View style={styles.listCard}>{visible.map(c=><TouchableOpacity key={c.id} style={styles.customerRow} onPress={()=>open(c)}><View style={[styles.customerIcon,c.equipmentComplete&&styles.customerIconComplete]}><Feather name={c.equipmentComplete?'check':'tool'} size={18} color={c.equipmentComplete?GREEN:ORANGE}/></View><View style={styles.personText}><Text style={styles.personName}>{c.name}</Text><Text style={styles.personMeta}>{c.code}{c.region?.name?` · ${c.region.name}`:''}</Text><Text style={c.equipmentComplete?styles.okText:styles.warningText}>{c.equipmentComplete?'Ekipman bilgisi tamam':'Ekipman bilgisi eksik'}</Text></View><Feather name="chevron-right" size={20} color="#8A99A6"/></TouchableOpacity>)}</View>}</>;
}
function CustomerView({customer,equipment,setEquipment,save,back,busy}:{customer:MyCustomer;equipment:any;setEquipment:(v:any)=>void;save:()=>void;back:()=>void;busy:boolean}) {
  const hasLocation=customer.canonicalLatitude!=null&&customer.canonicalLongitude!=null;
  return <><TouchableOpacity style={styles.backLink} onPress={back}><Feather name="arrow-left" size={17} color={BLUE}/><Text style={styles.backText}>MÜŞTERİLERİM</Text></TouchableOpacity><View style={styles.card}><View style={styles.cardIcon}><Feather name="map-pin" size={20} color={BLUE}/></View><Text style={styles.taskName}>{customer.name}</Text><Text style={styles.taskMeta}>{customer.code}{customer.region?.name?` · ${customer.region.name}`:''}</Text>{customer.address?<Text style={styles.help}>{customer.address}</Text>:null}{hasLocation?<View style={styles.locationChip}><Feather name="crosshair" size={14} color={BLUE}/><Text style={styles.locationText}>{customer.canonicalLatitude?.toFixed(5)}, {customer.canonicalLongitude?.toFixed(5)} · güven {customer.locationConfidence ?? 0}%</Text></View>:<Text style={styles.personMeta}>Konum bilgisi henüz yok</Text>}</View><SectionHeader title="Ekipman" subtitle="Kayıtlı adetleri kontrol et ve gerekirse güncelle"/><EquipmentFields equipment={equipment} setEquipment={setEquipment}/><PrimaryButton title="EKİPMAN BİLGİLERİNİ KAYDET" icon="save" onPress={save} disabled={busy}/></>;
}

function EquipmentConfirmView({task,equipment,setEquipment,confirm,cancel,busy}:{task:DueTask;equipment:any;setEquipment:(v:any)=>void;confirm:()=>void;cancel:()=>void;busy:boolean}) {
  const known=[task.coolerCount,task.towerCount,task.tapCount,task.smarttapCount].every(v=>v!=null);
  return <><View style={styles.card}><View style={styles.cardIcon}><Feather name="tool" size={20} color={BLUE}/></View><Text style={styles.cardTitle}>{task.pointName}</Text><Text style={styles.help}>{known?'Kayıtlı ekipman bilgilerini kontrol et. Bir fark varsa adetleri düzenle.':'İlk bakım için ekipman adetlerini eksiksiz gir.'}</Text></View><EquipmentFields equipment={equipment} setEquipment={setEquipment}/><PrimaryButton title={known?'BİLGİLER DOĞRU · BAKIMI KAYDET':'BİLGİLERİ KAYDET · BAKIMI TAMAMLA'} icon="check-circle" onPress={confirm} disabled={busy}/><SecondaryButton title="Vazgeç" icon="x" danger onPress={cancel} disabled={busy}/></>;
}

function HistoryView({items,busy,onRevert}:{items:TechnicianHistoryItem[];busy:boolean;onRevert:(i:TechnicianHistoryItem)=>void}) {
  return <><SectionHeader title="Bugünkü İşlemler" subtitle="Son kayıtlarını kontrol edebilir ve bakım kayıtlarını geri alabilirsin"/>{items.length===0?<Empty icon="clock" title="Bugün işlem yok" text="Bugün yaptığın saha işlemleri burada görünecek."/>:<View style={styles.listCard}>{items.map((i,n)=>{const attempt=i.type==='ATTEMPT';const name=i.point?.name||i.prospect?.name||'İşlem';const label=i.type==='MAINTENANCE'?(i.assistedForTechnician?`${i.assistedForTechnician.name} için bakım`:'Bakım yapıldı'):attempt?'Bakım yapılamadı':i.type==='PROSPECT_VISIT'?(i.purpose==='INSTALLATION'?'Kurma':'Keşif'):'Bakım dışı ziyaret';return <View key={`${i.at}-${n}`} style={styles.historyRow}><View style={[styles.historyDot,attempt&&styles.historyWarn]}><Feather name={attempt?'alert-triangle':'check'} size={17} color="#fff"/></View><View style={styles.historyContent}><Text style={styles.historyTime}>{new Date(i.at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</Text><Text style={styles.personName}>{name}</Text><Text style={attempt?styles.warningText:styles.okText}>{label}</Text>{i.type==='MAINTENANCE'?<TouchableOpacity disabled={busy} onPress={()=>onRevert(i)} style={styles.revertButton}><Feather name="rotate-ccw" size={14} color="#B7372F"/><Text style={styles.revertText}>GERİ AL</Text></TouchableOpacity>:null}</View></View>})}</View>}</>;
}

function NewPointView({begin,busy}:{begin:()=>void;busy:boolean}) { return <View style={styles.card}><Text style={styles.cardTitle}>Bu ziyaret ne için?</Text><View style={styles.newChoice}><Feather name="search" size={23} color={BLUE}/><View><Text style={styles.personName}>Keşif</Text><Text style={styles.personMeta}>Potansiyel müşteri</Text></View></View><View style={styles.newChoice}><Feather name="tool" size={23} color={BLUE}/><View><Text style={styles.personName}>Kurma</Text><Text style={styles.personMeta}>Yeni kurulacak nokta</Text></View></View><View style={styles.infoBox}><Feather name="info" size={17} color="#315A78"/><Text style={styles.infoText}>Devam etmek için önce EFESİM ekran görüntüsü alınır. Manuel adres girişi yoktur.</Text></View><PrimaryButton title="EFESİM EKRAN GÖRÜNTÜSÜ SEÇ" icon="image" onPress={begin} disabled={busy}/></View>; }
function EfesimView(p:any) { return <><View style={styles.card}><Text style={styles.sectionLabel}>EFESİM</Text><TextInput style={styles.input} value={p.sapNo} onChangeText={p.setSapNo} keyboardType="number-pad" placeholder="SAP No"/><TextInput style={styles.input} value={p.customerName} onChangeText={p.setCustomerName} placeholder="Müşteri adı"/></View>{p.strong?<View style={styles.card}><Text style={styles.sectionLabel}>GOOGLE MAPS EŞLEŞMESİ</Text><Text style={styles.taskName}>{p.google?.name}</Text><Text style={styles.help}>{p.google?.address||'Adres bilgisi yok'}</Text><View style={styles.choiceRow}><Choice title="BU İŞLETME" selected={p.useGoogle} onPress={()=>p.setUseGoogle(true)}/><Choice title="EŞLEŞMEDİ" selected={!p.useGoogle} onPress={()=>p.setUseGoogle(false)}/></View></View>:<View style={styles.card}><Text style={styles.sectionLabel}>GOOGLE MAPS</Text><Text style={styles.help}>Güvenilir eşleşme bulunamadı. İsim ile devam edebilirsin.</Text></View>}<View style={styles.card}><Text style={styles.sectionLabel}>ADRES</Text><Text style={styles.help}>{p.addressText}</Text><Text style={styles.locked}>Adres düzenlenemez.</Text><PrimaryButton title="ADAY MÜŞTERİYİ OLUŞTUR" icon="user-plus" onPress={p.save} disabled={p.busy}/></View></>; }
function ProspectView(p:{prospect:ProspectRecord;purpose:ProspectVisitPurpose;setPurpose:(v:ProspectVisitPurpose)=>void;save:()=>void;busy:boolean}) { return <View style={styles.card}><View style={styles.cardIcon}><Feather name="check" size={20} color={GREEN}/></View><Text style={styles.okText}>Aday müşteri hazır</Text><Text style={styles.taskName}>{p.prospect.name}</Text>{p.prospect.sapNo?<Text style={styles.help}>SAP No: {p.prospect.sapNo}</Text>:null}<Text style={styles.sectionLabel}>ZİYARET AMACI</Text><View style={styles.choiceRow}><Choice title="KEŞİF" selected={p.purpose==='SURVEY'} onPress={()=>p.setPurpose('SURVEY')}/><Choice title="KURMA" selected={p.purpose==='INSTALLATION'} onPress={()=>p.setPurpose('INSTALLATION')}/></View><PrimaryButton title={p.purpose==='SURVEY'?'KEŞİF ZİYARETİNİ KAYDET':'KURMA ZİYARETİNİ KAYDET'} icon="check-circle" onPress={p.save} disabled={p.busy}/></View>; }

function SuccessView({point,assisted,title='Bakım kaydedildi',done}:{point:string;assisted:string;title?:string;done:()=>void}) {
  return <View style={styles.successCard}><View style={styles.successCircle}><Feather name="check" size={38} color="#fff"/></View><Text style={styles.successEyebrow}>İŞLEM TAMAMLANDI</Text><Text style={styles.successTitle}>{title}</Text><Text style={styles.successPoint}>{point}</Text>{assisted?<Text style={styles.help}>{assisted} için yardım olarak kaydedildi.</Text>:null}<View style={styles.successMetaRow}><Feather name="map-pin" size={15} color="#6E7D89"/><Text style={styles.successMeta}>İşlem zamanı ve saha konumu kaydedildi.</Text></View><PrimaryButton title="TAMAM" icon="arrow-right" onPress={done}/></View>;
}

function Empty({icon='inbox',title='Açık görev yok',text}:{icon?:React.ComponentProps<typeof Feather>['name'];title?:string;text?:string}) { return <View style={styles.empty}><View style={styles.emptyIcon}><Feather name={icon} size={25} color="#718493"/></View><Text style={styles.emptyTitle}>{title}</Text>{text?<Text style={styles.emptyText}>{text}</Text>:null}</View>; }
function SectionHeader({title,subtitle,action,actionIcon,onAction}:{title:string;subtitle?:string;action?:string;actionIcon?:React.ComponentProps<typeof Feather>['name'];onAction?:()=>void}) { return <View style={styles.sectionHead}><View style={styles.sectionHeadText}><Text style={styles.sectionTitle}>{title}</Text>{subtitle?<Text style={styles.sectionSubtitle}>{subtitle}</Text>:null}</View>{action&&onAction?<TouchableOpacity style={styles.sectionAction} onPress={onAction}>{actionIcon?<Feather name={actionIcon} size={14} color={BLUE}/>:null}<Text style={styles.refresh}>{action}</Text></TouchableOpacity>:null}</View>; }
function PrimaryButton({title,icon,onPress,disabled}:{title:string;icon?:React.ComponentProps<typeof Feather>['name'];onPress:()=>void;disabled?:boolean}) { return <TouchableOpacity accessibilityRole="button" style={[styles.primary,disabled&&styles.disabled]} onPress={onPress} disabled={disabled}>{icon?<Feather name={icon} size={17} color="#fff"/>:null}<Text style={styles.primaryText}>{title}</Text></TouchableOpacity>; }
function SecondaryButton({title,icon,onPress,disabled,danger}:{title:string;icon?:React.ComponentProps<typeof Feather>['name'];onPress:()=>void;disabled?:boolean;danger?:boolean}) { return <TouchableOpacity accessibilityRole="button" style={[styles.secondary,danger&&styles.secondaryDanger,disabled&&styles.disabled]} onPress={onPress} disabled={disabled}>{icon?<Feather name={icon} size={16} color={danger?'#B7372F':BLUE}/>:null}<Text style={[styles.secondaryText,danger&&styles.secondaryDangerText]}>{title}</Text></TouchableOpacity>; }
function Choice({title,selected,onPress}:{title:string;selected:boolean;onPress:()=>void}) { return <TouchableOpacity style={[styles.choice,selected&&styles.choiceSelected]} onPress={onPress}><Text style={[styles.choiceText,selected&&styles.choiceTextSelected]}>{title}</Text></TouchableOpacity>; }
function Nav({label,icon,active,onPress}:{label:string;icon:React.ComponentProps<typeof Feather>['name'];active:boolean;onPress:()=>void}) { return <TouchableOpacity accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} style={styles.navItem} onPress={onPress}><View style={[styles.navIconWrap,active&&styles.navIconActive]}><Feather name={icon} size={20} color={active?BLUE:'#80909D'}/></View><Text style={[styles.navLabel,active&&styles.navActive]}>{label}</Text></TouchableOpacity>; }
function initials(name:string){return name.split(' ').filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
function message(e:unknown){return e instanceof Error?e.message:String(e);}

const BLUE='#075A96', DARK_BLUE='#064C80', BRIGHT_BLUE='#0877D1', LIGHT='#F3F6F9', TEXT='#182633', MUTED='#68798A', LINE='#E2E9EF', RED='#E7473C', ORANGE='#F39A22', GREEN='#27A867';
const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:DARK_BLUE}, shell:{flex:1,backgroundColor:LIGHT}, scroll:{flex:1}, container:{padding:18,paddingBottom:32,gap:14}, center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:LIGHT},
  header:{backgroundColor:DARK_BLUE,paddingHorizontal:20,paddingTop:17,paddingBottom:19,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.08)'}, headerIdentity:{flexDirection:'row',alignItems:'center',gap:11,flex:1,minWidth:0,marginRight:10}, brandImage:{width:42,height:42,borderRadius:12,backgroundColor:'#fff'}, headerCopy:{flex:1,minWidth:0}, eyebrow:{color:'#D7E8F5',fontSize:12,fontWeight:'900',letterSpacing:.4}, headerTitle:{color:'#fff',fontSize:27,fontWeight:'900',letterSpacing:-.45,marginTop:1,flexShrink:1}, headerUser:{color:'#C9DDEC',fontSize:12,marginTop:1}, logoutBtn:{borderWidth:1,borderColor:'rgba(255,255,255,.22)',backgroundColor:'rgba(255,255,255,.06)',paddingHorizontal:11,paddingVertical:9,borderRadius:10,flexDirection:'row',alignItems:'center',gap:6}, logoutText:{color:'#fff',fontSize:10,fontWeight:'900'},
  loginSafe:{flex:1,backgroundColor:LIGHT}, loginHero:{backgroundColor:DARK_BLUE,paddingHorizontal:26,paddingTop:46,paddingBottom:34,gap:34}, loginBrandRow:{flexDirection:'row',alignItems:'center',gap:13}, loginLogo:{width:62,height:62,borderRadius:18,backgroundColor:'#fff'}, loginBrand:{color:'#fff',fontSize:25,fontWeight:'900',letterSpacing:-.4}, loginBrandSub:{color:'#9FC2DA',fontSize:10,fontWeight:'800',letterSpacing:1.05,marginTop:3}, loginIntro:{gap:8}, loginTitle:{color:'#fff',fontSize:30,fontWeight:'900',letterSpacing:-.55}, loginSub:{color:'#C8DDED',fontSize:14,lineHeight:21,maxWidth:330}, loginForm:{backgroundColor:'#fff',margin:18,borderWidth:1,borderColor:LINE,borderRadius:17,padding:20,gap:10,shadowColor:'#173349',shadowOpacity:.05,shadowRadius:14,elevation:2}, formLabel:{fontSize:10,fontWeight:'900',letterSpacing:.9,color:'#718493',marginTop:3}, loginInput:{backgroundColor:'#F8FAFC',borderWidth:1,borderColor:'#D4DEE6',borderRadius:11,padding:13,fontSize:16,color:TEXT},
  summaryRow:{flexDirection:'row',gap:12}, summaryBox:{flex:1,backgroundColor:'#fff',borderRadius:15,padding:16,borderWidth:1,borderColor:LINE,shadowColor:'#173349',shadowOpacity:.025,shadowRadius:8,elevation:1}, summaryIcon:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',marginBottom:11}, summaryRed:{color:RED,fontSize:30,fontWeight:'900',letterSpacing:-.5}, summaryOrange:{color:ORANGE,fontSize:30,fontWeight:'900',letterSpacing:-.5}, summaryLabel:{color:MUTED,fontSize:12,fontWeight:'800',marginTop:1},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',gap:12,marginTop:3}, sectionHeadText:{flex:1,gap:3}, sectionTitle:{fontSize:19,fontWeight:'900',color:TEXT,letterSpacing:-.2}, sectionSubtitle:{fontSize:12,lineHeight:17,color:'#758594'}, sectionActions:{flexDirection:'row',alignItems:'center',gap:14}, sectionAction:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:8,borderRadius:9,backgroundColor:'#EAF4FC'}, refresh:{fontSize:10,fontWeight:'900',color:BLUE,letterSpacing:.4},
  searchBox:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D8E2E9',borderRadius:12,minHeight:46,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:9}, searchInput:{flex:1,fontSize:15,color:TEXT,paddingVertical:10},
  card:{backgroundColor:'#fff',borderRadius:15,padding:17,gap:12,borderWidth:1,borderColor:LINE,shadowColor:'#173349',shadowOpacity:.025,shadowRadius:10,elevation:1}, cardIcon:{width:38,height:38,borderRadius:11,backgroundColor:'#EAF4FC',alignItems:'center',justifyContent:'center'}, cardTitle:{fontSize:20,fontWeight:'900',color:TEXT,letterSpacing:-.25}, help:{fontSize:14,lineHeight:21,color:'#637485'},
  task:{backgroundColor:'#fff',borderRadius:16,padding:17,gap:11,borderWidth:1,borderColor:LINE,shadowColor:'#173349',shadowOpacity:.035,shadowRadius:11,elevation:1}, taskTop:{flexDirection:'row',alignItems:'center'}, statusPill:{flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:9,paddingVertical:5,borderRadius:999}, statusLate:{backgroundColor:'#FDEDEC'}, statusCurrent:{backgroundColor:'#FFF4E4'}, statusDot:{width:7,height:7,borderRadius:4}, redDot:{backgroundColor:RED}, orangeDot:{backgroundColor:ORANGE}, lateText:{color:'#B6312A',fontSize:10,fontWeight:'900',letterSpacing:.55}, currentText:{color:'#A96308',fontSize:10,fontWeight:'900',letterSpacing:.55}, taskName:{fontSize:20,fontWeight:'900',color:TEXT,letterSpacing:-.25}, metaRow:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap'}, metaDivider:{width:1,height:13,backgroundColor:'#D7E0E7',marginHorizontal:3}, taskMeta:{fontSize:12,color:'#667989'}, taskActions:{gap:9}, routeButton:{borderWidth:1,borderColor:'#BCD0DF',backgroundColor:'#F8FBFD',borderRadius:10,padding:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8}, routeText:{color:BLUE,fontSize:12,fontWeight:'900'}, primary:{backgroundColor:BRIGHT_BLUE,borderRadius:11,paddingVertical:14,paddingHorizontal:14,alignItems:'center',justifyContent:'center',minHeight:48,flexDirection:'row',gap:8,shadowColor:'#075A96',shadowOpacity:.13,shadowRadius:7,elevation:2}, primaryText:{color:'#fff',fontSize:13,fontWeight:'900',letterSpacing:.15}, failButton:{borderWidth:1,borderColor:'#E2B7B4',backgroundColor:'#FFFDFD',borderRadius:10,paddingVertical:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8}, failText:{color:'#B7372F',fontSize:13,fontWeight:'800'}, secondary:{borderWidth:1,borderColor:'#C8D8E4',backgroundColor:'#fff',borderRadius:10,paddingVertical:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,minHeight:46}, secondaryText:{color:BLUE,fontSize:13,fontWeight:'900'}, secondaryDanger:{borderColor:'#E2B7B4'}, secondaryDangerText:{color:'#B7372F'}, disabled:{opacity:.45},
  listCard:{backgroundColor:'#fff',borderRadius:15,borderWidth:1,borderColor:LINE,paddingHorizontal:16,shadowColor:'#173349',shadowOpacity:.025,shadowRadius:10,elevation:1}, personRow:{flexDirection:'row',alignItems:'center',paddingVertical:13,borderBottomWidth:1,borderBottomColor:'#EDF1F4'}, customerRow:{flexDirection:'row',alignItems:'center',paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#EDF1F4'}, avatar:{width:42,height:42,borderRadius:12,backgroundColor:'#DDEEFF',alignItems:'center',justifyContent:'center'}, avatarText:{color:BLUE,fontWeight:'900'}, customerIcon:{width:40,height:40,borderRadius:12,backgroundColor:'#FFF4E4',alignItems:'center',justifyContent:'center'}, customerIconComplete:{backgroundColor:'#E8F7EF'}, personText:{flex:1,marginLeft:11}, personName:{fontSize:15,fontWeight:'900',color:TEXT}, personMeta:{fontSize:12,color:'#758594',marginTop:2},
  assistBanner:{backgroundColor:'#FFF7DD',borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#F1DFA1'}, assistBadge:{width:38,height:38,borderRadius:11,backgroundColor:'#FFF0B7',alignItems:'center',justifyContent:'center'}, assistBody:{flex:1,marginLeft:10}, assistEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#9C7819'}, assistText:{fontSize:13,fontWeight:'900',color:'#6E5700',marginTop:2}, assistChange:{fontSize:10,fontWeight:'900',color:'#6E5700'},
  nav:{height:72,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#DDE5EB',flexDirection:'row',paddingTop:5,paddingBottom:5,shadowColor:'#173349',shadowOpacity:.06,shadowRadius:10,elevation:10}, navItem:{flex:1,alignItems:'center',justifyContent:'center',gap:3}, navIconWrap:{width:36,height:29,borderRadius:10,alignItems:'center',justifyContent:'center'}, navIconActive:{backgroundColor:'#EAF4FC'}, navLabel:{fontSize:10,color:'#80909D',fontWeight:'800'}, navActive:{color:BRIGHT_BLUE,fontWeight:'900'},
  historyRow:{flexDirection:'row',gap:12,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#EDF1F4'}, historyContent:{flex:1}, revertButton:{alignSelf:'flex-start',marginTop:9,borderWidth:1,borderColor:'#E2B7B4',borderRadius:8,paddingHorizontal:10,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:6}, revertText:{color:'#B7372F',fontSize:10,fontWeight:'900'}, historyDot:{width:36,height:36,borderRadius:11,backgroundColor:GREEN,alignItems:'center',justifyContent:'center'}, historyWarn:{backgroundColor:ORANGE}, historyTime:{fontSize:10,color:'#7A8A97',fontWeight:'800',marginBottom:2}, okText:{color:GREEN,fontSize:12,fontWeight:'900',marginTop:3}, warningText:{color:ORANGE,fontSize:12,fontWeight:'900',marginTop:3},
  equipmentRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,borderBottomWidth:1,borderBottomColor:'#EDF1F4',paddingVertical:10}, equipmentInfo:{flexDirection:'row',alignItems:'center',gap:10}, equipmentIcon:{width:34,height:34,borderRadius:10,backgroundColor:'#EAF4FC',alignItems:'center',justifyContent:'center'}, equipmentLabel:{fontSize:15,fontWeight:'800',color:TEXT}, equipmentInput:{width:88,borderWidth:1,borderColor:'#D6E0E8',backgroundColor:'#F8FAFC',borderRadius:10,padding:10,fontSize:18,textAlign:'center',fontWeight:'900',color:TEXT}, backLink:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7,paddingVertical:6}, backText:{fontSize:10,fontWeight:'900',color:BLUE,letterSpacing:.5}, locationChip:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#EAF4FC',alignSelf:'flex-start',paddingHorizontal:9,paddingVertical:7,borderRadius:8}, locationText:{fontSize:11,color:BLUE,fontWeight:'800'},
  successCard:{backgroundColor:'#fff',borderRadius:17,padding:26,gap:10,alignItems:'center',borderWidth:1,borderColor:LINE,shadowColor:'#173349',shadowOpacity:.035,shadowRadius:10,elevation:1}, successCircle:{width:76,height:76,borderRadius:24,backgroundColor:GREEN,alignItems:'center',justifyContent:'center',marginBottom:6}, successEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1,color:GREEN}, successTitle:{fontSize:23,fontWeight:'900',color:TEXT,textAlign:'center'}, successPoint:{fontSize:18,fontWeight:'900',color:BLUE,textAlign:'center'}, successMetaRow:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:8}, successMeta:{fontSize:12,color:'#6E7D89',textAlign:'center'},
  empty:{backgroundColor:'#fff',borderRadius:14,padding:24,alignItems:'center',borderWidth:1,borderColor:LINE,gap:7}, emptyIcon:{width:50,height:50,borderRadius:15,backgroundColor:'#F0F4F7',alignItems:'center',justifyContent:'center',marginBottom:3}, emptyTitle:{fontSize:16,fontWeight:'900',color:'#4F6271',textAlign:'center'}, emptyText:{fontSize:12,lineHeight:18,color:'#7B8A97',textAlign:'center',maxWidth:280}, loader:{marginVertical:16},
  newChoice:{borderWidth:1,borderColor:'#DCE5EC',borderRadius:12,padding:15,flexDirection:'row',alignItems:'center',gap:14}, infoBox:{backgroundColor:'#EAF4FC',borderRadius:10,padding:12,flexDirection:'row',gap:9,alignItems:'flex-start'}, infoText:{flex:1,fontSize:13,lineHeight:19,color:'#315A78'}, sectionLabel:{fontSize:10,fontWeight:'900',letterSpacing:.9,color:'#5C7080'}, input:{borderWidth:1,borderColor:'#D6E0E8',backgroundColor:'#F8FAFC',borderRadius:10,padding:12,fontSize:16,color:TEXT}, choiceRow:{flexDirection:'row',gap:8}, choice:{flex:1,borderWidth:1,borderColor:'#C7D3DD',borderRadius:10,padding:12,alignItems:'center'}, choiceSelected:{backgroundColor:BLUE,borderColor:BLUE}, choiceText:{fontSize:11,fontWeight:'900',color:'#415565'}, choiceTextSelected:{color:'#fff'}, locked:{fontSize:12,color:'#7D8A95',fontWeight:'700'},
});
