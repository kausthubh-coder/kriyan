// Whether interface sounds and haptics are on. Task actions play them from outside components
// (the command menu and shortcuts call them too), so they read plain module flags.
// Sounds follow the account (the profile's `sounds`, unset is off); haptics belong to the
// phone in your hand, so they're kept on the device (on unless turned off).

import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@kriyan/convex/api";
import { readLocal, writeLocal } from "./storage";

let on = false;

/**
 * Keeps the sounds flag in step with the profile while someone is signed in. The root layout
 * renders it once, so the flag is right before any screen plays a sound.
 */
export function SoundSetting() {
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.account.profile, isAuthenticated ? {} : "skip");
  useEffect(() => {
    if (!isAuthenticated) on = false;
    else if (profile) on = profile.sounds === true;
  }, [isAuthenticated, profile]);
  return null;
}

export function soundsOn(): boolean {
  return on;
}

/** Settings flips it the moment the switch moves, before the server answers. */
export function setSoundsOn(value: boolean) {
  on = value;
}

const HAPTICS_KEY = "kriyan.haptics";
let haptics = readLocal(HAPTICS_KEY) !== "off";

export function hapticsOn(): boolean {
  return haptics;
}

export function setHapticsOn(value: boolean) {
  haptics = value;
  writeLocal(HAPTICS_KEY, value ? null : "off");
}
