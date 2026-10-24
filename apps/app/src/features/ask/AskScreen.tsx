// Ask (b2.html?screen=assistant): plain words to add, move and find things, and what agents did
// this week with Undo on every change. Kriyan has no AI of its own: it does a few requests by
// itself (core/ask.ts) and the rest wait for an agent the person connected through MCP or the CLI.
// Phones: the conversation scrolls under a floating ask box above the dock, with the spaces and
// Settings (behind your initial) that used to be under Browse. Desktop: the conversation and its
// box on the left, Automations in a column on the right that an open task's panel covers.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Platform, ScrollView, useWindowDimensions, View } from "react-native";
import Head from "expo-router/head";
import { useMutation } from "convex/react";
import { Search } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@kriyan/convex/api";
import { SPLIT_MIN_WIDTH } from "@kriyan/core/tokens";
import { useClock } from "@/data/time";
import { useAccessTokens, useActivity, useAsks } from "@/data/views";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { openCommand } from "@/features/shell/context";
import { DOCK_GAP, DOCK_HEIGHT } from "@/features/shell/Dock";
import { errorText } from "@/features/tasks/actions";
import { useIsPhone } from "@/theme/layout";
import { c, s, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Skeleton } from "@/ui/bits";
import { PageHead, PhoneHead } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { AskBar } from "./AskBar";
import { noAgentYet } from "./agents";
import { Automations } from "./Automations";
import { Conversation, NoAgentNote } from "./Conversation";
import { SettingsLink } from "./Initial";
import { SpacesSection } from "./SpacesSection";

const TITLE = "Ask Kriyan";
const SUB = "Add, move and find things in plain words.";
/** The desktop conversation's width (b2.html `.col-in` on Ask). */
const CHAT_WIDTH = 640;

export function AskScreen() {
  const phone = useIsPhone();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { today, timeZone } = useClock();
  const asks = useAsks();
  const activity = useActivity(7);
  const tokens = useAccessTokens();
  const noAgent = noAgentYet(tokens, activity, asks);
  const sendAsk = useMutation(api.assistant.send);
  const clearAsks = useMutation(api.assistant.clearAsks);
  const [text, setText] = useState("");
  const sending = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const [barHeight, setBarHeight] = useState(0);
  // Automations get their own column when the conversation still has room beside it.
  const split = !phone && width >= SPLIT_MIN_WIDTH;

  const send = (raw: string) => {
    const words = raw.trim();
    if (!words || sending.current) return;
    sending.current = true;
    setText("");
    sendAsk({ text: words })
      .catch((e: unknown) => {
        setText(words);
        showToast(errorText(e));
      })
      .finally(() => {
        sending.current = false;
      });
  };

  // The conversation emptying is the feedback; the tasks it made stay where they are.
  const clear = () => void clearAsks().catch((e: unknown) => showToast(errorText(e)));

  // A new request or reply scrolls into view once it has drawn; opening the tab starts at the
  // top, as the prototype does.
  const signature = asks ? `${asks.length}:${asks.filter((a) => a.reply !== null).length}` : null;
  const seen = useRef<string | null>(null);
  const followUntil = useRef(0);
  useLayoutEffect(() => {
    if (signature === null) return;
    if (seen.current !== null && seen.current !== signature) {
      followUntil.current = Date.now() + 1000;
      requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
    }
    seen.current = signature;
  }, [signature]);
  const follow = () => {
    if (Date.now() < followUntil.current) scroll.current?.scrollToEnd({ animated: true });
  };

  const conversation =
    asks === undefined ? (
      <View testID="skeleton" style={{ gap: s.s3 }}>
        <Skeleton width="40%" style={{ alignSelf: "flex-end" }} />
        <Skeleton width="70%" />
      </View>
    ) : asks.length === 0 ? (
      noAgent ? (
        <NoAgentNote intro />
      ) : null
    ) : (
      <View>
        <SectionLabel
          title="Conversation"
          right={
            <Button
              variant="quiet"
              label="Clear"
              accessibilityLabel="Clear the conversation"
              onPress={clear}
            />
          }
        />
        <Conversation asks={asks} noAgent={noAgent} />
      </View>
    );
  const automations = <Automations activity={activity} today={today} timeZone={timeZone} />;
  const bar = <AskBar value={text} onChange={setText} onSend={send} suggestions={asks?.length === 0} />;
  const title =
    Platform.OS === "web" ? (
      <Head>
        <title>{`${TITLE} | Kriyan`}</title>
      </Head>
    ) : null;

  if (phone) {
    // The box floats above the dock (b2.html `.askbar`: 12 above the dock's top edge).
    const barBottom = insets.bottom + DOCK_GAP + DOCK_HEIGHT + s.s3;
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {title}
        <ScrollView
          ref={scroll}
          onContentSizeChange={follow}
          keyboardShouldPersistTaps="handled"
          // Keyboard focus scrolls a row clear of the box instead of leaving it underneath (web).
          style={[
            { flex: 1 },
            Platform.OS === "web" ? ({ scrollPaddingBottom: barHeight + s.s4 } as object) : null,
          ]}
          contentContainerStyle={{ paddingTop: insets.top + s.s4, paddingHorizontal: s.s4 }}
        >
          <View style={{ width: "100%", maxWidth: sz.column, alignSelf: "center", gap: s.s8 }}>
            <PhoneHead
              title={TITLE}
              sub={SUB}
              actions={
                <>
                  <Button icon={Search} accessibilityLabel="Search" onPress={() => openCommand()} />
                  <SettingsLink />
                </>
              }
            />
            {automations}
            <SpacesSection />
            {conversation}
            {/* Room to scroll the last reply clear of the box and the dock. */}
            <View style={{ height: barHeight + s.s4 }} />
          </View>
        </ScrollView>
        <View
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
          pointerEvents="box-none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        >
          <View pointerEvents="none" style={[{ height: s.s6 }, fade]} />
          <View style={{ alignItems: "center", paddingHorizontal: DOCK_GAP, backgroundColor: c.bg }}>
            <View style={{ width: "100%", maxWidth: 528 }}>{bar}</View>
            {/* The dock floats over this. */}
            <View style={{ height: barBottom }} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
      {title}
      <View style={{ flex: 1, minWidth: 0 }}>
        <ScrollView
          ref={scroll}
          onContentSizeChange={follow}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: s.s12, paddingHorizontal: s.s8, paddingBottom: s.s6 }}
        >
          <Column>
            <PageHead title={TITLE} sub={SUB} right={<SettingsLink />} />
            {split ? null : automations}
            {conversation}
          </Column>
        </ScrollView>
        <View style={{ paddingHorizontal: s.s8, paddingBottom: s.s6, paddingTop: s.s2 }}>
          <View
            pointerEvents="none"
            style={[{ position: "absolute", left: 0, right: 0, top: -s.s6, height: s.s6 }, fade]}
          />
          <View style={{ width: "100%", maxWidth: CHAT_WIDTH, alignSelf: "center" }}>{bar}</View>
        </View>
      </View>
      {split ? (
        <ScrollView
          role="complementary"
          aria-label="Automations"
          style={{ width: sz.panel, flexGrow: 0, borderLeftWidth: 1, borderLeftColor: c.line }}
          contentContainerStyle={{ padding: s.s6, paddingTop: s.s12 }}
        >
          {automations}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Column({ children }: { children: ReactNode }) {
  return (
    <View style={{ width: "100%", maxWidth: CHAT_WIDTH, alignSelf: "center", gap: s.s8 }}>{children}</View>
  );
}

/** The page fades into the box's backdrop instead of ending at a hard edge (web only). */
const fade =
  Platform.OS === "web"
    ? ({ backgroundImage: `linear-gradient(to bottom, transparent, ${c.bg})` } as object)
    : null;
