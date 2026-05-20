/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { setupBackgroundHandler } from './src/services/fcm';

// Register FCM background handler before the app mounts.
// Wrapped in try/catch — a missing google-services.json must never
// prevent the app from starting.
try {
  setupBackgroundHandler();
} catch (e) {
  console.warn('[FCM] Background handler not registered:', e);
}

AppRegistry.registerComponent(appName, () => App);
