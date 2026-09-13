import * as React from 'react';
import { TextStyle } from 'react-native';
export type FeatherProps={name:string;size?:number;color?:string;style?:TextStyle|TextStyle[]};
export const Feather: React.ComponentType<FeatherProps>;
