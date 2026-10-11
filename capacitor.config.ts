import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.balmer.aprende',
  appName: 'Balmer Aprende',
  webDir: 'mobile-web',
  server: {
    url: 'https://balmer-aprende-pwa.balmerbs.chatgpt.site',
    cleartext: false,
    allowNavigation: ['auth.openai.com'],
  },
  android: { backgroundColor: '#f6f4ed', allowMixedContent: false },
};
export default config;
