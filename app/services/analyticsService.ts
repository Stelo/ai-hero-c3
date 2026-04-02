import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import { courses, enrollments, purchases } from "~/db/schema";

// ─── Analytics Service ───
// Read-only aggregation queries for instructor and admin analytics.
// Uses positional parameters (project convention).

export function getCourseRevenue(courseId: number) {
  const result = db
    .select({ total: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)` })
    .from(purchases)
    .where(eq(purchases.courseId, courseId))
    .get();

  return result?.total ?? 0;
}

export function getCourseEnrollmentCount(courseId: number) {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();

  return result?.count ?? 0;
}

export function getCourseCompletionRate(courseId: number) {
  const result = db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`count(${enrollments.completedAt})`,
    })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .get();

  if (!result || result.total === 0) return 0;

  return result.completed / result.total;
}

export function getCourseSummaries(instructorId: number | null) {
  const courseList =
    instructorId !== null
      ? db
          .select()
          .from(courses)
          .where(eq(courses.instructorId, instructorId))
          .all()
      : db.select().from(courses).all();

  return courseList.map((course) => {
    const revenue = getCourseRevenue(course.id);
    const enrollmentCount = getCourseEnrollmentCount(course.id);
    const completionRate = getCourseCompletionRate(course.id);

    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      status: course.status,
      revenue,
      enrollmentCount,
      completionRate,
    };
  });
}
