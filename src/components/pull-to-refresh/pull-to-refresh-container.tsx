"use client";

import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator";
import { useStickToBottomContext } from "use-stick-to-bottom";
import type { ReactNode } from "react";

export interface PullToRefreshContainerProps {
  onRefresh: () => Promise<void>;
  isEnabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function PullToRefreshContainer({
  onRefresh,
  isEnabled = true,
  children,
  className,
}: PullToRefreshContainerProps) {
  const { isAtBottom } = useStickToBottomContext();

  const {
    pullDistance,
    isPulling,
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
