import * as React from 'react';
import { TextStyle } from 'react-native';

export type FeatherName = string;
export type FeatherProps = {
  name: FeatherName;
  size?: number;
  color?: string;
  style?: TextStyle | TextStyle[];
};

export const Feather: React.ComponentType<FeatherProps>;
