// Phones: swipe a task right to tick it off, left to move it. A short left swipe opens
// "Tomorrow" and "Pick a day" and waits; a long one moves the task straight away. Each side
// arms at a line people can see (the colour fills, a tick on Android) and commits on release.
// The visible twins are the checkbox and the task's "When" field.

import { useId, type ReactNode } from "react";
import { Platform, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  makeMutable,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { CalendarDays, Check as CheckGlyph, Sunrise } from "lucide-react-native";
import { createStore } from "@/data/store";
import { c, hex, s } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { armHaptic } from "./haptics";

/** One row open at a time: opening another closes this one. React reads the store; the UI
 * thread watches the shared value and springs the old row shut. */
const openRow = createStore<string | null>(null);
const openRowUI = makeMutable("");
const openRowShared = () => openRowUI;

function markOpen(id: string, on: boolean) {
  if (on) {
    openRow.set(id);
    openRowUI.value = id;
  } else if (openRow.get() === id) {
    openRow.set(null);
    openRowUI.value = "";
  }
}

/** On the web, letting go after a swipe still clicks the row; that click shouldn't open the task. */
function stopClick(e: Event) {
  e.stopPropagation();
  e.preventDefault();
}

/** From the start of a swipe, however long it's held, until just after it's let go. */
function swallowClick() {
  if (Platform.OS !== "web") return;
  window.addEventListener("click", stopClick, { capture: true, once: true });
}

function stopSwallowingSoon() {
  if (Platform.OS !== "web") return;
  // Long enough for the release's own click; short enough that the next real tap still works.
  setTimeout(() => window.removeEventListener("click", stopClick, { capture: true }), 300);
}

const ACTION = 88;
const OPEN = ACTION * 2;
const SPRING = { damping: 26, stiffness: 320, mass: 1 };

interface Props {
  children: ReactNode;
  /** The space's colour, which fills the leading side as a tick arms. */
  color: string;
  onComplete?: () => void;
  /** "Today" for a task from an earlier day, otherwise "Tomorrow". */
  moveLabel: string;
  onMove: () => void;
  onPick: () => void;
}

export function SwipeRow({ children, color, onComplete, moveLabel, onMove, onPick }: Props) {
  const id = useId();
  const x = useSharedValue(0);
  const from = useSharedValue(0);
  const width = useSharedValue(0);
  // 1: a release ticks the task off; -1: a release moves it; 0: neither.
  const armed = useSharedValue(0);
  const canComplete = Boolean(onComplete);

  const isOpen = openRow.useValue((v) => v === id);
  const open = openRowShared();

  const setOpen = (on: boolean) => markOpen(id, on);
  const complete = () => {
    setOpen(false);
    onComplete?.();
  };
  const move = () => {
    setOpen(false);
    onMove();
    // If the row is still here a moment later (the move failed), bring it back.
    setTimeout(() => {
      x.value = withSpring(0, SPRING);
    }, 1200);
  };
  const slideOutAndMove = () => {
    x.value = withTiming(-width.value, { duration: 180 });
    move();
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onStart(() => {
      from.value = x.value;
      scheduleOnRN(swallowClick);
    })
    .onUpdate((e) => {
      const w = width.value;
      let next = from.value + e.translationX;
      if (!canComplete && next > 0) next = 0;
      x.value = Math.max(-w, Math.min(w, next));
      const arm = canComplete && next > w * 0.4 ? 1 : next < -w * 0.55 ? -1 : 0;
      if (arm !== armed.value) {
        armed.value = arm;
        if (arm !== 0) scheduleOnRN(armHaptic);
      }
    })
    .onEnd((e) => {
      const w = width.value;
      const arm = armed.value;
      armed.value = 0;
      if (arm === 1) {
        x.value = withSpring(0, { ...SPRING, velocity: e.velocityX });
        scheduleOnRN(complete);
      } else if (arm === -1) {
        x.value = withTiming(-w, { duration: 180 });
        scheduleOnRN(move);
      } else if (x.value < -OPEN / 2 || e.velocityX < -600) {
        x.value = withSpring(-OPEN, { ...SPRING, velocity: e.velocityX });
        scheduleOnRN(setOpen, true);
      } else {
        x.value = withSpring(0, { ...SPRING, velocity: e.velocityX });
        scheduleOnRN(setOpen, false);
      }
    })
    .onFinalize(() => {
      scheduleOnRN(stopSwallowingSoon);
    });

  useAnimatedReaction(
    () => open.value,
    (current) => {
      if (current !== id && x.value < 0) x.value = withSpring(0, SPRING);
    },
  );

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const leading = useAnimatedStyle(() => ({ opacity: x.value > 0 ? 1 : 0 }));
  const leadingFill = useAnimatedStyle(() => ({
    opacity: withTiming(x.value > width.value * 0.4 ? 1 : 0, { duration: 120 }),
  }));
  const trailing = useAnimatedStyle(() => ({ opacity: x.value < 0 ? 1 : 0 }));
  const trailingFill = useAnimatedStyle(() => ({
    opacity: withTiming(x.value < -width.value * 0.55 ? 1 : 0, { duration: 120 }),
  }));

  const fill = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => {
        width.value = e.nativeEvent.layout.width;
      }}
      style={{ overflow: "hidden", marginHorizontal: -s.s2, paddingHorizontal: s.s2 }}
    >
      {canComplete ? (
        <Animated.View
          pointerEvents="none"
          style={[{ ...fill, backgroundColor: c.raised, justifyContent: "center" }, leading]}
        >
          <View style={{ paddingLeft: s.s6 }}>
            <CheckGlyph size={20} color={hex.ink2} strokeWidth={2.25} />
          </View>
          <Animated.View style={[{ ...fill, backgroundColor: color, justifyContent: "center" }, leadingFill]}>
            <View style={{ paddingLeft: s.s6 }}>
              <CheckGlyph size={20} color={hex.bg} strokeWidth={2.25} />
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents={isOpen ? "box-none" : "none"}
        aria-hidden={!isOpen}
        style={[
          { ...fill, flexDirection: "row", justifyContent: "flex-end", backgroundColor: c.raised },
          trailing,
        ]}
      >
        <Press
          role="button"
          focusable={isOpen}
          accessibilityLabel={moveLabel}
          onPress={slideOutAndMove}
          hoverBg={null}
          scale={false}
          style={{ width: ACTION, alignItems: "center", justifyContent: "center", gap: s.s1 }}
        >
          <Icon icon={Sunrise} tone="ink2" />
          <Txt variant="caption" tone="ink2">
            {moveLabel}
          </Txt>
        </Press>
        <Press
          role="button"
          focusable={isOpen}
          accessibilityLabel="Pick a day"
          onPress={() => {
            setOpen(false);
            onPick();
          }}
          hoverBg={null}
          scale={false}
          style={{ width: ACTION, alignItems: "center", justifyContent: "center", gap: s.s1 }}
        >
          <Icon icon={CalendarDays} tone="ink2" />
          <Txt variant="caption" tone="ink2">
            Pick a day
          </Txt>
        </Press>
        {/* Over the buttons: once armed, the whole side says what letting go will do. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              ...fill,
              backgroundColor: c.ink,
              justifyContent: "center",
              alignItems: "flex-end",
              paddingRight: s.s6,
            },
            trailingFill,
          ]}
        >
          <Txt variant="label" tone="onInk">
            {moveLabel}
          </Txt>
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: c.raised }, row]}>
          {children}
          {isOpen ? (
            // While open, a tap on the row closes it instead of opening the task.
            <Press
              role="button"
              accessibilityLabel="Close actions"
              onPress={() => setOpen(false)}
              hoverBg={null}
              scale={false}
              ripple={false}
              style={fill}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
