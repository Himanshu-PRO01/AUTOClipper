import { useReducedMotion } from "framer-motion";
import ReactLenis from "lenis/react";
import { type CSSProperties, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./ScrollTiltedGrid.css";

export interface ScrollTiltedGridProps<T> {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  itemKey: (item: T, index: number) => string;
  loop?: boolean;
  initialCycles?: number;
  maxCycles?: number;
  smoothScroll?: boolean;
  perspective?: number;
  maxTilt?: number;
  maxBlur?: number;
  rounded?: string;
  sectionPadding?: string;
  className?: string;
}

type TileVariables = CSSProperties & {
  "--tile-border-radius": string;
  "--tile-blur": string;
  "--tile-brightness": number;
  "--tile-saturation": number;
  "--tile-transform": string;
  "--tile-content-scale": number;
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function GalleryTile({
  content,
  index,
  perspective,
  maxTilt,
  maxBlur,
  rounded,
  reduceMotion,
}: {
  content: ReactNode;
  index: number;
  perspective: number;
  maxTilt: number;
  maxBlur: number;
  rounded: string;
  reduceMotion: boolean;
}) {
  const tileRef = useRef<HTMLElement>(null);
  const side = index % 2 === 0 ? -1 : 1;

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile || reduceMotion) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = tile.getBoundingClientRect();
      const travel = window.innerHeight + rect.height;
      const position = clamp((window.innerHeight - rect.top) / travel);
      const distance = Math.abs(position - 0.5) * 2;
      const signed = (position - 0.5) * 2;
      const eased = distance * distance * (3 - 2 * distance);
      const x = side * eased * 18;
      const y = -signed * eased * 24;
      const tilt = -signed * maxTilt;
      const roll = side * signed * 3;
      const skew = -side * signed * 7;

      tile.style.setProperty("--tile-blur", `${eased * maxBlur}px`);
      tile.style.setProperty("--tile-brightness", String(1 - eased * 0.5));
      tile.style.setProperty("--tile-saturation", String(1 - eased * 0.5));
      tile.style.setProperty("--tile-content-scale", String(1.03 + eased * 0.15));
      tile.style.setProperty(
        "--tile-transform",
        `translate3d(${x}%, ${y}%, ${eased * 180}px) rotateX(${tilt}deg) rotateZ(${roll}deg) skewX(${skew}deg)`,
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(tile);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [maxBlur, maxTilt, reduceMotion, side]);

  const variables: TileVariables = {
    perspective,
    "--tile-border-radius": rounded,
    "--tile-blur": "0px",
    "--tile-brightness": 1,
    "--tile-saturation": 1,
    "--tile-transform": "translate3d(0, 0, 0)",
    "--tile-content-scale": 1.03,
  };

  return (
    <figure
      ref={tileRef}
      className={`gallery-tile ${side > 0 ? "offset-down" : ""}`}
      style={variables}
    >
      <div
        className={`gallery-tile-inner ${!reduceMotion ? "motion-enabled" : ""}`}
      >
        <div
          className={`gallery-tile-content ${!reduceMotion ? "motion-enabled" : ""}`}
        >
          {content}
        </div>
      </div>
    </figure>
  );
}

export function ScrollTiltedGrid<T>({
  items,
  renderItem,
  itemKey,
  loop = false,
  initialCycles = 2,
  maxCycles = 4,
  smoothScroll = true,
  perspective = 1000,
  maxTilt = 30, // Reduced maxTilt from 62 to 30 to make ClipCards more readable
  maxBlur = 5,
  rounded = "0.75rem",
  sectionPadding = "10vh",
  className = "",
}: ScrollTiltedGridProps<T>) {
  const reduceMotion = useReducedMotion() ?? false;
  const cycleLimit = Math.max(1, maxCycles);
  const [cycleCount, setCycleCount] = useState(() =>
    clamp(initialCycles, 1, cycleLimit),
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marker = loadMoreRef.current;
    if (!loop || !marker) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setCycleCount((count) => Math.min(cycleLimit, count + 1));
        }
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [cycleLimit, loop]);

  const tiles = useMemo(
    () =>
      Array.from({ length: loop ? cycleCount : 1 }, (_, cycle) =>
        items.map((item, index) => ({ cycle, item, index })),
      ).flat(),
    [cycleCount, items, loop],
  );

  const gallery = (
    <section
      className={`scroll-tilted-grid-wrapper ${className}`}
      aria-label="Scroll-reactive grid"
    >
      <div
        className="scroll-tilted-grid"
        style={{ paddingBlock: sectionPadding }}
      >
        {tiles.map(({ cycle, item, index }) => (
          <GalleryTile
            key={`${cycle}-${itemKey(item, index)}`}
            content={renderItem(item, index)}
            index={index}
            perspective={perspective}
            maxTilt={maxTilt}
            maxBlur={maxBlur}
            rounded={rounded}
            reduceMotion={reduceMotion}
          />
        ))}
      </div>
      {loop && cycleCount < cycleLimit ? (
        <div ref={loadMoreRef} style={{ height: "1px" }} aria-hidden />
      ) : null}
    </section>
  );

  return smoothScroll && !reduceMotion ? (
    <ReactLenis
      root
      options={{ autoRaf: true, lerp: 0.075, wheelMultiplier: 0.85 }}
    >
      {gallery}
    </ReactLenis>
  ) : (
    gallery
  );
}
