const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/CorporateApp.tsx');
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  "import React, { useEffect, useMemo, useState } from 'react';\nimport { ActivityIndicator, Alert, Image, ImageSourcePropType, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';",
  "import React, { useEffect, useMemo, useState } from 'react';\nimport { Feather as ExpoFeather } from '@expo/vector-icons';\nimport { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';"
);

const start = source.indexOf("const ICON_SPRITE = require('../assets/icons-sprite.png');");
const endMarker = "\n\nexport default function CorporateApp()";
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  throw new Error('Icon sprite block not found; refusing to patch unexpected CorporateApp.tsx');
}

const replacement = `const FEATHER_ALIASES: Record<string, React.ComponentProps<typeof ExpoFeather>['name']> = {\n  building: 'home',\n  support: 'life-buoy',\n  snowflake: 'wind',\n  tower: 'radio',\n  tap: 'droplet',\n  smarttap: 'cpu',\n  refresh: 'refresh-cw',\n};\nfunction Feather({name,size=18,color='#075A96'}:{name:string;size?:number;color?:string}) {\n  const iconName = FEATHER_ALIASES[name] ?? name as React.ComponentProps<typeof ExpoFeather>['name'];\n  return <ExpoFeather name={iconName} size={size} color={color} />;\n}`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source);
console.log('CorporateApp icon sprite dependency replaced with @expo/vector-icons/Feather');
