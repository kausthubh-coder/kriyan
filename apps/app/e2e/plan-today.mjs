// Planning today on v5 (after `seed.mjs`): what's left from yesterday and what's due today with
// no time wait in To fit in; a chip opens Fill with that task picked, Fill waits for a length
// (Kriyan never guesses one), "Put it at …" makes it a block, and Undo puts it back. A tap on a
// free stretch opens Fill for that stretch. At 1440 and 390. Prints ok or FAIL per step;
// screenshots in .artifacts/app/.

import { addDays } from "@kriyan/core/dates";
import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";
import { op } from "./api.mjs";

const failures = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${String(e).split("\n")[0]}`);
  }
};

const { date: today } = await op("get_today", {});
await op("add_task", { title: "Return the library books", date: addDays(today, -1) });
await op("add_task", { title: "Hand in the lab form", deadline: today, dueTime: 23 * 60 });
const onToday = async (title) =>
  (await op("get_today", {})).scheduled.find((t) => t.title === title && t.date === today);

const browser = await launch();
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const ctx = await signedInContext(browser, { width: w, height: h });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}/today`);
  await settle(page);
  const fill = page.getByRole("dialog", { name: "Fill free time" });

  await step(`${w}: To fit in has yesterday's task and today's due one, each saying why`, async () => {
    await page.getByRole("button", { name: "Fit in Return the library books, yesterday" }).waitFor();
    await page.getByRole("button", { name: "Fit in Hand in the lab form, due 23:00" }).waitFor();
    await page.screenshot({ path: artifact(`plan-fit-in-${w}.png`) });
  });

  await step(
    `${w}: a chip opens Fill with it picked; a length puts it at a time, Undo takes it back`,
    async () => {
      await page.getByRole("button", { name: "Fit in Return the library books, yesterday" }).click();
      await fill.waitFor();
      const picked = fill.getByRole("radio", { name: "Return the library books" });
      if ((await picked.getAttribute("aria-checked")) !== "true")
        throw new Error("the chip's task isn't picked");
      await fill.getByRole("button", { name: "Pick how long" }).waitFor();
      await fill.getByRole("radio", { name: "30 min", exact: true }).click();
      const put = fill.getByRole("button", { name: /^Put it at \d\d:\d\d–\d\d:\d\d$/ });
      const range = ((await put.getAttribute("aria-label")) ?? "").replace("Put it at ", "");
      await page.screenshot({ path: artifact(`plan-fill-${w}.png`) });
      await put.click();
      const toast = page.getByRole("status").filter({ hasText: `Return the library books, ${range}` });
      await toast.waitFor();
      const placed = await onToday("Return the library books");
      if (!placed || placed.length !== 30)
        throw new Error(`not on today at a time for 30 min: ${JSON.stringify(placed)}`);
      await toast.getByRole("button", { name: "Undo" }).click();
      await page.getByRole("button", { name: "Fit in Return the library books, yesterday" }).waitFor();
      if (await onToday("Return the library books")) throw new Error("Undo left it on today");
    },
  );

  await step(`${w}: a free stretch opens Fill for that stretch`, async () => {
    const gap = page.getByRole("button", { name: /free\. Fill \d\d:\d\d–\d\d:\d\d$/ }).first();
    const label = (await gap.getAttribute("aria-label")) ?? "";
    const stretch = label.replace(/^.*Fill /, "");
    await gap.click();
    await fill.getByText(`Fill ${stretch}`).waitFor();
    await page.keyboard.press("Escape");
    await fill.waitFor({ state: "detached" });
  });
  await ctx.close();
}
await browser.close();
console.log(`plan-today: ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
