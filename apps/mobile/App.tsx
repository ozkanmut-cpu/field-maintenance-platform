import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  confirmEfesim,
  createProspectVisit,
  EfesimExtractResult,
  extractEfesim,
  ProspectRecord,
  ProspectVisitPurpose,
} from './src/api';

type Step = 'START' | 'RESULT' | 'SAVED' | 'VISIT_SAVED';

const TECHNICIAN_ID = process.env.EXPO_PUBLIC_TECHNICIAN_ID ?? '';

export default function App() {
  const [step, setStep] = useState<Step>('START');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EfesimExtractResult | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [sapNo, setSapNo] = useState('');
  const [fieldLocation, setFieldLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [useGoogle, setUseGoogle] = useState(true);
  const [prospect, setProspect] = useState<ProspectRecord | null>(null);
  const [visitPurpose, setVisitPurpose] = useState<ProspectVisitPurpose>('SURVEY');

  const google = result?.googleMatch;
  const strongGoogleMatch = Boolean(google?.matched && google.placeId);

  const addressText = useMemo(() => {
    if (strongGoogleMatch && useGoogle) return google?.address || 'Google adres bilgisi yok';
    return 'Adres yok — manuel adres girişi kapalı';
  }, [google, strongGoogleMatch, useGoogle]);

  async function ensureLocation() {
    const locationPermission = await Location.requestForegroundPermissionsAsync();
    if (!locationPermission.granted) {
      throw new Error('Konum izni gerekli.');
    }
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      throw new Error('Telefonun konum servisini açmalısın.');
    }
    return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  }

  async function beginEfesimFlow() {
    if (!TECHNICIAN_ID) {
      Alert.alert('Kurulum gerekli', 'EXPO_PUBLIC_TECHNICIAN_ID tanımlı değil.');
      return;
    }

    setBusy(true);
    try {
      const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaPermission.granted) {
        Alert.alert('İzin gerekli', 'EFESİM ekran görüntüsünü seçebilmek için fotoğraf izni gerekli.');
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });
      if (picked.canceled) return;

      const asset = picked.assets[0];
      if (!asset.base64) throw new Error('Ekran görüntüsü okunamadı');

      const location = await ensureLocation();
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setFieldLocation(coords);

      const extracted = await extractEfesim({
        technicianId: TECHNICIAN_ID,
        imageBase64: asset.base64,
        ...coords,
      });

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

  async function saveProspect() {
    if (!result || !fieldLocation) return;
    if (result.duplicate) {
      Alert.alert(
        'Zaten kayıtlı',
        result.duplicate.type === 'POINT'
          ? 'Bu SAP No kayıtlı bir noktaya ait.'
          : 'Bu SAP No için zaten aday müşteri var.',
      );
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
        technicianId: TECHNICIAN_ID,
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
    if (!prospect) return;
    setBusy(true);
    try {
      const location = await ensureLocation();
      await createProspectVisit({
        prospectId: prospect.id,
        technicianId: TECHNICIAN_ID,
        purpose: visitPurpose,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters: location.coords.accuracy ?? undefined,
        locationCapturedAt: new Date(location.timestamp).toISOString(),
        idempotencyKey: `prospect-visit-${TECHNICIAN_ID}-${prospect.id}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}`,
      });
      setStep('VISIT_SAVED');
    } catch (error) {
      Alert.alert('Ziyaret kaydedilemedi', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('START');
    setResult(null);
    setCustomerName('');
    setSapNo('');
    setFieldLocation(null);
    setUseGoogle(true);
    setProspect(null);
    setVisitPurpose('SURVEY');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Kayıtlı Olmayan Nokta</Text>
        <Text style={styles.subtitle}>Önce EFESİM</Text>

        {step === 'START' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>EFESİM ekran görüntüsünü seç</Text>
            <Text style={styles.help}>
              Sistem müşteri adı ve SAP No'yu okuyacak, bulunduğun konuma göre Google Maps eşleşmesini deneyecek.
            </Text>
            <PrimaryButton title="EFESİM EKRAN GÖRÜNTÜSÜ SEÇ" onPress={beginEfesimFlow} disabled={busy} />
          </View>
        )}

        {step === 'RESULT' && result && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>EFESİM</Text>
              <TextInput
                style={styles.input}
                value={sapNo}
                onChangeText={setSapNo}
                keyboardType="number-pad"
                placeholder="SAP No"
                maxLength={10}
              />
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Müşteri adı"
                maxLength={180}
              />
            </View>

            {result.duplicate ? (
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>Bu müşteri zaten sistemde</Text>
                <Text style={styles.help}>
                  {result.duplicate.type === 'POINT'
                    ? 'SAP No kayıtlı bir noktaya ait. Yeni aday oluşturulmayacak.'
                    : 'Aynı SAP No ile mevcut bir aday müşteri bulundu.'}
                </Text>
              </View>
            ) : strongGoogleMatch ? (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>GOOGLE MAPS EŞLEŞMESİ</Text>
                <Text style={styles.googleName}>{google?.name}</Text>
                <Text style={styles.readOnlyAddress}>{google?.address || 'Adres bilgisi yok'}</Text>
                {typeof google?.confidence === 'number' && (
                  <Text style={styles.help}>Eşleşme güveni: %{google.confidence}</Text>
                )}
                <View style={styles.row}>
                  <ChoiceButton title="BU İŞLETME" selected={useGoogle} onPress={() => setUseGoogle(true)} />
                  <ChoiceButton title="EŞLEŞMEDİ" selected={!useGoogle} onPress={() => setUseGoogle(false)} />
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>GOOGLE MAPS</Text>
                <Text style={styles.help}>Güvenilir bir eşleşme bulunamadı. Manuel isim ile devam edebilirsin.</Text>
              </View>
            )}

            {!result.duplicate && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>ADRES</Text>
                <Text style={styles.readOnlyAddress}>{addressText}</Text>
                <Text style={styles.locked}>Adres düzenlenemez.</Text>
                <PrimaryButton title="ADAY MÜŞTERİYİ OLUŞTUR" onPress={saveProspect} disabled={busy} />
              </View>
            )}

            <TouchableOpacity style={styles.secondaryButton} onPress={reset} disabled={busy}>
              <Text style={styles.secondaryButtonText}>BAŞTAN BAŞLA</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'SAVED' && prospect && (
          <View style={styles.card}>
            <Text style={styles.success}>Aday müşteri hazır</Text>
            <Text style={styles.googleName}>{prospect.name}</Text>
            {prospect.sapNo ? <Text style={styles.help}>SAP No: {prospect.sapNo}</Text> : null}
            <Text style={styles.sectionLabel}>ZİYARET AMACI</Text>
            <View style={styles.row}>
              <ChoiceButton title="KEŞİF" selected={visitPurpose === 'SURVEY'} onPress={() => setVisitPurpose('SURVEY')} />
              <ChoiceButton
                title="KURMA"
                selected={visitPurpose === 'INSTALLATION'}
                onPress={() => setVisitPurpose('INSTALLATION')}
              />
            </View>
            <Text style={styles.help}>Ziyaret kaydedilirken güncel GPS yeniden alınacak.</Text>
            <PrimaryButton
              title={visitPurpose === 'SURVEY' ? 'KEŞİF ZİYARETİNİ KAYDET' : 'KURMA ZİYARETİNİ KAYDET'}
              onPress={saveVisit}
              disabled={busy}
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={reset} disabled={busy}>
              <Text style={styles.secondaryButtonText}>ZİYARET KAYDETMEDEN ÇIK</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'VISIT_SAVED' && prospect && (
          <View style={styles.card}>
            <Text style={styles.success}>
              {visitPurpose === 'SURVEY' ? 'Keşif ziyareti kaydedildi' : 'Kurma ziyareti kaydedildi'}
            </Text>
            <Text style={styles.help}>{prospect.name} aday müşteri geçmişine eklendi.</Text>
            <PrimaryButton title="YENİ İŞLEM" onPress={reset} disabled={busy} />
          </View>
        )}

        {busy && <ActivityIndicator size="large" style={styles.loader} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton(props: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.primaryButton, props.disabled && styles.disabled]}
      onPress={props.onPress}
      disabled={props.disabled}
    >
      <Text style={styles.primaryButtonText}>{props.title}</Text>
    </TouchableOpacity>
  );
}

function ChoiceButton(props: { title: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.choice, props.selected && styles.choiceSelected]}
      onPress={props.onPress}
    >
      <Text style={[styles.choiceText, props.selected && styles.choiceTextSelected]}>{props.title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 18, gap: 14 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 12 },
  warningCard: { backgroundColor: '#fff3cd', borderRadius: 14, padding: 16, gap: 8 },
  warningTitle: { fontSize: 17, fontWeight: '800' },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  sectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.7 },
  help: { fontSize: 14, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#d7d7d7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
  },
  googleName: { fontSize: 19, fontWeight: '800' },
  readOnlyAddress: { fontSize: 15, lineHeight: 21 },
  locked: { fontSize: 12, fontWeight: '700', opacity: 0.55 },
  row: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#b7b7b7',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  choiceSelected: { backgroundColor: '#111', borderColor: '#111' },
  choiceText: { fontWeight: '800' },
  choiceTextSelected: { color: '#fff' },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  secondaryButton: { padding: 13, alignItems: 'center' },
  secondaryButtonText: { fontWeight: '800' },
  disabled: { opacity: 0.45 },
  loader: { marginTop: 12 },
  success: { fontSize: 21, fontWeight: '900' },
});
