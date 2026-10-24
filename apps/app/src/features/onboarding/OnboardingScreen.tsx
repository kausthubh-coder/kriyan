// First run (docs/design/v4/onboarding.html): a new person builds their first day before
// signing in, then signs in to save it. Steps 1 to 6 run signed out; signing in on step 6
// moves on to 7 to 9 on the same screen. On desktop each step is a card beside a live preview
// of the day it builds.

import { useEffect, useState } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import Head from "expo-router/head";
import { Redirect, router } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useClock } from "@/data/time";
import { useWebReminders } from "@/features/notifications/AllowReminders";
import { c, s } from "@/theme/tokens";
import { LightStatusBar } from "@/ui/statusBar";
import { ConnectAI, GetStarted, Step7 } from "./AfterSignIn";
import { FirstTask, Helps, Hours, TheMath, Welcome, weekMath } from "./BeforeSignIn";
import { LivePreview } from "./Day";
import { draft, finishDraft, hasStep7, inProgress, updateDraft, type Step } from "./draft";
import { DesktopCard } from "./Frame";
import { useSaveDraft } from "./save";
import { SaveYourPlan } from "./SaveYourPlan";

/** From this width the step is a card with the live day beside it, like the prototype. */
const DESKTOP_MIN_WIDTH = 900;

export function OnboardingScreen() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const d = draft.useValue((x) => x);
  const { today } = useClock();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
  const reminders = useWebReminders();
  const step7 = hasStep7(reminders.available);
  const [copied, setCopied] = useState({ claude: false, codex: false });
  // Signed in and not mid-way: there's nothing to set up here.
  const [nothingToDo] = useState(() => Boolean(isSignedIn) && !inProgress());

  useSaveDraft(Boolean(isSignedIn) && !nothingToDo);
  useEffect(() => {
    if (nothingToDo) return;
    // Signing in on step 6 (or from the welcome) carries on after it; signing out part way
    // through goes back to signing in.
    if (isSignedIn && d.step <= 6) updateDraft({ step: step7 ? 7 : 8 });
    if (!isSignedIn && d.step >= 7) updateDraft({ step: 6 });
    // On step 7 in a browser that turned out unable to send reminders: there's nothing to ask.
    if (isSignedIn && d.step === 7 && !step7) updateDraft({ step: 8 });
  }, [isSignedIn, d.step, step7, nothingToDo]);

  if (nothingToDo) return <Redirect href="/today" />;

  const go = (step: Step) => updateDraft({ step });
  const next = () => go(Math.min(9, d.step + (d.step === 6 && !step7 ? 2 : 1)) as Step);
  const back = () => go(Math.max(1, d.step - 1) as Step);
  const finish = () => {
    finishDraft();
    router.replace("/today");
  };

  const props = { d, today, next, back };
  let body;
  switch (d.step) {
    case 1:
      body = <Welcome today={today} next={next} signIn={() => go(6)} />;
      break;
    case 2:
      body = <Helps {...props} />;
      break;
    case 3:
      body = <Hours {...props} />;
      break;
    case 4:
      body = <TheMath {...props} />;
      break;
    case 5:
      body = <FirstTask {...props} />;
      break;
    case 6:
      body = <SaveYourPlan d={d} today={today} back={back} />;
      break;
    case 7:
      body = step7 ? <Step7 d={d} today={today} next={next} reminders={reminders} /> : null;
      break;
    case 8:
      body = (
        <ConnectAI
          next={next}
          back={step7 ? back : undefined}
          copied={copied}
          onCopied={(which) => setCopied((prev) => ({ ...prev, [which]: true }))}
        />
      );
      break;
    default:
      body = (
        <GetStarted
          d={d}
          today={today}
          name={user?.firstName ?? null}
          agentReady={copied.claude || copied.codex}
          finish={finish}
        />
      );
  }

  const note =
    d.step <= 3
      ? "Every answer shapes this. It's what you'll see each morning."
      : d.step === 4
        ? `About ${weekMath(d).free} hours this week are yours to plan.`
        : isSignedIn
          ? "This is your real Today."
          : "This is your real Today. Signing in saves it.";

  return (
    <View style={{ flex: 1, backgroundColor: desktop ? c.sunken : d.step === 1 ? c.head : c.raised }}>
      {Platform.OS === "web" ? (
        <Head>
          <title>Welcome | Kriyan</title>
        </Head>
      ) : null}
      {/* Light status bar icons over the black welcome and the black head of the last step. */}
      <LightStatusBar enabled={!desktop && (d.step === 1 || d.step === 9)} />
      {desktop ? (
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s.s16,
            padding: s.s12,
          }}
        >
          <DesktopCard.Provider value>{body}</DesktopCard.Provider>
          {/* The last step keeps the preview too, so its card stays where the others were. */}
          {/* 64 + 8: the prototype's 72 between the card and the preview, from scale steps. */}
          {d.step === 1 ? null : (
            <View style={{ marginLeft: s.s2 }}>
              <LivePreview d={d} today={today} note={note} />
            </View>
          )}
        </View>
      ) : (
        body
      )}
    </View>
  );
}
