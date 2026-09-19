import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MyCustomer } from '../api';
import { matchesSearch, searchMatchLabel } from '../search';

type CustomersScreenProps = {
  customers: MyCustomer[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenCustomer: (customer: MyCustomer) => void;
  onRefresh: () => void;
};

export function CustomersScreen({ customers, loading, error, search, onSearchChange, onOpenCustomer, onRefresh }: CustomersScreenProps) {
  const visibleCustomers = customers.filter(customer => matchesSearch(search, [customer.name, customer.code, customer.region?.name ?? '', customer.address ?? '', ...(customer.aliases ?? [])]));

  return <View style={styles.screen}>
    <View style={styles.heading}>
      <Text style={styles.title}>Müşterilerim</Text>
      <Text style={styles.subtitle}>Ekipman bilgilerini bakım zamanı gelmeden tamamlayabilirsin.</Text>
    </View>

    <View style={styles.searchBox}>
      <Feather name="search" size={18} color="#667989" />
      <TextInput accessibilityLabel="Müşteri ara" style={styles.searchInput} value={search} onChangeText={onSearchChange} placeholder="Ad, kod, bölge, adres veya eski ad ara" placeholderTextColor="#8795A1" autoCorrect={false} returnKeyType="search" />
      {search ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Müşteri aramasını temizle" style={styles.clearButton} onPress={() => onSearchChange('')}><Feather name="x" size={18} color="#667989" /></TouchableOpacity> : null}
    </View>

    {loading && customers.length === 0 ? <View style={styles.statusCard} accessibilityRole="progressbar" accessibilityLabel="Müşteriler yükleniyor"><ActivityIndicator color="#075A96" /><Text style={styles.statusTitle}>Müşteriler yükleniyor</Text><Text style={styles.statusBody}>Atanmış müşterilerin getiriliyor.</Text></View> : null}
    {error ? <View style={styles.errorCard} accessibilityRole="alert"><Feather name="alert-circle" size={20} color="#B7372F" /><View style={styles.errorCopy}><Text style={styles.errorTitle}>Müşteriler yüklenemedi</Text><Text style={styles.statusBody}>{error}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Müşterileri tekrar dene" style={styles.retryButton} onPress={onRefresh}><Text style={styles.retryText}>TEKRAR DENE</Text></TouchableOpacity></View></View> : null}
    {!loading && !error && customers.length === 0 ? <Empty icon="users" title="Atanmış müşteri yok" text="Aktif müşterilerin burada listelenecek." /> : null}
    {!loading && !error && customers.length > 0 && visibleCustomers.length === 0 ? <Empty icon="search" title="Sonuç bulunamadı" text="Arama ifadesini değiştirip tekrar dene." /> : null}
    {visibleCustomers.length > 0 ? <View style={styles.listCard}>{visibleCustomers.map(customer => <TouchableOpacity key={customer.id} accessibilityRole="button" accessibilityLabel={`${customer.name} müşteri detayını aç`} style={styles.customerRow} onPress={() => onOpenCustomer(customer)}>
      <View style={[styles.statusIcon, customer.equipmentComplete ? styles.completeIcon : styles.incompleteIcon]}><Feather name={customer.equipmentComplete ? 'check' : 'tool'} size={18} color={customer.equipmentComplete ? '#1B8051' : '#A96308'} /></View>
      <View style={styles.customerCopy}><Text style={styles.customerName}>{customer.name}</Text><Text style={styles.customerMeta}>{customer.code}{customer.region?.name ? ` · ${customer.region.name}` : ''}</Text>{searchMatchLabel(search, [{ label: 'ad', value: customer.name }, { label: 'kod', value: customer.code }, { label: 'bölge', value: customer.region?.name }, { label: 'adres', value: customer.address }, ...customer.aliases?.map(value => ({ label: 'eski ad', value })) ?? []]) ? <Text style={styles.matchText}>Eşleşme: {searchMatchLabel(search, [{ label: 'ad', value: customer.name }, { label: 'kod', value: customer.code }, { label: 'bölge', value: customer.region?.name }, { label: 'adres', value: customer.address }, ...customer.aliases?.map(value => ({ label: 'eski ad', value })) ?? []])}</Text> : null}<Text style={customer.equipmentComplete ? styles.completeText : styles.incompleteText}>{customer.equipmentComplete ? 'Ekipman bilgisi tamam' : 'Ekipman bilgisi eksik'}</Text></View>
      <Feather name="chevron-right" size={20} color="#8A99A6" />
    </TouchableOpacity>)}</View> : null}
  </View>;
}

function Empty({ icon, title, text }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; text: string }) {
  return <View style={styles.statusCard}><Feather name={icon} size={23} color="#6D8291" /><Text style={styles.statusTitle}>{title}</Text><Text style={styles.statusBody}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  heading: { gap: 3 },
  title: { color: '#173349', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#607583', fontSize: 13, lineHeight: 19 },
  searchBox: { minHeight: 48, borderWidth: 1, borderColor: '#C8D8E4', borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingLeft: 13, paddingRight: 5 },
  searchInput: { flex: 1, minHeight: 46, paddingHorizontal: 10, color: '#173349', fontSize: 14 },
  clearButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  statusCard: { minHeight: 136, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 7 },
  statusTitle: { color: '#173349', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  statusBody: { color: '#607583', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  errorCard: { flexDirection: 'row', gap: 10, backgroundColor: '#FFF0EF', borderWidth: 1, borderColor: '#F4C4C1', borderRadius: 14, padding: 14 },
  errorCopy: { flex: 1, gap: 4 },
  errorTitle: { color: '#A32C26', fontSize: 15, fontWeight: '900' },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 3, paddingHorizontal: 2 },
  retryText: { color: '#075A96', fontSize: 12, fontWeight: '900' },
  listCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDE5EB', borderRadius: 14, paddingHorizontal: 14 },
  customerRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#EDF1F4' },
  statusIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  completeIcon: { backgroundColor: '#E8F7EF' },
  incompleteIcon: { backgroundColor: '#FFF4E4' },
  customerCopy: { flex: 1, gap: 2 },
  customerName: { color: '#173349', fontSize: 15, fontWeight: '900' },
  customerMeta: { color: '#718391', fontSize: 12, fontWeight: '700' },
  matchText: { color: '#607583', fontSize: 11, fontWeight: '800' },
  completeText: { color: '#1B8051', fontSize: 12, fontWeight: '900' },
  incompleteText: { color: '#A96308', fontSize: 12, fontWeight: '900' },
});
