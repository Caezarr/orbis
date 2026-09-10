"use client";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useInView } from "motion/react";
const Gradient = dynamic(() => import("./ShaderAtmosphere"), { ssr: false });
const Metal = dynamic(() => import("./PreparedMetal"), { ssr: false });

let webGLSupport: boolean | undefined;
function useWebGL() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (webGLSupport === undefined) {
        const probe = document.createElement("canvas");
        try {
          const context = probe.getContext("webgl2", {
            powerPreference: "low-power",
          });
          webGLSupport = !!context;
          context?.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
          webGLSupport = false;
        }
      }
      setSupported(webGLSupport);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return supported;
}

class OpticsBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function useVisibleMotion(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "60px" });
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return { ref, active: enabled && inView && visible };
}
export function Atmosphere({ enabled }: { enabled: boolean }) {
  const { ref, active } = useVisibleMotion(enabled);
  const supported = useWebGL();
  useEffect(() => {
    if (!enabled || !supported) return;
    const timer = setTimeout(() => {
      void import("./PreparedMetal")
        .then((m) => m.warmPaperMasks())
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [enabled, supported]);
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: 0.42,
      }}
      aria-hidden
    >
      {active && supported && (
        <OpticsBoundary>
          <Gradient />
        </OpticsBoundary>
      )}
    </div>
  );
}
export function LiquidMark({
  enabled,
  running = true,
  src = "/brand/orbis-mark.svg",
  size = 220,
}: {
  enabled: boolean;
  running?: boolean;
  src?: string;
  size?: number;
}) {
  const { ref, active } = useVisibleMotion(enabled && running);
  const supported = useWebGL();
  const nearby = useInView(ref, { margin: "900px" });
  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "relative",
        width: size,
        height: size,
        maxWidth: "100%",
      }}
    >
      {/* Static local image remains underneath when WebGL is unavailable. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          opacity: 0,
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg,#e9f3ff 3%,#315282 20%,#c7e2ff 32%,#f7fbff 39%,#5673a2 47%,#0e2e62 54%,#cee1ff 63%,#789acd 74%,#edf6ff 83%,#436ca9)",
          maskImage: `url(${src})`,
          maskRepeat: "no-repeat",
          maskPosition: "center",
          maskSize: "contain",
          filter: "drop-shadow(0 20px 18px #24396a22)",
        }}
      />
      {nearby && supported && enabled && (
        <OpticsBoundary>
          <Metal src={src} active={active} />
        </OpticsBoundary>
      )}
    </div>
  );
}

/** dashersw/liquid-glass-js shaders, with a bounded texture instead of a page snapshot. */
export function GlassLens({ enabled }: { enabled: boolean }) {
  const { ref, active } = useVisibleMotion(enabled);
  const supported = useWebGL();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active || !supported || !canvas.current) return;
    let cancelled = false;
    let dispose = () => {};
    import("@/lib/visual/liquid-glass-shaders")
      .then(({ glassVertex, glassFragment }) => {
        if (cancelled || !canvas.current) return;
        const gl = canvas.current.getContext("webgl", {
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
        if (!gl) return;
        const shaders: WebGLShader[] = [];
        const buffers: WebGLBuffer[] = [];
        const program = gl.createProgram();
        const texture = gl.createTexture();
        if (!program || !texture) return;
        dispose = () => {
          gl.deleteTexture(texture);
          buffers.forEach((b) => gl.deleteBuffer(b));
          gl.deleteProgram(program);
          shaders.forEach((s) => gl.deleteShader(s));
        };
        for (const [type, code] of [
          [gl.VERTEX_SHADER, glassVertex],
          [gl.FRAGMENT_SHADER, glassFragment],
        ] as const) {
          const shader = gl.createShader(type);
          if (!shader) return;
          shaders.push(shader);
          gl.shaderSource(shader, code);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            dispose();
            return;
          }
          gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          dispose();
          return;
        }
        gl.useProgram(program);
        for (const [name, data] of [
          ["a_position", [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]],
          ["a_texcoord", [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]],
        ] as const) {
          const buffer = gl.createBuffer();
          if (!buffer) return;
          buffers.push(buffer);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(data),
            gl.STATIC_DRAW,
          );
          const at = gl.getAttribLocation(program, name);
          gl.enableVertexAttribArray(at);
          gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
        }
        const textureCanvas = document.createElement("canvas");
        textureCanvas.width = 256;
        textureCanvas.height = 256;
        const ctx = textureCanvas.getContext("2d")!;
        const gradient = ctx.createLinearGradient(0, 0, 256, 200);
        gradient.addColorStop(0, "#edf5ff");
        gradient.addColorStop(0.35, "#b4ccff");
        gradient.addColorStop(0.55, "#315fc2");
        gradient.addColorStop(0.72, "#e9f4ff");
        gradient.addColorStop(1, "#7497df");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = "#ffffff88";
        ctx.lineWidth = 2;
        for (let i = 0; i < 256; i += 28) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 100, 256);
          ctx.stroke();
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          textureCanvas,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const uniforms = {
          u_scrollY: 0,
          u_pageHeight: 256,
          u_viewportHeight: 256,
          u_blurRadius: 2,
          u_borderRadius: 36,
          u_warp: 1,
          u_edgeIntensity: 0.025,
          u_rimIntensity: 0.08,
          u_baseIntensity: 0.012,
          u_edgeDistance: 0.15,
          u_rimDistance: 0.8,
          u_baseDistance: 0.1,
          u_cornerBoost: 0.03,
          u_rippleEffect: 0.1,
          u_tintOpacity: 0.15,
        };
        for (const [key, value] of Object.entries(uniforms))
          gl.uniform1f(gl.getUniformLocation(program, key), value);
        gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), 256, 256);
        gl.uniform2f(gl.getUniformLocation(program, "u_textureSize"), 256, 256);
        gl.uniform2f(
          gl.getUniformLocation(program, "u_containerPosition"),
          128,
          128,
        );
        gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
        gl.viewport(0, 0, 256, 256);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      dispose();
    };
  }, [active, supported]);
  return (
    <div
      ref={ref}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <canvas
        ref={canvas}
        width={256}
        height={256}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 28,
          opacity: 0.8,
        }}
      />
    </div>
  );
}
