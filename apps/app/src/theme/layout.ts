// Phone or desktop: Android is always the phone layout; the web switches below 760px.

import { useWindowDimensions, type TextStyle } from "react-native";
import { PHONE_MAX_WIDTH, phoneType, size, type, type TypeRole } from "@kriyan/core/tokens";
import { family, isWeb } from "./tokens";

export type RoleName = keyof typeof type;

export function useIsPhone(): boolean {
  const { width } = useWindowDimensions();
  return !isWeb || width < PHONE_MAX_WIDTH;
}

export function roleStyle(role: TypeRole): TextStyle {
  return {
    ...family(role.weight),
    fontSize: role.size,
    lineHeight: role.line,
    letterSpacing: role.tracking * role.size,
  };
}

const desktopRoles = Object.fromEntries(
  (Object.keys(type) as RoleName[]).map((k) => [k, roleStyle(type[k])]),
) as Record<RoleName, TextStyle>;
const phoneRoles = Object.fromEntries(
  (Object.keys(phoneType) as RoleName[]).map((k) => [k, roleStyle(phoneType[k])]),
) as Record<RoleName, TextStyle>;

/** Type roles for the current layout: body is 14 on desktop, 16 on phones. */
export function useType(): Record<RoleName, TextStyle> {
  return useIsPhone() ? phoneRoles : desktopRoles;
}

/** Control and row heights: 32/36 with a fine pointer, 44/48 on touch. */
export function useControl(): { ctl: number; row: number } {
  return useIsPhone() ? { ctl: size.touch, row: size.phoneRow } : { ctl: size.ctl, row: size.row };
}
