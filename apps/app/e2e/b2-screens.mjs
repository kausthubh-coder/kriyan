// The B2 screens the way a person reaches them: Today, Start focus from the up-next card, and
// the review from "Close the day". Screenshots to .artifacts/app/b2-*.png.
//   node apps/app/e2e/seed.mjs && node apps/app/e2e/b2-screens.mjs        (SCHEME=dark for dark)

import { BASE, artifact, launch, settle, signedInContext } from "./lib.mjs";

const scheme = process.env.SCHEME ?? "light";
const browser = await launch();
const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failures.push(name);
};

for (const [name, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
]) {
  const ctx = await signedInContext(browser, viewport, scheme);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const shot = (what) => page.screenshot({ path: artifact(`b2-${what}-${name}-${scheme}.png`) });

  await page.goto(`${BASE}/today`);
  await settle(page);
  await shot("today");
  const sentence = await page
    .getByText(/You have|Nothing is planned/)
    .first()
    .textContent();
  check(`${name}: Today's header says the day in a sentence`, Boolean(sentence));

  const start = page.getByRole("button", { name: /Start focus|^Focus$/ }).first();
  if (await start.count()) {
    await start.click();
    await page.waitForURL(/\/focus\//);
    await settle(page);
    await page.waitForTimeout(1200);
    const t1 = await page.getByRole("timer").textContent();
    await page.waitForTimeout(1500);
    const t2 = await page.getByRole("timer").textContent();
    check(`${name}: the focus timer runs (${t1} → ${t2})`, t1 !== t2);
    await shot("focus");
    await page.getByRole("button", { name: "Pause" }).click();
    const p1 = await page.getByRole("timer").textContent();
    await page.waitForTimeout(1500);
    check(`${name}: pause stops it`, p1 === (await page.getByRole("timer").textContent()));
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/today/);
  } else check(`${name}: an up-next card with Start focus (nothing timed later today?)`, false);

  await page.goto(`${BASE}/review`);
  await settle(page);
  await shot("review-done");
  const give = page.getByRole("button", { name: /^Next: (\d+ things? still open|tomorrow)$/ });
  check(`${name}: review opens on what got done`, (await give.count()) > 0);
  const label = (await give.textContent()) ?? "";
  await give.click();
  if (/still open/.test(label)) {
    await settle(page);
    await shot("review-decide");
    const before = await page.getByText(/^\d+ of \d+\./).textContent();
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await page.waitForTimeout(600);
    const after = await page
      .getByText(/^\d+ of \d+\.|^Tomorrow$/)
      .first()
      .textContent();
    check(`${name}: Tomorrow moves on to the next card (${before} → ${after})`, before !== after);
    await page
      .getByRole("button", { name: "Keep the rest on today" })
      .click()
      .catch(() => undefined);
  }
  await page.getByRole("button", { name: "Looks good" }).click();
  await page.getByRole("radio", { name: "Good" }).click();
  await page.getByRole("button", { name: "Close the day" }).click();
  await page.getByText("Day closed").waitFor();
  await shot("review-closed");
  check(`${name}: the review ends on Day closed`, true);
  check(`${name}: no page errors`, errors.length === 0);
  if (errors.length) console.log(errors.join("\n"));
  await ctx.close();
}
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log("all passed");
