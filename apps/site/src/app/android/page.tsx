import { PlainPage } from "@/components/PlainPage";
import css from "@/components/Prose.module.css";
import ui from "@/components/ui.module.css";
import { ANDROID_QR_MODULES, ANDROID_QR_PATH } from "@/lib/android-qr";
import { pageMetadata } from "@/lib/metadata";
import { ANDROID_RELEASE, APK_URL, RELEASES_URL } from "@/lib/site";
import android from "./android.module.css";

const { version, sizeMb, minAndroid } = ANDROID_RELEASE;

export const metadata = pageMetadata({
  path: "/android",
  title: "Android",
  heading: "Kriyan for Android",
  description: `Kriyan ${version} for Android: ${sizeMb} MB, for Android ${minAndroid} or later, installed from GitHub in three steps.`,
});

export default function Android() {
  return (
    <PlainPage>
      <h1>Kriyan for Android</h1>
      <p className={css.lede}>
        The whole planner on your phone, with swipes, haptics and reminders. It installs straight from GitHub,
        not the Play Store, so Android asks you to allow it once.
      </p>

      <dl className={android.facts}>
        <div>
          <dt>Version</dt>
          <dd>{version}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{sizeMb} MB</dd>
        </div>
        <div>
          <dt>Needs</dt>
          <dd>Android {minAndroid} or later</dd>
        </div>
      </dl>

      <div className={android.get}>
        <div className={css.actions}>
          <a href={APK_URL} className={`${ui.btn} ${ui.primary} ${ui.large}`}>
            Download the APK
          </a>
        </div>
        {/* On a computer the APK is no use; the code opens this page on the phone instead. */}
        <figure className={android.qr}>
          <svg
            viewBox={`-2 -2 ${ANDROID_QR_MODULES + 4} ${ANDROID_QR_MODULES + 4}`}
            shapeRendering="crispEdges"
            role="img"
            aria-label="QR code that opens kriyan.app/android"
          >
            <rect x="-2" y="-2" width={ANDROID_QR_MODULES + 4} height={ANDROID_QR_MODULES + 4} />
            <path d={ANDROID_QR_PATH} />
          </svg>
          <figcaption>
            On a computer? Scan this with your phone&apos;s camera to open this page there.
          </figcaption>
        </figure>
      </div>

      <h2 id="install">Install it in three steps</h2>
      <ol>
        <li>
          <strong>Download it on your phone.</strong> Tap Download the APK. If your browser says the file
          might be harmful, choose Download anyway.
        </li>
        <li>
          <strong>Allow the install.</strong> Open the downloaded file. The first time, Android asks you to
          allow apps from your browser: tap Settings, turn on Allow from this source, then go back. On Android
          7, turn on Unknown sources under Settings, Security.
        </li>
        <li>
          <strong>Install.</strong> Tap Install, then Open. If Play Protect says it doesn&apos;t know the app,
          tap More details, then Install anyway.
        </li>
      </ol>
      <p>
        To update later, download the new APK and install it over the old one. Your plan lives in your
        account, so nothing is lost.
      </p>

      <h2 id="releases">Every release</h2>
      <p>
        Release notes and earlier versions are on <a href={RELEASES_URL}>GitHub releases</a>, next to the
        code.
      </p>
    </PlainPage>
  );
}
