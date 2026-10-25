// The menu (docs/design/v5 prototype `page("menu")`): Today's left button opens it on phones.
// Inbox, the spaces grouped under their top-level parent, then Goals and habits, Agents and
// Settings. One tap to anywhere; Back returns to Today.

import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Link, router, type Href } from "expo-router";
import Constants from "expo-constants";
import { ChevronRight, Inbox, Plug, Plus, Settings, Target } from "lucide-react-native";
import { useActivity } from "@/data/views";
import { AddSpace } from "@/features/space/AddSpace";
import { GroupLabel, Page, PageEmpty } from "@/features/shell/Page";
import { useNav } from "@/features/shell/nav";
import { family, s, spaceTone } from "@/theme/tokens";
import { Dot, Skeleton } from "@/ui/bits";
import { DottedRule } from "@/ui/DottedRule";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

const ROW = 64;

export function MenuScreen() {
  const { groups, inbox } = useNav();
  const activity = useActivity(31);
  const [adding, setAdding] = useState(false);
  // The agent that did something last, as the prototype's "Chitti school" beside Agents.
  const agent = activity?.[0]?.agent;
  const version = Constants.expoConfig?.version;
  return (
    <Page tabTitle="Menu" barTitle="Kriyan" backTo="/today">
      <MenuRow href="/inbox" label="Inbox" right={inbox ? String(inbox) : undefined}>
        <Icon icon={Inbox} size={20} tone="ink2" />
      </MenuRow>
      {groups === undefined ? (
        <View testID="skeleton" style={{ gap: s.s4, paddingTop: s.s6 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={`${60 - i * 10}%`} height={16} />
          ))}
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.parent?._id ?? "loose"}>
            {g.parent ? (
              <Link href={`/space/${g.parent._id}` as Href} asChild>
                <Press
                  role="link"
                  accessibilityLabel={g.parent.name}
                  hoverBg={null}
                  scale={false}
                  style={{ alignSelf: "flex-start", minWidth: 44 }}
                >
                  <GroupLabel>{g.label}</GroupLabel>
                </Press>
              </Link>
            ) : (
              <GroupLabel>{g.label}</GroupLabel>
            )}
            {g.spaces.map(({ space, count, indent }) => (
              <MenuRow
                key={space._id}
                href={`/space/${space._id}` as Href}
                label={space.name}
                right={count ? String(count) : undefined}
                indent={indent}
              >
                <Dot color={spaceTone(space.color).dot} size={11} />
              </MenuRow>
            ))}
          </View>
        ))
      )}
      {groups && groups.length === 0 && !adding ? (
        <PageEmpty
          title="No spaces yet"
          body="A space holds what belongs together: a class, a project, home. Tasks go to the Inbox until they have one."
        />
      ) : null}
      {adding ? (
        <View style={{ paddingTop: s.s4 }}>
          <AddSpace onDone={(id) => (setAdding(false), id && router.push(`/space/${id}`))} />
        </View>
      ) : (
        <MenuRow label="Add a space" quiet onPress={() => setAdding(true)}>
          <Icon icon={Plus} size={20} tone="ink3" />
        </MenuRow>
      )}
      <GroupLabel>YOU</GroupLabel>
      <MenuRow href="/goals" label="Goals and habits">
        <Icon icon={Target} size={20} tone="ink2" />
      </MenuRow>
      <MenuRow href="/agents" label="Agents" right={agent}>
        <Icon icon={Plug} size={20} tone="ink2" />
      </MenuRow>
      <MenuRow href="/settings" label="Settings">
        <Icon icon={Settings} size={20} tone="ink2" />
      </MenuRow>
      <Txt variant="meta" tone="ink3" style={{ textAlign: "center", paddingTop: s.s8 }}>
        {version ? `Kriyan ${version}, open source` : "Kriyan, open source"}
      </Txt>
    </Page>
  );
}

function MenuRow({
  href,
  label,
  right,
  indent = 0,
  quiet,
  onPress,
  children,
}: {
  href?: Href;
  label: string;
  right?: string;
  indent?: number;
  quiet?: boolean;
  onPress?: () => void;
  children: ReactNode;
}) {
  const row = (
    <Press
      role={href ? "link" : "button"}
      accessibilityLabel={right ? `${label}, ${right}` : label}
      onPress={onPress}
      hoverBg={null}
      scale={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s4,
        minHeight: ROW,
        paddingLeft: indent * s.s6,
      }}
    >
      {({ hovered }) => (
        <>
          <View style={{ width: 24, alignItems: "center" }}>{children}</View>
          <Txt
            variant="subhead"
            tone={quiet ? "ink3" : "ink"}
            numberOfLines={1}
            style={[family("500"), { flex: 1 }, hovered ? { textDecorationLine: "underline" } : null]}
          >
            {label}
          </Txt>
          {right ? (
            <Txt variant="body" tone="ink3" tnum numberOfLines={1} style={{ maxWidth: 160 }}>
              {right}
            </Txt>
          ) : null}
          {quiet ? null : <Icon icon={ChevronRight} size={18} tone="ink3" />}
          <DottedRule width={2} />
        </>
      )}
    </Press>
  );
  return href ? (
    <Link href={href} asChild>
      {row}
    </Link>
  ) : (
    row
  );
}
