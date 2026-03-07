import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Header skeleton */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="flex-1 container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Sleep event cards */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-6 w-36" />
        </div>
        {/* Message bubbles */}
        <div className="space-y-3 mt-6">
          <Skeleton className="h-10 w-3/4 rounded-xl" />
          <Skeleton className="h-20 w-5/6 rounded-xl ml-auto" />
          <Skeleton className="h-10 w-2/3 rounded-xl" />
        </div>
      </div>

      {/* Input skeleton */}
      <div className="sticky bottom-0 border-t py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background">
        <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4">
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
