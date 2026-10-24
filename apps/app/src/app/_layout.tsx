import { useEffect } from "react";
import { View } from "react-native";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { convex } from "@/data/convex";
import { SoundSetting } from "@/features/feel/setting";
import { inProgress, rememberSignedInHere, signedInHere } from "@/features/onboarding/draft";
import { registerServiceWorker } from "@/features/notifications/register";
import { useAppFonts } from "@/theme/fonts";
import { c, scheme } from "@/theme/tokens";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
// On the web, Google sign-in returns to this page in a popup; this hands the result back.
WebBrowser.maybeCompleteAuthSession();
// The web app's offline shell and Web Push reminders (production builds only; nothing on Android).
registerServiceWorker();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing. Run `bun run setup`.");

const base = scheme === "dark" ? DarkTheme : DefaultTheme;
const navTheme = {
  ...base,
  colors: { ...base.colors, background: c.bg, card: c.bg, text: c.ink, border: c.line, primary: c.ink },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ClerkProvider publishableKey={publishableKey as string} tokenCache={tokenCache}>
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
              <ThemeProvider value={navTheme}>
                <StatusBar style="auto" />
                <SoundSetting />
                <Gate />
              </ThemeProvider>
            </ConvexProviderWithClerk>
          </ClerkProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Gate() {
  const fonts = useAppFonts();
  const { isLoaded, isSignedIn } = useAuth();
  const ready = fonts && isLoaded;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
  useEffect(() => {
    if (isSignedIn) rememberSignedInHere();
  }, [isSignedIn]);

  // The splash stays up while the fonts and the saved session load (both local, never the network).
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  // Signed out, a new person starts on onboarding and someone who has signed in here before
  // starts on sign-in: the first screen they may see is where they land. Onboarding stays
  // open once signed in, because its last steps come after signing in.
  const returning = signedInHere() && !inProgress();
  const signInScreen = (
    <Stack.Protected key="sign-in" guard={!isSignedIn}>
      <Stack.Screen name="sign-in" />
    </Stack.Protected>
  );
  const onboardingScreen = <Stack.Screen key="onboarding" name="onboarding" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: "fade" }}>
      <Stack.Protected guard={Boolean(isSignedIn)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {returning ? [signInScreen, onboardingScreen] : [onboardingScreen, signInScreen]}
    </Stack>
  );
}
