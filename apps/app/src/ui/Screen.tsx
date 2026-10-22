// The frame every screen sits in. Phones get a 64dp top app bar (with back on pushed
// screens); desktop gets the calm 680px column, shifted left while a task panel is open.

import type { ReactNode } from "react";
import { Platform, ScrollView, View, type ScrollViewProps } from "react-native";
import { router, usePathname } from "expo-router";
import Head from "expo-router/head";
import { ArrowLeft, Plus, Search } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openCommand } from "@/features/shell/context";
import { NAVBAR_HEIGHT } from "@/features/shell/navbarHeight";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows, sz } from "@/theme/tokens";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Press } from "./Press";
import { Txt } from "./Txt";

interface Props {
  /** The phone app bar's title. */
  title: string;
  /** Pushed screens show a back arrow on phones. */
  back?: boolean;
  /** Extra controls in the phone app bar, before search. */
  actions?: ReactNode;
  /** Tab roots on Android show the floating add button. */
  fab?: boolean;
  /** "wide" is for the week; everything else is the 680px column. */
  width?: "column" | "wide" | number;
  children: ReactNode;
  scrollProps?: ScrollViewProps;
  /** Below the scroll view, pinned (the proposals banner). */
  footer?: ReactNode;
  /** The task panel covers this layout's right column instead of pushing the page left. */
  panelCovers?: boolean;
}

export function goBack(fallback: "/today" | "/browse" = "/today") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function AppBar({ title, back, actions }: { title: string; back?: boolean; actions?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: c.bg,
        zIndex: 4,
        ...(Platform.OS === "web" ? ({ position: "sticky", top: 0 } as object) : {}),
      }}
    >
      <View
        style={{
          height: 64,
          flexDirection: "row",
          alignItems: "center",
          gap: s.s1,
          paddingLeft: back ? s.s1 : s.s4,
          paddingRight: s.s1,
        }}
      >
        {back ? (
          <Button icon={ArrowLeft} accessibilityLabel="Back" onPress={() => goBack("/browse")} />
        ) : null}
        <Txt variant="title" heading={1} numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Txt>
        {actions}
        <Button icon={Search} accessibilityLabel="Search" onPress={() => openCommand()} />
      </View>
    </View>
  );
}

export function Fab() {
  return (
    <Press
      role="button"
      accessibilityLabel="Add task"
      onPress={() => router.push("/add")}
      hoverBg={null}
      style={{
        position: "absolute",
        right: s.s4,
        bottom: s.s4,
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: c.ink,
        alignItems: "center",
        justifyContent: "center",
        boxShadow: shadows.overlay,
        overflow: "hidden",
        zIndex: 6,
      }}
    >
      <Icon icon={Plus} size={24} tone="onInk" />
    </Press>
  );
}

export function usePanelOpen(): boolean {
  const path = usePathname();
  return path.startsWith("/task/");
}

export function Screen({
  title,
  back,
  actions,
  fab,
  width = "column",
  children,
  scrollProps,
  footer,
  panelCovers,
}: Props) {
  const phone = useIsPhone();
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
      {phone ? <AppBar title={title} back={back} actions={actions} /> : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        // On the phone web layout the navigation bar is fixed over the bottom; the list ends above it.
        style={{ flex: 1, ...(phone && Platform.OS === "web" ? { marginBottom: NAVBAR_HEIGHT + s.s4 } : {}) }}
        contentContainerStyle={{
          paddingTop: phone ? s.s2 : width === "wide" ? s.s8 : s.s12,
          paddingHorizontal: phone ? s.s4 : s.s8,
          paddingBottom: s.s16,
        }}
        {...scrollProps}
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
          {children}
          {/* Room to scroll the last row clear of the floating add button. */}
          {fab && phone ? <View style={{ height: 56 }} /> : null}
        </View>
      </ScrollView>
      {footer}
      {fab && phone && Platform.OS !== "web" ? <Fab /> : null}
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
