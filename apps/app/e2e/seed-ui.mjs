// Adds the brief's sample sentences through the desktop quick add, the way a person would.
import { BASE, launch, artifact, signedInContext, settle } from "./lib.mjs";
const sentences = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "Calculus II lecture every tue and thu 9am for 1h30 #school/calculus",
      "Mum's birthday 16 oct every year remind day before at 20:00",
      "Run every 2 days after done #life",
    ];
const browser = await launch();
const ctx = await signedInContext(browser);
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log(`[pageerror] ${e}`));
await page.goto(`${BASE}/today`);
await settle(page);
const field = page.getByRole("textbox", { name: "Add a task" });
for (const text of sentences) {
  await field.fill(text);
  await page.waitForTimeout(400);
  if (text === sentences[0]) await page.screenshot({ path: artifact("quickadd-parsing-1440.png") });
  await field.press("Enter");
  await page.waitForTimeout(1200);
  console.log("added:", text);
}
await page.screenshot({ path: artifact("today-seeded-1440.png"), fullPage: true });
await browser.close();
