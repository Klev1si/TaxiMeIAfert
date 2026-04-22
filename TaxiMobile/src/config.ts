/**
 * App configuration.
 * In production these values come from a CI-injected .env file via
 * react-native-config or a build-time transform.
 * During development just edit the defaults below.
 */
const Config = {
  API_BASE_URL: 'http://10.0.2.2:3000',   // Android emulator → localhost
  // API_BASE_URL: 'http://localhost:3000', // iOS simulator
  // API_BASE_URL: 'https://api.yourdomain.com', // production
  WS_URL: 'http://10.0.2.2:3000',
  GOOGLE_MAPS_API_KEY: '',
};

export default Config;
