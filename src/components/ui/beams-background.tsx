"use client";

/**
 * Adapted from Kokonut UI's Beams Background component.
 * Source: https://github.com/kokonut-labs/kokonutui
 * License: MIT
 */
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BeamsBackgroundProps {
  className?: string;
  children?: ReactNode;
  intensity?: "subtle" | "medium" | "strong";
}

interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  speed: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}

function createBeam(width: number, height: number, isDarkMode: boolean): Beam {
  const angle = -35 + Math.random() * 10;
  const hueBase = isDarkMode ? 190 : 210;
  const hueRange = isDarkMode ? 70 : 50;
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 30 + Math.random() * 60,
    length: height * 2.5,
    angle,
    speed: 0.6 + Math.random() * 1.2,
    opacity: 0.12 + Math.random() * 0.16,
    hue: hueBase + Math.random() * hueRange,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.02 + Math.random() * 0.03,
  };
}

export default function BeamsBackground({ className, children, intensity = "strong" }: BeamsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beamsRef = useRef<Beam[]>([]);
  const frameRef = useRef<number>(0);
  const darkModeRef = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const updateDarkMode = () => { darkModeRef.current = document.documentElement.classList.contains("dark"); };
    const observer = new MutationObserver(updateDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    updateDarkMode();

    const beamCount = { subtle: 12, medium: 18, strong: 24 }[intensity];
    const updateCanvasSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      const compact = width <= 640 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      beamsRef.current = Array.from({ length: compact ? Math.min(beamCount, 12) : beamCount }, () => createBeam(width, height, darkModeRef.current));
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize, { passive: true });

    const opacityMap = { subtle: 0.7, medium: 0.85, strong: 1 };
    const resetBeam = (beam: Beam, index: number, total: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const column = index % 3;
      const spacing = width / 3;
      const hueBase = darkModeRef.current ? 190 : 210;
      const hueRange = darkModeRef.current ? 70 : 50;
      beam.y = height + 100;
      beam.x = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5;
      beam.width = 100 + Math.random() * 100;
      beam.speed = 0.5 + Math.random() * 0.4;
      beam.hue = hueBase + (index * hueRange) / total;
      beam.opacity = 0.2 + Math.random() * 0.1;
    };
    const drawBeam = (beam: Beam) => {
      ctx.save();
      ctx.translate(beam.x, beam.y);
      ctx.rotate((beam.angle * Math.PI) / 180);
      const alpha = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) * opacityMap[intensity];
      const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);
      const saturation = darkModeRef.current ? "85%" : "75%";
      const lightness = darkModeRef.current ? "65%" : "45%";
      gradient.addColorStop(0, `hsla(${beam.hue},${saturation},${lightness},0)`);
      gradient.addColorStop(0.1, `hsla(${beam.hue},${saturation},${lightness},${alpha * 0.5})`);
      gradient.addColorStop(0.4, `hsla(${beam.hue},${saturation},${lightness},${alpha})`);
      gradient.addColorStop(0.6, `hsla(${beam.hue},${saturation},${lightness},${alpha})`);
      gradient.addColorStop(0.9, `hsla(${beam.hue},${saturation},${lightness},${alpha * 0.5})`);
      gradient.addColorStop(1, `hsla(${beam.hue},${saturation},${lightness},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx.restore();
    };
    const draw = (animate: boolean) => {
      if (animate && document.hidden) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.filter = intensity === "strong" ? "blur(28px)" : "blur(20px)";
      beamsRef.current.forEach((beam, index) => {
        if (animate) { beam.y -= beam.speed; beam.pulse += beam.pulseSpeed; }
        if (beam.y + beam.length < -100) resetBeam(beam, index, beamsRef.current.length);
        drawBeam(beam);
      });
      ctx.filter = "none";
      if (animate && !document.hidden) frameRef.current = requestAnimationFrame(() => draw(true));
    };
    const onVisibilityChange = () => {
      cancelAnimationFrame(frameRef.current);
      if (!document.hidden) draw(!reduce);
    };
    draw(!reduce);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
    };
  }, [intensity, reduce]);

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-[#07101b]", className)} aria-hidden={children ? undefined : true}>
      <canvas className="absolute inset-0 h-full w-full opacity-75" ref={canvasRef} aria-hidden="true" />
      <motion.div
        className="absolute inset-0 bg-[#07101b]/20"
        animate={reduce ? undefined : { opacity: [0.2, 0.42, 0.2] }}
        transition={{ duration: 10, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
        aria-hidden="true"
      />
      {children && <div className="pointer-events-auto relative z-10 flex min-h-full w-full items-center justify-center">{children}</div>}
    </div>
  );
}
