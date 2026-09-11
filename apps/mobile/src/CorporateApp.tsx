import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  AttemptReason, AuthUser, clearSessionToken, confirmEfesim, completeMaintenance, createProspectVisit,
  DueTask, EfesimExtractResult, extractEfesim, HelpTarget, helpTargets, login, me, ProspectRecord,
  ProspectVisitPurpose, recordMaintenanceAttempt, restoreSessionToken, technicianDashboard,
  TechnicianDashboard, technicianHistory, TechnicianHistoryItem, myCustomers, updateCustomerEquipment, MyCustomer,
} from './api';

type Screen = 'TASKS' | 'CUSTOMERS' | 'CUSTOMER' | 'EQUIPMENT_CONFIRM' | 'HELP' | 'NEW' | 'HISTORY' | 'EFESIM_RESULT' | 'PROSPECT' | 'VISIT_SAVED' | 'SUCCESS';

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

  async function signOut() { await clearSessionToken(); setUser(null); setDashboard(null); setPassword(''); setScreen('TASKS'); }
  async function loadTasks() { try { setDashboard(await technicianDashboard()); } catch (e) { Alert.alert('Görevler alınamadı', message(e)); } }
  async function openHelp() { setBusy(true); try { setHelpPeople(await helpTargets()); setHelpDashboard(null); setScreen('HELP'); } catch (e) { Alert.alert('Yardım listesi alınamadı', message(e)); } finally { setBusy(false); } }
  async function selectHelper(target: HelpTarget) { setBusy(true); try { setHelpDashboard(await technicianDashboard(target.id)); } catch (e) { Alert.alert('Görevler alınamadı', message(e)); } finally { setBusy(false); } }
  async function openHistory() { setBusy(true); try { const h = await technicianHistory(); setHistoryItems(h.items.slice().reverse()); setScreen('HISTORY'); } catch (e) { Alert.alert('Geçmiş alınamadı', message(e)); } finally { setBusy(false); } }
  function equipmentFrom(value: { coolerCount?:number|null; towerCount?:number|null; tapCount?:number|null; smarttapCount?:number|null }) {
    setEquipment({ coolerCount:value.coolerCount==null?'':String(value.coolerCount), towerCount:value.towerCount==null?'':String(value.towerCount), tapCount:value.tapCount==null?'':String(value.tapCount), smarttapCount:value.smarttapCount==null?'':String(value.smarttapCount) });
  }
  function parsedEquipment() {
    if (Object.values(equipment).some(v => !v.trim())) throw new Error('Soğutucu, kule, musluk ve SmartTap adetlerinin tamamını gir.');
    const values = Object.fromEntries(Object.entries(equipment).map(([k,v])=>[k, Number(v)])) as {coolerCount:number;towerCount:number;tapCount:number;smarttapCount:number};
    if (Object.values(values).some(v=>!Number.isInteger(v)||v<0)) throw new Error('Tüm ekipman adetlerini 0 veya daha büyük tam sayı olarak gir.');
    return values;
  }
  async function openCustomers() { setBusy(true); try { setCustomers(await myCustomers()); setScreen('CUSTOMERS'); } catch(e){ Alert.alert('Müşteriler alınamadı',message(e)); } finally{ setBusy(false); } }
  function openCustomer(customer:MyCustomer){ setSelectedCustomer(customer); equipmentFrom(customer); setScreen('CUSTOMER'); }
  async function saveCustomerEquipment(){ if(!selectedCustomer)return; setBusy(true); try { const values=parsedEquipment(); await updateCustomerEquipment(selectedCustomer.id,values); const refreshed=await myCustomers(); setCustomers(refreshed); const next=refreshed.find(x=>x.id===selectedCustomer.id)??null; setSelectedCustomer(next); if(next) equipmentFrom(next); Alert.alert('Kaydedildi','Müşteri ekipman bilgileri güncellendi.'); } catch(e){ Alert.alert('Kaydedilemedi',message(e)); } finally{setBusy(false);} }
  function prepareComplete(task:DueTask, assistedForTechnicianId?:string){ setPendingTask(task); setPendingAssist(assistedForTechnicianId); equipmentFrom(task); setScreen('EQUIPMENT_CONFIRM'); }

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

  async function completeTask(task: DueTask, assistedForTechnicianId?: string) {
    setBusy(true);
    try {
      const loc = await currentLocation();
      const equipmentValues = parsedEquipment();
      await completeMaintenance({ pointId: task.pointId, assistedForTechnicianId, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy ?? undefined, locationCapturedAt: new Date(loc.timestamp).toISOString(), deviceRecordedAt: new Date().toISOString(), ...equipmentValues, equipmentConfirmed: true, idempotencyKey: `maintenance-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      setSuccessPoint(task.pointName); setSuccessAssist(helpDashboard?.technician.name ?? ''); setScreen('SUCCESS'); setHelpDashboard(null); await loadTasks();
    } catch (e) { Alert.alert('Bakım kaydedilemedi', message(e)); }
    finally { setBusy(false); }
  }

  async function beginEfesim() {
    setBusy(true);
    try {
      const media = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!media.granted) return Alert.alert('İzin gerekli', 'EFESİM ekran görüntüsünü seçmek için fotoğraf izni gerekli.');
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9, base64: true });
      if (picked.canceled) return;
      const asset = picked.assets[0]; if (!asset.base64) throw new Error('Ekran görüntüsü okunamadı.');
      const loc = await currentLocation(); const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }; setFieldLocation(coords);
      const result = await extractEfesim({ technicianId: user!.id, imageBase64: asset.base64, ...coords });
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

  if (sessionLoading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" /><Text>Oturum kontrol ediliyor...</Text></SafeAreaView>;
  if (!user) return <Login username={username} password={password} setUsername={setUsername} setPassword={setPassword} busy={busy} signIn={signIn} />;

  const title = screen === 'CUSTOMERS' || screen === 'CUSTOMER' ? 'Müşterilerim' : screen === 'EQUIPMENT_CONFIRM' ? 'Ekipman Kontrolü' : screen === 'HELP' ? 'Yardım Et' : screen === 'NEW' || screen === 'EFESIM_RESULT' || screen === 'PROSPECT' || screen === 'VISIT_SAVED' ? 'Yeni Nokta' : screen === 'HISTORY' ? 'Geçmiş' : 'İşler';
  return <SafeAreaView style={styles.safe}><StatusBar style="light" /><View style={styles.shell}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>SAHA BAKIM</Text><Text style={styles.headerTitle}>{title}</Text><Text style={styles.headerUser}>{user.name}</Text></View><TouchableOpacity style={styles.logoutBtn} onPress={() => void signOut()}><Text style={styles.logoutText}>ÇIKIŞ</Text></TouchableOpacity></View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {screen === 'TASKS' && <TaskList dashboard={dashboard} busy={busy} refresh={() => void loadTasks()} onDirections={openDirections} onAttempt={task => attemptReason(task)} onComplete={task => prepareComplete(task)} />}
      {screen === 'HELP' && <HelpView people={helpPeople} dashboard={helpDashboard} busy={busy} select={selectHelper} change={() => setHelpDashboard(null)} onDirections={openDirections} onAttempt={task => attemptReason(task, helpDashboard?.technician.id)} onComplete={task => prepareComplete(task, helpDashboard?.technician.id)} />}
      {screen === 'CUSTOMERS' && <CustomersView customers={customers} open={openCustomer} />}
      {screen === 'CUSTOMER' && selectedCustomer && <CustomerView customer={selectedCustomer} equipment={equipment} setEquipment={setEquipment} save={() => void saveCustomerEquipment()} back={() => setScreen('CUSTOMERS')} busy={busy} />}
      {screen === 'EQUIPMENT_CONFIRM' && pendingTask && <EquipmentConfirmView task={pendingTask} equipment={equipment} setEquipment={setEquipment} confirm={() => void completeTask(pendingTask,pendingAssist)} cancel={() => { setPendingTask(null); setPendingAssist(undefined); setScreen(pendingAssist?'HELP':'TASKS'); }} busy={busy} />}
      {screen === 'HISTORY' && <HistoryView items={historyItems} />}
      {screen === 'SUCCESS' && <SuccessView point={successPoint} assisted={successAssist} done={() => { setSuccessAssist(''); setScreen('TASKS'); }} />}
      {screen === 'NEW' && <NewPointView begin={() => void beginEfesim()} busy={busy} />}
      {screen === 'EFESIM_RESULT' && efesim && <EfesimView result={efesim} sapNo={sapNo} setSapNo={setSapNo} customerName={customerName} setCustomerName={setCustomerName} strong={strongGoogleMatch} google={google} useGoogle={useGoogle} setUseGoogle={setUseGoogle} addressText={addressText} save={() => void saveProspect()} busy={busy} />}
      {screen === 'PROSPECT' && prospect && <ProspectView prospect={prospect} purpose={visitPurpose} setPurpose={setVisitPurpose} save={() => void saveVisit()} busy={busy} />}
      {screen === 'VISIT_SAVED' && prospect && <SuccessView point={prospect.name} assisted="" title={visitPurpose === 'SURVEY' ? 'Keşif kaydedildi' : 'Kurma kaydedildi'} done={() => setScreen('TASKS')} />}
      {busy && <ActivityIndicator size="large" style={styles.loader} />}
    </ScrollView>
    <View style={styles.nav}><Nav label="İşler" symbol="▣" active={screen === 'TASKS' || screen === 'SUCCESS' || screen === 'EQUIPMENT_CONFIRM'} onPress={() => setScreen('TASKS')} /><Nav label="Müşterilerim" symbol="⌂" active={screen === 'CUSTOMERS' || screen === 'CUSTOMER'} onPress={() => void openCustomers()} /><Nav label="Yardım Et" symbol="♧" active={screen === 'HELP'} onPress={() => void openHelp()} /><Nav label="Yeni Nokta" symbol="⊕" active={['NEW','EFESIM_RESULT','PROSPECT','VISIT_SAVED'].includes(screen)} onPress={() => setScreen('NEW')} /><Nav label="Geçmiş" symbol="↺" active={screen === 'HISTORY'} onPress={() => void openHistory()} /></View>
  </View></SafeAreaView>;
}

function Login(p: { username:string; password:string; setUsername:(v:string)=>void; setPassword:(v:string)=>void; busy:boolean; signIn:()=>void }) {
  return <SafeAreaView style={styles.loginSafe}><StatusBar style="light" /><View style={styles.loginHero}><View style={styles.logoMark}><Text style={styles.logoText}>S</Text></View><Text style={styles.loginTitle}>Saha Bakım</Text><Text style={styles.loginSub}>Güvenilir Saha Yönetimi</Text></View><View style={styles.loginForm}><TextInput style={styles.loginInput} value={p.username} onChangeText={p.setUsername} autoCapitalize="none" autoComplete="username" placeholder="Kullanıcı adı" placeholderTextColor="#6f8298" /><TextInput style={styles.loginInput} value={p.password} onChangeText={p.setPassword} secureTextEntry autoComplete="password" placeholder="Şifre" placeholderTextColor="#6f8298" onSubmitEditing={p.signIn} /><PrimaryButton title="GİRİŞ YAP" onPress={p.signIn} disabled={p.busy} />{p.busy && <ActivityIndicator />}</View></SafeAreaView>;
}

function TaskList(p:{dashboard:TechnicianDashboard|null;busy:boolean;refresh:()=>void;onDirections:(t:DueTask)=>void;onAttempt:(t:DueTask)=>void;onComplete:(t:DueTask)=>void}) {
  return <><Summary dashboard={p.dashboard} /><View style={styles.sectionHead}><Text style={styles.sectionTitle}>Görev Listesi</Text><TouchableOpacity onPress={p.refresh}><Text style={styles.refresh}>YENİLE</Text></TouchableOpacity></View>{!p.dashboard ? <ActivityIndicator /> : p.dashboard.due.length === 0 ? <Empty /> : p.dashboard.due.map(t => <Task key={t.pointId} task={t} busy={p.busy} onDirections={p.onDirections} onAttempt={p.onAttempt} onComplete={p.onComplete} />)}</>;
}
function HelpView(p:{people:HelpTarget[];dashboard:TechnicianDashboard|null;busy:boolean;select:(t:HelpTarget)=>void;change:()=>void;onDirections:(t:DueTask)=>void;onAttempt:(t:DueTask)=>void;onComplete:(t:DueTask)=>void}) { return !p.dashboard ? <View style={styles.card}><Text style={styles.cardTitle}>Kime yardım edeceksin?</Text><Text style={styles.help}>Yalnızca yöneticinin izin verdiği teknisyenler.</Text>{p.people.length===0?<Empty text="Yardım yetkisi tanımlanmamış."/>:p.people.map(t=><TouchableOpacity key={t.id} style={styles.personRow} onPress={()=>p.select(t)}><View style={styles.avatar}><Text style={styles.avatarText}>{initials(t.name)}</Text></View><View style={styles.personText}><Text style={styles.personName}>{t.name}</Text><Text style={styles.personMeta}>@{t.username}</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>)}</View> : <><View style={styles.assistBanner}><Text style={styles.assistText}>🤝 {p.dashboard.technician.name} için yardım</Text><TouchableOpacity onPress={p.change}><Text style={styles.assistChange}>DEĞİŞTİR</Text></TouchableOpacity></View><Summary dashboard={p.dashboard}/>{p.dashboard.due.length===0?<Empty/>:p.dashboard.due.map(t=><Task key={t.pointId} task={t} busy={p.busy} onDirections={p.onDirections} onAttempt={p.onAttempt} onComplete={p.onComplete}/>)}</>; }
function Summary({dashboard}:{dashboard:TechnicianDashboard|null}) { return <View style={styles.summaryRow}><View style={styles.summaryBox}><Text style={styles.summaryRed}>{dashboard?.overdue ?? '—'}</Text><Text style={styles.summaryLabel}>Gecikmiş</Text></View><View style={styles.summaryBox}><Text style={styles.summaryOrange}>{dashboard?.current ?? '—'}</Text><Text style={styles.summaryLabel}>Bu Dönem</Text></View></View>; }
function Task({task,busy,onDirections,onAttempt,onComplete}:{task:DueTask;busy:boolean;onDirections:(t:DueTask)=>void;onAttempt:(t:DueTask)=>void;onComplete:(t:DueTask)=>void}) { const late=task.priority==='OVERDUE'; return <View style={styles.task}><View style={styles.taskTop}><View style={[styles.statusDot,late?styles.redDot:styles.orangeDot]}/><Text style={late?styles.lateText:styles.currentText}>{late?'GECİKMİŞ':'BU DÖNEM'}{task.overduePeriods>0?` · ${task.overduePeriods} dönem`:''}</Text></View><Text style={styles.taskName}>{task.pointName}</Text><Text style={styles.taskMeta}>{task.pointCode} · {task.regionName}</Text><TouchableOpacity style={styles.routeButton} onPress={()=>onDirections(task)} disabled={busy}><Text style={styles.routeText}>⌖  YOL TARİFİ</Text></TouchableOpacity><PrimaryButton title="BAKIM YAPILDI" onPress={()=>onComplete(task)} disabled={busy}/><TouchableOpacity style={styles.failButton} onPress={()=>onAttempt(task)} disabled={busy}><Text style={styles.failText}>!  Bakım yapılamadı</Text></TouchableOpacity></View>; }
function EquipmentFields({equipment,setEquipment}:{equipment:{coolerCount:string;towerCount:string;tapCount:string;smarttapCount:string};setEquipment:(v:any)=>void}) { const row=(key:keyof typeof equipment,label:string)=><View style={styles.equipmentRow}><Text style={styles.equipmentLabel}>{label}</Text><TextInput style={styles.equipmentInput} value={equipment[key]} onChangeText={v=>setEquipment({...equipment,[key]:v.replace(/[^0-9]/g,'')})} keyboardType="number-pad" placeholder="—" /></View>; return <View style={styles.card}>{row('coolerCount','Soğutucu')}{row('towerCount','Kule')}{row('tapCount','Musluk')}{row('smarttapCount','SmartTap')}</View>; }
function CustomersView({customers,open}:{customers:MyCustomer[];open:(c:MyCustomer)=>void}) { return <View style={styles.card}><Text style={styles.cardTitle}>Müşterilerim</Text><Text style={styles.help}>Bakım zamanı gelmeden de müşteri ekipman bilgilerini buradan tamamlayabilirsin.</Text>{customers.length===0?<Empty text="Atanmış aktif müşteri yok."/>:customers.map(c=><TouchableOpacity key={c.id} style={styles.personRow} onPress={()=>open(c)}><View style={styles.personText}><Text style={styles.personName}>{c.name}</Text><Text style={styles.personMeta}>{c.code}{c.region?.name?` · ${c.region.name}`:''}</Text><Text style={c.equipmentComplete?styles.okText:styles.warningText}>{c.equipmentComplete?'Ekipman bilgisi tamam':'Ekipman bilgisi eksik'}</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>)}</View>; }
function CustomerView({customer,equipment,setEquipment,save,back,busy}:{customer:MyCustomer;equipment:any;setEquipment:(v:any)=>void;save:()=>void;back:()=>void;busy:boolean}) { const hasLocation=customer.canonicalLatitude!=null&&customer.canonicalLongitude!=null; return <><View style={styles.card}><TouchableOpacity onPress={back}><Text style={styles.refresh}>‹ MÜŞTERİLERİM</Text></TouchableOpacity><Text style={styles.taskName}>{customer.name}</Text><Text style={styles.taskMeta}>{customer.code}{customer.region?.name?` · ${customer.region.name}`:''}</Text>{customer.address?<Text style={styles.help}>{customer.address}</Text>:null}{hasLocation?<Text style={styles.locationText}>⌖ {customer.canonicalLatitude?.toFixed(5)}, {customer.canonicalLongitude?.toFixed(5)} · güven {customer.locationConfidence ?? 0}%</Text>:<Text style={styles.personMeta}>Konum bilgisi henüz yok</Text>}</View><EquipmentFields equipment={equipment} setEquipment={setEquipment}/><PrimaryButton title="EKİPMAN BİLGİLERİNİ KAYDET" onPress={save} disabled={busy}/></>; }
function EquipmentConfirmView({task,equipment,setEquipment,confirm,cancel,busy}:{task:DueTask;equipment:any;setEquipment:(v:any)=>void;confirm:()=>void;cancel:()=>void;busy:boolean}) { const known=[task.coolerCount,task.towerCount,task.tapCount,task.smarttapCount].every(v=>v!=null); return <><View style={styles.card}><Text style={styles.cardTitle}>{task.pointName}</Text><Text style={styles.help}>{known?'Kayıtlı ekipman bilgileri doğru mu? Yanlışsa adetleri değiştir.':'İlk bakım için ekipman adetlerini gir.'}</Text></View><EquipmentFields equipment={equipment} setEquipment={setEquipment}/><PrimaryButton title={known?'BİLGİLER DOĞRU · BAKIMI KAYDET':'BİLGİLERİ KAYDET · BAKIMI TAMAMLA'} onPress={confirm} disabled={busy}/><TouchableOpacity style={styles.failButton} onPress={cancel} disabled={busy}><Text style={styles.failText}>Vazgeç</Text></TouchableOpacity></>; }
function HistoryView({items}:{items:TechnicianHistoryItem[]}) { return <View style={styles.card}><Text style={styles.cardTitle}>Bugünkü İşlemler</Text><Text style={styles.help}>Son kayıtlarını buradan kontrol edebilirsin.</Text>{items.length===0?<Empty text="Bugün işlem yok."/>:items.map((i,n)=>{const attempt=i.type==='ATTEMPT';const name=i.point?.name||i.prospect?.name||'İşlem';const label=i.type==='MAINTENANCE'?(i.assistedForTechnician?`${i.assistedForTechnician.name} için bakım`:'Bakım yapıldı'):attempt?'Bakım yapılamadı':i.type==='PROSPECT_VISIT'?(i.purpose==='INSTALLATION'?'Kurma':'Keşif'):'Bakım dışı ziyaret';return <View key={`${i.at}-${n}`} style={styles.historyRow}><View style={[styles.historyDot,attempt&&styles.historyWarn]}><Text style={styles.historyDotText}>{attempt?'!':'✓'}</Text></View><View><Text style={styles.historyTime}>{new Date(i.at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</Text><Text style={styles.personName}>{name}</Text><Text style={attempt?styles.warningText:styles.okText}>{label}</Text></View></View>})}</View>; }
function NewPointView({begin,busy}:{begin:()=>void;busy:boolean}) { return <View style={styles.card}><Text style={styles.cardTitle}>Bu ziyaret ne için?</Text><View style={styles.newChoice}><Text style={styles.choiceIcon}>⌕</Text><View><Text style={styles.personName}>Keşif</Text><Text style={styles.personMeta}>Potansiyel müşteri</Text></View></View><View style={styles.newChoice}><Text style={styles.choiceIcon}>⚒</Text><View><Text style={styles.personName}>Kurma</Text><Text style={styles.personMeta}>Yeni kurulacak nokta</Text></View></View><View style={styles.infoBox}><Text style={styles.infoText}>Devam etmek için önce EFESİM ekran görüntüsü alınır. Manuel adres girişi yoktur.</Text></View><PrimaryButton title="EFESİM EKRAN GÖRÜNTÜSÜ SEÇ" onPress={begin} disabled={busy}/></View>; }
function EfesimView(p:any) { return <><View style={styles.card}><Text style={styles.sectionLabel}>EFESİM</Text><TextInput style={styles.input} value={p.sapNo} onChangeText={p.setSapNo} keyboardType="number-pad" placeholder="SAP No"/><TextInput style={styles.input} value={p.customerName} onChangeText={p.setCustomerName} placeholder="Müşteri adı"/></View>{p.strong?<View style={styles.card}><Text style={styles.sectionLabel}>GOOGLE MAPS EŞLEŞMESİ</Text><Text style={styles.taskName}>{p.google?.name}</Text><Text style={styles.help}>{p.google?.address||'Adres bilgisi yok'}</Text><View style={styles.choiceRow}><Choice title="BU İŞLETME" selected={p.useGoogle} onPress={()=>p.setUseGoogle(true)}/><Choice title="EŞLEŞMEDİ" selected={!p.useGoogle} onPress={()=>p.setUseGoogle(false)}/></View></View>:<View style={styles.card}><Text style={styles.sectionLabel}>GOOGLE MAPS</Text><Text style={styles.help}>Güvenilir eşleşme bulunamadı. İsim ile devam edebilirsin.</Text></View>}<View style={styles.card}><Text style={styles.sectionLabel}>ADRES</Text><Text style={styles.help}>{p.addressText}</Text><Text style={styles.locked}>Adres düzenlenemez.</Text><PrimaryButton title="ADAY MÜŞTERİYİ OLUŞTUR" onPress={p.save} disabled={p.busy}/></View></>; }
function ProspectView(p:{prospect:ProspectRecord;purpose:ProspectVisitPurpose;setPurpose:(v:ProspectVisitPurpose)=>void;save:()=>void;busy:boolean}) { return <View style={styles.card}><Text style={styles.okText}>Aday müşteri hazır</Text><Text style={styles.taskName}>{p.prospect.name}</Text>{p.prospect.sapNo?<Text style={styles.help}>SAP No: {p.prospect.sapNo}</Text>:null}<Text style={styles.sectionLabel}>ZİYARET AMACI</Text><View style={styles.choiceRow}><Choice title="KEŞİF" selected={p.purpose==='SURVEY'} onPress={()=>p.setPurpose('SURVEY')}/><Choice title="KURMA" selected={p.purpose==='INSTALLATION'} onPress={()=>p.setPurpose('INSTALLATION')}/></View><PrimaryButton title={p.purpose==='SURVEY'?'KEŞİF ZİYARETİNİ KAYDET':'KURMA ZİYARETİNİ KAYDET'} onPress={p.save} disabled={p.busy}/></View>; }
function SuccessView({point,assisted,title='Bakım kaydedildi',done}:{point:string;assisted:string;title?:string;done:()=>void}) { return <View style={styles.successCard}><View style={styles.successCircle}><Text style={styles.successCheck}>✓</Text></View><Text style={styles.successTitle}>{title}</Text><Text style={styles.successPoint}>{point}</Text>{assisted?<Text style={styles.help}>{assisted} için yardım olarak kaydedildi.</Text>:null}<Text style={styles.successMeta}>İşlem zamanı ve saha konumu kaydedildi.</Text><PrimaryButton title="TAMAM" onPress={done}/></View>; }
function Empty({text='Açık görev yok'}:{text?:string}) { return <View style={styles.empty}><Text style={styles.emptyTitle}>{text}</Text></View>; }
function PrimaryButton({title,onPress,disabled}:{title:string;onPress:()=>void;disabled?:boolean}) { return <TouchableOpacity style={[styles.primary,disabled&&styles.disabled]} onPress={onPress} disabled={disabled}><Text style={styles.primaryText}>{title}</Text></TouchableOpacity>; }
function Choice({title,selected,onPress}:{title:string;selected:boolean;onPress:()=>void}) { return <TouchableOpacity style={[styles.choice,selected&&styles.choiceSelected]} onPress={onPress}><Text style={[styles.choiceText,selected&&styles.choiceTextSelected]}>{title}</Text></TouchableOpacity>; }
function Nav({label,symbol,active,onPress}:{label:string;symbol:string;active:boolean;onPress:()=>void}) { return <TouchableOpacity style={styles.navItem} onPress={onPress}><Text style={[styles.navSymbol,active&&styles.navActive]}>{symbol}</Text><Text style={[styles.navLabel,active&&styles.navActive]}>{label}</Text></TouchableOpacity>; }
function initials(name:string){return name.split(' ').filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
function message(e:unknown){return e instanceof Error?e.message:String(e);}

const BLUE='#075A96', DARK_BLUE='#064C80', LIGHT='#F3F6F9', RED='#E7473C', ORANGE='#F39A22', GREEN='#27A867';
const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:BLUE}, shell:{flex:1,backgroundColor:LIGHT}, scroll:{flex:1}, container:{padding:16,paddingBottom:28,gap:12}, center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:LIGHT},
  header:{backgroundColor:BLUE,paddingHorizontal:20,paddingVertical:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, eyebrow:{color:'#BFD8EC',fontSize:11,fontWeight:'900',letterSpacing:1.4}, headerTitle:{color:'#fff',fontSize:25,fontWeight:'900',marginTop:2}, headerUser:{color:'#E6F0F7',fontSize:13,marginTop:2}, logoutBtn:{borderWidth:1,borderColor:'#6FA4C8',paddingHorizontal:12,paddingVertical:8,borderRadius:9}, logoutText:{color:'#fff',fontSize:11,fontWeight:'900'},
  loginSafe:{flex:1,backgroundColor:DARK_BLUE}, loginHero:{flex:1.05,alignItems:'center',justifyContent:'center',gap:9,padding:24}, logoMark:{width:72,height:72,borderRadius:22,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'}, logoText:{color:BLUE,fontSize:43,fontWeight:'900',fontStyle:'italic'}, loginTitle:{color:'#fff',fontSize:32,fontWeight:'900'}, loginSub:{color:'#C8DDED',fontSize:14}, loginForm:{backgroundColor:LIGHT,padding:24,gap:12}, loginInput:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D4DEE6',borderRadius:12,padding:14,fontSize:16,color:'#172431'},
  summaryRow:{flexDirection:'row',gap:10}, summaryBox:{flex:1,backgroundColor:'#fff',borderRadius:14,padding:17,alignItems:'center',shadowColor:'#000',shadowOpacity:.04,shadowRadius:8,elevation:1}, summaryRed:{color:RED,fontSize:28,fontWeight:'900'}, summaryOrange:{color:ORANGE,fontSize:28,fontWeight:'900'}, summaryLabel:{color:'#68798A',fontSize:12,fontWeight:'800',marginTop:2},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:3}, sectionTitle:{fontSize:18,fontWeight:'900',color:'#182633'}, refresh:{fontSize:11,fontWeight:'900',color:BLUE}, card:{backgroundColor:'#fff',borderRadius:15,padding:16,gap:12}, cardTitle:{fontSize:19,fontWeight:'900',color:'#182633'}, help:{fontSize:14,lineHeight:20,color:'#637485'},
  task:{backgroundColor:'#fff',borderRadius:15,padding:15,gap:8,borderWidth:1,borderColor:'#E3E9EE'}, taskTop:{flexDirection:'row',alignItems:'center',gap:7}, statusDot:{width:9,height:9,borderRadius:5}, redDot:{backgroundColor:RED}, orangeDot:{backgroundColor:ORANGE}, lateText:{color:RED,fontSize:12,fontWeight:'900'}, currentText:{color:ORANGE,fontSize:12,fontWeight:'900'}, taskName:{fontSize:19,fontWeight:'900',color:'#1A2733'}, taskMeta:{fontSize:13,color:'#667989'}, routeButton:{borderWidth:1,borderColor:'#BCD0DF',backgroundColor:'#F8FBFD',borderRadius:10,padding:11,alignItems:'center'}, routeText:{color:BLUE,fontSize:12,fontWeight:'900'}, primary:{backgroundColor:'#0877D1',borderRadius:11,paddingVertical:14,paddingHorizontal:12,alignItems:'center'}, primaryText:{color:'#fff',fontSize:14,fontWeight:'900'}, failButton:{borderWidth:1,borderColor:'#E2B7B4',borderRadius:10,paddingVertical:11,alignItems:'center'}, failText:{color:'#B7372F',fontSize:13,fontWeight:'800'}, disabled:{opacity:.45},
  personRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#EDF1F4'}, avatar:{width:42,height:42,borderRadius:21,backgroundColor:'#DDEEFF',alignItems:'center',justifyContent:'center'}, avatarText:{color:BLUE,fontWeight:'900'}, personText:{flex:1,marginLeft:11}, personName:{fontSize:15,fontWeight:'800',color:'#1C2935'}, personMeta:{fontSize:12,color:'#758594',marginTop:2}, chevron:{fontSize:28,color:'#8091A0'}, assistBanner:{backgroundColor:'#FFF0B7',borderRadius:12,padding:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, assistText:{fontSize:13,fontWeight:'900',color:'#6E5700'}, assistChange:{fontSize:11,fontWeight:'900',color:'#6E5700'},
  nav:{height:66,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#DDE5EB',flexDirection:'row',paddingBottom:4}, navItem:{flex:1,alignItems:'center',justifyContent:'center',gap:2}, navSymbol:{fontSize:20,color:'#80909D'}, navLabel:{fontSize:10,color:'#80909D',fontWeight:'700'}, navActive:{color:'#0877D1',fontWeight:'900'},
  historyRow:{flexDirection:'row',gap:12,paddingVertical:11,borderBottomWidth:1,borderBottomColor:'#EDF1F4'}, historyDot:{width:34,height:34,borderRadius:17,backgroundColor:GREEN,alignItems:'center',justifyContent:'center'}, historyWarn:{backgroundColor:ORANGE}, historyDotText:{color:'#fff',fontWeight:'900',fontSize:17}, historyTime:{fontSize:11,color:'#7A8A97'}, okText:{color:GREEN,fontSize:13,fontWeight:'800'}, warningText:{color:ORANGE,fontSize:13,fontWeight:'800'},
  newChoice:{borderWidth:1,borderColor:'#DCE5EC',borderRadius:12,padding:15,flexDirection:'row',alignItems:'center',gap:14}, choiceIcon:{fontSize:27,color:BLUE}, infoBox:{backgroundColor:'#EAF4FC',borderRadius:10,padding:12}, infoText:{fontSize:13,lineHeight:19,color:'#315A78'}, sectionLabel:{fontSize:11,fontWeight:'900',letterSpacing:.9,color:'#5C7080'}, input:{borderWidth:1,borderColor:'#D6E0E8',borderRadius:10,padding:12,fontSize:16}, choiceRow:{flexDirection:'row',gap:8}, choice:{flex:1,borderWidth:1,borderColor:'#C7D3DD',borderRadius:10,padding:12,alignItems:'center'}, choiceSelected:{backgroundColor:BLUE,borderColor:BLUE}, choiceText:{fontSize:12,fontWeight:'900',color:'#415565'}, choiceTextSelected:{color:'#fff'}, locked:{fontSize:12,color:'#7D8A95',fontWeight:'700'},
  equipmentRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,borderBottomWidth:1,borderBottomColor:'#EDF1F4',paddingVertical:8}, equipmentLabel:{fontSize:15,fontWeight:'800',color:'#1C2935'}, equipmentInput:{width:92,borderWidth:1,borderColor:'#D6E0E8',borderRadius:10,padding:10,fontSize:18,textAlign:'center',fontWeight:'800'}, locationText:{fontSize:13,color:BLUE,fontWeight:'700'},
  successCard:{backgroundColor:'#fff',borderRadius:16,padding:24,gap:10,alignItems:'center'}, successCircle:{width:78,height:78,borderRadius:39,backgroundColor:GREEN,alignItems:'center',justifyContent:'center',marginBottom:4}, successCheck:{color:'#fff',fontSize:47,fontWeight:'700'}, successTitle:{fontSize:23,fontWeight:'900',color:'#182633'}, successPoint:{fontSize:18,fontWeight:'900',color:BLUE,textAlign:'center'}, successMeta:{fontSize:13,color:'#6E7D89',marginBottom:8,textAlign:'center'}, empty:{backgroundColor:'#fff',borderRadius:14,padding:22,alignItems:'center'}, emptyTitle:{fontSize:16,fontWeight:'800',color:'#60717F'}, loader:{marginVertical:8},
});
