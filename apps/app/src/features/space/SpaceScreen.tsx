// A space (docs/design/v5 prototype `page("space:…")`): the big name with its dot, how many are
// open, then the next three weeks by day in v5 rows, what has no day yet, the spaces inside it,
// its goals and its note. A parent space lists what its spaces hold, each row naming the space.

import { useRef, useState } from "react";
import { View } from "react-native";
import { Link, router, type Href } from "expo-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Archive, ChevronRight, Ellipsis, Palette, Pencil, Plus } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { formatDay } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useSpaceView, type SpaceView } from "@/data/views";
import { NoteEditor, NoteToolbarHost } from "@/features/notes/NoteEditor";
import { GoalCard } from "@/features/progress/GoalCard";
import { ListRow } from "@/features/shell/ListRow";
import { Page, PageEmpty, PageLabel } from "@/features/shell/Page";
import { rowMeta } from "@/features/shell/rowMeta";
import { errorText } from "@/features/tasks/actions";
import { Option } from "@/features/tasks/pickers";
import { useIsPhone } from "@/theme/layout";
import { c, family, r, s, spaceTone, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Dot, Field, Skeleton } from "@/ui/bits";
import { DottedRule } from "@/ui/DottedRule";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { AddSpace, ColorPicker } from "./AddSpace";

function useSpaceDays(id: Id<"spaces">) {
  const { today } = useClock();
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.navigation.spaceDays, isAuthenticated ? { id, today } : "skip");
}

export function SpaceScreen({ id }: { id: Id<"spaces"> }) {
  const view = useSpaceView(id);
  const days = useSpaceDays(id);
  const moreRef = useRef<View>(null);
  const [menu, setMenu] = useState(false);
  const open = view ? [...view.next, ...view.later].filter((t) => !t.event).length : 0;
  return (
    <View style={{ flex: 1 }}>
      <Page
        tabTitle={view?.space.name ?? "Space"}
        title={view?.space.name ?? " "}
        lead={view ? <Dot color={spaceTone(view.space.color).dot} size={14} /> : undefined}
        sub={view ? `${open} open` : " "}
        add={{ spaceId: id }}
        right={
          view ? (
            <View ref={moreRef} collapsable={false}>
              <RoundIcon label="Space options" onPress={() => setMenu(true)} expanded={menu} />
            </View>
          ) : undefined
        }
      >
        {view === undefined || days === undefined ? (
          <View testID="skeleton" style={{ gap: s.s6, paddingTop: s.s6 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={`${60 - i * 10}%`} height={16} />
            ))}
          </View>
        ) : (
          <SpaceBody view={view} days={days} />
        )}
      </Page>
      {view ? <SpaceMenu view={view} open={menu} onClose={() => setMenu(false)} anchor={moreRef} /> : null}
      <NoteToolbarHost />
    </View>
  );
}

/** A small round grey button, like the back button beside it (Joi's top bar). */
function RoundIcon({ label, onPress, expanded }: { label: string; onPress: () => void; expanded?: boolean }) {
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      aria-expanded={expanded}
      onPress={onPress}
      hoverBg={null}
      rippleRadius={sz.touch / 2}
      style={{ width: sz.touch, height: sz.touch, alignItems: "center", justifyContent: "center" }}
    >
      {({ hovered }) => (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: r.pill,
            backgroundColor: hovered ? c.select : c.sunken,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon icon={Ellipsis} size={20} tone="ink" />
        </View>
      )}
    </Press>
  );
}

type Days = NonNullable<ReturnType<typeof useSpaceDays>>;

function SpaceBody({ view, days }: { view: SpaceView; days: Days }) {
  const { today } = useClock();
  const phone = useIsPhone();
  const [adding, setAdding] = useState(false);
  const update = useMutation(api.organize.updateSpace);
  const id = view.space._id;
  const shown = new Set(days.flatMap((d) => d.items.map((t) => t._id)));
  // No day yet: what isn't already on one of the days above as due.
  const later = view.later.filter((t) => !shown.has(t._id));
  return (
    <>
      {days.length === 0 && later.length === 0 ? (
        <PageEmpty
          title="Nothing in the next three weeks"
          body={`Tasks you add to ${view.space.name} show here by day.`}
          action={
            phone ? null : (
              <Button
                icon={Plus}
                label="Add a task"
                onPress={() => router.push({ pathname: "/add", params: { spaceId: id } })}
              />
            )
          }
        />
      ) : null}
      {days.map((d) => (
        <View key={d.date}>
          <PageLabel>{formatDay(d.date, today)}</PageLabel>
          {d.items.map((t) => (
            <ListRow
              key={`${t._id}-${d.date}`}
              task={t}
              meta={rowMeta(t, d.date, today)}
              showSpace={t.spaceId !== id}
            />
          ))}
        </View>
      ))}
      {later.length ? (
        <View>
          <PageLabel>No day yet</PageLabel>
          {later.map((t) => (
            <ListRow key={t._id} task={t} meta={rowMeta(t, today, today)} showSpace={t.spaceId !== id} />
          ))}
        </View>
      ) : null}
      <PageLabel>{`Inside ${view.space.name}`}</PageLabel>
      {view.children.map((child) => (
        <Link key={child._id} href={`/space/${child._id}` as Href} asChild>
          <Press
            role="link"
            accessibilityLabel={`${child.name}, ${child.open} open`}
            hoverBg={null}
            scale={false}
            style={{ flexDirection: "row", alignItems: "center", gap: s.s4, minHeight: 56 }}
          >
            <View style={{ width: 24, alignItems: "center" }}>
              <Dot color={spaceTone(child.color).dot} size={10} />
            </View>
            <Txt variant="subhead" style={[family("500"), { flex: 1 }]} numberOfLines={1}>
              {child.name}
            </Txt>
            <Txt variant="body" tone="ink3" tnum>
              {child.open} open
            </Txt>
            <Icon icon={ChevronRight} size={18} tone="ink3" />
            <DottedRule width={2} />
          </Press>
        </Link>
      ))}
      {adding ? (
        <View style={{ paddingTop: s.s3 }}>
          <AddSpace parentId={id} parentName={view.space.name} onDone={() => setAdding(false)} />
        </View>
      ) : (
        <Press
          role="button"
          onPress={() => setAdding(true)}
          hoverBg={null}
          scale={false}
          style={{ flexDirection: "row", alignItems: "center", gap: s.s4, minHeight: 56 }}
        >
          <View style={{ width: 24, alignItems: "center" }}>
            <Icon icon={Plus} size={18} tone="ink3" />
          </View>
          <Txt variant="subhead" tone="ink3" style={family("500")}>
            {`Add a space inside ${view.space.name}`}
          </Txt>
        </Press>
      )}
      {view.goals.length ? (
        <View>
          <PageLabel>{view.goals.length === 1 ? "Goal" : "Goals"}</PageLabel>
          {view.goals.map((g) => (
            <GoalCard key={g._id} goal={g} color={view.space.color} today={today} />
          ))}
        </View>
      ) : null}
      <PageLabel>Note</PageLabel>
      <View style={{ paddingTop: s.s2 }}>
        <NoteEditor
          key={id}
          value={view.space.note}
          onChange={(md) => void update({ id, note: md }).catch((e: unknown) => showToast(errorText(e)))}
          placeholder="Add a note: plans, links, a checklist"
        />
      </View>
    </>
  );
}

function SpaceMenu({
  view,
  open,
  onClose,
  anchor,
}: {
  view: SpaceView;
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<View | null>;
}) {
  const update = useMutation(api.organize.updateSpace);
  const archive = useMutation(api.organize.archiveSpace);
  const [step, setStep] = useState<"more" | "rename" | "color">("more");
  const [name, setName] = useState(view.space.name);
  const close = () => (setStep("more"), onClose());
  const save = (patch: Omit<Parameters<typeof update>[0], "id">) =>
    update({ id: view.space._id, ...patch }).catch((e: unknown) => showToast(errorText(e)));
  return (
    <Popover open={open} onClose={close} anchor={anchor} title={view.space.name} width={300}>
      {step === "rename" ? (
        <View style={{ gap: s.s3 }}>
          <Field
            label="Space name"
            value={name}
            onChangeText={setName}
            autoFocus
            onSubmitEditing={() => (void save({ name }), close())}
          />
          <Button
            variant="primary"
            label="Rename"
            onPress={() => (void save({ name }), close())}
            disabled={!name.trim()}
          />
        </View>
      ) : step === "color" ? (
        <ColorPicker value={view.space.color} onPick={(color) => (void save({ color }), close())} />
      ) : (
        <View style={{ gap: 2 }}>
          <Option
            label="Rename"
            leading={<Icon icon={Pencil} size={16} />}
            onPress={() => setStep("rename")}
          />
          <Option
            label="Change colour"
            leading={<Icon icon={Palette} size={16} />}
            onPress={() => setStep("color")}
          />
          <Option
            label="Archive space"
            hint="Its tasks stay"
            leading={<Icon icon={Archive} size={16} />}
            onPress={() => {
              close();
              void archive({ id: view.space._id })
                .then(() => {
                  showToast(`Archived ${view.space.name}`);
                  router.replace("/menu");
                })
                .catch((e: unknown) => showToast(errorText(e)));
            }}
          />
        </View>
      )}
    </Popover>
  );
}
