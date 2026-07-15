export const releasePageUrl =
  'https://github.com/kausthubh-coder/kriyan/releases/tag/v0.1.0'

const releaseDownloadBaseUrl =
  'https://github.com/kausthubh-coder/kriyan/releases/download/v0.1.0'

export const releaseAssetUrls = {
  android: `${releaseDownloadBaseUrl}/kriyan-android-v1.0.0.apk`,
  cliDarwin: `${releaseDownloadBaseUrl}/kriyan-darwin-arm64`,
  desktop: `${releaseDownloadBaseUrl}/Kriyan_0.1.0_aarch64.dmg`,
  nodeLinux: `${releaseDownloadBaseUrl}/kriyan-node-v0.1.0-linux-x64.tar.gz`,
} as const
