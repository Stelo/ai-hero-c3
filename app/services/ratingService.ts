import { eq, avg, sql, and, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

export function upsertRating(userId: number, courseId: number, rating: number) {
  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating },
    })
    .returning()
    .get();
}

export function getUserRatingForCourse(
  userId: number,
  courseId: number
): number | null {
  const row = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();
  return row?.rating ?? null;
}

export function getCourseAverageRating(courseId: number): {
  average: number | null;
  count: number;
} {
  const row = db
    .select({
      average: avg(courseRatings.rating),
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    average: row?.average ? Number(row.average) : null,
    count: row?.count ?? 0,
  };
}

export function getBulkAverageRatings(courseIds: number[]): Map<
  number,
  { average: number | null; count: number }
> {
  const result = new Map<number, { average: number | null; count: number }>();
  if (courseIds.length === 0) return result;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: avg(courseRatings.rating),
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    result.set(row.courseId, {
      average: row.average ? Number(row.average) : null,
      count: row.count,
    });
  }

  return result;
}
