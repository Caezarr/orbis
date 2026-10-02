import Image from "next/image";
import { TOOLS, toolLogoPath } from "@/data/verticals/tools";
import type { ToolUse } from "@/data/verticals/types";
import v from "./vertical-landing.module.css";

/**
 * Data-driven list of connectable tools. Each vertical/job supplies its own
 * tools and copy; nothing here is specific to one industry.
 */
export function VerticalToolGraph({
  heading,
  intro,
  tools,
  note,
  pasteOnly = [],
  sectionClassName,
}: {
  heading: string;
  intro: string;
  tools: ToolUse[];
  note?: string;
  pasteOnly?: string[];
  sectionClassName: string;
}) {
  if (tools.length === 0 && !note && pasteOnly.length === 0) return null;
  return (
    <section className={`${sectionClassName} ${v.compact}`} id="tools">
      <div className={v.centerHeading}>
        <h2>{heading}</h2>
        <p>{intro}</p>
      </div>
      <div className={v.tools} data-toolgraph>
        {tools.map(({ tool, use }) => {
          const logo = toolLogoPath(tool);
          const name = TOOLS[tool].name;
          return (
            <div className={v.tool} key={tool}>
              {logo ? (
                <Image src={logo} alt="" width={32} height={32} />
              ) : (
                <span className={v.toolInitial} aria-hidden>
                  {name.charAt(0)}
                </span>
              )}
              <span>
                <strong>{name}</strong>
                <small>{use}</small>
              </span>
            </div>
          );
        })}
      </div>
      {pasteOnly.length > 0 && (
        <ul className={v.pasteList}>
          {pasteOnly.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {note && <p className={v.toolsNote}>{note}</p>}
    </section>
  );
}
