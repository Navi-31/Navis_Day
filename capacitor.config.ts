import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aura.dailytracker',
  appName: 'Aura Daily Tracker',
  webDir: 'dist',
  android: {
    backgroundColor: '#000000',
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
