"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { ComponentProps } from "react";
import { memo } from "react";

export type ShimmerProps = ComponentProps<typeof motion.p> & {
  duration?: number;
  spread?: number;
};

export const Shimmer = memo(
  ({
    className,
    duration = 2,
    spread = 2,
    children,
    ...props
  }: ShimmerProps) => {
    const childText = typeof children === "string" ? children : "";
    const dynamicSpread = childText.length * spread;

    return (
      <motion.p
        animate={{ backgroundPosition: "-100% center" }}
        className={cn(
          "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
          "bg-[linear-gradient(90deg,transparent,transparent_calc(50%-var(--spread)),currentColor_50%,transparent_calc(50%+var(--spread)),transparent)]",
          className
        )}
        initial={{ backgroundPosition: "100% center" }}
        style={
          {
            "--spread": `${dynamicSpread}px`,
          } as React.CSSProperties
        }
        transition={{
          backgroundPosition: {
            duration,
            ease: "linear",
            repeat: Infinity,
          },
        }}
        {...props}
      >
        {children}
      </motion.p>
    );
  }
);

Shimmer.displayName = "Shimmer";
