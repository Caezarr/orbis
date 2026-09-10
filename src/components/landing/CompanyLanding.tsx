"use client";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Mail,
  FileText,
  CalendarDays,
  ShieldCheck,
  Menu,
  X,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { WebsiteHero } from "./WebsiteHero";
import { Atmosphere, LiquidMark, useVisibleMotion } from "./Optics";
import {
  TaskWorkshop,
  KnowledgeGrowth,
  ScrollSetup,
  GraphResult,
  LandingPricing,
  GlassAction,
} from "./MotionScenes";
import s from "./company-landing.module.css";

function Mark({ small = false }: { small?: boolean }) {
  return (
    <Image
      src="/brand/orbis-mark.svg"
      width={small ? 25 : 36}
      height={small ? 25 : 36}
      alt=""
    />
  );
}
const tools = [
  { name: "Gmail", key: "gmail", color: "#cf5048" },
  { name: "HubSpot", key: "hubspot", color: "#e97c50" },
  { name: "Salesforce", key: "salesforce", color: "#169bd5" },
  { name: "Notion", key: "notion", color: "#253552" },
  { name: "Outlook", key: "microsoftoutlook", color: "#1475ce" },
  { name: "Google Drive", key: "googledrive", color: "#308a62" },
];
function Tool({ item }: { item: (typeof tools)[number] }) {
  return (
    <span
      className={s.toolLogo}
      style={{ "--tool": item.color } as CSSProperties}
    >
      <Image
        src={`/brand/tools/${item.key}.svg`}
        alt=""
        width={25}
        height={25}
      />
      <span>{item.name}</span>
    </span>
  );
}

const IntakeScene = TaskWorkshop;
function FocusScene() {
  const [selected, setSelected] = useState([true, true, false]);
  const rows = [
    {
      title: "Prepare customer replies",
      meta: "Customer care · every morning",
      icon: Mail,
    },
    {
      title: "Draft quotes from your brief",
      meta: "Sales · when a request arrives",
      icon: FileText,
    },
    {
      title: "Publish social content",
      meta: "Marketing · not selected",
      icon: Sparkles,
    },
  ];
  return (
    <div className={s.focusScene}>
      <div className={s.sceneHeader}>
        <span>Your delegation list</span>
        <SlidersHorizontal size={16} />
      </div>
      {rows.map((r, i) => (
        <button
          key={r.title}
          className={s.taskChoice}
          data-selected={selected[i]}
          aria-pressed={selected[i]}
          onClick={() =>
            setSelected((v) => v.map((x, j) => (i === j ? !x : x)))
          }
        >
          <r.icon size={20} />
          <span>
            <strong>{r.title}</strong>
            <small>
              {selected[i]
                ? r.meta.replace("not selected", "selected")
                : "Not delegated · stays with you"}
            </small>
          </span>
          <i>{selected[i] && <Check size={13} />}</i>
        </button>
      ))}
      <div className={s.selectionSummary}>
        <ShieldCheck size={18} />
        <span>
          {selected.filter(Boolean).length} selected. Everything else stays
          yours.
        </span>
      </div>
      <small className={s.localCaption}>
        Try selecting a task. Illustration only.
      </small>
    </div>
  );
}
function DayScene() {
  return (
    <div className={s.dayScene}>
      <div className={s.sceneHeader}>
        <span>Wednesday, with Orbis</span>
        <CalendarDays size={17} />
      </div>
      <div className={s.week}>
        <span>Mon</span>
        <span>Tue</span>
        <b>Wed</b>
        <span>Thu</span>
        <span>Fri</span>
      </div>
      {[
        {
          time: "09:00",
          title: "Inbox, prepared.",
          detail: "Replies waiting for your approval",
        },
        {
          time: "12:00",
          title: "The follow-ups, sorted.",
          detail: "Your next steps in one place",
        },
        {
          time: "15:00",
          title: "Room for what’s next.",
          detail: "A little more space in your day",
        },
      ].map((r, i) => (
        <div
          className={s.dayRow}
          key={r.time}
          style={{ "--i": i } as CSSProperties}
        >
          <time>{r.time}</time>
          <div className={s.calendarBlock}>{r.title}</div>
          <div className={s.cleared}>
            <Check size={14} />
            <span>
              <strong>{r.title}</strong>
              <small>{r.detail}</small>
            </span>
          </div>
        </div>
      ))}
      <div className={s.freeTime}>
        <span />
        Your calendar should have room for you.
      </div>
      <small className={s.localCaption}>
        Illustrative day, not a time-saving guarantee.
      </small>
    </div>
  );
}
const MemoryScene = KnowledgeGrowth;
const chapters = [
  {
    title: "Busywork goes in. Useful work comes out.",
    description:
      "A customer request. A brief. A stack of documents. Give Orbis a clear mission and the right context. Get work you can actually review.",
    foot: "From scattered inputs to a clear next step.",
    Scene: IntakeScene,
  },
  {
    title: "Only the work you choose. Nothing else.",
    description:
      "Start with one task, not a company-wide overhaul. Pick what matters, set your boundaries, and keep the rest exactly as it is.",
    foot: "Your tools. Your rules. Your final say.",
    Scene: FocusScene,
  },
  {
    title: "Make room for the work only you can do.",
    description:
      "Less time pulling information together. More time with clients, your team, or the idea you never quite get to.",
    foot: "Build towards a lighter day, one mission at a time.",
    Scene: DayScene,
  },
  {
    title: "Gets better with your feedback.",
    description:
      "Your expertise shouldn’t disappear after every conversation. Keep the corrections that matter, test them, and carry them into the next run.",
    foot: "A weekly learning loop. A memory you can inspect and approve.",
    Scene: MemoryScene,
  },
];
function Chapter({ index, enabled }: { index: number; enabled: boolean }) {
  const { ref, active } = useVisibleMotion(enabled);
  const item = chapters[index];
  return (
    <article
      ref={ref}
      className={s.chapter}
      data-running={active}
      style={{ "--chapter": index } as CSSProperties}
    >
      <div className={s.chapterCopy}>
        <span className={s.chapterNumber}>
          0{index + 1}
          <span>/04</span>
        </span>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div className={s.chapterFoot}>
          <span />
          {item.foot}
        </div>
      </div>
      <div className={s.chapterVisual}>
        <item.Scene enabled={active} />
      </div>
    </article>
  );
}

const Setup = ScrollSetup;
function ToolGraph({ enabled }: { enabled: boolean }) {
  const { ref, active } = useVisibleMotion(enabled);
  return (
    <section className={`${s.section} ${s.graphSection}`} id="tools">
      <div className={s.sectionHeading}>
        <h2>
          Many tools.
          <br />
          One place to move work forward.
        </h2>
        <p>
          Works around the tools you already use.
          <br />
          Your company’s context brings it all together.
        </p>
      </div>
      <div ref={ref} data-running={active} className={s.graph}>
        <div className={s.graphOrbit} />
        <svg
          viewBox="0 0 1000 460"
          preserveAspectRatio="none"
          className={s.graphLines}
          aria-hidden
        >
          {[
            [140, 80],
            [500, 35],
            [860, 80],
            [140, 370],
            [500, 425],
            [860, 370],
          ].map(([x, y], i) => (
            <g key={i}>
              <path
                d={`M${x} ${y} Q500 ${y} 500 230`}
                fill="none"
                stroke="#c6d5ec"
                strokeWidth="1.2"
              />
              <path
                className={s.signal}
                d={`M${x} ${y} Q500 ${y} 500 230`}
                fill="none"
                stroke="#6388e5"
                strokeWidth="3"
                strokeDasharray="5 220"
                style={{ animationDelay: `${i * -0.5}s` }}
              />
            </g>
          ))}
        </svg>
        <div className={s.graphCore}>
          <LiquidMark enabled={enabled} running={active} size={126} />
          <strong>Your Orbis</strong>
          <small>Context · decisions · memory</small>
        </div>
        {tools.map((t, i) => (
          <div className={`${s.graphTool} ${s[`node${i}`]}`} key={t.key}>
            <Tool item={t} />
          </div>
        ))}
        <GraphResult enabled={active} />
      </div>
      <div className={s.integrationPromise}>
        <strong>Your favourite tools. Working together.</strong>
        <p>Connect your favourite tools. Choose what your agents can access.</p>
      </div>
      <div className={s.toolStrip}>
        {tools.map((t) => (
          <Tool item={t} key={t.key} />
        ))}
      </div>
    </section>
  );
}

const subscribeHydration = () => () => {};
export function CompanyLanding() {
  const reduced = useReducedMotion();
  const [quiet, setQuiet] = useState(false),
    [menu, setMenu] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const enabled = hydrated && reduced === false && !quiet;
  return (
    <div className={s.root} data-motion={enabled}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.nav}>
        <Link href="/" className={s.brand} aria-label="Orbis home">
          <Mark />
          Orbis
        </Link>
        <nav className={s.desktopNav} aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/catalog">100+ missions</Link>
          <a href="#tools">Your tools</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className={s.navActions}>
          <Link className={s.login} href="/today">
            Login
          </Link>
          <GlassAction href="#start" enabled={enabled} primary>
            Launch your first agents
          </GlassAction>
          <button
            className={s.menuToggle}
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {menu && (
        <nav className={s.mobileNav} aria-label="Mobile navigation">
          {[
            { href: "#how-it-works", text: "How it works" },
            { href: "/catalog", text: "100+ missions" },
            { href: "#tools", text: "Your tools" },
            { href: "#pricing", text: "Pricing" },
          ].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMenu(false)}>
              {l.text}
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </nav>
      )}
      <main id="main">
        <div className={s.heroWrap} id="start">
          <Atmosphere enabled={enabled} />
          <WebsiteHero />
        </div>
        <section className={`${s.section} ${s.chapters}`} id="how-it-works">
          <div className={s.storyIntro}>
            <div className={s.sectionHeading}>
              <h2>
                You run the company.
                <br />
                Give the busywork a team.
              </h2>
              <p>
                One person or a growing business. Start with what you need.
                <br />
                Keep the expertise, lose a little of the overload.
              </p>
            </div>
            <Image
              className={s.storyImage}
              src="/brand/orbis-modules.png"
              width={1000}
              height={667}
              sizes="(max-width: 700px) 100vw, 45vw"
              alt="Blue architectural modules forming a company, with an orange glass cube."
            />
          </div>
          <div className={s.chapterStack}>
            {chapters.map((_, i) => (
              <Chapter key={i} index={i} enabled={enabled} />
            ))}
          </div>
        </section>
        <Setup enabled={enabled} />
        <ToolGraph enabled={enabled} />
        <section className={`${s.section} ${s.recapSection}`}>
          <div>
            <span className={s.quietLabel}>
              The daily rhythm we’re building
            </span>
            <h2>
              Less checking in.
              <br />
              More knowing where things stand.
            </h2>
            <p>
              A recap of completed work. A short list of decisions. A clear
              trail when you want the details.
            </p>
            <Link href="/today" className={s.inlineLink}>
              Explore your workspace <ArrowRight size={16} />
            </Link>
          </div>
          <div className={s.recap}>
            <div className={s.recapTop}>
              <Mark small />
              <span>Your daily brief</span>
              <small>Example</small>
            </div>
            <h3>
              Good morning.
              <br />
              Here’s what needs you.
            </h3>
            <div>
              <Check size={16} />
              <span>
                Customer replies prepared
                <small>Sources attached to each draft</small>
              </span>
            </div>
            <div>
              <Check size={16} />
              <span>
                Tomorrow’s meeting brief ready
                <small>Your context, in one place</small>
              </span>
            </div>
            <div className={s.decision}>
              <span>1</span>
              <p>
                A delivery date needs confirmation.
                <small>Your agent asks instead of guessing.</small>
              </p>
              <ArrowUpRight size={16} />
            </div>
            <small>
              Illustrative recap. Automatic daily delivery is not yet active.
            </small>
          </div>
        </section>
        <section className={s.section} id="pricing">
          <div className={s.sectionHeading}>
            <h2>A team that fits your company.</h2>
            <p>
              A platform subscription. Usage you can understand.
              <br />
              Bring your own services, or request a managed setup.
            </p>
            <small>
              Indicative pricing · final scope and availability confirmed before
              any subscription.
            </small>
          </div>
          <LandingPricing enabled={enabled} />
          <Link href="/pricing" className={s.pricingDetails}>
            See assumptions and estimate usage <ArrowRight size={15} />
          </Link>
        </section>
        <section className={`${s.section} ${s.faq}`}>
          <h2>A few things worth knowing.</h2>
          <div>
            {[
              {
                q: "Do I need to replace my tools?",
                a: "No. The goal is to work around your existing services. Choose your preferred tools in your plan. Each connector still needs its own verified access before an agent can use it.",
              },
              {
                q: "Will an agent act without asking?",
                a: "Not by default. Start in test mode, inspect the output and choose your boundaries. External execution requires a verified connector and an explicit policy; it is not enabled on this installation.",
              },
              {
                q: "What gets remembered?",
                a: "Approved corrections and instructions, with a defined scope. You can inspect that memory. Selecting a document folder does not make it accessible until permissions and synchronization have been verified.",
              },
              {
                q: "What can I use today?",
                a: "Website intake, guided audits, 100 mission contracts, source selection, and evaluated AI document runs with a configured provider. Self-serve OAuth, scheduled external execution and automatic daily recaps are still being built.",
              },
            ].map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <ChevronDown size={17} />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={s.finalCta}>
          <div className={s.ctaOrb}>
            <LiquidMark enabled={enabled} size={145} />
          </div>
          <h2>
            Your ambition.
            <br />A little more capacity.
          </h2>
          <p>Start with your company. Build the team around it.</p>
          <WebsiteHero compact />
          <Link href="/catalog">Or find your first mission</Link>
        </section>
      </main>
      <footer className={s.footer}>
        <div>
          <Link href="/" className={s.brand}>
            <Mark />
            Orbis
          </Link>
          <p>
            A bigger business.
            <br />
            Not a bigger team.
          </p>
        </div>
        <div>
          <span>Explore</span>
          <Link href="/catalog">Mission catalogue</Link>
          <Link href="/audit">Company audit</Link>
          <Link href="/pricing">Pricing & usage</Link>
        </div>
        <div>
          <span>Build with Orbis</span>
          <Link href="/audit?audience=integrator">For integrators</Link>
          <Link href="/connections">Tools & access</Link>
          <Link href="/today">Your workspace</Link>
        </div>
        <div className={s.footerBottom}>
          <span>© {new Date().getFullYear()} Orbis</span>
          <label className={s.motionPreference}>
            Motion{" "}
            <select
              aria-label="Motion preference"
              value={quiet ? "reduced" : "system"}
              onChange={(e) => setQuiet(e.target.value === "reduced")}
            >
              <option value="system">Automatic</option>
              <option value="reduced">Reduced</option>
            </select>
          </label>
        </div>
      </footer>
    </div>
  );
}
