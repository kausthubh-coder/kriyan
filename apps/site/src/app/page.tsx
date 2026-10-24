import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Code } from "@/components/Code";
import { ProductShot } from "@/components/ProductShot";
import { QuickAddDemo } from "@/components/QuickAddDemo";
import ui from "@/components/ui.module.css";
import { ANDROID_PAGE, APP_URL, DESCRIPTION, GITHUB_URL, HEADLINE, MCP_URL, SITE_NAME } from "@/lib/site";
// Prototype renders of the B2 design (scripts/render-product.mjs). Re-render them from the real app
// once it ships the B2 screens (2.2.0), so every picture shows what the app does.
import todayDesktop from "@/assets/product/b2-today-desktop.png";
import todayPhone from "@/assets/product/b2-today-phone.png";
import askDesktop from "@/assets/product/b2-assistant-desktop.png";
import askPhone from "@/assets/product/b2-assistant-phone.png";
import goalsDesktop from "@/assets/product/b2-goals-desktop.png";
import goalsPhone from "@/assets/product/b2-goals-phone.png";
import reviewDesktop from "@/assets/product/b2-review-desktop.png";
import reviewPhone from "@/assets/product/b2-review-phone.png";
import todayDarkDesktop from "@/assets/product/b2-today-dark-desktop.png";
import todayDarkPhone from "@/assets/product/b2-today-dark-phone.png";
import askDarkDesktop from "@/assets/product/b2-assistant-dark-desktop.png";
import askDarkPhone from "@/assets/product/b2-assistant-dark-phone.png";
import goalsDarkDesktop from "@/assets/product/b2-goals-dark-desktop.png";
import goalsDarkPhone from "@/assets/product/b2-goals-dark-phone.png";
import reviewDarkDesktop from "@/assets/product/b2-review-dark-desktop.png";
import reviewDarkPhone from "@/assets/product/b2-review-dark-phone.png";
import css from "./page.module.css";

// The home page keeps the layout's default title; it only adds its own address.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, title: HEADLINE, description: DESCRIPTION, url: "/" },
};

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className={css.main}>
        <section className={css.hero} aria-labelledby="headline">
          <h1 id="headline" className={css.headline}>
            Your whole day, <span className={css.dim}>in one calm plan.</span>
          </h1>
          <p className={css.lede}>{DESCRIPTION}</p>
          <div className={css.actions}>
            <a href={APP_URL} className={`${ui.btn} ${ui.primary} ${ui.large}`}>
              Open the web app
            </a>
            <Link href={ANDROID_PAGE} className={`${ui.btn} ${ui.secondary} ${ui.large}`}>
              Get it on Android
            </Link>
          </div>
          <p className={css.note}>
            On iPhone, open it in Safari and add it to your Home Screen. No App Store needed.
          </p>
          <div className={css.shot}>
            <ProductShot
              lead
              desktop={todayDesktop}
              phone={todayPhone}
              darkDesktop={todayDarkDesktop}
              darkPhone={todayDarkPhone}
              alt="Kriyan's Today: Thursday's plan in one sentence, 3 events, 7 tasks and 2 habits, mostly free after 18:00, with Write lab report 4 starting in 5 minutes."
            />
          </div>
        </section>

        <section className={css.section} aria-labelledby="now">
          <div className={css.intro}>
            <h2 id="now">What&apos;s next, and is there time?</h2>
            <p>
              Today opens on one sentence about your day, the block that starts next, and the free time left.
            </p>
          </div>
          <ul className={css.points}>
            <li>
              <b>Next, then free</b>
              <span>
                &ldquo;Upcoming in 5 min&rdquo; with a Start focus button, and how long until you&apos;re
                free.
              </span>
            </li>
            <li>
              <b>Events and tasks apart</b>
              <span>
                Classes and meetings sit on the timeline; tasks get ticked off. Lengths only when you set one.
              </span>
            </li>
            <li>
              <b>2 from earlier</b>
              <span>Unfinished tasks wait in one quiet line you can move in a tap. Never a red list.</span>
            </li>
          </ul>
        </section>

        <section className={css.section} aria-labelledby="capture">
          <div className={css.intro}>
            <h2 id="capture">Write it like you&apos;d say it</h2>
            <p>
              Quick add reads dates, times, lengths, repeats and several reminders from one line.{" "}
              <Link href="/docs/quick-add" className={css.link}>
                See every phrase
              </Link>
            </p>
          </div>
          <div className={css.demo}>
            <QuickAddDemo />
          </div>
        </section>

        <section className={css.section} aria-labelledby="ask">
          <div className={css.intro}>
            <h2 id="ask">Ask in plain words</h2>
            <p>
              Kriyan does a few things by itself: add a task from a sentence, move what&apos;s left to
              tomorrow, find free time, say what&apos;s next, and tell you how the week went. Anything else
              waits for an AI you connect, which does it and replies in Ask.
            </p>
          </div>
          <ProductShot
            desktop={askDesktop}
            phone={askPhone}
            darkDesktop={askDarkDesktop}
            darkPhone={askDarkPhone}
            alt="Ask answering what do I have time for: 3 hours 45 minutes free from 17:45, with inbox tasks that fit and a button to place each one."
          />
          <ul className={css.points}>
            <li>
              <b>No AI of its own</b>
              <span>
                Kriyan works the same with nothing connected. A request it can&apos;t do says so, and waits
                until your agent answers it.
              </span>
            </li>
            <li>
              <b>Your agent, through MCP or the CLI</b>
              <span>
                Connect Claude, ChatGPT or Codex. It reads your plan, does what you asked, and replies under
                your request.
              </span>
            </li>
            <li>
              <b>Every change, with Undo</b>
              <span>
                Each task an agent adds, moves or changes is listed with the agent&apos;s name, and each one
                has Undo.
              </span>
            </li>
          </ul>
          <div className={css.setup}>
            <div>
              <h3>Claude, ChatGPT and other MCP clients</h3>
              <p>Add a custom connector with this address, then sign in to Kriyan.</p>
              <Code caption="MCP server">{MCP_URL}</Code>
            </div>
            <div>
              <h3>The command line</h3>
              <p>
                Every view and change, in a terminal and as JSON for scripts. For now it runs from a copy of
                the code.{" "}
                <Link href="/docs/cli" className={css.link}>
                  Set up the CLI
                </Link>
              </p>
              <Code caption="Terminal, in your copy of Kriyan">{`bun run kriyan today\nbun run kriyan add "essay fri 17:00 #school every week"`}</Code>
            </div>
          </div>
        </section>

        <section className={css.section} aria-labelledby="goals">
          <div className={css.intro}>
            <h2 id="goals">Habits, goals and the time you have</h2>
            <p>
              Goals move by milestones. Habits count over weeks, so one missed day never resets anything. And
              the time that&apos;s yours stays in view: days left in the year, free hours this week.
            </p>
          </div>
          <ProductShot
            desktop={goalsDesktop}
            phone={goalsPhone}
            darkDesktop={goalsDarkDesktop}
            darkPhone={goalsDarkPhone}
            alt="Goals and habits: 71 days left in 2026, 4 weeks left in the semester, 14.5 hours free this week, and goals with the steps left."
          />
        </section>

        <section className={css.section} aria-labelledby="review">
          <div className={css.intro}>
            <h2 id="review">Close the day in a minute</h2>
            <p>
              See what got done, then give each open task a place: tomorrow, another day, the inbox, or let it
              go. Then the day is closed.
            </p>
          </div>
          <ProductShot
            desktop={reviewDesktop}
            phone={reviewPhone}
            darkDesktop={reviewDarkDesktop}
            darkPhone={reviewDarkPhone}
            alt="Close the day: you finished 1 task and 1 habit and focused for 38 minutes, with 9 things still open to place."
          />
        </section>

        <section className={css.section} aria-labelledby="devices">
          <div className={css.intro}>
            <h2 id="devices">On your phone and your computer</h2>
          </div>
          <ul className={css.points}>
            <li>
              <b>iPhone</b>
              <span>
                Open{" "}
                <a href={APP_URL} className={css.link}>
                  app.kriyan.app
                </a>{" "}
                in Safari, tap Share, then Add to Home Screen. It opens full screen, like any app.
              </span>
            </li>
            <li>
              <b>Android</b>
              <span>
                <Link href={ANDROID_PAGE} className={css.link}>
                  Get the app
                </Link>{" "}
                for swipes, haptics and reminders on your phone. Android 7 or later.
              </span>
            </li>
            <li>
              <b>Web</b>
              <span>The full planner in any browser, with keyboard shortcuts on a computer.</span>
            </li>
          </ul>
        </section>

        <section className={css.section} aria-labelledby="open">
          <div className={css.intro}>
            <h2 id="open">Free and open source</h2>
            <p>
              Kriyan is MIT licensed and built in the open.{" "}
              <a href={GITHUB_URL} className={css.link}>
                Read the code on GitHub
              </a>
            </p>
          </div>
        </section>

        <section className={css.closing} aria-labelledby="start">
          <h2 id="start">
            Start with today. <span className={css.dim}>It takes a minute.</span>
          </h2>
          <div className={css.actions}>
            <a href={APP_URL} className={`${ui.btn} ${ui.primary} ${ui.large}`}>
              Open the web app
            </a>
            <Link href={ANDROID_PAGE} className={`${ui.btn} ${ui.secondary} ${ui.large}`}>
              Get it on Android
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
