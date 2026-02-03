"use client";

import { cn } from "@/lib/utils";
import { Loader } from "@/components/ai-elements/loader";
import { motion } from "motion/react";
import { ArrowDownIcon, CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

export interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  hasReachedThreshold: boolean;
  progress: number;
  className?: string;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  hasReachedThreshold,
  progress,
  className,
}: PullToRefreshIndicatorProps) {
  const [showComplete, setShowComplete] = useState(false);
  const [wasRefreshing, setWasRefreshing] = useState(false);

  // Track when refresh completes to show checkmark briefly
  useEffect(() => {
    if (isRefreshing) {
      setWasRefreshing(true);
    } else if (wasRefreshing) {
      setShowComplete(true);
      const timer = setTimeout(() => {
        setShowComplete(false);
        setWasRefreshing(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isRefreshing, wasRefreshing]);

  const isVisible = pullDistance > 0 || isRefreshing || showComplete;

  if (!isVisible) return null;

  // Arrow rotates from 0 to 180 degrees as progress goes 0 to 1
  const arrowRotation = Math.min(180, progress * 180);

  return (
    <motion.div
      className={cn(
        "absolute left-0 right-0 flex items-center justify-center pointer-events-none z-10",
        className
      )}
      initial={{ opacity: 0, y: 0 }}
      animate={{
        opacity: Math.min(1, progress * 1.5),
        y: isRefreshing ? 60 : pullDistance,
        scale: hasReachedThreshold && !isRefreshing ? 1.1 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
      style={{ bottom: 0 }}
    >
      <motion.div
        className={cn(
          "flex items-center justify-center rounded-full bg-background border shadow-md",
          "w-10 h-10 text-muted-foreground"
        )}
        animate={{
          scale: showComplete ? [1, 1.2, 1] : 1,
        }}
        transition={{ duration: 0.3 }}
      >
        {showComplete ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            <CheckIcon className="w-5 h-5 text-green-500" />
          </motion.div>
        ) : isRefreshing ? (
          <Loader size={20} />
        ) : (
          <motion.div
            animate={{ rotate: arrowRotation }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <ArrowDownIcon className="w-5 h-5" />
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
