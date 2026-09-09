"use client";

import { motion, type Easing, type Transition } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

type BlurTextProps = {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  stepDuration?: number;
};

function buildKeyframes(
  from: Record<string, string | number>,
  steps: Array<Record<string, string | number>>,
): Record<string, Array<string | number>> {
  const keys = new Set<string>([...Object.keys(from), ...steps.flatMap((step) => Object.keys(step))]);
  const keyframes: Record<string, Array<string | number>> = {};
  keys.forEach((key) => {
    keyframes[key] = [from[key], ...steps.map((step) => step[key])];
  });
  return keyframes;
}

export default function BlurText({
  text = "",
  delay = 80,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  as: Tag = "p",
  stepDuration = 0.28,
}: BlurTextProps) {
  const elements = animateBy === "words" ? text.split(" ") : text.split("");
  const [inView, setInView] = useState(false);
  const [reduce, setReduce] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(media.matches);
    if (media.matches) setInView(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  const defaultFrom = useMemo(
    () =>
      direction === "top"
        ? { filter: "blur(10px)", opacity: 0, y: -28 }
        : { filter: "blur(10px)", opacity: 0, y: 28 },
    [direction],
  );
  const defaultTo = useMemo(
    () => [
      { filter: "blur(4px)", opacity: 0.55, y: direction === "top" ? 4 : -4 },
      { filter: "blur(0px)", opacity: 1, y: 0 },
    ],
    [direction],
  );
  const times = [0, 0.5, 1];

  return (
    <Tag ref={ref as never} className={`flex flex-wrap ${className}`}>
      {elements.map((segment, index) => {
        const spanTransition: Transition = {
          duration: stepDuration * 2,
          times,
          delay: reduce ? 0 : (index * delay) / 1000,
          ease: ((t: number) => t) as Easing,
        };
        return (
          <motion.span
            key={`${segment}-${index}`}
            initial={reduce ? { opacity: 1, y: 0, filter: "blur(0px)" } : defaultFrom}
            animate={inView ? buildKeyframes(defaultFrom, defaultTo) : defaultFrom}
            transition={spanTransition}
            style={{ display: "inline-block", willChange: "transform, filter, opacity" }}
          >
            {segment === " " ? "\u00A0" : segment}
            {animateBy === "words" && index < elements.length - 1 ? "\u00A0" : null}
          </motion.span>
        );
      })}
    </Tag>
  );
}
