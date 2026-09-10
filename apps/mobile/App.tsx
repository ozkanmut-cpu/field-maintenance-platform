import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AuthUser,
  clearSessionToken,
  confirmEfesim,
  completeMaintenance,
  createProspectVisit,
  EfesimExtractResult,
  extractEfesim,
  login,
  me,
  ProspectRecord,
  ProspectVisitPurpose,
  HelpTarget,
  TechnicianDashboard,
  helpTargets,
  technicianDashboard,
  restoreSessionToken,
  recordMaintenanceAttempt,
  AttemptReason,
} from './src/api';

type Step = 'HOME' | 'MY_TASKS' | 'UNREGISTERED' | 'RESULT' | 'SAVED' | 'VISIT_SAVED';

export default function App() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('HOME');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EfesimExtractResult | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [sapNo, setSapNo] = useState('');
  const [fieldLocation, setFieldLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [useGoogle, setUseGoogle] = useState(true);
  const [prospect, setProspect] = useState<ProspectRecord | null>(null);
  const [visitPurpose, setVisitPurpose] = useState<ProspectVisitPurpose>('SURVEY');
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPeople, setHelpPeople] = useState<HelpTarget[]>([]);
  const [helpDashboard, setHelpDashboard] = useState<TechnicianDashboard | null>(null);
  const [myDashboard, setMyDashboard] = useState<TechnicianDashboard | null>(null);

  const google = result?.googleMatch;
  const strongGoogleMatch = Boolean(google?.matched && google.placeId);
  const technicianId = user?.id ?? '';

  const addressText = useMemo(() => {
    if (strongGoogleMatch && useGoogle) return google?.address || 'Google adres bilgisi yok';
    return 'Adres yok — manuel adres girişi kapalı';
  }, [google, strongGoogleMatch, useGoogle]);

  useEffect(() => {
    void restoreSession();
  }, []);

  async function restoreSession() {
    try {
      const token = await restoreSessionToken();
      if (!token) return;
      const current = await me();
      if (current.role !== 'TECHNICIAN') {
        await clearSessionToken();
        return;
      }
      setUser(current);
    } catch {
      await clearSessionToken();
    } finally {
      setSessionLoading(false);
    }
  }

  async function signIn() {
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || password.length < 8) {
      Alert.alert('Giriş bilgileri eksik', 'Kullanıcı adı ve şifreni kontrol et.');
      return;
    }
    setBusy(true);
    try {
      const session = await login(cleanUsername, password);
      if (session.user.role !== 'TECHNICIAN') {
        await clearSessionToken();
        throw new Error('Bu mobil uygulama teknisyen hesabı gerektiriyor.');
      }
      setUser(session.user);
      setPassword('');
    } catch (error) {
      Alert.alert('Giriş yapılamadı', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function openMyTasks() {
    setBusy(true);
    try { setMyDashboard(await technicianDashboard()); setStep('MY_TASKS'); }
    catch (error) { Alert.alert('Görevler alınamadı', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function openHelp() {
    setBusy(true);
    try {
      const targets = await helpTargets();
      setHelpPeople(targets);
      setHelpDashboard(null);
      setHelpOpen(true);
    } catch (error) { Alert.alert('Yardım listesi alınamadı', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function chooseHelpTarget(target: HelpTarget) {
    setBusy(true);
    try { setHelpDashboard(await technicianDashboard(target.id)); }
    catch (error) { Alert.alert('Görevler alınamadı', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function completeHelpTask(task: TechnicianDashboard['due'][number]) {
    if (!helpDashboard) return;
    setBusy(true);
    try {
      const location = await ensureLocation();
      await completeMaintenance({
        pointId: task.pointId,
        assistedForTechnicianId: helpDashboard.technician.id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters: location.coords.accuracy ?? undefined,
        locationCapturedAt: new Date(location.timestamp).toISOString(),
        deviceRecordedAt: new Date().toISOString(),
        idempotencyKey: `help-maintenance-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      const refreshed = await technicianDashboard(helpDashboard.technician.id);
      setHelpDashboard(refreshed);
      Alert.alert('Bakım kaydedildi', `${task.pointName} bakımını ${helpDashboard.technician.name} adına tamamladın.`);
    } catch (error) {
      Alert.alert('Bakım kaydedilemedi', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await clearSessionToken();
    setUser(null);
    setPassword('');
    reset();
  }

  async function ensureLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('Konum izni gerekli.');
    if (!(await Location.hasServicesEnabledAsync())) throw new Error('Telefonun konum servisini açmalısın.');
    return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  }

  async function beginEfesimFlow() {
    if (!technicianId) return;
    setBusy(true);
    try {
      const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaPermission.granted) {
        Alert.alert('İzin gerekli', 'EFESİM ekran görüntüsünü seçebilmek için fotoğraf izni gerekli.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9, base64: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset.base64) throw new Error('Ekran görüntüsü okunamadı');
      const location = await ensureLocation();
      const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setFieldLocation(coords);
      const extracted = await extractEfesim({ technicianId, imageBase64: asset.base64, ...coords });
      setResult(extracted);
      setCustomerName(extracted.customerName ?? '');
      setSapNo(extracted.sapNo ?? '');
      setUseGoogle(extracted.nextStep === 'CONFIRM_GOOGLE_MATCH');
      setStep('RESULT');
    } catch (error) {
      Alert.alert('EFESİM okunamadı', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }


  async function openDirections(task: import('./src/api').DueTask) {
    const destination = task.latitude != null && task.longitude != null
      ? `${task.latitude},${task.longitude}`
      : [task.pointName, task.address, task.regionName].filter(Boolean).join(' ');
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    try { await Linking.openURL(url); }
    catch { Alert.alert('Harita açılamadı', 'Google Maps veya tarayıcı açılamadı.'); }
  }

  function chooseAttemptReason(task: import('./src/api').DueTask, assistedForTechnicianId?: string) {
    const choices: Array<{ text: string; reason: AttemptReason }> = [
      { text: 'İşletme kapalı', reason: 'BUSINESS_CLOSED' },
      { text: 'Yetkili kişi yok', reason: 'AUTHORIZED_PERSON_UNAVAILABLE' },
      { text: 'Erişim sağlanamadı', reason: 'ACCESS_FAILED' },
      { text: 'Diğer', reason: 'OTHER' },
    ];
    Alert.alert('Bakım yapılamadı', task.pointName, [
      ...choices.map((choice) => ({ text: choice.text, onPress: () => void saveAttempt(task, choice.reason, assistedForTechnicianId) })),
      { text: 'Vazgeç', style: 'cancel' as const },
    ]);
  }

  async function saveAttempt(task: import('./src/api').DueTask, reason: AttemptReason, assistedForTechnicianId?: string) {
    setBusy(true);
    try {
      const location = await ensureLocation();
      await recordMaintenanceAttempt({
        pointId: task.pointId, assistedForTechnicianId, reason,
        latitude: location.coords.latitude, longitude: location.coords.longitude,
        accuracyMeters: location.coords.accuracy ?? undefined,
        locationCapturedAt: new Date(location.timestamp).toISOString(),
        idempotencyKey: `attempt-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      Alert.alert('Kaydedildi', 'Bakım yapılamadı kaydı oluşturuldu. Görev açık kalır.');
    } catch (error) { Alert.alert('Kayıt oluşturulamadı', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function completeOwnTask(task: import('./src/api').DueTask) {
    setBusy(true);
    try {
      const location = await ensureLocation();
      await completeMaintenance({
        pointId: task.pointId,
        latitude: location.coords.latitude, longitude: location.coords.longitude,
        accuracyMeters: location.coords.accuracy ?? undefined,
        locationCapturedAt: new Date(location.timestamp).toISOString(),
        idempotencyKey: `maintenance-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      setMyDashboard(await technicianDashboard());
      Alert.alert('Tamamlandı', `${task.pointName} bakım kaydı oluşturuldu.`);
    } catch (error) { Alert.alert('Bakım kaydedilemedi', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function saveProspect() {
    if (!result || !fieldLocation || !technicianId) return;
    if (result.duplicate) {
      Alert.alert('Zaten kayıtlı', result.duplicate.type === 'POINT' ? 'Bu SAP No kayıtlı bir noktaya ait.' : 'Bu SAP No için zaten aday müşteri var.');
      return;
    }
    const cleanName = customerName.trim();
    if (cleanName.length < 2) {
      Alert.alert('Müşteri adı gerekli', 'Müşteri adını kontrol et.');
      return;
    }
    setBusy(true);
    try {
      const confirmed = await confirmEfesim({
        technicianId,
        customerName: cleanName,
        sapNo: sapNo.trim() || null,
        googlePlaceId: strongGoogleMatch && useGoogle ? google?.placeId ?? null : null,
        latitude: fieldLocation.latitude,
        longitude: fieldLocation.longitude,
      });
      setProspect(confirmed.prospect);
      setStep('SAVED');
    } catch (error) {
      Alert.alert('Kayıt oluşturulamadı', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveVisit() {
    if (!prospect || !technicianId) return;
    setBusy(true);
    try {
      const location = await ensureLocation();
      await createProspectVisit({
        prospectId: prospect.id,
        technicianId,
        purpose: visitPurpose,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters: location.coords.accuracy ?? undefined,
        locationCapturedAt: new Date(location.timestamp).toISOString(),
        idempotencyKey: `prospect-visit-${technicianId}-${prospect.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      setStep('VISIT_SAVED');
    } catch (error) {
      Alert.alert('Ziyaret kaydedilemedi', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('HOME');
    setResult(null);
    setCustomerName('');
    setSapNo('');
    setFieldLocation(null);
    setUseGoogle(true);
    setProspect(null);
    setVisitPurpose('SURVEY');
  }

  if (sessionLoading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator size="large" /><Text>Oturum kontrol ediliyor...</Text></SafeAreaView>;
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.loginWrap}>
          <Text style={styles.title}>Field Maintenance</Text>
          <Text style={styles.subtitle}>Teknisyen girişi</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoComplete="username" placeholder="Kullanıcı adı" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" placeholder="Şifre" onSubmitEditing={() => void signIn()} />
          <PrimaryButton title="GİRİŞ YAP" onPress={() => void signIn()} disabled={busy} />
          {busy && <ActivityIndicator size="large" />}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View><Text style={styles.title}>Saha Bakım</Text><Text style={styles.subtitle}>{user.name}</Text></View>
          <View style={styles.headerActions}><TouchableOpacity onPress={() => void openHelp()}><Text style={styles.helpAction}>YARDIM ET</Text></TouchableOpacity><TouchableOpacity onPress={() => void signOut()}><Text style={styles.logout}>ÇIKIŞ</Text></TouchableOpacity></View>
        </View>

        {helpOpen && <View style={styles.card}>
          <View style={styles.helpHeader}><Text style={styles.cardTitle}>Yardım Et</Text><TouchableOpacity onPress={() => { setHelpOpen(false); setHelpDashboard(null); }}><Text style={styles.logout}>KAPAT</Text></TouchableOpacity></View>
          {helpPeople.length === 0 ? <Text style={styles.help}>Yönetici sana henüz yardım yetkisi vermemiş.</Text> : !helpDashboard ? <>
            <Text style={styles.help}>Kimin görevlerine yardım edeceğini seç.</Text>
            {helpPeople.map((target) => <TouchableOpacity key={target.id} style={styles.helpPerson} onPress={() => void chooseHelpTarget(target)}><Text style={styles.googleName}>{target.name}</Text><Text style={styles.help}>@{target.username}</Text></TouchableOpacity>)}
          </> : <>
            <Text style={styles.googleName}>{helpDashboard.technician.name}</Text>
            <Text style={styles.help}>Gecikmiş: {helpDashboard.overdue} · Bu dönem: {helpDashboard.current}</Text>
            {helpDashboard.due.length === 0 ? <Text style={styles.success}>Açık görev yok</Text> : helpDashboard.due.map((task) => <View key={task.pointId} style={styles.taskCard}>
              <Text style={styles.sectionLabel}>{task.priority === 'OVERDUE' ? 'GECİKMİŞ' : 'BU DÖNEM'}</Text>
              <Text style={styles.googleName}>{task.pointName}</Text>
              <Text style={styles.help}>{task.pointCode} · {task.regionName}{task.overduePeriods > 0 ? ` · ${task.overduePeriods} dönem gecikmiş` : ''}</Text>
              <View style={styles.taskActions}><TouchableOpacity style={styles.outlineButton} onPress={() => void openDirections(task)} disabled={busy}><Text style={styles.outlineButtonText}>YOL TARİFİ</Text></TouchableOpacity><TouchableOpacity style={styles.outlineButton} onPress={() => chooseAttemptReason(task, helpDashboard.technician.id)} disabled={busy}><Text style={styles.outlineButtonText}>YAPILAMADI</Text></TouchableOpacity></View>
              <PrimaryButton title="BAKIM YAPILDI" onPress={() => void completeHelpTask(task)} disabled={busy} />
            </View>)}
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setHelpDashboard(null)}><Text style={styles.secondaryButtonText}>BAŞKA TEKNİSYEN SEÇ</Text></TouchableOpacity>
          </>}
        </View>}

        {step === 'HOME' && <>
          <View style={styles.card}><Text style={styles.cardTitle}>Benim İşlerim</Text><Text style={styles.help}>Gecikmiş işler her zaman en üstte gelir.</Text><PrimaryButton title="BENİM İŞLERİM" onPress={() => void openMyTasks()} disabled={busy} /></View>
          <View style={styles.card}><Text style={styles.cardTitle}>Yardım Et</Text><Text style={styles.help}>Yalnızca yöneticinin izin verdiği teknisyenlerin görevlerini görürsün.</Text><PrimaryButton title="YARDIM ET" onPress={() => void openHelp()} disabled={busy} /></View>
          <View style={styles.card}><Text style={styles.cardTitle}>Kayıtlı Olmayan Nokta</Text><Text style={styles.help}>Keşif veya kurma için önce EFESİM ekran görüntüsü ile başla.</Text><PrimaryButton title="YENİ NOKTA / EFESİM" onPress={() => setStep('UNREGISTERED')} disabled={busy} /></View>
        </>}

        {step === 'MY_TASKS' && <View style={styles.card}>
          <View style={styles.helpHeader}><Text style={styles.cardTitle}>Benim İşlerim</Text><TouchableOpacity onPress={() => setStep('HOME')}><Text style={styles.logout}>GERİ</Text></TouchableOpacity></View>
          {!myDashboard ? <Text style={styles.help}>Görevler yükleniyor...</Text> : <>
            <Text style={styles.help}>Gecikmiş: {myDashboard.overdue} · Bu dönem: {myDashboard.current}</Text>
            {myDashboard.due.length === 0 ? <Text style={styles.success}>Açık görev yok</Text> : myDashboard.due.map((task) => <View key={task.pointId} style={styles.taskCard}>
              <Text style={styles.sectionLabel}>{task.priority === 'OVERDUE' ? 'GECİKMİŞ' : 'BU DÖNEM'}</Text>
              <Text style={styles.googleName}>{task.pointName}</Text>
              <Text style={styles.help}>{task.pointCode} · {task.regionName}{task.overduePeriods > 0 ? ` · ${task.overduePeriods} dönem gecikmiş` : ''}</Text>
              <View style={styles.taskActions}><TouchableOpacity style={styles.outlineButton} onPress={() => void openDirections(task)} disabled={busy}><Text style={styles.outlineButtonText}>YOL TARİFİ</Text></TouchableOpacity><TouchableOpacity style={styles.outlineButton} onPress={() => chooseAttemptReason(task)} disabled={busy}><Text style={styles.outlineButtonText}>YAPILAMADI</Text></TouchableOpacity></View>
              <PrimaryButton title="BAKIM YAPILDI" onPress={() => void completeOwnTask(task)} disabled={busy} />
            </View>)}
          </>}
        </View>}

        {step === 'UNREGISTERED' && <View style={styles.card}>
          <View style={styles.helpHeader}><Text style={styles.cardTitle}>Kayıtlı Olmayan Nokta</Text><TouchableOpacity onPress={() => setStep('HOME')}><Text style={styles.logout}>GERİ</Text></TouchableOpacity></View>
          <Text style={styles.cardTitle}>Önce EFESİM</Text>
          <Text style={styles.help}>Ekran görüntüsünden müşteri adı ve SAP No okunur; GPS ile Google Maps eşleşmesi denenir.</Text>
          <PrimaryButton title="EFESİM EKRAN GÖRÜNTÜSÜ SEÇ" onPress={() => void beginEfesimFlow()} disabled={busy} />
        </View>}

        {step === 'RESULT' && result && <>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>EFESİM</Text>
            <TextInput style={styles.input} value={sapNo} onChangeText={setSapNo} keyboardType="number-pad" placeholder="SAP No" maxLength={10} />
            <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Müşteri adı" maxLength={180} />
          </View>
          {result.duplicate ? <View style={styles.warningCard}><Text style={styles.warningTitle}>Bu müşteri zaten sistemde</Text><Text style={styles.help}>{result.duplicate.type === 'POINT' ? 'SAP No kayıtlı bir noktaya ait.' : 'Aynı SAP No ile mevcut aday müşteri bulundu.'}</Text></View> : strongGoogleMatch ? <View style={styles.card}>
            <Text style={styles.sectionLabel}>GOOGLE MAPS EŞLEŞMESİ</Text>
            <Text style={styles.googleName}>{google?.name}</Text>
            <Text style={styles.readOnlyAddress}>{google?.address || 'Adres bilgisi yok'}</Text>
            {typeof google?.confidence === 'number' && <Text style={styles.help}>Eşleşme güveni: %{google.confidence}</Text>}
            <View style={styles.row}><ChoiceButton title="BU İŞLETME" selected={useGoogle} onPress={() => setUseGoogle(true)} /><ChoiceButton title="EŞLEŞMEDİ" selected={!useGoogle} onPress={() => setUseGoogle(false)} /></View>
          </View> : <View style={styles.card}><Text style={styles.sectionLabel}>GOOGLE MAPS</Text><Text style={styles.help}>Güvenilir bir eşleşme bulunamadı. Manuel isim ile devam edebilirsin.</Text></View>}
          {!result.duplicate && <View style={styles.card}><Text style={styles.sectionLabel}>ADRES</Text><Text style={styles.readOnlyAddress}>{addressText}</Text><Text style={styles.locked}>Adres düzenlenemez.</Text><PrimaryButton title="ADAY MÜŞTERİYİ OLUŞTUR" onPress={() => void saveProspect()} disabled={busy} /></View>}
          <TouchableOpacity style={styles.secondaryButton} onPress={reset} disabled={busy}><Text style={styles.secondaryButtonText}>BAŞTAN BAŞLA</Text></TouchableOpacity>
        </>}

        {step === 'SAVED' && prospect && <View style={styles.card}>
          <Text style={styles.success}>Aday müşteri hazır</Text><Text style={styles.googleName}>{prospect.name}</Text>
          {prospect.sapNo ? <Text style={styles.help}>SAP No: {prospect.sapNo}</Text> : null}
          <Text style={styles.sectionLabel}>ZİYARET AMACI</Text>
          <View style={styles.row}><ChoiceButton title="KEŞİF" selected={visitPurpose === 'SURVEY'} onPress={() => setVisitPurpose('SURVEY')} /><ChoiceButton title="KURMA" selected={visitPurpose === 'INSTALLATION'} onPress={() => setVisitPurpose('INSTALLATION')} /></View>
          <Text style={styles.help}>Ziyaret kaydedilirken güncel GPS yeniden alınacak.</Text>
          <PrimaryButton title={visitPurpose === 'SURVEY' ? 'KEŞİF ZİYARETİNİ KAYDET' : 'KURMA ZİYARETİNİ KAYDET'} onPress={() => void saveVisit()} disabled={busy} />
          <TouchableOpacity style={styles.secondaryButton} onPress={reset} disabled={busy}><Text style={styles.secondaryButtonText}>ZİYARET KAYDETMEDEN ÇIK</Text></TouchableOpacity>
        </View>}

        {step === 'VISIT_SAVED' && prospect && <View style={styles.card}><Text style={styles.success}>{visitPurpose === 'SURVEY' ? 'Keşif ziyareti kaydedildi' : 'Kurma ziyareti kaydedildi'}</Text><Text style={styles.help}>{prospect.name} aday müşteri geçmişine eklendi.</Text><PrimaryButton title="YENİ İŞLEM" onPress={reset} disabled={busy} /></View>}
        {busy && <ActivityIndicator size="large" style={styles.loader} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton(props: { title: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity style={[styles.primaryButton, props.disabled && styles.disabled]} onPress={props.onPress} disabled={props.disabled}><Text style={styles.primaryButtonText}>{props.title}</Text></TouchableOpacity>;
}
function ChoiceButton(props: { title: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[styles.choice, props.selected && styles.choiceSelected]} onPress={props.onPress}><Text style={[styles.choiceText, props.selected && styles.choiceTextSelected]}>{props.title}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f5f5f5' },
  loginWrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  container: { padding: 18, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  logout: { fontSize: 13, fontWeight: '900' },
  helpAction: { fontSize: 13, fontWeight: '900', color: '#3867d6' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 12 },
  warningCard: { backgroundColor: '#fff3cd', borderRadius: 14, padding: 16, gap: 8 },
  warningTitle: { fontSize: 17, fontWeight: '800' },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  sectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.7 },
  help: { fontSize: 14, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#d7d7d7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 17 },
  googleName: { fontSize: 19, fontWeight: '800' },
  readOnlyAddress: { fontSize: 15, lineHeight: 21 },
  locked: { fontSize: 12, fontWeight: '700', opacity: 0.55 },
  row: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#b7b7b7', borderRadius: 10, padding: 12, alignItems: 'center' },
  choiceSelected: { backgroundColor: '#111', borderColor: '#111' },
  choiceText: { fontWeight: '800' },
  choiceTextSelected: { color: '#fff' },
  primaryButton: { backgroundColor: '#111', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 12, alignItems: 'center', marginTop: 4 },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  secondaryButton: { padding: 13, alignItems: 'center' },
  secondaryButtonText: { fontWeight: '800' },
  disabled: { opacity: 0.45 },
  loader: { marginTop: 12 },
  success: { fontSize: 21, fontWeight: '900' },
  helpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  helpPerson: { borderWidth: 1, borderColor: '#dedede', borderRadius: 12, padding: 12, gap: 3 },
  taskCard: { borderWidth: 1, borderColor: '#dedede', borderRadius: 12, padding: 12, gap: 8 },
  taskActions: { flexDirection: 'row', gap: 8 },
  outlineButton: { flex: 1, borderWidth: 1, borderColor: '#cfd4da', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  outlineButtonText: { fontSize: 12, fontWeight: '900' },
});
