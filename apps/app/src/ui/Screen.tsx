// The frame every screen sits in. Phones get the prototype's large title (with "Back" on pushed
// screens) and room for the floating dock. On desktop every page sits in one frame, so every
// page starts at the same left edge: a reading column (680px) or the frame's full width.

import type { ReactNode } from "react";
import { Platform, ScrollView, View, type ScrollViewProps, type TextStyle } from "react-native";
import { router, usePathname } from "expo-router";
import Head from "expo-router/head";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DOCK_CLEARANCE } from "@/features/shell/Dock";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, sz } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Press } from "./Press";
import { Txt } from "./Txt";

interface Props {
  /** The phone's large title (and the browser tab's name). */
  title: string;
  /** A quiet line under the phone title. */
  sub?: string;
  /** Pushed screens show a back arrow on phones. */
  back?: boolean;
  /** Extra controls in the phone app bar, before search. */
  actions?: ReactNode;
  /**
   * "column" is the 680px reading column, "full" the frame's whole width (two columns side by
   * side), "wide" the week's grid, which uses the whole window. A number caps the width inside
   * the frame. All of them start at the same left edge.
   */
  width?: "column" | "full" | "wide" | number;
  children: ReactNode;
  scrollProps?: ScrollViewProps;
  /** Below the scroll view, pinned (the proposals banner). */
  footer?: ReactNode;
  /** The task panel covers this layout's right column instead of pushing the page left. */
  panelCovers?: boolean;
  /**
   * Phones: drawn edge to edge in place of the app bar (Today's black header), scrolling away
   * with the page; the content sits on a sheet that overlaps its bottom edge.
   */
  hero?: ReactNode;
}

/** The widest page: Today's list and schedule side by side (b2.html `.dpg.wide`). */
const FULL = sz.column + s.s12 + sz.schedule;

export function goBack(fallback: "/today" | "/browse" = "/today") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * The phone's page head (b2.html `.pg-head`): "Back" above a large title on pushed screens,
 * the title alone on tabs. It scrolls with the page; there is no app bar.
 */
export function PhoneHead({
  title,
  sub,
  back,
  actions,
}: {
  title: string;
  sub?: string;
  back?: boolean;
  actions?: ReactNode;
}) {
  return (
    <View style={{ gap: s.s1 }}>
      {back ? (
        <Press
          role="button"
          accessibilityLabel="Back"
          onPress={() => goBack("/browse")}
          hoverBg={null}
          scale={false}
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            minHeight: sz.touch,
            marginLeft: -s.s1,
            paddingRight: s.s2,
          }}
        >
          <Icon icon={ChevronLeft} size={20} tone="ink2" />
          <Txt variant="label" tone="ink2">
            Back
          </Txt>
        </Press>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
        <PageTitle title={title} style={{ flex: 1 }} />
        {actions}
      </View>
      {sub ? (
        <Txt variant="body" tone="ink3">
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

export function usePanelOpen(): boolean {
  const path = usePathname();
  return path.startsWith("/task/");
}

export function Screen({
  title,
  sub,
  back,
  actions,
  width = "column",
  children,
  scrollProps,
  footer,
  panelCovers,
  hero,
}: Props) {
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  const heroed = phone && hero;
  const panelOpen = usePanelOpen();
  const maxWidth = width === "column" ? sz.column : width === "full" || width === "wide" ? undefined : width;
  // While the panel is open the page keeps clear of it (desktop), unless the panel is meant to
  // cover this layout's right column.
  const shift = !phone && panelOpen && width !== "wide" && !panelCovers;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* The browser's tab and history name the page, like the site's "%s | Kriyan". */}
      {Platform.OS === "web" ? (
        <Head>
          <title>{`${title} | Kriyan`}</title>
        </Head>
      ) : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={
          heroed
            ? { paddingBottom: s.s16 }
            : {
                paddingTop: phone ? insets.top + s.s4 : width === "wide" ? s.s8 : s.s12,
                paddingHorizontal: phone ? s.s4 : s.s8,
                paddingBottom: s.s16,
              }
        }
        {...scrollProps}
      >
        {heroed ? <View style={{ backgroundColor: c.head, paddingTop: insets.top }}>{hero}</View> : null}
        <View
          style={
            heroed
              ? {
                  backgroundColor: c.bg,
                  borderTopLeftRadius: r.sheet,
                  borderTopRightRadius: r.sheet,
                  marginTop: -r.sheet,
                  paddingTop: s.s4,
                  paddingHorizontal: s.s4,
                }
              : undefined
          }
        >
          {/* The frame: centred in wide windows, so its left edge is every page's left edge. */}
          <View
            style={{
              width: "100%",
              maxWidth: phone || width === "wide" ? undefined : FULL,
              alignSelf: "center",
              // The panel covers the right 440px; the page ends before it.
              paddingRight: shift ? sz.panel : 0,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth,
                alignSelf: phone ? "center" : "flex-start",
                gap: phone ? s.s8 : s.s12,
              }}
            >
              {phone && !heroed ? <PhoneHead title={title} sub={sub} back={back} actions={actions} /> : null}
              {children}
              {/* Room to scroll the last row clear of the floating dock. */}
              {phone ? <View style={{ height: DOCK_CLEARANCE + insets.bottom }} /> : null}
            </View>
          </View>
        </View>
      </ScrollView>
      {/* The status bar is see-through on Android: without this, scrolled text runs under the
          clock. Today's black header stays black behind it. */}
      {insets.top ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: insets.top,
            backgroundColor: heroed ? c.head : c.bg,
          }}
        />
      ) : null}
      {footer}
    </View>
  );
}

/** Every page's title, on phones and desktop: one role, so no page's title is smaller than another's. */
export function PageTitle({ title, style }: { title: string; style?: TextStyle }) {
  return (
    <Txt variant="headline" heading={1} style={style}>
      {title}
    </Txt>
  );
}

/** The desktop page head: title, a quiet line under it, and controls on the right. */
export function PageHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  /** @deprecated Every page title is the same size now (PageTitle); this does nothing. */
  big?: boolean;
}) {
  const phone = useIsPhone();
  if (phone) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: s.s4 }}>
      <View style={{ flex: 1, gap: s.s1 }}>
        <PageTitle title={title} />
        {sub ? (
          <Txt variant="body" tone="ink3">
            {sub}
          </Txt>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>{right}</View> : null}
    </View>
  );
}

export function SectionHead({ title, meta, right }: { title: string; meta?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: s.s2, paddingBottom: s.s1 }}>
      <Txt variant="subhead" heading={2} style={{ flex: 1 }}>
        {title}
      </Txt>
      {meta ? (
        <Txt variant="meta" tone="ink3">
          {meta}
        </Txt>
      ) : null}
      {/* A quiet button's label, not its padding, lines up with the column's right edge. */}
      {right ? <View style={{ marginRight: -s.s3 }}>{right}</View> : null}
    </View>
  );
}

/** A quiet surface for empty and error states: what goes here, and one action. */
export function Notice({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: Parameters<typeof Icon>[0]["icon"];
}) {
  return (
    <View style={{ gap: s.s2, paddingVertical: s.s4, alignItems: "flex-start" }}>
      <View style={{ flexDirection: "row", gap: s.s2, alignItems: "center" }}>
        {icon ? <Icon icon={icon} tone="ink3" /> : null}
        <Txt variant="label">{title}</Txt>
      </View>
      {body ? (
        <Txt variant="body" tone="ink3" style={{ maxWidth: 480 }}>
          {body}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: s.s1, marginLeft: -s.s3 }}>{action}</View> : null}
    </View>
  );
}

export const radiusCard = r.card;
