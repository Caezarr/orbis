import Image from "next/image";
import s from "./orbi.module.css";

/** Motion follows actual UI state, never a simulated success or timer. */
export function Orbi({
  mood = "welcome",
  size = 120,
  working = false,
}: {
  mood?: "welcome" | "thinking" | "done" | "team";
  size?: number;
  working?: boolean;
}) {
  return (
    <span
      className={working ? s.working : s.still}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src={`/brand/orbi/${mood}.png`}
        width={size}
        height={size}
        sizes={`${size}px`}
        alt=""
      />
    </span>
  );
}
