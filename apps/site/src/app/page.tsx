import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import { Code } from "@/components/Code";
import { ProductShot } from "@/components/ProductShot";
import { QuickAddDemo } from "@/components/QuickAddDemo";
import { BrandMark } from "@/lib/brand";
import { APK_URL, APP_URL, DESCRIPTION, GITHUB_URL, MCP_URL } from "@/lib/site";
// Prototype renders of the B2 design (scripts/render-product.mjs). Re-render them from the real app
// once it ships the B2 screens.
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

// The landing page carries the B2 look on its own (light and dark, Inter); the docs keep the
// site's shared tokens until those move to B2 too.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function Home() {
  return (
    <div className={`${css.root} ${inter.variable}`}>
      <header className={css.header}>
        <Link href="/" className={css.brand} aria-label="Kriyan home">
          <BrandMark size={24} />
          Kriyan
        </Link>
        <nav className={css.nav} aria-label="Site">
          <Link href="/docs" className={`${css.btn} ${css.quiet}`}>
            Docs
          </Link>
          <a href={GITHUB_URL} className={`${css.btn} ${css.quiet} ${css.hideOnPhone}`}>
            GitHub
          </a>
          <a href={APP_URL} className={`${css.btn} ${css.secondary}`}>
            Open the web app
          </a>
        </nav>
      </header>

      <main className={css.main}>
        <section className={css.hero} aria-labelledby="headline">
          <h1 id="headline" className={css.headline}>
            Your whole day, <span className={css.dim}>in one calm plan.</span>
          </h1>
          <p className={css.lede}>{DESCRIPTION}</p>
          <div className={css.actions}>
            <a href={APP_URL} className={`${css.btn} ${css.primary} ${css.large}`}>
              Open the web app
            </a>
            <a href={APK_URL} className={`${css.btn} ${css.secondary} ${css.large}`}>
              Get it on Android
            </a>
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
            <h2 id="ask">Ask, and it&apos;s done</h2>
            <p>
              Ask Kriyan in plain words: &ldquo;what do I have time for?&rdquo; or &ldquo;move the lab report
              to after lunch&rdquo;. Changes land in your plan straight away, each with Undo.
            </p>
          </div>
          <ProductShot
            desktop={askDesktop}
            phone={askPhone}
            darkDesktop={askDarkDesktop}
            darkPhone={askDarkPhone}
            alt="Ask Kriyan answering what do I have time for: 3 hours 45 minutes free from 17:45, with inbox tasks that fit and a button to place each one."
          />
          <ul className={css.points}>
            <li>
              <b>Automations</b>
              <span>
                Let Codex read Moodle and Gmail each morning and add what&apos;s due, marked with where it
                came from.
              </span>
            </li>
            <li>
              <b>Your AI, through MCP</b>
              <span>Claude, ChatGPT or Cursor can read your week and plan it with you.</span>
            </li>
            <li>
              <b>One tip at a time</b>
              <span>&ldquo;Lab reports take you 1h 50m, not 1h 30m&rdquo;, from your own history.</span>
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
                Every view and change, in a terminal and as JSON for scripts.{" "}
                <Link href="/docs/cli" className={css.link}>
                  Set up the CLI
                </Link>
              </p>
              <Code caption="Terminal">{`kriyan today\nkriyan add "essay fri 17:00 #school every week"`}</Code>
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
                <a href={APK_URL} className={css.link}>
                  Download the app
                </a>{" "}
                for swipes, haptics and reminders on your phone.
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
            <a href={APP_URL} className={`${css.btn} ${css.primary} ${css.large}`}>
              Open the web app
            </a>
            <a href={APK_URL} className={`${css.btn} ${css.secondary} ${css.large}`}>
              Get it on Android
            </a>
          </div>
        </section>
      </main>

      <footer className={css.footer}>
        <div>
          <Link href="/" className={css.brand} aria-label="Kriyan home">
            <BrandMark size={20} />
            Kriyan
          </Link>
          <p>Open source under the MIT licence. Kriyan is Sanskrit for action.</p>
        </div>
        <nav aria-label="Footer">
          <ul className={css.footerLinks}>
            <li>
              <a href={GITHUB_URL} className={`${css.btn} ${css.quiet}`}>
                GitHub
              </a>
            </li>
            <li>
              <Link href="/docs" className={`${css.btn} ${css.quiet}`}>
                Docs
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={`${css.btn} ${css.quiet}`}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className={`${css.btn} ${css.quiet}`}>
                Terms
              </Link>
            </li>
          </ul>
        </nav>
      </footer>
    </div>
  );
}
