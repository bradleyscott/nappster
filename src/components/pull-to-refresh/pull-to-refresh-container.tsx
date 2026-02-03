"use client";

import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator";
import type { ReactNode } from "react";

export interface PullToRefreshContainerProps {
  onRefresh: () => Promise<void>;
  isEnabled?: boolean;
  isAtBottom: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Container that adds pull-to-refresh functionality.
 * Requires isAtBottom to be passed as a prop (from useStickToBottomContext or similar).
 */
export function PullToRefreshContainer({
  onRefresh,
  isEnabled = true,
  isAtBottom,
  children,
  className,
}: PullToRefreshContainerProps) {
  const {
    pullDistance,
    isRefreshing,
    hasReachedThreshold,
    progress,
    handlers,
  } = usePullToRefresh({
    onRefresh,
    isAtBottom,
    isEnabled,
  });

  return (
    <div
      className={cn("relative flex flex-col flex-1", className)}
      onTouchStart={handlers.onTouchStart}
      onTouchMove={handlers.onTouchMove}
      onTouchEnd={handlers.onTouchEnd}
    >
      {children}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        hasReachedThreshold={hasReachedThreshold}
        progress={progress}
      />
    </div>
  );
}
