"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Orbi } from "@/components/product/Orbi";
import {
  ArrowUpRight,
  Mail,
  FileText,
  Search,
  CalendarDays,
  House,
  Clapperboard,
} from "lucide-react";
import { suggestMissions } from "@/lib/product/conversation";
import { businessWorkflows } from "@/lib/workflows/blueprints";
import s from "@/components/product/workspace.module.css";

const templates = [
  {
    title: "Manage my rental properties",
    text: "I manage apartments on Airbnb and Booking through Hostaway. Help me coordinate guests, arrivals and cleaning.",
    icon: House,
  },
  {
    title: "Build my content team",
    text: "I am a content creator. Help me turn my expertise into original content, produce the assets and improve with feedback.",
    icon: Clapperboard,
  },
  {
    title: "Handle customer requests",
    text: "Help me analyse customer requests and prepare clear replies.",
    icon: Mail,
  },
  {
    title: "Prepare a quote",
    text: "Préparer des devis à partir des demandes clients et de notre catalogue de prix.",
    icon: FileText,
  },
  {
    title: "Research a topic",
    text: "Faire une veille et une recherche sourcée sur mes concurrents.",
    icon: Search,
  },
  {
    title: "Prepare my meetings",
    text: "Préparer mes réunions avec le contexte client et les points à aborder.",
    icon: CalendarDays,
  },
];
export default function ChatPage() {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = JSON.parse(
          sessionStorage.getItem("orbis:conversation") ?? "[]",
        );
        if (Array.isArray(stored) && stored.every((m) => typeof m === "string"))
          setMessages(stored.slice(-30).map((m) => m.slice(0, 4000)));
      } catch {
        /* A restricted browser can still use the conversation. */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim().length < 8) return;
    const next = [...messages, value.trim()].slice(-30);
    setMessages(next);
    try {
      sessionStorage.setItem("orbis:conversation", JSON.stringify(next));
    } catch {
      /* Keep the current session usable without storage. */
    }
    setValue("");
  }
  return (
    <div className={`${s.page} ${s.chat}`}>
      <header className={s.welcome}>
        <Orbi size={144} />
        <h1>Ask Orbi.</h1>
        <p>A task, an idea, or something taking too much of your day.</p>
      </header>
      {messages.map((message, i) => {
        const matches = suggestMissions(messages.slice(0, i + 1).join(" "));
        const context = messages.slice(0, i + 1).join(" ");
        const systems = businessWorkflows.filter((w) =>
          w.id === "rental-operations"
            ? /airbnb|booking|hostaway|rental|appartement|locati[of]/i.test(
                context,
              )
            : /content|contenu|creator|createur|créateur|higgsfield|youtube|tiktok/i.test(
                context,
              ),
        );
        return (
          <section key={i} aria-label="Conversation">
            <div className={s.userMessage}>{message}</div>
            <div className={s.reply}>
              <strong>Let’s turn that into a mission.</strong>
              <p>
                {matches.length || systems.length
                  ? "Here are starting points from your marketplace. Choose one to personalise its approach, context and tools."
                  : "I couldn’t find a relevant template yet. What result do you want, and what information should the mission start from?"}
              </p>
              <div className={s.grid}>
                {systems.map((w) => (
                  <Link
                    key={w.id}
                    className={s.template}
                    href={`/workflows/${w.id}`}
                  >
                    <div>
                      <small>Complete business workflow</small>
                      <strong>{w.name}</strong>
                      <small>{w.outcome}</small>
                    </div>
                  </Link>
                ))}
                {matches.map(({ flow }) => (
                  <Link
                    className={s.template}
                    key={flow.id}
                    href={`/audit?flow=${flow.id}&from=description`}
                    onClick={() =>
                      sessionStorage.setItem(
                        "orbis:text-intake",
                        messages
                          .slice(0, i + 1)
                          .join("\n")
                          .slice(0, 4000),
                      )
                    }
                  >
                    <FileText size={20} />
                    <div>
                      <strong>{flow.title}</strong>
                      <small>{flow.output}</small>
                    </div>
                  </Link>
                ))}
              </div>
              <p>
                Need to be more specific? Tell me the outcome, the input you
                have, or the tool you use.
              </p>
            </div>
          </section>
        );
      })}
      {messages.length > 0 && (
        <button
          className={s.secondary + " mb-4"}
          onClick={() => {
            setMessages([]);
            try {
              sessionStorage.removeItem("orbis:conversation");
            } catch {
              /* Storage is optional. */
            }
            setValue("");
            input.current?.focus();
          }}
        >
          Start a new conversation
        </button>
      )}
      <form className={s.composer} onSubmit={submit}>
        <label htmlFor="need" className="sr-only">
          Describe what you need
        </label>
        <textarea
          id="need"
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={4000}
          placeholder="Describe what you need…"
          rows={3}
        />
        <div className={s.composeBottom}>
          <small>Start with the result you want.</small>
          <button className={s.primary} disabled={value.trim().length < 8}>
            Ask Orbi <ArrowUpRight size={17} />
          </button>
        </div>
      </form>
      {!messages.length && (
        <>
          <p className="mt-8">Or start with a template</p>
          <div className={s.templates}>
            {templates.map((t) => (
              <button
                className={s.template}
                key={t.title}
                onClick={() => {
                  setValue(t.text);
                  input.current?.focus();
                }}
              >
                <t.icon size={20} />
                <div>
                  <strong>{t.title}</strong>
                  <small>Make it yours</small>
                </div>
              </button>
            ))}
          </div>
          <Link href="/catalog" className={s.secondary}>
            Explore all 100 missions <ArrowUpRight size={16} />
          </Link>
        </>
      )}
    </div>
  );
}
