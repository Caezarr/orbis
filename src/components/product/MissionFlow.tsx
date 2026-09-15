import { ArrowRight, ShieldCheck } from "lucide-react";
import { resolveBusinessWorkflow } from "@/lib/workflows/blueprints";
import s from "./mission-flow.module.css";

/** Legacy kind aliases remain supported by connection pages. */
export function MissionFlow({ kind }: { kind: string }) {
  const workflow = resolveBusinessWorkflow(kind);
  if (!workflow)
    return (
      <p className={s.review}>No blueprint is available for this workflow.</p>
    );
  return (
    <figure
      className={s.flow}
      aria-label={`${workflow.vertical ?? workflow.name} mission blueprint`}
    >
      <figcaption>
        {workflow.vertical ?? workflow.name}{" "}
        <span> / Blueprint · not execution status</span>
      </figcaption>
      <div className={s.track}>
        <div className={s.inputs}>
          <strong>01 / Bring the context</strong>
          {workflow.integrations
            .filter((tool) => tool.required)
            .map((tool) => (
              <div className={s.tool} key={tool.name}>
                <strong>{tool.name}</strong>
                <span>{tool.role}</span>
              </div>
            ))}
          <small>
            Tool choices depend on available connections and verified
            permissions.
          </small>
        </div>
        <ArrowRight className={s.arrow} aria-hidden="true" />
        <div className={s.outputs}>
          <strong>02 / Choose a bounded task</strong>
          {(workflow.tasks ?? []).map((task) => (
            <div key={task.id}>
              <strong>{task.name}</strong>
              <span>{task.unit ? `1 ${task.unit}` : "1 task"}</span>
            </div>
          ))}
        </div>
        <ArrowRight className={s.arrow} aria-hidden="true" />
        <div className={s.outputs}>
          <strong>03 / Review the result</strong>
          <div>
            <strong>Evidence + acceptance check</strong>
            <span>Missing context returns to you.</span>
          </div>
          <div>
            <strong>Approved action → receipt</strong>
            <span>
              External effects depend on your policy and connected tools.
            </span>
          </div>
          <span className={s.review}>
            <ShieldCheck size={18} aria-hidden="true" />
            No completion without verified evidence.
          </span>
        </div>
      </div>
    </figure>
  );
}
