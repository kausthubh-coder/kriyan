import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json holds the config (`bun run tokens` writes its colours). This only adds what
// comes from the environment: the Firebase file that Android push needs.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    ...(process.env.ANDROID_GOOGLE_SERVICES_FILE
      ? { googleServicesFile: process.env.ANDROID_GOOGLE_SERVICES_FILE }
      : {}),
  },
});
