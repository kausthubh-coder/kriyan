// The ask bar at the foot of desktop Today (b2.html `askBarHTML("desk")`): plain words to add,
// move or find things without leaving the day. Sending opens Ask, where the reply arrives, as
// the prototype does.

import { useRef, useState } from "react";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import { AskBar } from "@/features/ask/AskBar";
import { errorText } from "@/features/tasks/actions";
import { showToast } from "@/ui/toast";

export function TodayAsk() {
  const sendAsk = useMutation(api.assistant.send);
  const [text, setText] = useState("");
  const sending = useRef(false);
  const send = (raw: string) => {
    const words = raw.trim();
    if (!words || sending.current) return;
    sending.current = true;
    setText("");
    sendAsk({ text: words })
      .then(() => router.push("/ask"))
      .catch((e: unknown) => {
        setText(words);
        showToast(errorText(e));
      })
      .finally(() => {
        sending.current = false;
      });
  };
  return <AskBar value={text} onChange={setText} onSend={send} suggestions={false} />;
}
