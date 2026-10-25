// The Inbox (docs/design/v5 prototype `page("inbox")`): ideas captured with no day yet, and what
// was planned or due before last week and never done, which Today no longer shows. Each row
// opens the task, where it gets a day or is let go.

import { View } from "react-native";
import { router } from "expo-router";
import { formatDate } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useInboxView, type TaskView } from "@/data/views";
import { ListRow } from "@/features/shell/ListRow";
import { Page, PageEmpty, PageLabel } from "@/features/shell/Page";
import { useIsPhone } from "@/theme/layout";
import { s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Skeleton } from "@/ui/bits";
import { Txt } from "@/ui/Txt";
import { toInbox } from "./data";

/** "Was due Wed 14 Oct" or "Was Wed 14 Oct": when it was meant to happen. */
function olderMeta(t: TaskView, today: string): string | undefined {
  if (t.deadline && !t.date) return `Was due ${formatDate(t.deadline, today)}`;
  if (t.date) return `Was ${formatDate(t.date, today)}`;
  return undefined;
}

export function InboxScreen() {
  const view = useInboxView();
  const { today } = useClock();
  const phone = useIsPhone();
  const inbox = view ? toInbox(view) : undefined;
  return (
    <Page tabTitle="Inbox" title="Inbox" sub="No day yet. Give each a day, or let it go." add={{}}>
      {inbox === undefined ? (
        <View testID="skeleton" style={{ gap: s.s6, paddingTop: s.s6 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={`${70 - i * 12}%`} height={16} />
          ))}
        </View>
      ) : inbox.ideas.length === 0 && inbox.older.length === 0 ? (
        <PageEmpty
          title="Nothing waiting"
          body="Everything you've captured has a day. Ideas you add without one land here."
          action={phone ? null : <Button label="Add an idea" onPress={() => router.push("/add")} />}
        />
      ) : (
        <>
          <PageLabel>Ideas</PageLabel>
          {inbox.ideas.length ? (
            inbox.ideas.map((t) => <ListRow key={t._id} task={t} />)
          ) : (
            <Txt variant="body" tone="ink3" style={{ paddingVertical: s.s4 }}>
              No ideas without a day.
            </Txt>
          )}
          {inbox.older.length ? (
            <>
              <PageLabel>From before last week</PageLabel>
              {inbox.older.map((t) => (
                <ListRow key={t._id} task={t} meta={olderMeta(t, today)} />
              ))}
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}
