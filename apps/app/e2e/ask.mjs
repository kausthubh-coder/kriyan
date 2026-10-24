// The Ask tab as a person uses it: a suggestion, an add with Undo, a request that waits, an
// agent's answer (made through the API as "Claude") with its changes, Undo on one of them,
// Claude's run in Automations, and Edit opening a task it added. After seed.mjs:
//   node apps/app/e2e/ask.mjs            (W=390 for the phone, SCHEME=dark for dark)
import { launch, signedInContext, settle, artifact, BASE } from "./lib.mjs";
import { op } from "./api.mjs";
const W = Number(process.env.W ?? 1440);
const scheme = process.env.SCHEME ?? "light";
const tag = `${W}-${scheme}`;
const b = await launch();
const ctx = await signedInContext(b, { width: W, height: W < 700 ? 844 : 900 }, scheme);
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const ok = (m) => console.log("ok  ", m);
const shot = (n) => p.screenshot({ path: artifact(`ask-${n}-${tag}.png`) });
await p.goto(`${BASE}/ask`);
await settle(p);
// start clean
const clear = p.getByRole("button", { name: "Clear the conversation" });
if (await clear.count()) {
  await clear.click();
  await p.waitForTimeout(800);
}
await shot("empty");
await p.getByRole("button", { name: "What's next?" }).click();
await p
  .getByText(/^(Next is|Nothing else)/)
  .first()
  .waitFor();
ok(
  "suggestion answered: " +
    (await p
      .getByText(/^(Next is|Nothing else)/)
      .first()
      .innerText()),
);
const box = p.getByRole("textbox", { name: "Ask Kriyan" });
await box.fill("Add call mum tomorrow 18:00");
await box.press("Enter");
await p.getByText('Added "call mum" to tomorrow at 18:00.').waitFor();
ok("add answered");
await shot("added");
await p.getByRole("button", { name: 'Undo: Added "call mum" to tomorrow at 18:00.' }).click();
await p.getByText("Undone", { exact: true }).first().waitFor();
ok("undo on Kriyan's reply shows Undone");
await box.fill("Plan my Friday around the calculus exam");
await box.press("Enter");
await p.getByText("Waiting for a connected agent to answer").waitFor();
ok("agent request waits");
await shot("waiting");
// act as Claude
const waiting = await op("get_asks");
const ask = waiting.find((a) => a.text.startsWith("Plan my Friday"));
await op("add_task", { text: "Study for calculus exam fri 14:00", agent: "Claude" });
await op("add_task", { text: "Pack calculator fri", agent: "Claude" });
await op("answer_ask", {
  askId: ask.askId,
  reply: "Added a study block on Friday at 14:00 and a reminder to pack your calculator.",
  agent: "Claude",
});
await p.getByText("Added a study block on Friday").waitFor();
ok("agent reply shows");
await p.waitForTimeout(500);
await shot("answered");
await p.getByRole("button", { name: 'Undo: Added "Pack calculator"' }).first().click();
await p.locator('[data-testid^="ask-"]').last().getByText("Undone", { exact: true }).waitFor();
ok("undo on an agent change");
await shot("change-undone");
// Automations: Claude's run
const run = p.getByRole("button", { name: /^Claude / });
await run.first().click();
await p.waitForTimeout(400);
await shot("automations-open");
ok("run opened: " + (await run.first().getAttribute("aria-label")));
await p.getByRole("button", { name: "Edit Study for calculus exam" }).first().click();
await p.waitForURL(/\/task\//);
await p.waitForTimeout(800);
await shot("edit-opens-task");
ok("Edit opens the task");
await p.keyboard.press("Escape");
await b.close();
