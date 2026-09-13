import { Feather as ExpoFeather } from '@expo/vector-icons';
import React from 'react';

const FEATHER_ALIASES: Record<string, React.ComponentProps<typeof ExpoFeather>['name']> = {
  building: 'home',
  support: 'life-buoy',
  snowflake: 'wind',
  tower: 'radio',
  tap: 'droplet',
  smarttap: 'cpu',
  refresh: 'refresh-cw',
};

export function Feather({ name, size = 18, color = '#075A96' }: { name: string; size?: number; color?: string }) {
  const iconName = FEATHER_ALIASES[name] ?? name as React.ComponentProps<typeof ExpoFeather>['name'];
  return <ExpoFeather name={iconName} size={size} color={color} />;
}
