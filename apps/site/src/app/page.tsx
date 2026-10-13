import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Code } from "@/components/Code";
import { ProductShot } from "@/components/ProductShot";
import { QuickAddDemo } from "@/components/QuickAddDemo";
import ui from "@/components/ui.module.css";
import { APK_URL, APP_URL, DESCRIPTION, HEADLINE, MCP_URL } from "@/lib/site";
import todayDesktop from "@/assets/product/today-desktop.png";
import todayPhone from "@/assets/product/today-phone.png";
import upcomingDesktop from "@/assets/product/upcoming-desktop.png";
import upcomingPhone from "@/assets/product/upcoming-phone.png";
import progressDesktop from "@/assets/product/progress-desktop.png";
import progressPhone from "@/assets/product/progress-phone.png";
import css from "./page.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className={css.main}>
        <section className={css.hero} aria-labelledby="headline">
          <div className={css.heroText}>
            <h1 id="headline" className={css.headline}>
              {HEADLINE}
            </h1>
            <p className={css.lede}>{DESCRIPTION}</p>
            <div className={css.actions}>
              <a href={APP_URL} className={`${ui.btn} ${ui.primary} ${ui.large}`}>
                Open Kriyan
              </a>
              <a href={APK_URL} className={`${ui.btn} ${ui.secondary} ${ui.large}`}>
                Get it on Android
              </a>
            </div>
          </div>
          <ProductShot
            lead
            desktop={todayDesktop}
            phone={todayPhone}
            alt="Kriyan's Today view: the task you're on now with 25 minutes left, lunch next at 13:00, three habits and four tasks for anytime today."
          />
        </section>

        <section className={css.section} aria-labelledby="now">
          <div className={css.intro}>
            <h2 id="now">What am I doing now?</h2>
            <p>
              Today opens on the one thing you&apos;re doing, when it ends, and what comes next. Everything
              else stays quiet until you need it.
            </p>
          </div>
          <ul className={css.points}>
            <li>
              <b>Now and next</b>
              <span>The current block with its end time, and the next one with when it starts.</span>
            </li>
            <li>
              <b>Free time left</b>
              <span>
                &ldquo;3 h 20 min free&rdquo; tells you if one more thing fits, before you say yes to it.
              </span>
            </li>
            <li>
              <b>2 from earlier</b>
              <span>
                Unfinished tasks wait in one quiet line with &ldquo;Move to today&rdquo;. Never a red list.
              </span>
            </li>
          </ul>
        </section>

        <section className={css.section} aria-labelledby="week">
          <div className={css.intro}>
            <h2 id="week">Does the week fit?</h2>
            <p>
              Upcoming lays out seven days with your classes, meetings and deadlines, and a load bar for each
              day: planned hours against free hours. When a day is over, you see it before it happens.
            </p>
          </div>
          <ProductShot
            desktop={upcomingDesktop}
            phone={upcomingPhone}
            alt="Kriyan's Upcoming view: seven days of blocks, with Thursday 1 hour over and three blocks Claude proposed waiting to be accepted."
          />
        </section>

        <section className={css.section} aria-labelledby="track">
          <div className={css.intro}>
            <h2 id="track">Am I on track?</h2>
            <p>
              Progress shows where your time went, goals against their pace, and habits counted by the week.
              Missing a day never resets anything.
            </p>
          </div>
          <ProductShot
            desktop={progressDesktop}
            phone={progressPhone}
            alt="Kriyan's Progress view: 23 hours done this week split by space, a year of time as a heatmap, and three goals against their pace."
          />
        </section>

        <section className={css.section} aria-labelledby="capture">
          <div className={css.intro}>
            <h2 id="capture">Capture it in one sentence</h2>
            <p>
              Quick add reads dates, times, lengths, repeats and reminders from what you type. The same words
              work in the app, the command line and your AI. A length is only set when you say one.{" "}
              <Link href="/docs/quick-add" className={css.link}>
                See every phrase
              </Link>
            </p>
          </div>
          <QuickAddDemo />
        </section>

        <section className={css.section} aria-labelledby="ai">
          <div className={css.intro}>
            <h2 id="ai">Plan with your AI</h2>
            <p>
              Claude, ChatGPT, Cursor or a script can read your plan and suggest changes through MCP or the
              command line. A plan from an agent arrives as a proposal, and nothing moves until you accept it.
            </p>
          </div>
          <div className={css.setup}>
            <div className={css.setupItem}>
              <h3>Claude and ChatGPT</h3>
              <p>Add a custom connector with this address, then sign in to Kriyan when asked.</p>
              <Code caption="MCP server">{MCP_URL}</Code>
            </div>
            <div className={css.setupItem}>
              <h3>Claude Code</h3>
              <p>One command adds Kriyan to every project on this computer.</p>
              <Code caption="Terminal">{`claude mcp add --transport http --scope user kriyan ${MCP_URL}`}</Code>
            </div>
            <div className={css.setupItem}>
              <h3>Cursor and other clients</h3>
              <p>
                Paste this into your MCP settings. Clients without sign-in can send a personal access token
                from Settings instead.
              </p>
              <Code caption="mcp.json">
                {JSON.stringify({ mcpServers: { kriyan: { url: MCP_URL } } }, null, 2)}
              </Code>
            </div>
            <div className={css.setupItem}>
              <h3>The command line</h3>
              <p>
                Every view and change, in a terminal and as JSON for scripts.{" "}
                <Link href="/docs/cli" className={css.link}>
                  Set up the CLI
                </Link>
              </p>
              <Code caption="Terminal">{`kriyan today\nkriyan add "essay fri 5pm #school every week"`}</Code>
            </div>
          </div>
          <p>
            <Link href="/docs/mcp" className={css.link}>
              Read the MCP guide
            </Link>
          </p>
        </section>

        <section className={css.closing} aria-labelledby="start">
          <h2 id="start">Start with today.</h2>
          <div className={css.actions}>
            <a href={APP_URL} className={`${ui.btn} ${ui.primary} ${ui.large}`}>
              Open Kriyan
            </a>
            <a href={APK_URL} className={`${ui.btn} ${ui.secondary} ${ui.large}`}>
              Get it on Android
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
