const releaseBaseUrl = 'https://github.com/kausthubh-coder/kriyan/releases'

export const appReleasePageUrl = `${releaseBaseUrl}/tag/v0.1.0`
export const nodeReleasePageUrl = `${releaseBaseUrl}/tag/v0.1.1`
export const releasePageUrl = nodeReleasePageUrl

const appDownloadBaseUrl = `${releaseBaseUrl}/download/v0.1.0`
const nodeDownloadBaseUrl = `${releaseBaseUrl}/download/v0.1.1`

export const releaseAssetUrls = {
  android: `${appDownloadBaseUrl}/kriyan-android-v1.0.0.apk`,
  cliDarwin: `${nodeDownloadBaseUrl}/kriyan-darwin-arm64`,
  desktop: `${appDownloadBaseUrl}/Kriyan_0.1.0_aarch64.dmg`,
  nodeLinux: `${nodeDownloadBaseUrl}/kriyan-node-v0.1.1-linux-x64.tar.gz`,
} as const
