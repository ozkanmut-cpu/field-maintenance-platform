import { Feather } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type PrimaryDestination = 'TASKS' | 'CUSTOMERS' | 'HISTORY';

const primaryDestinations: Array<{ destination: PrimaryDestination; label: 'İşler' | 'Müşterilerim' | 'Geçmiş'; icon: React.ComponentProps<typeof Feather>['name'] }> = [
  { destination: 'TASKS', label: 'İşler', icon: 'home' },
  { destination: 'CUSTOMERS', label: 'Müşterilerim', icon: 'home' },
  { destination: 'HISTORY', label: 'Geçmiş', icon: 'clock' },
];

type MobileShellProps = {
  title: string;
  userName: string;
  brandImage: ImageSourcePropType;
  activeDestination: PrimaryDestination;
  onNavigate: (destination: PrimaryDestination) => void;
  onProfilePress: () => void;
  showNavigation?: boolean;
  children: ReactNode;
};

export function MobileShell({ title, userName, brandImage, activeDestination, onNavigate, onProfilePress, showNavigation = true, children }: MobileShellProps) {
  return <View style={styles.shell}>
    <View style={styles.header}>
      <View style={styles.identity}>
        <Image source={brandImage} style={styles.brandImage} />
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>fıçıbakım</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64} style={styles.title}>{title}</Text>
          <Text style={styles.userName}>{userName}</Text>
        </View>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Hesap seçeneklerini aç" style={styles.profileButton} onPress={onProfilePress}>
        <Feather name="user" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
    <View style={styles.content}>{children}</View>
    {showNavigation && <View accessibilityRole="tablist" style={styles.navigation}>
      {primaryDestinations.map((item) => {
        const active = item.destination === activeDestination;
        return <TouchableOpacity key={item.destination} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active }} style={styles.navItem} onPress={() => onNavigate(item.destination)}>
          <View style={[styles.navIcon, active && styles.navIconActive]}><Feather name={item.icon} size={20} color={active ? BRIGHT_BLUE : '#80909D'} /></View>
          <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
        </TouchableOpacity>;
      })}
    </View>}
  </View>;
}

const DARK_BLUE = '#064C80';
const BRIGHT_BLUE = '#0877D1';

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#F3F6F9' },
  header: { backgroundColor: DARK_BLUE, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.08)' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, minWidth: 0, marginRight: 10 },
  brandImage: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff' },
  titleCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#D7E8F5', fontSize: 12, fontWeight: '900', letterSpacing: .4 },
  title: { color: '#fff', fontSize: 27, fontWeight: '900', letterSpacing: -.45, marginTop: 1, flexShrink: 1 },
  userName: { color: '#C9DDEC', fontSize: 12, marginTop: 1 },
  profileButton: { width: 48, height: 48, borderWidth: 1, borderColor: 'rgba(255,255,255,.22)', backgroundColor: 'rgba(255,255,255,.06)', borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  navigation: { minHeight: 72, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#DDE5EB', flexDirection: 'row', paddingVertical: 5, shadowColor: '#173349', shadowOpacity: .06, shadowRadius: 10, elevation: 10 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navIcon: { width: 36, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: '#EAF4FC' },
  navLabel: { fontSize: 10, color: '#80909D', fontWeight: '800' },
  navLabelActive: { color: BRIGHT_BLUE, fontWeight: '900' },
});
