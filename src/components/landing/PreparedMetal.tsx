"use client";
import { useEffect, useRef } from "react";
import {
  ShaderMount,
  liquidMetalFragmentShader,
  toProcessedLiquidMetal,
  getShaderColorFromString,
  ShaderFitOptions,
} from "@paper-design/shaders";

// One preprocessing pass per local asset, shared by every logo instance.
const masks = new Map<string, Promise<HTMLImageElement>>();
function mask(src: string) {
  let value = masks.get(src);
  if (!value) {
    value = toProcessedLiquidMetal(src).then(async ({ pngBlob }) => {
      const url = URL.createObjectURL(pngBlob);
      const image = new Image();
      image.src = url;
      try {
        await image.decode();
        return image;
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    masks.set(src, value);
  }
  return value;
}
export async function warmPaperMasks() {
  for (const src of [
    "orbis-mark.svg",
    "tools/gmail.svg",
    "tools/microsoftoutlook.svg",
    "tools/hubspot.svg",
    "tools/salesforce.svg",
    "time-off.svg",
  ]) {
    await mask(`/brand/${src}`).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}
export default function PreparedMetal({
  src,
  active,
}: {
  src: string;
  active: boolean;
}) {
  const node = useRef<HTMLDivElement>(null),
    mount = useRef<ShaderMount | null>(null);
  const playing = useRef(active);
  useEffect(() => {
    playing.current = active;
    mount.current?.setSpeed(active ? 0.18 : 0);
  }, [active]);
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let instance: ShaderMount | null = null;
    mask(src)
      .then((image) => {
        if (cancelled || !node.current) return;
        const uniforms = {
          u_colorBack: getShaderColorFromString("#00000000"),
          u_colorTint: getShaderColorFromString("#7699ef"),
          u_image: image,
          u_contour: 0.35,
          u_distortion: 0.12,
          u_softness: 0.2,
          u_repetition: 2.3,
          u_shiftRed: 0.08,
          u_shiftBlue: 0.2,
          u_angle: 70,
          u_isImage: true,
          u_shape: 0,
          u_fit: ShaderFitOptions.contain,
          u_scale: 0.9,
          u_rotation: 0,
          u_offsetX: 0,
          u_offsetY: 0,
          u_originX: 0.5,
          u_originY: 0.5,
          u_worldWidth: 0,
          u_worldHeight: 0,
        };
        try {
          instance = new ShaderMount(
            node.current,
            liquidMetalFragmentShader,
            uniforms,
            { alpha: true, powerPreference: "low-power" },
            playing.current ? 0.18 : 0,
            0,
            1,
            120000,
            ["u_image"],
          );
          mount.current = instance;
          frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
              if (!cancelled && node.current) node.current.style.opacity = "1";
            });
          });
        } catch {
          instance?.dispose();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      instance?.dispose();
      mount.current = null;
    };
  }, [src]);
  return (
    <div
      ref={node}
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0,
        transition: "opacity 350ms ease",
      }}
    />
  );
}
