// Phones: the Inbox and the spaces tree, one tap each, at the end of Ask. Desktop has them in
// the sidebar. Ask took Browse's tab, so what Browse held lives here and behind your initial.

import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Link, router, type Href } from "expo-router";
import { ChevronRight, Inbox, Plus } from "lucide-react-native";
import { useInboxView, useSpaces } from "@/data/views";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { AddSpace } from "@/features/space/AddSpace";
import { useControl } from "@/theme/layout";
import { r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Dot, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

function NavRow({
  href,
  label,
  leading,
  count,
  indent = 0,
}: {
  href: Href;
  label: string;
  leading: ReactNode;
  count?: number;
  indent?: number;
}) {
  const { row } = useControl();
  return (
    <Link href={href} asChild>
      <Press
        role="link"
        scale={false}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          minHeight: row,
          paddingLeft: s.s2 + indent * s.s4,
          paddingRight: s.s2,
          marginHorizontal: -s.s2,
          borderRadius: r.ctl,
        }}
      >
        <View style={{ width: 18, alignItems: "center" }}>{leading}</View>
        <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Txt>
        {count ? (
          <Txt variant="meta" tone="ink3" tnum>
            {count}
          </Txt>
        ) : null}
        <Icon icon={ChevronRight} size={16} />
      </Press>
    </Link>
  );
}

export function SpacesSection() {
  const spaces = useSpaces();
  const inbox = useInboxView();
  const [adding, setAdding] = useState(false);
  return (
    <View testID="spaces">
      <SectionLabel
        title="Spaces"
        right={<Button icon={Plus} label="Add space" onPress={() => setAdding(!adding)} expanded={adding} />}
      />
      {adding ? <AddSpace onDone={(id) => (setAdding(false), id && router.push(`/space/${id}`))} /> : null}
      <NavRow href="/inbox" label="Inbox" count={inbox?.length} leading={<Icon icon={Inbox} size={16} />} />
      {spaces === undefined ? (
        <View testID="skeleton" style={{ gap: s.s3, paddingVertical: s.s2 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={`${50 - i * 10}%`} />
          ))}
        </View>
      ) : spaces.length === 0 && !adding ? (
        <Txt variant="body" tone="ink3" style={{ paddingVertical: s.s2 }}>
          Spaces hold your tasks: a class, a client, a part of your life. They can sit inside each other.
        </Txt>
      ) : (
        spaces.map((sp) => (
          <NavRow
            key={sp._id}
            href={`/space/${sp._id}`}
            label={sp.name}
            indent={sp.depth}
            leading={<Dot color={spaceTone(sp.color).dot} />}
          />
        ))
      )}
    </View>
  );
}
