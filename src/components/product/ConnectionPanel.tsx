"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Search,
  ShieldCheck,
  Plug,
  Building2,
  Clapperboard,
  MessagesSquare,
} from "lucide-react";
import { integrations, integrationCategories, type IntegrationSlug } from "@/lib/integrations/catalog";
import {
  solutions,
  solutionReadiness,
  requirementStatus,
  toolDetails,
  administratorSetup,
  type ConnectionState,
} from "@/lib/integrations/solutions";
import s from "./workspace.module.css";
import c from "./connections.module.css";
import { ToolLogo } from "./ToolLogo";
import { MissionFlow } from "./MissionFlow";

const labels: Record<ConnectionState, string> = {
  connected: "Account active",
  needs_auth: "Reconnect account",
  not_connected: "Not connected",
  not_configured: "Discoverable · setup required",
  unverified: "Not yet checked",
  error: "Could not verify",
};
const icons = [Building2, Clapperboard, MessagesSquare];
// The host must derive this flag from its server-side authorization context.
export function ConnectionPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [configured, setConfigured] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<
    Partial<Record<IntegrationSlug, ConnectionState>>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("customers");
  const [availability, setAvailability] = useState("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All tools");
  const [checked, setChecked] = useState("");
  const [details, setDetails] = useState<IntegrationSlug | null>(null);
  const solution = solutions.find((item) => item.id === selected)!;
  const readiness = solutionReadiness(solution.requirements, statuses);
  async function refresh(signal?: AbortSignal) {
    try {
      const response = await fetch("/api/v1/integrations", {
        method: "POST",
        signal,
      });
      if (!response.ok)
        throw new Error("Could not verify your tools. Try again.");
      const body = await response.json();
      if (signal?.aborted) return;
      setConfigured(
        body.items
          .filter((i: { configured: boolean }) => i.configured)
          .map((i: { slug: string }) => i.slug),
      );
      setStatuses(
        Object.fromEntries(
          body.items.map((i: { slug: string; status: string }) => [
            i.slug,
            i.status,
          ]),
        ),
      );
      setChecked(body.checkedAt);
    } catch (e) {
      if (!signal?.aborted) {
        setStatuses({});
        setConfigured([]);
        setChecked("");
        setError(e instanceof Error ? e.message : "Please try again.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);
  async function connect(slug: IntegrationSlug) {
    setBusy(slug);
    setError("");
    try {
      const response = await fetch(`/api/v1/connections/${slug}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Connection failed.");
      window.location.assign(result.redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }
  const filtered = integrations.filter((item) => {
    const detail = toolDetails[item.slug];
    return (
      (category === "All tools" || category === detail.category) &&
      (availability === "all" || (availability === "configured" ? configured.includes(item.slug) : statuses[item.slug] === "connected")) &&
      `${item.name} ${item.purpose} ${detail.unlocks.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase().trim())
    );
  });
  return (
    <>
      <section className={c.intro} aria-labelledby="connect-outcome">
        <div>
          <span className={c.eyebrow}>A connected company. Less busywork.</span>
          <h2 id="connect-outcome">
            What would you like to take off your plate?
          </h2>
          <p>Start with the work. Bring the tools you already use.</p>
        </div>
        <div className={c.solutions}>
          {solutions.map((item, index) => {
            const Icon = icons[index % icons.length];
            return (
              <button
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
              >
                <Icon size={22} />
                <strong>{item.name}</strong>
                <span>{item.outcome}</span>
                <span className={c.choose}>
                  {selected === item.id
                    ? "Your connection plan"
                    : "See the connection plan"}{" "}
                  <ArrowUpRight size={15} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <MissionFlow kind={selected} />
      <section className={c.plan} aria-labelledby="connection-plan">
        <div className={c.planHead}>
          <div>
            <span className={c.eyebrow}>Your connection plan</span>
            <h2 id="connection-plan">{solution.name}</h2>
          </div>
          <span className={s.badge} role="status">
            {loading
              ? "Checking connections…"
              : `${readiness.connected} of ${readiness.total} core tool needs connected`}
          </span>
        </div>
        {solution.requirements.map((requirement) => {
          const ready = requirementStatus(requirement, statuses);
          return (
            <div className={c.requirement} key={requirement.label}>
              <span className={ready.satisfied ? c.done : c.dot}>
                {ready.satisfied ? <Check size={17} /> : <Plug size={17} />}
              </span>
              <div>
                <strong>
                  {requirement.label}{" "}
                  {requirement.optional && <small>Optional</small>}
                </strong>
                <p>{requirement.description}</p>
              </div>
              <div className={c.alternatives}>
                {requirement.alternatives.map((slug, index) => (
                  <span key={slug}>
                    {index > 0 && <small>or</small>}
                    <a
                      href={`#tool-${slug}`}
                      onClick={() => {
                        setQuery("");
                        setCategory("All tools");
                        setAvailability("all");
                        setDetails(slug);
                      }}
                    >
                      {integrations.find((i) => i.slug === slug)!.name}
                      {statuses[slug] === "connected" && <Check size={13} />}
                    </a>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {solution.specialist && (
          <p className={c.specialist}>{solution.specialist}</p>
        )}
        <div className={c.planFoot}>
          <p>
            {readiness.connectionsReady
              ? "Core tools connected. Next, define scope and approve how the mission can act."
              : "Choose one tool per need. You do not need to change your whole stack."}
          </p>
          <Link href={solution.href} className={s.primary}>
            Set up this mission <ArrowUpRight size={16} />
          </Link>
        </div>
      </section>
      <div className={c.libraryHead}>
        <div>
          <h2>Your tools, working together.</h2>
          <p>{integrations.length} tools to discover. Availability depends on your workspace configuration.</p>
        </div>
        <button
          className={s.secondary}
          disabled={loading || busy !== null}
          onClick={() => {
            setLoading(true);
            setError("");
            void refresh();
          }}
        >
          {loading ? "Checking…" : "Refresh connections"}
        </button>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div className={c.search}>
        <Search size={19} />
        <input
          aria-label="Search integrations"
          placeholder="Search a tool or what you want to do…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={s.tabs} aria-label="Integration categories">
        {["All tools", ...integrationCategories].map((name) => (
          <button
            key={name}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <label className={c.availability}>
        Show
        <select aria-label="Integration availability" value={availability} onChange={(e) => setAvailability(e.target.value)}>
          <option value="all">All discoverable tools</option>
          <option value="configured">Configured in this workspace</option>
          <option value="connected">Active accounts</option>
        </select>
        <span role="status">{filtered.length} tools</span>
      </label>
      <div className={s.grid}>
        {filtered.map((item) => {
          const state = statuses[item.slug] ?? "unverified",
            detail = toolDetails[item.slug];
          return (
            <article
              id={`tool-${item.slug}`}
              className={c.tool}
              key={item.slug}
            >
              <div className={c.toolHead}>
                <span className={c.monogram} aria-hidden="true">
                  <ToolLogo tool={item.slug} />
                </span>
                <div>
                  <h3>{item.name}</h3>
                  <small>{detail.category}</small>
                </div>
                <span
                  className={state === "connected" ? c.connected : c.status}
                >
                  {loading ? "Checking…" : labels[state]}
                </span>
              </div>
              <p>{item.purpose}</p>
              <ul>
                {detail.unlocks.map((unlock) => (
                  <li key={unlock}>
                    <Check size={14} />
                    {unlock}
                  </li>
                ))}
              </ul>
              <div className={c.toolActions}>
                <button
                  disabled={
                    loading ||
                    !configured.includes(item.slug) ||
                    busy !== null ||
                    state === "connected"
                  }
                  className={state === "connected" ? s.secondary : s.primary}
                  onClick={() => void connect(item.slug)}
                >
                  {busy === item.slug
                    ? "Opening sign-in…"
                    : state === "connected"
                      ? "Connected"
                      : state === "needs_auth"
                        ? "Reconnect"
                        : "Connect account"}
                </button>
                <button
                  className={c.textButton}
                  aria-expanded={details === item.slug}
                  onClick={() =>
                    setDetails(details === item.slug ? null : item.slug)
                  }
                >
                  Access & scope
                </button>
              </div>
              {details === item.slug && (
                <div className={c.access}>
                  <ShieldCheck size={19} />
                  <div>
                    <p>{detail.boundary}</p>
                    <p>Permissions shown here are informational. {state === "connected" ? "Composio reports an active account; granted scopes and action permissions have not been verified." : "Account access and granted scopes have not been verified."}</p>
                    {detail.category === "Knowledge" && (
                      <Link href="/knowledge/scopes">
                        Choose knowledge scope →
                      </Link>
                    )}
                    {isAdmin && !loading && !configured.includes(item.slug) && (
                      <p>
                        {administratorSetup(item.slug)}
                      </p>
                    )}
                    <p>
                      Review the exact permissions on the provider’s consent
                      screen. Orbis never asks you to paste passwords here.
                    </p>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className={s.empty}>
          <h2>No tools match this search</h2>
          <p>Try the tool name, or start with the work you need done.</p>
          <button
            className={s.secondary}
            onClick={() => {
              setQuery("");
              setCategory("All tools");
              setAvailability("all");
            }}
          >
            Reset filters
          </button>
        </div>
      )}
      <div className={c.footer}>
        <ShieldCheck size={20} />
        <p>
          Account access is not permission to send, publish or spend. Each
          mission has its own scope and approval rules.
        </p>
      </div>
      {checked && (
        <p className="text-xs">
          Last check:{" "}
          {new Date(checked).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          . Refresh after changing account access.
        </p>
      )}
    </>
  );
}
