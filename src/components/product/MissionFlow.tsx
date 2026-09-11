import { ArrowRight, ShieldCheck, Check } from "lucide-react";
import { Orbi } from "./Orbi";
import { ToolLogo } from "./ToolLogo";
import s from "./mission-flow.module.css";

const flows = {
  rental: {
    tools: [
      { id: "notion", name: "Property guides" },
      { id: "slack", name: "Your team" },
    ],
    source: "Hostaway reservations",
    steps: ["Prepare arrivals", "Coordinate cleaning", "Draft guest replies"],
    review: "You approve exceptions",
  },
  creator: {
    tools: [
      { id: "googledrive", name: "Your best content" },
      { id: "notion", name: "Your brand & ideas" },
    ],
    source: "Your creator brief",
    steps: [
      "Find original angles",
      "Prepare scripts",
      "Build production briefs",
    ],
    review: "You approve scripts & budget",
  },
  customers: {
    tools: [
      { id: "gmail", name: "Customer requests" },
      { id: "notion", name: "Approved knowledge" },
    ],
    source: "A customer needs help",
    steps: [
      "Understand the request",
      "Prepare a sourced answer",
      "Flag sensitive decisions",
    ],
    review: "You review before sending",
  },
};
export function MissionFlow({ kind }: { kind: keyof typeof flows }) {
  const flow = flows[kind];
  return (
    <figure className={s.flow} aria-label="Mission flow">
      <figcaption>
        {flow.source} <span>→ your mission plan</span>
      </figcaption>
      <div className={s.track}>
        <div className={s.inputs}>
          {flow.tools.map((tool) => (
            <div className={s.tool} key={tool.id}>
              <ToolLogo tool={tool.id} />
              <span>{tool.name}</span>
            </div>
          ))}
          <small>Tools shown are examples; choose yours below.</small>
        </div>
        <ArrowRight className={s.arrow} aria-hidden="true" />
        <div className={s.orbi}>
          <Orbi mood="team" size={122} />
          <strong>Orbi</strong>
          <span>Context → clear next steps</span>
        </div>
        <ArrowRight className={s.arrow} aria-hidden="true" />
        <div className={s.outputs}>
          {flow.steps.map((step) => (
            <div key={step}>
              <Check size={16} />
              {step}
            </div>
          ))}
          <span className={s.review}>
            <ShieldCheck size={17} />
            {flow.review}
          </span>
        </div>
      </div>
    </figure>
  );
}
