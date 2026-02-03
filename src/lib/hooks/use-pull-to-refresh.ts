"use client";

import { useCallback, useRef, useState } from "react";

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  isAtBottom: boolean;
  threshold?: number;
  maxPullDistance?: number;
  resistance?: number;
  isEnabled?: boolean;
}

export interface UsePullToRefreshReturn {
  pullDistance: number;
  isPulling: boolean;
  isRefreshing: boolean;
  hasReachedThreshold: boolean;
  progress: number;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export function usePullToRefresh({
  onRefresh,
  isAtBottom,
  threshold = 80,
  maxPullDistance = 150,
  resistance = 2.5,
  isEnabled = true,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef(0);
  const currentY = useRef(0);

  const hasReachedThreshold = pullDistance >= threshold;
  const progress = Math.min(1, pullDistance / threshold);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isEnabled || isRefreshing || !isAtBottom) return;

      startY.current = e.touches[0].clientY;
      currentY.current = e.touches[0].clientY;
      setIsPulling(true);
    },
    [isEnabled, isRefreshing, isAtBottom]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPulling || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const rawDelta = currentY.current - startY.current;

      // Only allow pulling down (positive delta)
      if (rawDelta <= 0) {
        setPullDistance(0);
        return;
      }

      // Apply resistance curve for natural feel
      const resistedDelta =
        rawDelta / (1 + (rawDelta / maxPullDistance) * resistance);
      const clampedDistance = Math.min(maxPullDistance, resistedDelta);

      setPullDistance(clampedDistance);

      // Haptic feedback when reaching threshold
      if (clampedDistance >= threshold && pullDistance < threshold) {
        if (navigator.vibrate) {
          navigator.vibrate(10);
        }
      }
    },
    [isPulling, isRefreshing, maxPullDistance, resistance, threshold, pullDistance]
  );

  const onTouchEnd = useCallback(async () => {
    if (!isPulling) return;

    setIsPulling(false);

    if (hasReachedThreshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold); // Hold at threshold during refresh

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, hasReachedThreshold, isRefreshing, onRefresh, threshold]);

  return {
    pullDistance,
    isPulling,
    isRefreshing,
    hasReachedThreshold,
    progress,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
