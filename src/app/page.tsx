import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Layers3,
  LockKeyhole,
  Network,
  SlidersHorizontal,
} from "lucide-react";
import {
  LandingDemo,
  LandingNav,
  MemoryPreview,
} from "@/components/landing/LandingExperience";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Orbis — A bigger business. Not a bigger team.",
  description:
    "Explore a new way to delegate work. Modular AI missions, shared company context, and a human in control. Try the interactive Orbis prototype.",
};

const capabilities = [
  {
    title: "Customer replies",
    description:
      "Turn a request into a considered response. See what’s known, and what needs you.",
    icon: "↗",
    href: "/discover/request-analysis",
    color: "blue",
  },
  {
    title: "Research & briefs",
    description:
      "A clear point of view, the sources behind it, and the questions still open.",
    icon: "⌕",
    href: "/discover/research-brief",
    color: "purple",
  },
  {
    title: "Content creation",
    description:
      "From your expertise to a first draft. Keep the voice. Check the claims.",
    icon: "✳",
    href: "/discover/content-draft",
    color: "orange",
  },
  {
    title: "Meeting preparation",
    description:
      "The context, the right questions, and a useful brief before you walk in.",
    icon: "↔",
    href: "/discover/meeting-prep",
    color: "green",
  },
];

export default function LandingPage() {
  return (
    <div className={styles.landing}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <a className={styles.announcement} href="#vision">
              <span className={styles.statusDot} />
              Meet your company’s next chapter <ArrowRight size={14} />
            </a>
            <h1 id="hero-title">
              A bigger business.
              <br />
              Not a bigger team.
            </h1>
            <p>Give the work to Orbis. Keep the part that needs you.</p>
            <p className={styles.heroDescription}>
              A home for AI that understands your business.
              <br className={styles.desktopBreak} /> Start with one mission.
              Build your own way of working.
            </p>
            <div className={styles.heroActions}>
              <a href="#demo" className={styles.primary}>
                See Orbis in action <ArrowRight size={17} />
              </a>
              <Link href="/discover" className={styles.textLink}>
                Explore the workspace <ArrowRight size={16} />
              </Link>
            </div>
            <span className={styles.demoDisclaimer}>
              Interactive prototype. No account, no external actions.
            </span>
          </div>
          <LandingDemo />
          <div className={styles.heroBottom}>
            <span>One company. Many possibilities.</span>
            <a href="#missions">
              Find your first mission <ArrowDown size={14} />
            </a>
          </div>
        </section>

        <section
          id="missions"
          className={styles.missions}
          aria-labelledby="missions-title"
        >
          <div className={styles.sectionIntro}>
            <div>
              <span className={styles.sectionKicker}>Work, not workflows</span>
              <h2 id="missions-title">
                Start with what’s
                <br />
                on your plate.
              </h2>
            </div>
            <p>
              You don’t need a whole new way to work.
              <br />
              You need one less thing to do. Pick a mission,
              <br className={styles.desktopBreak} /> explore its output, and
              make it yours.
            </p>
          </div>
          <div className={styles.capabilityGrid}>
            {capabilities.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className={styles.capability}
              >
                <span
                  className={`${styles.capabilityIcon} ${styles[item.color]}`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className={styles.capabilityCta}>
                  Explore prototype
                  <ArrowRight size={16} />
                </span>
              </Link>
            ))}
          </div>
          <div className={styles.moreMissions}>
            <span>And the bigger picture?</span>
            <p>
              Lead generation. Quotes. Tender responses. Your own custom
              missions.
            </p>
            <span className={styles.roadmapTag}>On the roadmap</span>
          </div>
        </section>

        <section
          id="how-it-works"
          className={styles.process}
          aria-labelledby="process-title"
        >
          <div className={styles.processHeading}>
            <span className={styles.sectionKicker}>
              A simpler starting point
            </span>
            <h2 id="process-title">
              From “we should”
              <br />
              to “here’s the first draft.”
            </h2>
            <p>
              The experience we’re building: less configuring,
              <br />
              more useful work in front of you.
            </p>
            <Link href="/discover" className={styles.textLink}>
              Walk through the prototype <ArrowRight size={16} />
            </Link>
          </div>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber}>1</span>
              <div>
                <h3>Introduce your business.</h3>
                <p>
                  Your website or a few words. Review the company context before
                  it becomes the foundation.
                </p>
                <div className={styles.urlIllustration}>
                  <span className={styles.miniGlobe}>◎</span>your-company.com
                  <ArrowRight size={16} />
                </div>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber}>2</span>
              <div>
                <h3>Choose the work. Set the boundaries.</h3>
                <p>
                  Pick a mission, add your knowledge, and decide what the agent
                  can and cannot do.
                </p>
                <div className={styles.inlineTags}>
                  <span>
                    <FileText size={13} />
                    Your knowledge
                  </span>
                  <span>
                    <SlidersHorizontal size={13} />
                    Your instructions
                  </span>
                </div>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber}>3</span>
              <div>
                <h3>See it. Refine it. Then trust it.</h3>
                <p>
                  Inspect the result and its sources. Correct what matters
                  before considering any real action.
                </p>
                <div className={styles.reviewChip}>
                  <Check size={14} />A result you can actually review
                </div>
              </div>
            </li>
          </ol>
        </section>

        <section
          id="vision"
          className={styles.vision}
          aria-labelledby="vision-title"
        >
          <div className={styles.visionHeader}>
            <span className={styles.sectionKicker}>
              The platform we’re building
            </span>
            <h2 id="vision-title">
              Many missions.
              <br />
              One understanding of you.
            </h2>
            <p>
              Your business shouldn’t have to introduce itself to every new
              agent.
            </p>
          </div>
          <div className={styles.contextPanel}>
            <div className={styles.contextCopy}>
              <Layers3 size={24} />
              <h3>
                Your context.
                <br />A common foundation.
              </h3>
              <p>
                Your offers, your customers, your way of doing things. A shared
                foundation designed to make the next mission easier to start.
              </p>
              <span className={styles.futureLabel}>
                Product direction · shared, governed context
              </span>
            </div>
            <div className={styles.contextArt}>
              <Image
                src="/brand/orbis-modules.png"
                alt="Distinct blue architectural modules sharing one foundation"
                width={1536}
                height={1024}
                sizes="(max-width: 760px) 100vw, 65vw"
              />
              <div className={styles.artCaption}>
                <span>Customer care</span>
                <span>Research</span>
                <span>Content</span>
                <span>Your next mission</span>
              </div>
            </div>
          </div>
          <div className={styles.visionGrid}>
            <article className={styles.memoryPanel}>
              <div>
                <span className={styles.sectionKicker}>
                  A correction should count
                </span>
                <h3>
                  Less repeating yourself.
                  <br />
                  More getting it right.
                </h3>
                <p>
                  Explore how a correction could become a scoped rule. Not every
                  edit should become a company-wide instruction.
                </p>
              </div>
              <MemoryPreview />
            </article>
            <article className={styles.controlPanel}>
              <div>
                <span className={styles.sectionKicker}>
                  A clear line of control
                </span>
                <h3>
                  Your business.
                  <br />
                  Your final say.
                </h3>
                <p>
                  The intended contract: inspect what will happen, to whom, and
                  with which permissions. Autonomy earned through evidence.
                </p>
              </div>
              <div className={styles.permissionPreview}>
                <div className={styles.permissionHeader}>
                  <LockKeyhole size={17} />
                  <strong>Mission permissions</strong>
                  <span>Design preview</span>
                </div>
                <div>
                  <span>Read selected documents</span>
                  <span className={styles.permissionAllowed}>
                    <Check size={13} />
                    Allowed
                  </span>
                </div>
                <div>
                  <span>Prepare a reply</span>
                  <span className={styles.permissionAllowed}>
                    <Check size={13} />
                    Allowed
                  </span>
                </div>
                <div>
                  <span>Send to a customer</span>
                  <span className={styles.permissionAsk}>Ask me first</span>
                </div>
                <div>
                  <span>Change a contract</span>
                  <span className={styles.permissionBlocked}>Not allowed</span>
                </div>
              </div>
            </article>
          </div>
          <div className={styles.infrastructure}>
            <Network size={22} />
            <div>
              <h3>Your tools belong here, too.</h3>
              <p>
                Bring your models, connect your services, set your budget. The
                roadmap is an open platform, not another closed stack.
              </p>
            </div>
            <a href="#questions" className={styles.textLink}>
              What’s available today <ArrowRight size={16} />
            </a>
          </div>
        </section>

        <section
          id="questions"
          className={styles.faq}
          aria-labelledby="faq-title"
        >
          <div>
            <span className={styles.sectionKicker}>A few good questions</span>
            <h2 id="faq-title">
              Big ambition.
              <br />
              Clear answers.
            </h2>
            <p>
              What this version does.
              <br />
              And what we’re building next.
            </p>
          </div>
          <div className={styles.faqList}>
            {[
              [
                "Can I use Orbis for real work today?",
                "This version is an interactive prototype. The landing uses fictional examples, and the workspace currently uses simulated profiles, outputs and connections. It is here to let you explore and shape the experience, not to run your business unattended.",
              ],
              [
                "Do I have to adopt the whole platform?",
                "No. The product is designed around independent missions. Customer replies, research, content and meeting preparation have prototype flows. Quotes, lead generation and tender responses are part of the broader roadmap.",
              ],
              [
                "Can I connect my own AI and business tools?",
                "That is a core part of the vision: bring your own model credentials or use a managed option, with scoped service connections. Real OAuth, BYOK and usage billing are not operational in this prototype.",
              ],
              [
                "Will an agent send anything without me?",
                "The landing demo never sends anything or calls an AI provider. Its review and correction interactions run locally in your browser. Production-grade permissions, approval-bound execution and ongoing automation still need to be implemented and verified.",
              ],
              [
                "Where does the five-minute promise fit?",
                "A first useful result in under five minutes is a product goal, not a measured claim today. We want to earn that promise on real company data, including setup, context review and evaluation.",
              ],
            ].map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown size={18} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.ctaOrbit} aria-hidden="true" />
          <span>A little less on your plate.</span>
          <h2>
            A lot more
            <br />
            within your reach.
          </h2>
          <a href="#demo" className={styles.whiteButton}>
            Find your first mission <ArrowRight size={17} />
          </a>
          <p>Explore the interactive prototype. Nothing gets sent.</p>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.brandMark} aria-hidden="true" />
          Orbis
        </Link>
        <span>Built around your business.</span>
        <div>
          <a href="#missions">Missions</a>
          <a href="#questions">Prototype status</a>
          <Link href="/discover">
            Open workspace <ArrowRight size={14} />
          </Link>
        </div>
        <small>© 2026 Orbis · Product prototype</small>
      </footer>
    </div>
  );
}
