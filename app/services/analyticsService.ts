import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "~/db";
import { courses, enrollments, purchases } from "~/db/schema";

// ─── Time period helpers ───

export type Period = "7d" | "30d" | "90d" | "1y" | "all";

export function periodToStartDate(period: Period): string | null {
  if (period === "all") return null;
  const now = new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

// ─── Analytics Service ───
// Read-only aggregation queries for instructor and admin analytics.
// Uses positional parameters (project convention).

export function getCourseRevenue(courseId: number, period: Period = "all") {
  const startDate = periodToStartDate(period);
  const condition =
    startDate !== null
      ? and(eq(purchases.courseId, courseId), gte(purchases.createdAt, startDate))
      : eq(purchases.courseId, courseId);

  const result = db
    .select({ total: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)` })
    .from(purchases)
    .where(condition)
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

export function getCourseEnrollmentSplit(courseId: number) {
  const total = getCourseEnrollmentCount(courseId);

  const paidResult = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .innerJoin(purchases, and(eq(purchases.userId, enrollments.userId), eq(purchases.courseId, enrollments.courseId)))
    .where(eq(enrollments.courseId, courseId))
    .get();

  const paid = paidResult?.count ?? 0;

  return { total, paid, free: total - paid };
}

export function getEnrollmentTrend(courseId: number, period: Period = "all") {
  const startDate = periodToStartDate(period);
  const condition =
    startDate !== null
      ? and(eq(enrollments.courseId, courseId), gte(enrollments.enrolledAt, startDate))
      : eq(enrollments.courseId, courseId);

  const rows = db
    .select({
      date: sql<string>`date(${enrollments.enrolledAt})`,
      count: sql<number>`count(*)`,
    })
    .from(enrollments)
    .where(condition)
    .groupBy(sql`date(${enrollments.enrolledAt})`)
    .orderBy(sql`date(${enrollments.enrolledAt})`)
    .all();

  return rows.map((r) => ({ date: r.date, count: r.count }));
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
