# Kriyan for Android

Kriyan's Android client is an Expo Router app. Version 1 can be built as a
standalone APK for direct installation; Play Store publication is a separate
release step.

## Build an installable APK

Prerequisites:

- Bun
- Java 17
- Android SDK 36 with NDK `27.1.12297006`
- dependencies installed from the repository root with
  `bun install --frozen-lockfile`

From the repository root, run:

```sh
bun run --cwd mobile build:android:apk
```

The command generates an ignored native Android project, bundles the JavaScript
into the app, and builds one 64-bit APK for modern Android phones (`arm64-v8a`)
and the standard Android emulator (`x86_64`). The result is written to:

```text
mobile/build/kriyan-android-v1.0.0.apk
```

The V1 APK uses the generated local debug signing key so it can be installed
directly. It is not suitable for Play Store submission or future store updates;
those require a protected release keystore and an AAB build.

Install it on a connected device or running emulator with:

```sh
adb install -r mobile/build/kriyan-android-v1.0.0.apk
```

## Development

```sh
bun run --cwd mobile start
bun run --cwd mobile android
```

The app starts in its explicit local demo mode unless a Convex URL and Kriyan
installation identifier are supplied through the existing runtime configuration.
