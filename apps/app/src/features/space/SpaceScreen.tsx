// A space: breadcrumb, then next tasks, later tasks, the spaces inside it (rows, not cards),
// its goal, and its Markdown note.

import { useRef, useState } from "react";
import { View } from "react-native";
import { Link, router } from "expo-router";
import { useMutation } from "convex/react";
import { Archive, ChevronRight, Ellipsis, Palette, Pencil, Plus } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { formatDuration } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useSpaceView, type SpaceView } from "@/data/views";
import { NoteEditor, NoteToolbarHost } from "@/features/notes/NoteEditor";
import { errorText } from "@/features/tasks/actions";
import { Option } from "@/features/tasks/pickers";
import { QuickAdd } from "@/features/tasks/QuickAdd";
import { TaskRow } from "@/features/tasks/TaskRow";
import { GoalView } from "@/features/progress/Goals";
import { useControl, useIsPhone } from "@/theme/layout";
import { r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Dot, Field, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { Screen, SectionHead } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { AddSpace, ColorPicker } from "./AddSpace";

export function SpaceScreen({ id }: { id: Id<"spaces"> }) {
  const view = useSpaceView(id);
  const phone = useIsPhone();
  return (
    <View style={{ flex: 1 }}>
      <Screen title={view?.space.name ?? "Space"} back width={phone ? "column" : 1040}>
        {view === undefined ? (
          <View testID="skeleton" style={{ gap: s.s6 }}>
            <Skeleton width={200} height={28} />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={`${60 - i * 10}%`} />
            ))}
          </View>
        ) : (
          <SpaceBody view={view} />
        )}
      </Screen>
      <NoteToolbarHost />
    </View>
  );
}

function SpaceBody({ view }: { view: SpaceView }) {
  const { today } = useClock();
  const phone = useIsPhone();
  const { row } = useControl();
  const update = useMutation(api.organize.updateSpace);
  const archive = useMutation(api.organize.archiveSpace);
  const [adding, setAdding] = useState<"task" | "space" | null>(null);
  const [menu, setMenu] = useState<"more" | "rename" | "color" | null>(null);
  const [name, setName] = useState(view.space.name);
  const moreRef = useRef<View>(null);
  const tone = spaceTone(view.space.color);
  const save = (patch: Omit<Parameters<typeof update>[0], "id">) =>
    update({ id: view.space._id, ...patch }).catch((e: unknown) => showToast(errorText(e)));

  const stats = [
    `${view.stats.open} open`,
    `${view.stats.doneThisMonth} done this month`,
    ...(view.stats.minutesThisWeek ? [`${formatDuration(view.stats.minutesThisWeek)} this week`] : []),
  ];

  const left = (
    <View style={{ gap: phone ? s.s8 : s.s12 }}>
      {adding === "task" ? (
        <QuickAdd
          variant={phone ? "sheet" : "inline"}
          placeholder={`Add to ${view.space.name}, like “read 7.4 thu”`}
          autoFocus
          onAdded={() => setAdding(null)}
        />
      ) : null}
      <View style={{ gap: s.s2 }}>
        <SectionHead title="Next" meta={view.next.length ? String(view.next.length) : undefined} />
        {view.next.length ? (
          view.next.map((t) => <TaskRow key={t._id} task={t} today={today} showWhen />)
        ) : (
          <Txt variant="body" tone="ink3">
            Nothing here has a day yet.
          </Txt>
        )}
      </View>
      {view.later.length ? (
        <View style={{ gap: s.s2 }}>
          <SectionHead title="Later" meta={String(view.later.length)} />
          {view.later.map((t) => (
            <TaskRow key={t._id} task={t} today={today} />
          ))}
        </View>
      ) : null}
      <View style={{ gap: s.s2 }}>
        <SectionHead title={`Inside ${view.space.name}`} />
        {view.children.map((child) => (
          <Link key={child._id} href={`/space/${child._id}`} asChild>
            <Press
              role="link"
              scale={false}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s.s3,
                minHeight: row,
                paddingHorizontal: s.s2,
                marginHorizontal: -s.s2,
                borderRadius: r.ctl,
              }}
            >
              <View style={{ width: 18, alignItems: "center" }}>
                <Dot color={spaceTone(child.color).dot} />
              </View>
              <Txt variant="body" style={{ flex: 1 }}>
                {child.name}
              </Txt>
              <Txt variant="meta" tone="ink3" tnum>
                {child.open} open
              </Txt>
              <Icon icon={ChevronRight} size={16} />
            </Press>
          </Link>
        ))}
        {adding === "space" ? (
          <AddSpace parentId={view.space._id} parentName={view.space.name} onDone={() => setAdding(null)} />
        ) : (
          <Press
            role="button"
            onPress={() => setAdding("space")}
            scale={false}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s.s3,
              minHeight: row,
              paddingHorizontal: s.s2,
              marginHorizontal: -s.s2,
              borderRadius: r.ctl,
            }}
          >
            <View style={{ width: 18, alignItems: "center" }}>
              <Icon icon={Plus} size={16} />
            </View>
            <Txt variant="body" tone="ink3">
              Add a space inside {view.space.name}
            </Txt>
          </Press>
        )}
      </View>
      {view.goals.length ? (
        <View style={{ gap: s.s2 }}>
          <SectionHead title={view.goals.length === 1 ? "Goal" : "Goals"} />
          <View style={{ gap: s.s6 }}>
            {view.goals.map((g) => (
              <GoalView key={g._id} goal={g} color={tone.dot} today={today} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const note = (
    <View style={{ gap: s.s2 }}>
      <SectionHead title="Note" />
      <NoteEditor
        key={view.space._id}
        value={view.space.note}
        onChange={(md) => void save({ note: md })}
        placeholder={phone ? "Add a note: plans, links, a checklist" : undefined}
      />
    </View>
  );

  return (
    <>
      <View style={{ gap: s.s2 }}>
        {view.breadcrumb.length ? (
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: s.s2 }}>
            {view.breadcrumb.map((b, i) => (
              <View key={b._id} style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
                {i ? (
                  <Txt variant="body" tone="ink3">
                    /
                  </Txt>
                ) : null}
                <Dot color={spaceTone(b.color).dot} />
                <Link href={`/space/${b._id}`} asChild>
                  <Press
                    role="link"
                    hoverBg={null}
                    scale={false}
                    style={{
                      minHeight: phone ? 44 : 24,
                      minWidth: phone ? 44 : undefined,
                      justifyContent: "center",
                    }}
                  >
                    <Txt variant="body" tone="ink3">
                      {b.name}
                    </Txt>
                  </Press>
                </Link>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3 }}>
          {phone ? null : <Dot color={tone.dot} size={12} />}
          {phone ? null : (
            <Txt variant="headline" heading={1} style={{ flex: 1 }}>
              {view.space.name}
            </Txt>
          )}
          <View style={{ flexDirection: "row", gap: s.s2, marginLeft: phone ? -s.s3 : 0 }}>
            <Button
              icon={Plus}
              label="Add space"
              onPress={() => setAdding(adding === "space" ? null : "space")}
            />
            <Button
              variant={phone ? "default" : "primary"}
              icon={Plus}
              label="Add task"
              onPress={() => setAdding(adding === "task" ? null : "task")}
            />
            <View ref={moreRef} collapsable={false}>
              <Button
                icon={Ellipsis}
                accessibilityLabel="Space options"
                onPress={() => setMenu("more")}
                expanded={menu !== null}
              />
            </View>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: s.s6, rowGap: s.s1 }}>
          {stats.map((st) => (
            <Txt key={st} variant="body" tone="ink3" tnum>
              {st}
            </Txt>
          ))}
        </View>
      </View>
      {phone ? (
        <>
          {left}
          {note}
        </>
      ) : (
        <View style={{ flexDirection: "row", gap: s.s12, alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{note}</View>
        </View>
      )}
      <Popover
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchor={moreRef}
        title={view.space.name}
        width={300}
      >
        {menu === "rename" ? (
          <View style={{ gap: s.s3 }}>
            <Field
              label="Space name"
              value={name}
              onChangeText={setName}
              autoFocus
              onSubmitEditing={() => (void save({ name }), setMenu(null))}
            />
            <Button
              variant="primary"
              label="Rename"
              onPress={() => (void save({ name }), setMenu(null))}
              disabled={!name.trim()}
            />
          </View>
        ) : menu === "color" ? (
          <ColorPicker value={view.space.color} onPick={(color) => (void save({ color }), setMenu(null))} />
        ) : (
          <View style={{ gap: 2 }}>
            <Option
              label="Rename"
              leading={<Icon icon={Pencil} size={16} />}
              onPress={() => setMenu("rename")}
            />
            <Option
              label="Change colour"
              leading={<Icon icon={Palette} size={16} />}
              onPress={() => setMenu("color")}
            />
            <Option
              label="Archive space"
              hint="Its tasks stay"
              leading={<Icon icon={Archive} size={16} />}
              onPress={() => {
                setMenu(null);
                void archive({ id: view.space._id })
                  .then(() => {
                    showToast(`Archived ${view.space.name}`);
                    router.replace("/browse");
                  })
                  .catch((e: unknown) => showToast(errorText(e)));
              }}
            />
          </View>
        )}
      </Popover>
    </>
  );
}
