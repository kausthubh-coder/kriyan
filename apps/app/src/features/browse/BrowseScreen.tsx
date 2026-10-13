// Browse (phones): the spaces tree, Progress, search and Settings, one tap each.

import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Link, router, type Href } from "expo-router";
import { ChevronRight, Plus, Search, SlidersHorizontal, Target } from "lucide-react-native";
import { useSpaces } from "@/data/views";
import { openCommand } from "@/features/shell/context";
import { useControl } from "@/theme/layout";
import { r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Dot, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { PageHead, Screen, SectionHead } from "@/ui/Screen";
import { Txt } from "@/ui/Txt";
import { AddSpace } from "@/features/space/AddSpace";

function NavRow({ href, onPress, label, leading, indent = 0 }: { href?: Href; onPress?: () => void; label: string; leading: ReactNode; indent?: number }) {
  const { row } = useControl();
  const body = (
    <Press
      role={href ? "link" : "button"}
      onPress={onPress}
      scale={false}
      style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: row, paddingLeft: s.s2 + indent * s.s4, paddingRight: s.s2, marginHorizontal: -s.s2, borderRadius: r.ctl }}
    >
      <View style={{ width: 18, alignItems: "center" }}>{leading}</View>
      <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Txt>
      <Icon icon={ChevronRight} size={16} />
    </Press>
  );
  return href ? (
    <Link href={href} asChild>
      {body}
    </Link>
  ) : (
    body
  );
}

export function BrowseScreen() {
  const spaces = useSpaces();
  const [adding, setAdding] = useState(false);
  return (
    <Screen title="Browse" fab>
      <PageHead title="Browse" />
      <View style={{ gap: s.s2 }}>
        <NavRow label="Search and commands" leading={<Icon icon={Search} size={16} />} onPress={() => openCommand()} />
      </View>
      <View style={{ gap: s.s2 }}>
        <SectionHead title="Spaces" right={<Button icon={Plus} label="Add space" onPress={() => setAdding(!adding)} expanded={adding} />} />
        {adding ? <AddSpace onDone={(id) => (setAdding(false), id && router.push(`/space/${id}`))} /> : null}
        {spaces === undefined ? (
          <View testID="skeleton" style={{ gap: s.s3 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={`${50 - i * 10}%`} />
            ))}
          </View>
        ) : spaces.length === 0 && !adding ? (
          <View style={{ gap: s.s2, alignItems: "flex-start" }}>
            <Txt variant="body" tone="ink3">
              Spaces hold your tasks: a class, a client, a part of your life. They can sit inside each other.
            </Txt>
            <Button icon={Plus} label="Add your first space" onPress={() => setAdding(true)} style={{ marginLeft: -s.s3 }} />
          </View>
        ) : (
          <View>
            {spaces.map((sp) => (
              <NavRow key={sp._id} href={`/space/${sp._id}`} label={sp.name} indent={sp.depth} leading={<Dot color={spaceTone(sp.color).dot} />} />
            ))}
          </View>
        )}
      </View>
      <View style={{ gap: s.s2 }}>
        <SectionHead title="More" />
        <View>
          <NavRow href="/progress" label="Progress: goals, habits, time" leading={<Icon icon={Target} size={16} />} />
          <NavRow href="/settings" label="Settings" leading={<Icon icon={SlidersHorizontal} size={16} />} />
        </View>
      </View>
    </Screen>
  );
}
