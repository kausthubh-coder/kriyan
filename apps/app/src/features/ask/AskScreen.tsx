// Ask (b2.html?screen=assistant): plain words to add, move and find things, and what agents did
// this week with Undo on every change. Kriyan has no AI of its own: it does a few requests by
// itself (core/ask.ts) and the rest wait for an agent the person connected through MCP or the CLI.
// Phones: Automations, the spaces (what Browse held) and the conversation scroll under a floating
// ask box above the dock; like a chat, the page opens on the newest messages, just above the box,
// with Automations and the spaces above them. Desktop: the conversation with its box right under
// it (pinned to the window's bottom once the conversation is taller), and Automations in a column
// on the right that an open task's panel covers.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
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
import { PageTitle } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { AskBar, useSendAsk } from "./AskBar";
import { noAgentYet } from "./agents";
import { Automations } from "./Automations";
import { Conversation, NoAgentNote } from "./Conversation";
import { SettingsLink } from "./Initial";
import { KeyboardLift, KeyboardRoom } from "./keyboard";
import { SpacesSection } from "./SpacesSection";

const TITLE = "Ask Kriyan";
const SUB = "Add, move and find things in plain words.";
/** The desktop conversation's width (b2.html `.col-in` on Ask). */
const CHAT_WIDTH = 640;
/** Closer than this to the end counts as reading the newest messages, so new ones follow. */
const NEAR_END = 48;

export function AskScreen() {
  const phone = useIsPhone();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { today, timeZone } = useClock();
  const asks = useAsks();
  const activity = useActivity(7);
  const tokens = useAccessTokens();
  const noAgent = noAgentYet(tokens, activity, asks);
  const clearAsks = useMutation(api.assistant.clearAsks);
  const [text, setText] = useState("");
  const send = useSendAsk(setText);
  const scroll = useRef<ScrollView>(null);
  const [barHeight, setBarHeight] = useState(0);
  // Automations get their own column when the conversation still has room beside it.
  const split = !phone && width >= SPLIT_MIN_WIDTH;

  // The conversation emptying is the feedback; the tasks it made stay where they are.
  const clear = () => void clearAsks().catch((e: unknown) => showToast(errorText(e)));

  // Like a chat, the page holds to its end while the person is there: it opens on the newest
  // messages, and a new request or reply (or Automations and the spaces loading above) keeps
  // them in view. Scrolling up lets go; coming back near the end holds again. An empty
  // conversation starts at the top, where the heading is.
  const atEnd = useRef(true);
  const hasMessages = (asks?.length ?? 0) > 0;
  const signature = asks ? `${asks.length}:${asks.filter((a) => a.reply !== null).length}` : null;
  const seen = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (signature === null) return;
    // Sending always brings the conversation's end into view, even from further up.
    if (seen.current !== null && seen.current !== signature) {
      atEnd.current = true;
      requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
    }
    seen.current = signature;
  }, [signature]);
  const hold = () => {
    if (hasMessages && atEnd.current) scroll.current?.scrollToEnd({ animated: false });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atEnd.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < NEAR_END;
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
  const scrollProps = {
    ref: scroll,
    onContentSizeChange: hold,
    onLayout: hold,
    onScroll,
    scrollEventThrottle: 32,
    keyboardShouldPersistTaps: "handled" as const,
  };

  if (phone) {
    // The box floats above the dock (b2.html `.askbar`: 12 above the dock's top edge).
    const barBottom = insets.bottom + DOCK_GAP + DOCK_HEIGHT + s.s3;
    return (
      <View style={{ flex: 1, backgroundColor: c.raised }}>
        {title}
        <ScrollView
          {...scrollProps}
          // Keyboard focus scrolls a row clear of the box instead of leaving it underneath (web).
          style={[
            { flex: 1 },
            Platform.OS === "web" ? ({ scrollPaddingBottom: barHeight + s.s4 } as object) : null,
          ]}
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + s.s4, paddingHorizontal: s.s4 }}
        >
          <View style={{ flex: 1, width: "100%", maxWidth: sz.column, alignSelf: "center", gap: s.s8 }}>
            <AskHead
              actions={
                // The phone's only way to search: the command menu finds any task or space.
                <Button icon={Search} accessibilityLabel="Search" onPress={() => openCommand()} />
              }
            />
            {automations}
            <SpacesSection />
            {/* A short page still puts the conversation just above the box, as a chat does. */}
            <View style={{ flex: 1, marginTop: -s.s8 }} />
            {conversation}
            {/* Room to scroll the last reply clear of the box and the dock, and of the keyboard
                while it's open (Android). */}
            <View style={{ height: barHeight }} />
            <KeyboardRoom />
          </View>
        </ScrollView>
        <View
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
          pointerEvents="box-none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        >
          <KeyboardLift rest={barBottom} gap={s.s2} style={{ pointerEvents: "box-none" }}>
            <View pointerEvents="none" style={[{ height: s.s6 }, phoneFade]} />
            <View style={{ alignItems: "center", paddingHorizontal: DOCK_GAP, backgroundColor: c.raised }}>
              <View style={{ width: "100%", maxWidth: 528 }}>{bar}</View>
              {/* The dock floats over this. */}
              <View style={{ height: barBottom }} />
            </View>
          </KeyboardLift>
        </View>
        {/* The status bar is see-through on Android: without this cap, scrolled messages run
            under the clock (ui/Screen.tsx draws the same one for other pages). */}
        {insets.top ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: insets.top,
              backgroundColor: c.raised,
            }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
      {title}
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Only as tall as what it holds, so the box sits right under a short conversation and
            at the window's bottom under a long one (b2.html `.askd`, sticky). */}
        <ScrollView
          {...scrollProps}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ paddingTop: s.s6, paddingHorizontal: s.s8, paddingBottom: s.s6 }}
        >
          <Column>
            <AskHead />
            {split ? null : automations}
            {conversation}
          </Column>
        </ScrollView>
        <View style={{ paddingHorizontal: s.s8, paddingBottom: s.s4, paddingTop: s.s8 }}>
          <View
            pointerEvents="none"
            style={[{ position: "absolute", left: 0, right: 0, top: 0, height: s.s8 }, fade]}
          />
          <View style={{ width: "100%", maxWidth: CHAT_WIDTH, alignSelf: "center" }}>{bar}</View>
        </View>
      </View>
      {split ? (
        <ScrollView
          role="complementary"
          aria-label="Automations"
          // B2's right column on Ask is 400 wide, like Today's schedule, not the task panel's 440.
          // A raised panel beside the page, like B2's `.rp` (#151517 against the black canvas in dark).
          style={{
            width: sz.schedule,
            flexGrow: 0,
            borderLeftWidth: 1,
            borderLeftColor: c.line,
            backgroundColor: c.raised,
          }}
          contentContainerStyle={{ padding: s.s6 }}
        >
          {automations}
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * The page's head (b2.html `.as-head`): title and line on the left, your initial at the top right,
 * level with the title rather than centred on the pair.
 */
function AskHead({ actions }: { actions?: ReactNode }) {
  const phone = useIsPhone();
  const sub = (
    <Txt variant="body" tone="ink3">
      {SUB}
    </Txt>
  );
  // On a phone the line runs the full width under the title row, so it doesn't wrap beside the
  // search button and your initial.
  return (
    <View style={{ gap: s.s1 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s3 }}>
        <View style={{ flex: 1, gap: s.s1 }}>
          <PageTitle title={TITLE} />
          {phone ? null : sub}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
          {actions}
          <SettingsLink />
        </View>
      </View>
      {phone ? sub : null}
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
/** Phones draw Ask on the raised sheet like every other page (ui/Screen.tsx's phone ground). */
const phoneFade =
  Platform.OS === "web"
    ? ({ backgroundImage: `linear-gradient(to bottom, transparent, ${c.raised})` } as object)
    : null;
