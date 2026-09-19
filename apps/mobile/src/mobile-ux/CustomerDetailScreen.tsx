import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import * as Native from 'react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MyCustomer } from '../api';
import { EquipmentCounts, EquipmentInput, equipmentFields, equipmentInputFrom, parseEquipment } from './equipment';

type CustomerDetailScreenProps = {
  customer: MyCustomer;
  saving: boolean;
  saveError: string | null;
  onSave: (values: EquipmentCounts) => void;
  onBack: () => void;
};

export function CustomerDetailScreen({ customer, saving, saveError, onSave, onBack }: CustomerDetailScreenProps) {
  const [equipment, setEquipment] = useState<EquipmentInput>(() => equipmentInputFrom(customer));
  useEffect(() => { setEquipment(equipmentInputFrom(customer)); }, [customer]);
  const parsed = useMemo(() => parseEquipment(equipment), [equipment]);
  const hasCanonicalLocation = customer.canonicalLatitude != null && customer.canonicalLongitude != null;

  function save() {
    if ('error' in parsed) return;
    onSave(parsed.values);
  }

  function changeEquipment(key: keyof EquipmentCounts, value: string) {
    setEquipment(current => ({ ...current, [key]: value.replace(/[^0-9]/g, '') }));
  }

  return <View style={styles.screen}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Müşteri listesine dön" style={styles.backButton} onPress={onBack} disabled={saving}>
      <Feather name="arrow-left" size={18} color="#075A96" /><Text style={styles.backText}>MÜŞTERİLERİME DÖN</Text>
    </TouchableOpacity>

    <View style={styles.card}>
      <Text style={styles.eyebrow}>MÜŞTERİ BİLGİLERİ</Text>
      <Text style={styles.name}>{customer.name}</Text>
      <Text style={styles.meta}>{customer.code}{customer.region?.name ? ` · ${customer.region.name}` : ''}</Text>
      <ReadOnlyField label="Adres" value={customer.address ?? 'Adres bilgisi yok'} />
      <ReadOnlyField label="Bölge" value={customer.region?.name ?? 'Bölge bilgisi yok'} />
    </View>

    <View style={styles.card}>
      <View style={styles.cardHeading}><Feather name="crosshair" size={18} color="#075A96" /><Text style={styles.cardTitle}>Kayıtlı konum</Text></View>
      {hasCanonicalLocation ? <>
        <Text style={styles.location}>{customer.canonicalLatitude!.toFixed(5)}, {customer.canonicalLongitude!.toFixed(5)}</Text>
        <Text style={styles.locationMeta}>{customer.locationSource ?? 'Kaynak bilgisi yok'} · güven {customer.locationConfidence ?? 0}%</Text>
      </> : <Text style={styles.locationMeta}>Konum bilgisi henüz yok.</Text>}
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Ekipman</Text>
      <Text style={styles.help}>Sadece ekipman adetlerini güncelleyebilirsin.</Text>
      {equipmentFields.map(({ key, label }) => <View key={key} style={styles.equipmentRow}>
        <Text style={styles.equipmentLabel}>{label}</Text>
        <Native.TextInput accessibilityLabel={`${label} adedi`} style={styles.input} value={equipment[key]} onChangeText={value => changeEquipment(key, value)} keyboardType="number-pad" inputMode="numeric" placeholder="0" placeholderTextColor="#8795A1" selectTextOnFocus editable={!saving} />
      </View>)}
    </View>

    {'error' in parsed ? <Text accessibilityRole="alert" style={styles.error}>{parsed.error}</Text> : null}
    {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Müşteri ekipman bilgilerini kaydet" accessibilityState={{ disabled: saving, busy: saving }} style={[styles.saveButton, saving && styles.disabled]} onPress={save} disabled={saving}>
      <Feather name="save" size={18} color="#fff" /><Text style={styles.saveText}>{saving ? 'KAYDEDİLİYOR...' : 'EKİPMAN BİLGİLERİNİ KAYDET'}</Text>
    </TouchableOpacity>
  </View>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <View style={styles.readOnlyField}><Text style={styles.readOnlyLabel}>{label}</Text><Text style={styles.readOnlyValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  backButton: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#075A96', fontSize: 11, fontWeight: '900', letterSpacing: .5 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, padding: 15, gap: 9 },
  eyebrow: { color: '#075A96', fontSize: 10, fontWeight: '900', letterSpacing: .7 },
  name: { color: '#173349', fontSize: 22, fontWeight: '900' },
  meta: { color: '#70818E', fontSize: 13, fontWeight: '700' },
  readOnlyField: { borderTopWidth: 1, borderColor: '#EDF1F4', paddingTop: 9, gap: 2 },
  readOnlyLabel: { color: '#70818E', fontSize: 11, fontWeight: '800' },
  readOnlyValue: { color: '#334E60', fontSize: 14, fontWeight: '700' },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: '#173349', fontSize: 16, fontWeight: '900' },
  location: { color: '#173349', fontSize: 15, fontWeight: '900' },
  locationMeta: { color: '#607583', fontSize: 13, lineHeight: 18 },
  help: { color: '#607583', fontSize: 13, lineHeight: 18 },
  equipmentRow: { minHeight: 56, borderTopWidth: 1, borderColor: '#EDF1F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  equipmentLabel: { color: '#334E60', fontSize: 14, fontWeight: '800' },
  input: { minWidth: 72, height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#C8D8E4', color: '#173349', fontSize: 16, fontWeight: '900', textAlign: 'center', paddingHorizontal: 8 },
  error: { color: '#B7372F', fontSize: 13, fontWeight: '800' },
  saveButton: { minHeight: 48, backgroundColor: '#0877D1', borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: .55 },
});
