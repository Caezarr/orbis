"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  FileText,
  Mail,
  Menu,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import styles from "@/app/landing.module.css";

const scenarios = [
  {
    id: "reply",
    label: "Reply to a customer",
    short: "Customer care",
    icon: Mail,
    source: "New customer request",
    sender: "Camille at Atelier Nord",
    time: "Today, 9:41",
    input:
      "We’re opening a second studio. Can you help us onboard 12 people next month? And do you offer support on weekends?",
    title: "A thoughtful reply. Not a guess.",
    subject: "Your second studio, covered.",
    body: "Hi Camille,\n\nWe can prepare onboarding for your team of 12, with a dedicated setup session and a shared getting-started guide.\n\nWeekend support isn’t included in the service catalogue. I’ll confirm the options with our team before making a commitment.\n\nCould you share your preferred launch date?",
    filename: "customer-reply.txt",
    sources: [
      "Service catalogue · Onboarding includes a setup session and guide.",
      "Customer request · 12 people; next month; weekend support requested.",
    ],
    check: "Weekend availability needs your confirmation",
    badge: "Reply prepared",
    detail: "The missing detail stays visible. No invented promise.",
    action: "Approve preview",
  },
  {
    id: "brief",
    label: "Prepare a meeting",
    short: "Meeting preparation",
    icon: FileText,
    source: "Upcoming conversation",
    sender: "Atelier Nord · Expansion call",
    time: "Tomorrow, 10:00",
    input:
      "Prepare our conversation about their second studio. Pull together the confirmed needs, open questions, and a useful agenda.",
    title: "Walk in with the whole picture.",
    subject: "Atelier Nord / Expansion brief",
    body: "The context\nA second studio. A 12-person team. A target launch next month.\n\nWhat to cover\n1. Confirm the opening date and onboarding owner.\n2. Map the new team’s setup and training needs.\n3. Discuss support expectations before quoting.\n\nStill to confirm\nExact launch date, budget and weekend coverage.",
    filename: "meeting-brief.txt",
    sources: [
      "Customer request · Second studio, 12 people, target next month.",
      "Meeting note · Expansion call; no budget confirmed yet.",
    ],
    check: "Three open questions carried into the agenda",
    badge: "Brief prepared",
    detail: "Known facts, useful questions, and no made-up context.",
    action: "Keep this brief",
  },
  {
    id: "content",
    label: "Create a first draft",
    short: "Content creation",
    icon: Sparkles,
    source: "A little expertise to share",
    sender: "Your content brief",
    time: "Ready when you are",
    input:
      "Write a short LinkedIn post about opening a second location. Keep it practical and human. No inflated numbers or sales pitch.",
    title: "Your expertise. A head start.",
    subject: "A second location isn’t a copy-paste.",
    body: "The first space teaches you how to work.\nThe second asks whether that knowledge can travel.\n\nBefore opening the doors, write down three things:\n• Who owns each part of onboarding.\n• Where the team finds the answers.\n• What happens when something falls outside the plan.\n\nA good launch starts before launch day.",
    filename: "content-draft.txt",
    sources: [
      "Writing guide · Practical, human, concise. Avoid promotional claims.",
      "Content brief · Opening a second location; no statistics requested.",
    ],
    check: "No unsupported statistics added",
    badge: "Draft prepared",
    detail: "A useful starting point, shaped around a clear writing brief.",
    action: "Keep this draft",
  },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <header
      className={styles.header}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <Link href="/" className={styles.wordmark} aria-label="Orbis home">
        <span className={styles.brandMark} aria-hidden="true" />
        Orbis
      </Link>
      <nav className={styles.desktopNav} aria-label="Main navigation">
        <Link href="/catalog">100 business cases</Link>
        <a href="#how-it-works">How it works</a>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <div className={styles.navActions}>
        <Link href="/audit" className={styles.navCta}>
          Find my first workflow <ArrowRight size={15} />
        </Link>
        <button
          ref={buttonRef}
          className={styles.menuButton}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="landing-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
      {open && (
        <nav
          id="landing-navigation"
          aria-label="Mobile navigation"
          className={styles.mobileNav}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
        >
          <a href="#missions" onClick={() => setOpen(false)}>
            What you can do
          </a>
          <a href="#how-it-works" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a href="#vision" onClick={() => setOpen(false)}>
            The bigger picture
          </a>
          <a href="#questions" onClick={() => setOpen(false)}>
            Questions & capabilities
          </a>
        </nav>
      )}
    </header>
  );
}

export function LandingDemo() {
  const [selected, setSelected] = useState(0);
  const [approved, setApproved] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const scenario = scenarios[selected];
  const Icon = scenario.icon;
  function select(index: number) {
    setSelected(index);
    setApproved(false);
    setShowSources(false);
    setDownloaded(false);
  }
  function download() {
    const text = `Orbis — fictional demonstration\n${scenario.subject}\n\n${scenario.body}\n\nExample sources:\n${scenario.sources.join("\n")}\n\n${scenario.check}\nNo external action was performed.`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = scenario.filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  }
  return (
    <div id="demo" className={styles.demoSection}>
      <div
        className={styles.scenarioTabs}
        role="tablist"
        aria-label="Explore a mission"
      >
        {scenarios.map((item, index) => (
          <button
            type="button"
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            aria-selected={selected === index}
            aria-controls="mission-preview"
            tabIndex={selected === index ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => {
              let next: number | undefined;
              if (event.key === "ArrowRight")
                next = (index + 1) % scenarios.length;
              if (event.key === "ArrowLeft")
                next = (index + scenarios.length - 1) % scenarios.length;
              if (event.key === "Home") next = 0;
              if (event.key === "End") next = scenarios.length - 1;
              if (next !== undefined) {
                event.preventDefault();
                select(next);
                document.getElementById(`tab-${scenarios[next].id}`)?.focus();
              }
            }}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="mission-preview"
        role="tabpanel"
        aria-labelledby={`tab-${scenario.id}`}
        tabIndex={0}
        className={styles.demoStage}
      >
        <div className={styles.stageChrome}>
          <span>
            <span className={styles.smallMark} aria-hidden="true" />
            Orbis <ChevronRight size={12} />
            <span>Your workspace</span>
          </span>
          <span className={styles.prototypeBadge}>Interactive demo</span>
        </div>
        <div className={styles.stageBody}>
          <aside className={styles.requestPane}>
            <div className={styles.paneLabel}>
              <Icon size={15} />
              {scenario.short}
            </div>
            <div className={styles.requestCard} key={`input-${scenario.id}`}>
              <div className={styles.requestTop}>
                <span className={styles.senderAvatar}>AN</span>
                <div>
                  <strong>{scenario.sender}</strong>
                  <span>{scenario.time}</span>
                </div>
              </div>
              <h3>{scenario.source}</h3>
              <p>{scenario.input}</p>
              <span className={styles.sourceAttachment}>
                <FileText size={13} />
                Company context attached
              </span>
            </div>
            <div className={styles.agentPath}>
              <span className={styles.pathLine} />
              <span className={styles.agentOrb} aria-hidden="true">
                ◎
              </span>
              <div>
                <strong>Context in. Useful work out.</strong>
                <span>Read · Prepare · Check</span>
              </div>
            </div>
            <div className={styles.fictionNote}>
              Fictional company & sample output.
              <br />
              No model call or external connection.
            </div>
          </aside>
          <div className={styles.resultPane} key={`output-${scenario.id}`}>
            <div className={styles.resultHeading}>
              <span className={styles.readyPill}>
                <Check size={12} />
                {scenario.badge}
              </span>
              <span>Ready for your review</span>
            </div>
            <h3>{scenario.title}</h3>
            <article className={styles.document}>
              <div className={styles.documentTop}>
                <FileText size={15} />
                <span>{scenario.filename}</span>
                <button
                  type="button"
                  onClick={download}
                  aria-label="Download sample result"
                  title="Download sample result"
                >
                  <Download size={15} />
                </button>
              </div>
              <div className={styles.documentBody}>
                <h4>{scenario.subject}</h4>
                <p>{scenario.body}</p>
              </div>
              <div className={styles.documentBottom}>
                <button
                  type="button"
                  aria-expanded={showSources}
                  aria-controls="demo-sources"
                  onClick={() => setShowSources(!showSources)}
                >
                  <FileText size={13} />2 example sources{" "}
                  <ChevronRight size={13} />
                </button>
                <span>Draft · Not sent</span>
              </div>
              {showSources && (
                <ul id="demo-sources" className={styles.sourceList}>
                  {scenario.sources.map((source) => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              )}
            </article>
            <div className={styles.checkNote}>
              <ShieldCheck size={16} />
              <span>{scenario.check}</span>
            </div>
            <div className={styles.reviewBar}>
              <span role="status">
                {approved
                  ? "Preview approved. Nothing was sent."
                  : downloaded
                    ? "Sample downloaded."
                    : scenario.detail}
              </span>
              <button
                type="button"
                className={
                  approved ? styles.approvedButton : styles.approveButton
                }
                onClick={() => setApproved(!approved)}
              >
                {approved ? (
                  <>
                    <RotateCcw size={14} />
                    Reset preview
                  </>
                ) : (
                  <>
                    {scenario.action}
                    <Check size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        <div className={styles.stageFooter}>
          <span>
            <ShieldCheck size={12} />
            You’re in a sandbox. Every action stays here.
          </span>
          <span>Made for the way your business works.</span>
        </div>
      </div>
    </div>
  );
}

export function MemoryPreview() {
  const [scope, setScope] = useState("customer");
  const [saved, setSaved] = useState(false);
  return (
    <div className={styles.memoryPreview}>
      <div className={styles.correctionBubble}>
        “For Atelier Nord, always use their studio name, not ‘your branch’.”
      </div>
      <div className={styles.memoryRule}>
        <span className={styles.smallMark} aria-hidden="true" />
        <div>
          <strong>A little context for next time.</strong>
          <p>Where should this correction apply?</p>
          <fieldset>
            <legend className={styles.srOnly}>Correction scope</legend>
            <label>
              <input
                type="radio"
                name="memory-scope"
                value="customer"
                checked={scope === "customer"}
                onChange={() => {
                  setScope("customer");
                  setSaved(false);
                }}
              />
              This customer
            </label>
            <label>
              <input
                type="radio"
                name="memory-scope"
                value="company"
                checked={scope === "company"}
                onChange={() => {
                  setScope("company");
                  setSaved(false);
                }}
              />
              All missions
            </label>
          </fieldset>
          <button type="button" onClick={() => setSaved(!saved)}>
            {saved ? (
              <>
                <Check size={13} />
                Preview saved · Undo
              </>
            ) : (
              <>
                Preview this rule <ArrowRight size={13} />
              </>
            )}
          </button>
          <span role="status" className={styles.memoryStatus}>
            {saved
              ? `Example rule scoped to ${scope === "customer" ? "Atelier Nord" : "all missions"}.`
              : "Illustration only. Not saved to your workspace."}
          </span>
        </div>
      </div>
    </div>
  );
}
