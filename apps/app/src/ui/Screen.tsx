// The frame every screen sits in. Phones get the prototype's large title (with "Back" on pushed
// screens) and room for the floating dock; desktop gets the calm 680px column, shifted left
// while a task panel is open.

import type { ReactNode } from "react";
import { Platform, ScrollView, View, type ScrollViewProps } from "react-native";
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
  /** "wide" is for the week; everything else is the 680px column. */
  width?: "column" | "wide" | number;
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
        <Txt variant="headline" heading={1} style={{ flex: 1 }}>
          {title}
        </Txt>
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
  const maxWidth = width === "column" ? sz.column : width === "wide" ? undefined : width;
  // While the panel is open the column moves left so the panel never covers it (desktop).
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
          <View
            style={{
              width: "100%",
              maxWidth,
              alignSelf: shift ? "flex-start" : "center",
              // The panel covers the right 440px; the column moves left to stay clear of it.
              ...(shift ? { marginRight: sz.panel } : {}),
              gap: phone ? s.s8 : s.s12,
            }}
          >
            {phone && !heroed ? <PhoneHead title={title} sub={sub} back={back} actions={actions} /> : null}
            {children}
            {/* Room to scroll the last row clear of the floating dock. */}
            {phone ? <View style={{ height: DOCK_CLEARANCE + insets.bottom }} /> : null}
          </View>
        </View>
      </ScrollView>
      {footer}
    </View>
  );
}

/** The desktop page head: title, a quiet line under it, and controls on the right. */
export function PageHead({
  title,
  sub,
  right,
  big,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  big?: boolean;
}) {
  const phone = useIsPhone();
  if (phone) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: s.s4 }}>
      <View style={{ flex: 1, gap: s.s1 }}>
        <Txt variant={big ? "headline" : "title"} heading={1}>
          {title}
        </Txt>
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
