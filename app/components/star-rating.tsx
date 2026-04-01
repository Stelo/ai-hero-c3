import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

interface StarRatingDisplayProps {
  average: number | null;
  count: number;
  className?: string;
}

export function StarRatingDisplay({
  average,
  count,
  className,
}: StarRatingDisplayProps) {
  if (average === null || count === 0) return null;

  return (
    <span className={cn("flex items-center gap-1", className)}>
      {[1, 2, 3, 4, 5].map((star) => {
        // How much of this star is filled: 0–1
        const fill = Math.min(1, Math.max(0, average - (star - 1)));
        const pct = Math.round(fill * 100);
        return (
          <span key={star} className="relative inline-flex size-3.5">
            {/* Empty star underneath */}
            <Star className="absolute inset-0 size-3.5 fill-none text-muted-foreground/40" />
            {/* Filled star clipped to the fill percentage */}
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${pct}%` }}
            >
              <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
            </span>
          </span>
        );
      })}
      <span className="text-xs text-muted-foreground">
        {average.toFixed(1)} ({count})
      </span>
    </span>
  );
}

interface StarRatingInputProps {
  courseId: number;
  userRating: number | null;
  className?: string;
}

export function StarRatingInput({
  courseId,
  userRating,
  className,
}: StarRatingInputProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? userRating ?? 0;

  return (
    <form method="post" className={cn("flex items-center gap-1", className)}>
      <input type="hidden" name="intent" value="rate" />
      <input type="hidden" name="courseId" value={courseId} />
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="submit"
          name="rating"
          value={star}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          className="cursor-pointer p-0.5 transition-transform hover:scale-110 focus-visible:outline-none"
          aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "size-5",
              star <= active
                ? "fill-yellow-400 text-yellow-400"
                : "fill-none text-muted-foreground/40"
            )}
          />
        </button>
      ))}
      {userRating !== null && (
        <span className="ml-1 text-xs text-muted-foreground">
          Your rating: {userRating}/5
        </span>
      )}
    </form>
  );
}
