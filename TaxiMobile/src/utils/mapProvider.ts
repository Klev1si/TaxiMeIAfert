/**
 * Map provider resolver.
 *
 * On Android we use Google Maps (SDK is linked via manifest + Play Services).
 * On iOS the GoogleMaps pod isn't linked (see AppDelegate.swift), so passing
 * PROVIDER_GOOGLE would render an empty grid. Returning `undefined` on iOS
 * makes react-native-maps fall back to Apple Maps, which is bundled with the
 * OS and needs no configuration.
 */
import { Platform } from 'react-native';
import { PROVIDER_GOOGLE } from 'react-native-maps';

export const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
