"use client";

import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator";
import type { ReactNode } from "react";

export interface PullToRefreshContainerProps {
  onRefresh: () => Promise<void>;
  isEnabled?: boolean;
  isAtBottom: boolean;
  children: ReactNode;
}

/**
 * Adds pull-to-refresh functionality with a minimal wrapper.
 * The wrapper is styled to act as a flex item that fills available space.
 * Requires isAtBottom to be passed as a prop (from useStickToBottomContext or similar).
 */
export function PullToRefreshContainer({
  onRefresh,
  isEnabled = true,
  isAtBottom,
  children,
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
      className="relative flex-1 min-h-0 overflow-hidden"
      style={{ display: 'flex', flexDirection: 'column' }}
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
