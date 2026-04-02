import { eq, and } from "drizzle-orm";
import { db } from "~/db";
import { lessonBookmarks, lessons, modules } from "~/db/schema";

export function toggleBookmark(opts: {
  userId: number;
  lessonId: number;
}): { bookmarked: boolean } {
  const { userId, lessonId } = opts;
  const existing = db
    .select()
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        eq(lessonBookmarks.lessonId, lessonId)
      )
    )
    .get();
  if (existing) {
    db.delete(lessonBookmarks)
      .where(
        and(
          eq(lessonBookmarks.userId, userId),
          eq(lessonBookmarks.lessonId, lessonId)
        )
      )
      .run();
    return { bookmarked: false };
  }
  db.insert(lessonBookmarks).values({ userId, lessonId }).run();
  return { bookmarked: true };
}

export function isLessonBookmarked(opts: {
  userId: number;
  lessonId: number;
}): boolean {
  const { userId, lessonId } = opts;
  const row = db
    .select()
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        eq(lessonBookmarks.lessonId, lessonId)
      )
    )
    .get();
  return !!row;
}

export function getBookmarkedLessonIds(opts: {
  userId: number;
  courseId: number;
}): number[] {
  const { userId, courseId } = opts;
  const rows = db
    .select({ lessonId: lessonBookmarks.lessonId })
    .from(lessonBookmarks)
    .innerJoin(lessons, eq(lessonBookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(eq(lessonBookmarks.userId, userId), eq(modules.courseId, courseId))
    )
    .all();
  return rows.map((r) => r.lessonId);
}
