// The frame of every page off Today (docs/design/v5 prototype `page()`): on phones Joi's round
// back button with an optional small title beside it, then a big title and a quiet line under
// it, and the floating add button on lists; on desktop the same page in a 640 column beside
// the rail, without the back button.

import type { ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Head from "expo-router/head";
import { ChevronLeft, Plus } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsPhone } from "@/theme/layout";
import { bold, c, family, r, s, shadows, sz } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

/** The desktop page's column (the prototype's `.center .col`). */
export const PAGE_WIDTH = 640;
/** Room under the last row for the floating add button and its fade. */
const ADD_CLEARANCE = 120;
const BACK = 40;
const ADD_WIDTH = 108;
const ADD_HEIGHT = 56;

/** Back to where you came from; a page opened from a link goes to the menu (the menu to Today). */
export function goBackFrom(fallback: "/menu" | "/today") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

interface Props {
  /** The big title. Leave it out for pages that only have the small one (Menu, Settings). */
  title?: string;
  /** Before the big title on its line: a space's dot. */
  lead?: ReactNode;
  /** The quiet line under the big title. */
  sub?: string;
  /** The small title in the phone's top bar, and the desktop page's first line ("Kriyan"). */
  barTitle?: string;
  /** The browser tab's name; defaults to the title. */
  tabTitle: string;
  /** A control at the top right: the phone's bar, beside the desktop title. */
  right?: ReactNode;
  /** Shows the floating add button on phones; it opens Add with these defaults. */
  add?: { spaceId?: string };
  /** Where Back goes when there's no history (a page opened from a link). */
  backTo?: "/menu" | "/today";
  children: ReactNode;
}

export function Page({
  title,
  lead,
  sub,
  barTitle,
  tabTitle,
  right,
  add,
  backTo = "/menu",
  children,
}: Props) {
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {Platform.OS === "web" ? (
        <Head>
          <title>{`${tabTitle} | Kriyan`}</title>
        </Head>
      ) : null}
      {phone ? (
        <View
          style={{
            paddingTop: insets.top + s.s2,
            // The round buttons' circles line up with the page's 24 edge; their 44 targets reach past it.
            paddingHorizontal: s.s6,
            height: insets.top + s.s2 + sz.touch + s.s1,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <BackButton onPress={() => goBackFrom(backTo)} />
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, right: 0, bottom: s.s1, alignItems: "center" }}
          >
            {barTitle ? (
              <Txt variant="subhead" heading={1}>
                {barTitle}
              </Txt>
            ) : null}
          </View>
          <View style={{ marginLeft: "auto", marginRight: -2 }}>{right}</View>
        </View>
      ) : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: phone ? s.s6 : s.s8,
          paddingTop: phone ? 0 : s.s12,
          paddingBottom: s.s16,
        }}
      >
        <View style={{ width: "100%", maxWidth: phone ? undefined : PAGE_WIDTH, alignSelf: "center" }}>
          {!phone && barTitle ? (
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: sz.row }}>
              <Txt variant="subhead" heading={1} style={{ flex: 1 }}>
                {barTitle}
              </Txt>
              {title ? null : right}
            </View>
          ) : null}
          {title ? (
            <View style={{ paddingTop: phone ? s.s2 : 0, gap: s.s1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3 }}>
                {lead}
                <Txt
                  variant="display"
                  heading={barTitle ? 2 : 1}
                  style={[bold, { flexShrink: 1, lineHeight: 44 }]}
                  numberOfLines={2}
                >
                  {title}
                </Txt>
                {!phone && right ? <View style={{ marginLeft: "auto" }}>{right}</View> : null}
              </View>
              {sub ? (
                <Txt variant="subhead" tone="ink3" style={family("500")}>
                  {sub}
                </Txt>
              ) : null}
            </View>
          ) : null}
          {children}
          {/* Room to scroll the last row clear of the floating add button. */}
          {add && phone ? <View style={{ height: ADD_CLEARANCE - s.s16 + insets.bottom }} /> : null}
        </View>
      </ScrollView>
      {add && phone ? <FloatingAdd spaceId={add.spaceId} /> : null}
    </View>
  );
}

/** Joi's round back button: a grey circle with a chevron. */
function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Press
      role="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hoverBg={null}
      rippleRadius={sz.touch / 2}
      style={{
        width: sz.touch,
        height: sz.touch,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: -2,
      }}
    >
      {({ hovered }) => (
        <View
          style={{
            width: BACK,
            height: BACK,
            borderRadius: r.pill,
            backgroundColor: hovered ? c.select : c.sunken,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon icon={ChevronLeft} size={20} tone="ink" strokeWidth={2.25} />
        </View>
      )}
    </Press>
  );
}

/** The phone's floating add button, centred over a fade of the page (the prototype's `.btns`). */
export function FloatingAdd({ spaceId }: { spaceId?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <View
        pointerEvents="none"
        style={[{ position: "absolute", left: 0, right: 0, bottom: 0, height: s.s16 * 2 }, fade]}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: s.s8 + insets.bottom,
          alignItems: "center",
        }}
      >
        <Press
          role="button"
          accessibilityLabel="Add"
          onPress={() => router.push(spaceId ? { pathname: "/add", params: { spaceId } } : "/add")}
          hoverBg={null}
          style={({ hovered }) => ({
            width: ADD_WIDTH,
            height: ADD_HEIGHT,
            borderRadius: r.pill,
            backgroundColor: hovered ? c.sunken : c.raised,
            boxShadow: shadows.overlay,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Icon icon={Plus} size={26} tone="ink3" strokeWidth={2} />
        </Press>
      </View>
    </>
  );
}

const fade =
  Platform.OS === "web"
    ? ({ backgroundImage: `linear-gradient(to bottom, transparent, ${c.bg} 62%)` } as object)
    : null;

/** A section's quiet label inside a page ("Ideas", "Today", "Goals"). */
export function PageLabel({ children }: { children: string }) {
  return (
    <Txt
      variant="label"
      tone="ink3"
      heading={2}
      style={[family("600"), { paddingTop: s.s6, fontSize: 14, lineHeight: 20 }]}
    >
      {children}
    </Txt>
  );
}

/** A group's small uppercase heading in the menu and Settings ("SCHOOL", "YOUR DAY"). */
export function GroupLabel({ children }: { children: string }) {
  return (
    <Txt
      variant="caption"
      tone="ink3"
      heading={2}
      style={[family("600"), { paddingTop: s.s6, paddingBottom: s.s1, letterSpacing: 0.3 }]}
    >
      {children}
    </Txt>
  );
}

/** A calm empty state: why it's empty, and one way forward. */
export function PageEmpty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: "center", gap: s.s2, paddingVertical: s.s8, paddingHorizontal: s.s4 }}>
      <Txt variant="subhead" tone="ink2" style={[family("500"), { textAlign: "center" }]}>
        {title}
      </Txt>
      {body ? (
        <Txt variant="body" tone="ink3" style={{ textAlign: "center", maxWidth: 360 }}>
          {body}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: s.s2 }}>{action}</View> : null}
    </View>
  );
}

/** "+ Add a habit" at the end of a list: quiet, on the rows' rule. */
export function AddLine({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      scale={false}
      style={{ flexDirection: "row", alignItems: "center", gap: s.s4, minHeight: 56 }}
    >
      {({ hovered }) => (
        <>
          <View style={{ width: 24, alignItems: "center" }}>
            <Icon icon={Plus} size={18} tone={hovered ? "ink2" : "ink3"} />
          </View>
          <Txt variant="subhead" tone={hovered ? "ink2" : "ink3"} style={family("500")}>
            {label}
          </Txt>
        </>
      )}
    </Press>
  );
}
