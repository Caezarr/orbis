"use client";
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";
export default function ShaderAtmosphere() {
  return (
    <ShaderGradientCanvas
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      pixelDensity={1}
      fov={45}
    >
      <ShaderGradient
        type="plane"
        animate="on"
        uSpeed={0.12}
        uStrength={2.2}
        uFrequency={3}
        uDensity={1.2}
        color1="#f5f9ff"
        color2="#a1bced"
        color3="#d6e2ff"
        cDistance={3.8}
        cPolarAngle={100}
        rotationX={50}
        lightType="3d"
        brightness={1.1}
        grain="off"
      />
    </ShaderGradientCanvas>
  );
}
