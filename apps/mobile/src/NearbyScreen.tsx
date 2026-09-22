import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { NearbyPoint } from './api';

type NearbyMode = 'LIST' | 'MAP';

export type NearbyScreenProps = {
  items: NearbyPoint[];
  origin: { latitude: number; longitude: number } | null;
  loading: boolean;
  cachedAt?: string;
  refresh(): void;
  directions(point: NearbyPoint): void;
};

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

export function NearbyScreen({ items, origin, loading, refresh, directions }: NearbyScreenProps) {
  const [mode, setMode] = useState<NearbyMode>('LIST');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const selectedPoint = useMemo(
    () => items.find(point => point.id === selectedPointId) ?? items[0] ?? null,
    [items, selectedPointId],
  );
  const initialRegion = useMemo(() => {
    const first = origin ?? items[0];
    return first ? { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 } : null;
  }, [origin, items]);

  useEffect(() => {
    if (items.length && !items.some(point => point.id === selectedPointId)) setSelectedPointId(items[0].id);
  }, [items, selectedPointId]);

  return <>
    <View style={styles.header}><View><Text style={styles.title}>Yakınımdakiler</Text><Text style={styles.subtitle}>Atandığın aktif noktalar, en yakından başlayarak</Text></View><TouchableOpacity onPress={refresh} disabled={loading}><Text style={styles.refresh}>YENİLE</Text></TouchableOpacity></View>
    {loading ? <ActivityIndicator size="large" style={styles.loader} /> : items.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Yakınında atanmış aktif nokta yok</Text><Text style={styles.emptyText}>Konumuna yakın atanmış aktif nokta bulunamadı.</Text></View> : <>
      <View style={styles.segmented}><TouchableOpacity style={[styles.segment, mode === 'LIST' && styles.segmentActive]} onPress={() => setMode('LIST')}><Text style={[styles.segmentText, mode === 'LIST' && styles.segmentTextActive]}>LİSTE</Text></TouchableOpacity><TouchableOpacity style={[styles.segment, mode === 'MAP' && styles.segmentActive]} onPress={() => setMode('MAP')}><Text style={[styles.segmentText, mode === 'MAP' && styles.segmentTextActive]}>HARİTA</Text></TouchableOpacity></View>
      {mode === 'LIST' ? <View style={styles.card}>{items.map(point => <PointRow key={point.id} point={point} directions={directions} />)}</View> : initialRegion ? <><MapView style={styles.map} initialRegion={initialRegion} showsUserLocation>{items.map(point => <Marker key={point.id} coordinate={{ latitude: point.latitude, longitude: point.longitude }} title={point.name} description={`${point.code} · ${formatDistance(point.distanceMeters)}`} onPress={() => setSelectedPointId(point.id)} pinColor={point.id === selectedPoint?.id ? '#0877D1' : '#075A96'} />)}</MapView>{selectedPoint ? <View style={styles.selected}><Text style={styles.pointName}>{selectedPoint.name}</Text><Text style={styles.pointMeta}>{selectedPoint.code}{selectedPoint.regionName ? ` · ${selectedPoint.regionName}` : ''} · {formatDistance(selectedPoint.distanceMeters)}</Text>{selectedPoint.address ? <Text style={styles.address}>{selectedPoint.address}</Text> : null}<TouchableOpacity style={styles.route} onPress={() => directions(selectedPoint)}><Text style={styles.routeText}>Yol tarifi</Text></TouchableOpacity></View> : null}</> : null}
    </>}
  </>;
}

function PointRow({ point, directions }: { point: NearbyPoint; directions(point: NearbyPoint): void }) {
  return <View style={styles.row}><View style={styles.pointCopy}><Text style={styles.pointName}>{point.name}</Text><Text style={styles.pointMeta}>{point.code}{point.regionName ? ` · ${point.regionName}` : ''} · {formatDistance(point.distanceMeters)}</Text>{point.address ? <Text style={styles.address}>{point.address}</Text> : null}</View><TouchableOpacity style={styles.route} onPress={() => directions(point)}><Text style={styles.routeText}>Yol tarifi</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginTop: 3 }, title: { fontSize: 19, fontWeight: '900', color: '#182633' }, subtitle: { fontSize: 12, color: '#758594', marginTop: 3 }, refresh: { fontSize: 10, fontWeight: '900', color: '#075A96', letterSpacing: .4 }, loader: { marginVertical: 16 }, segmented: { flexDirection: 'row', padding: 4, backgroundColor: '#EAF0F4', borderRadius: 11 }, segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 }, segmentActive: { backgroundColor: '#075A96' }, segmentText: { fontSize: 11, fontWeight: '900', color: '#667989' }, segmentTextActive: { color: '#fff' }, card: { backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#E2E9EF', paddingHorizontal: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDF1F4' }, pointCopy: { flex: 1 }, pointName: { fontSize: 15, fontWeight: '900', color: '#182633' }, pointMeta: { fontSize: 12, color: '#758594', marginTop: 2 }, address: { fontSize: 12, color: '#637485', marginTop: 4 }, route: { borderWidth: 1, borderColor: '#BCD0DF', backgroundColor: '#F8FBFD', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }, routeText: { color: '#075A96', fontSize: 12, fontWeight: '900' }, map: { height: 330, borderRadius: 15 }, selected: { backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#E2E9EF', padding: 16, gap: 5 }, empty: { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E2E9EF', gap: 7 }, emptyTitle: { fontSize: 16, fontWeight: '900', color: '#4F6271', textAlign: 'center' }, emptyText: { fontSize: 12, color: '#7B8A97', textAlign: 'center' },
});
