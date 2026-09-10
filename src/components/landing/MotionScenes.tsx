"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Check,
  Mail,
  FileText,
  Search,
  ChevronRight,
} from "lucide-react";
import { LiquidMark, useVisibleMotion } from "./Optics";
import { LandingCta } from "./LandingCta";
import { businessMonthly } from "@/lib/product/pricing";
import v from "./motion-scenes.module.css";

function useCycle(active: boolean, length: number, duration: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % length),
      duration,
    );
    return () => clearInterval(timer);
  }, [active, length, duration]);
  return index;
}
const jobs = [
  {
    input: "Reply to a customer",
    output: "Customer reply prepared",
    detail: "Tone checked · sources attached",
    Icon: Mail,
  },
  {
    input: "Prepare a quote",
    output: "Quote ready for review",
    detail: "Approved pricing · scope included",
    Icon: FileText,
  },
  {
    input: "Research a prospect",
    output: "Prospect brief prepared",
    detail: "Company context · evidence linked",
    Icon: Search,
  },
];
export function TaskWorkshop({ enabled }: { enabled: boolean }) {
  const { ref, active } = useVisibleMotion(enabled);
  const index = useCycle(active, jobs.length, 7600);
  const job = jobs[index];
  return (
    <div
      ref={ref}
      className={v.workshop}
      data-active={active}
      aria-label={`Illustration: ${job.input} becomes ${job.output}`}
    >
      <div className={v.workshopTop}>
        <span>One mission, end to end</span>
        <span>0{index + 1} / 03</span>
      </div>
      <div className={v.workshopStage} key={index}>
        <div className={v.inputCard}>
          <job.Icon size={17} />
          <span>{job.input}</span>
          <ChevronRight size={13} />
        </div>
        <div className={v.track} />
        <div className={v.trackOut} />
        <div className={v.portal}>
          <div className={v.portalBack} />
          <div className={v.portalFace}>
            <span className={v.portalMark} />
            <span className={v.scan} />
          </div>
          <div className={v.portalEdge} />
          <div className={v.portalFloor} />
        </div>
        <div className={v.working}>
          Read <span /> Prepare <span /> Check
        </div>
        <div className={v.outputCard}>
          <span>
            <Check size={14} />
          </span>
          <div>
            <strong>{job.output}</strong>
            <small>{job.detail}</small>
          </div>
        </div>
      </div>
      <div className={v.workshopBottom}>
        <span />
        Same task in. A useful result out.
      </div>
    </div>
  );
}
const nodes = Array.from({ length: 30 }, (_, i) => {
  const angle = i * 2.399963;
  const radius = 35 + Math.sqrt(i + 1) * 20;
  return {
    x: 215 + Math.cos(angle) * radius * 1.24,
    y: 128 + Math.sin(angle) * radius * 0.77,
    parent: i < 6 ? -1 : Math.floor((i - 6) / 2),
    group: i % 4,
  };
});
const weeks = [
  {
    week: 1,
    count: 6,
    title: "Your business, understood.",
    note: "Offers, clients and the way you work.",
  },
  {
    week: 3,
    count: 16,
    title: "Your feedback, connected.",
    note: "Approved corrections link to the right missions.",
  },
  {
    week: 5,
    count: 30,
    title: "Your expertise, compounded.",
    note: "More relevant context for the next task.",
  },
];
export function KnowledgeGrowth({ enabled }: { enabled: boolean }) {
  const { ref, active } = useVisibleMotion(enabled);
  const automatic = useCycle(active, 3, 5000);
  const [chosen, setChosen] = useState<number | null>(null);
  const index = chosen ?? automatic,
    week = weeks[index];
  return (
    <div ref={ref} className={v.knowledge}>
      <div className={v.weekSelector} aria-label="Illustrative memory growth">
        {weeks.map((w, i) => (
          <button
            key={w.week}
            aria-pressed={i === index}
            onClick={() => setChosen(i)}
          >
            Week {w.week}
            <span />
          </button>
        ))}
      </div>
      <svg
        className={v.knowledgeSvg}
        viewBox="0 0 430 256"
        role="img"
        aria-label={`Week ${week.week}: ${week.count} illustrative knowledge connections`}
      >
        <defs>
          <radialGradient id="knowledge-halo">
            <stop stopColor="#b7cff8" stopOpacity=".3" />
            <stop offset="1" stopColor="#b7cff8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="215" cy="128" r="124" fill="url(#knowledge-halo)" />
        {nodes.slice(0, week.count).map((n, i) => {
          const p = n.parent < 0 ? { x: 215, y: 128 } : nodes[n.parent];
          return (
            <g
              key={i}
              className={v.knowledgeNode}
              style={{ "--delay": `${(i % 10) * 50}ms` } as CSSProperties}
            >
              <path
                d={`M${p.x} ${p.y} L${n.x} ${n.y}`}
                stroke={n.group === 0 ? "#789dde" : "#c1d3ec"}
                strokeWidth={n.group === 0 ? 1.4 : 0.8}
              />
              <circle
                cx={n.x}
                cy={n.y}
                r={i < 6 ? 5 : 3.2}
                fill={["#315ee8", "#88a7d8", "#78b5ad", "#abc0e4"][n.group]}
              />
              <title>
                {
                  [
                    "Client context",
                    "Approved instruction",
                    "Mission experience",
                    "Source knowledge",
                  ][n.group]
                }
              </title>
            </g>
          );
        })}
        <circle cx="215" cy="128" r="20" fill="#fff" stroke="#b9ccec" />
        <circle
          cx="215"
          cy="128"
          r="11"
          fill="none"
          stroke="#315ee8"
          strokeWidth="4"
        />
        <circle
          cx="225"
          cy="118"
          r="3"
          fill="#315ee8"
          stroke="#fff"
          strokeWidth="2"
        />
        <text x="215" y="164" textAnchor="middle" fill="#6a81a5" fontSize="9">
          Your company
        </text>
      </svg>
      <div className={v.memoryLegend}>
        <span>Knowledge</span>
        <span>Experience</span>
        <span>Approved rules</span>
      </div>
      <div className={v.memoryExplanation}>
        <strong>{week.title}</strong>
        <p>{week.note}</p>
      </div>
      <small className={v.caption}>
        Your knowledge. Your feedback. Your agents, getting better.
      </small>
    </div>
  );
}

const stages = [
  {
    name: "Understand",
    title: "Start with your website.",
    text: "Orbis learns the context of your business. You confirm what you do, who you help, and the work you want to delegate.",
    note: "No website? Tell us in your own words.",
  },
  {
    name: "Connect",
    title: "Your tools. Now working together.",
    text: "Choose the right missions. Connect your services and select the exact knowledge your agents can use.",
    note: "Your access stays scoped to the work you choose.",
  },
  {
    name: "Delegate",
    title: "Work prepared. You stay in control.",
    text: "Test the result, check the sources, and refine the way your agent works. Build towards a daily brief of completed work and decisions that need you.",
    note: "Review the work. Keep control of every decision.",
  },
];
export function ScrollSetup({ enabled }: { enabled: boolean }) {
  const section = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!section.current) return;
      const rows = [
        ...section.current.querySelectorAll<HTMLElement>("[data-setup-stage]"),
      ];
      let closest = 0,
        distance = Infinity;
      rows.forEach((row, i) => {
        const d = Math.abs(row.getBoundingClientRect().top - innerHeight * 0.3);
        if (d < distance) {
          distance = d;
          closest = i;
        }
      });
      setStep(closest);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  function jump(index: number) {
    if (!section.current) return;
    const row =
      section.current.querySelectorAll<HTMLElement>("[data-setup-stage]")[
        index
      ];
    if (row)
      window.scrollTo({
        top: row.getBoundingClientRect().top + scrollY - 120,
        behavior: enabled ? "smooth" : "instant",
      });
  }
  return (
    <section ref={section} className={v.setupScroll} id="setup">
      <div className={v.setupSticky}>
        <header>
          <h2>Your company is the starting point.</h2>
          <p>
            A simple conversation. A clear mission. A first result to review.
          </p>
        </header>
        <div className={v.setupBody}>
          <nav aria-label="Setup progress" className={v.stageNav}>
            {stages.map((stage, i) => (
              <button
                key={stage.name}
                onClick={() => jump(i)}
                aria-current={i === step ? "step" : undefined}
              >
                <small>0{i + 1}</small>
                {stage.name}
                <ArrowUpRight size={16} />
                <i
                  style={{
                    transform: `scaleX(${i < step ? 1 : i === step ? 0.5 : 0})`,
                  }}
                />
              </button>
            ))}
          </nav>
          <div className={v.stageDeck}>
            {stages.map((stage, i) => (
              <div
                key={stage.name}
                className={v.setupSlide}
                data-selected={step === i}
                data-setup-stage={i}
              >
                <div className={v.stageCopy}>
                  <h3>{stage.title}</h3>
                  <p>{stage.text}</p>
                  <small>{stage.note}</small>
                  <LandingCta
                    href={i === 1 ? "/catalog" : "/audit"}
                    enabled={enabled}
                  >
                    {i === 1 ? "Find my missions" : "Launch your first agents"}
                  </LandingCta>
                </div>
                <div className={v.stageArt}>
                  {i === 1 ? (
                    <div className={v.preparedTools}>
                      {[
                        { src: "gmail", name: "Gmail" },
                        { src: "microsoftoutlook", name: "Outlook" },
                        { src: "hubspot", name: "HubSpot" },
                        { src: "salesforce", name: "Salesforce" },
                      ].map((t) => (
                        <div key={t.src}>
                          <LiquidMark
                            enabled={enabled}
                            running={step === i}
                            src={`/brand/tools/${t.src}.svg`}
                            size={100}
                          />
                          <small>{t.name}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <LiquidMark
                      enabled={enabled}
                      running={step === i}
                      src={
                        i === 2
                          ? "/brand/time-off.svg"
                          : "/brand/orbis-mark.svg"
                      }
                      size={250}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
const results = [
  { text: "Customer reply prepared", tool: "Gmail", left: "18%", top: "42%" },
  { text: "Quote ready for review", tool: "HubSpot", left: "57%", top: "24%" },
  { text: "Account brief ready", tool: "Salesforce", left: "68%", top: "55%" },
  { text: "Knowledge organized", tool: "Notion", left: "20%", top: "64%" },
  { text: "Meeting brief prepared", tool: "Outlook", left: "47%", top: "76%" },
  { text: "Sources checked", tool: "Drive", left: "64%", top: "38%" },
];
export function GraphResult({ enabled }: { enabled: boolean }) {
  const { ref, active } = useVisibleMotion(enabled);
  const index = useCycle(active, results.length, 4600);
  const result = results[index];
  return (
    <div ref={ref} className={v.resultBounds}>
      <div
        key={index}
        className={v.graphResult}
        data-active={active}
        style={{ "--left": result.left, "--top": result.top } as CSSProperties}
      >
        <span>
          <Check size={13} />
        </span>
        <div>
          <strong>{result.text}</strong>
          <small>{result.tool} · ready for you</small>
        </div>
      </div>
    </div>
  );
}

export function LandingPricing({ enabled }: { enabled: boolean }) {
  const [seats, setSeats] = useState(5);
  const business = businessMonthly(seats);
  return (
    <div className={v.priceGrid}>
      {[
        {
          name: "Solo",
          audience: "One person. More capacity.",
          price: "€149",
          unit: "/ month",
          copy: "Your first missions, with your own expertise.",
          cta: "Launch your first agents",
          href: "/audit",
          features: [
            "One operator",
            "100 mission contracts",
            "Context and approved memory",
          ],
        },
        {
          name: "Business",
          audience: "Your team, working as one.",
          price: `€${business}`,
          unit: "/ month",
          copy: "Choose the people who work with your agents.",
          cta: "Launch your first agents",
          href: `/audit?seats=${seats}`,
          features: [
            "5 seats included in the proposed base",
            "€39 / additional seat / month proposed",
            "Usage and deployment scoped separately",
          ],
        },
        {
          name: "Partner",
          audience: "Your clients. Your expertise.",
          price: "Let’s talk.",
          unit: "",
          copy: "Design the right setup for the companies you help.",
          cta: "Discuss my setup",
          href: "/audit?audience=integrator",
          features: [
            "Client deployment plans",
            "Reusable mission configurations",
            "Commercial terms tailored together",
          ],
        },
      ].map((plan, i) => (
        <article
          className={v.priceCard}
          data-featured={i === 1}
          key={plan.name}
        >
          <small>{plan.audience}</small>
          <h3>{plan.name}</h3>
          <div
            className={v.priceValue}
            aria-live={i === 1 ? "polite" : undefined}
          >
            {plan.price}
            <small>{plan.unit}</small>
          </div>
          <p>{plan.copy}</p>
          {i === 1 ? (
            <label className={v.seats}>
              <span>Team seats</span>
              <select
                aria-label="Business seats"
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
              >
                {[1, 2, 3, 5, 10, 15, 20, 30, 50].map((n) => (
                  <option value={n} key={n}>
                    {n} {n === 1 ? "seat" : "seats"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className={v.planScope}>
              {i === 0
                ? "Built for a one-person company"
                : "A setup shaped around your clients"}
            </div>
          )}
          <LandingCta
            href={plan.href}
            enabled={enabled}
            variant={i === 1 ? "primary" : "light"}
          >
            {plan.cta}
          </LandingCta>
          <ul>
            {plan.features.map((f) => (
              <li key={f}>
                <Check size={13} />
                {f}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
