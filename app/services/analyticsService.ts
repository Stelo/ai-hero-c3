import { eq, and, gte, sql, isNotNull } from "drizzle-orm";
import { db } from "~/db";
import {
  users,
  courses,
  enrollments,
  purchases,
  lessons,
  modules,
  lessonProgress,
  quizzes,
  quizAttempts,
  videoWatchEvents,
  LessonProgressStatus,
} from "~/db/schema";

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

// ─── Quiz analytics ───

export interface QuizMetrics {
  quizId: number;
  quizTitle: string;
  totalAttempts: number;
  avgAttemptsPerStudent: number;
  avgScore: number;
  bestAttemptPassRate: number;
  latestAttemptPassRate: number;
}

export function getCourseQuizMetrics(courseId: number): QuizMetrics[] {
  // Fetch all quizzes for the course (via lessons → modules → course)
  const quizList = db
    .select({ quizId: quizzes.id, quizTitle: quizzes.title })
    .from(quizzes)
    .innerJoin(lessons, eq(lessons.id, quizzes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(modules.courseId, courseId))
    .all();

  return quizList.map(({ quizId, quizTitle }) => {
    const attempts = db
      .select({
        userId: quizAttempts.userId,
        score: quizAttempts.score,
        attemptedAt: quizAttempts.attemptedAt,
      })
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, quizId))
      .all();

    if (attempts.length === 0) {
      return {
        quizId,
        quizTitle,
        totalAttempts: 0,
        avgAttemptsPerStudent: 0,
        avgScore: 0,
        bestAttemptPassRate: 0,
        latestAttemptPassRate: 0,
      };
    }

    const totalAttempts = attempts.length;

    // Group by user
    const byUser = new Map<number, { scores: number[]; latestScore: number; latestAt: string }>();
    for (const a of attempts) {
      const existing = byUser.get(a.userId);
      if (!existing) {
        byUser.set(a.userId, { scores: [a.score], latestScore: a.score, latestAt: a.attemptedAt });
      } else {
        existing.scores.push(a.score);
        if (a.attemptedAt > existing.latestAt) {
          existing.latestScore = a.score;
          existing.latestAt = a.attemptedAt;
        }
      }
    }

    const PASS_THRESHOLD = 0.7;
    const studentCount = byUser.size;

    let bestPassCount = 0;
    let latestPassCount = 0;
    let scoreSum = 0;

    for (const { scores, latestScore } of byUser.values()) {
      const best = Math.max(...scores);
      if (best >= PASS_THRESHOLD) bestPassCount++;
      if (latestScore >= PASS_THRESHOLD) latestPassCount++;
    }

    for (const a of attempts) {
      scoreSum += a.score;
    }

    return {
      quizId,
      quizTitle,
      totalAttempts,
      avgAttemptsPerStudent: totalAttempts / studentCount,
      avgScore: scoreSum / totalAttempts,
      bestAttemptPassRate: bestPassCount / studentCount,
      latestAttemptPassRate: latestPassCount / studentCount,
    };
  });
}

// ─── Lesson drop-off funnel ───

export interface LessonFunnelEntry {
  lessonId: number;
  lessonTitle: string;
  modulePosition: number;
  lessonPosition: number;
  studentCount: number;
}

export function getLessonDropoffFunnel(courseId: number): LessonFunnelEntry[] {
  const rows = db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      modulePosition: modules.position,
      lessonPosition: lessons.position,
      studentCount: sql<number>`count(distinct ${lessonProgress.userId})`,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .leftJoin(
      lessonProgress,
      and(
        eq(lessonProgress.lessonId, lessons.id),
        sql`${lessonProgress.status} in ('${sql.raw(LessonProgressStatus.InProgress)}', '${sql.raw(LessonProgressStatus.Completed)}')`
      )
    )
    .where(eq(modules.courseId, courseId))
    .groupBy(lessons.id)
    .orderBy(modules.position, lessons.position)
    .all();

  return rows.map((r) => ({
    lessonId: r.lessonId,
    lessonTitle: r.lessonTitle,
    modulePosition: r.modulePosition,
    lessonPosition: r.lessonPosition,
    studentCount: r.studentCount,
  }));
}

// ─── Video drop-off ───

export interface VideoDropoffEntry {
  lessonId: number;
  lessonTitle: string;
  avgWatchDepth: number; // 0–1 fraction of video watched
}

export function getCourseVideoDropoff(courseId: number): VideoDropoffEntry[] {
  // Only lessons that have videoUrl and durationMinutes set
  const videoLessons = db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      durationMinutes: lessons.durationMinutes,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(
      and(
        eq(modules.courseId, courseId),
        isNotNull(lessons.videoUrl),
        isNotNull(lessons.durationMinutes)
      )
    )
    .all();

  return videoLessons
    .map(({ lessonId, lessonTitle, durationMinutes }) => {
      if (!durationMinutes || durationMinutes <= 0) return null;

      const durationSeconds = durationMinutes * 60;

      // MAX positionSeconds per user, then average across users
      const perUserMax = db
        .select({
          userId: videoWatchEvents.userId,
          maxPos: sql<number>`max(${videoWatchEvents.positionSeconds})`,
        })
        .from(videoWatchEvents)
        .where(eq(videoWatchEvents.lessonId, lessonId))
        .groupBy(videoWatchEvents.userId)
        .all();

      if (perUserMax.length === 0) return null;

      const avgMaxPos =
        perUserMax.reduce((sum, r) => sum + r.maxPos, 0) / perUserMax.length;

      return {
        lessonId,
        lessonTitle,
        avgWatchDepth: Math.min(avgMaxPos / durationSeconds, 1),
      };
    })
    .filter((entry): entry is VideoDropoffEntry => entry !== null);
}

// ─── Anomaly detection ───
// Pure functions — no database access. Take already-computed analytics data
// and return lists of anomalies for display as callouts in the UI.

export interface DropoffAnomaly {
  type: "dropoff";
  lessonId: number;
  lessonTitle: string;
  continuationRate: number; // fraction of prior lesson's students who reached this lesson
}

export interface QuizAnomaly {
  type: "quiz";
  quizId: number;
  quizTitle: string;
  bestAttemptPassRate: number;
}

export interface CompletionAnomaly {
  type: "completion";
  completionRate: number;
}

export type Anomaly = DropoffAnomaly | QuizAnomaly | CompletionAnomaly;

const DROPOFF_THRESHOLD = 0.6; // fewer than 60% continuation flags a drop-off anomaly
const QUIZ_PASS_THRESHOLD = 0.5; // best-attempt pass rate below 50% flags a quiz anomaly
const COMPLETION_THRESHOLD = 0.3; // course completion rate below 30% flags a completion anomaly

export function detectDropoffAnomalies(funnel: LessonFunnelEntry[]): DropoffAnomaly[] {
  const anomalies: DropoffAnomaly[] = [];

  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1];
    const curr = funnel[i];

    // Skip if previous lesson had no students (avoid divide-by-zero; nothing to compare)
    if (prev.studentCount === 0) continue;

    const continuationRate = curr.studentCount / prev.studentCount;
    if (continuationRate < DROPOFF_THRESHOLD) {
      anomalies.push({
        type: "dropoff",
        lessonId: curr.lessonId,
        lessonTitle: curr.lessonTitle,
        continuationRate,
      });
    }
  }

  return anomalies;
}

export function detectQuizAnomalies(quizMetrics: QuizMetrics[]): QuizAnomaly[] {
  return quizMetrics
    .filter((q) => q.bestAttemptPassRate < QUIZ_PASS_THRESHOLD)
    .map((q) => ({
      type: "quiz" as const,
      quizId: q.quizId,
      quizTitle: q.quizTitle,
      bestAttemptPassRate: q.bestAttemptPassRate,
    }));
}

export function detectCompletionAnomaly(completionRate: number): CompletionAnomaly | null {
  if (completionRate < COMPLETION_THRESHOLD) {
    return { type: "completion", completionRate };
  }
  return null;
}

// ─── CSV export queries ───

export interface EnrollmentExportRow {
  studentName: string;
  email: string;
  enrolledAt: string;
  enrollmentType: "paid" | "free";
  completionStatus: "completed" | "in progress";
}

export function getEnrollmentExportRows(
  courseId: number,
  period: Period = "all"
): EnrollmentExportRow[] {
  const startDate = periodToStartDate(period);
  const condition =
    startDate !== null
      ? and(eq(enrollments.courseId, courseId), gte(enrollments.enrolledAt, startDate))
      : eq(enrollments.courseId, courseId);

  const rows = db
    .select({
      studentName: users.name,
      email: users.email,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
      pricePaid: purchases.pricePaid,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .leftJoin(
      purchases,
      and(eq(purchases.userId, enrollments.userId), eq(purchases.courseId, enrollments.courseId))
    )
    .where(condition)
    .all();

  return rows.map((r) => ({
    studentName: r.studentName,
    email: r.email,
    enrolledAt: r.enrolledAt,
    enrollmentType: r.pricePaid != null ? "paid" : "free",
    completionStatus: r.completedAt ? "completed" : "in progress",
  }));
}

export interface RevenueExportRow {
  purchaseDate: string;
  studentName: string;
  courseTitle: string;
  amountPaid: number; // in cents
}

export function getRevenueExportRows(
  courseId: number,
  period: Period = "all"
): RevenueExportRow[] {
  const startDate = periodToStartDate(period);
  const condition =
    startDate !== null
      ? and(eq(purchases.courseId, courseId), gte(purchases.createdAt, startDate))
      : eq(purchases.courseId, courseId);

  const rows = db
    .select({
      purchaseDate: purchases.createdAt,
      studentName: users.name,
      courseTitle: courses.title,
      amountPaid: purchases.pricePaid,
    })
    .from(purchases)
    .innerJoin(users, eq(users.id, purchases.userId))
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(condition)
    .all();

  return rows.map((r) => ({
    purchaseDate: r.purchaseDate,
    studentName: r.studentName,
    courseTitle: r.courseTitle,
    amountPaid: r.amountPaid,
  }));
}

export interface QuizResultsExportRow {
  studentName: string;
  quizTitle: string;
  bestScore: number;
  bestAttemptPassed: boolean;
  latestScore: number;
  latestAttemptPassed: boolean;
}

export function getQuizResultsExportRows(courseId: number): QuizResultsExportRow[] {
  const quizList = db
    .select({ quizId: quizzes.id, quizTitle: quizzes.title })
    .from(quizzes)
    .innerJoin(lessons, eq(lessons.id, quizzes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(modules.courseId, courseId))
    .all();

  if (quizList.length === 0) return [];

  const results: QuizResultsExportRow[] = [];

  for (const { quizId, quizTitle } of quizList) {
    const attempts = db
      .select({
        userId: quizAttempts.userId,
        studentName: users.name,
        score: quizAttempts.score,
        attemptedAt: quizAttempts.attemptedAt,
      })
      .from(quizAttempts)
      .innerJoin(users, eq(users.id, quizAttempts.userId))
      .where(eq(quizAttempts.quizId, quizId))
      .all();

    // Group by user to find best and latest attempt
    const byUser = new Map<
      number,
      { studentName: string; bestScore: number; latestScore: number; latestAt: string }
    >();

    for (const a of attempts) {
      const existing = byUser.get(a.userId);
      if (!existing) {
        byUser.set(a.userId, {
          studentName: a.studentName,
          bestScore: a.score,
          latestScore: a.score,
          latestAt: a.attemptedAt,
        });
      } else {
        if (a.score > existing.bestScore) existing.bestScore = a.score;
        if (a.attemptedAt > existing.latestAt) {
          existing.latestScore = a.score;
          existing.latestAt = a.attemptedAt;
        }
      }
    }

    const PASS_THRESHOLD = 0.7;
    for (const { studentName, bestScore, latestScore } of byUser.values()) {
      results.push({
        studentName,
        quizTitle,
        bestScore,
        bestAttemptPassed: bestScore >= PASS_THRESHOLD,
        latestScore,
        latestAttemptPassed: latestScore >= PASS_THRESHOLD,
      });
    }
  }

  return results;
}

// ─── CSV serialisation ───
// Pure functions — no database access. Convert query result rows to CSV strings.

function escapeCell(value: string): string {
  // If value contains commas, quotes, or newlines, wrap in quotes and escape internal quotes
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCell).join(",");
  const dataLines = rows.map((row) => row.map(escapeCell).join(","));
  return [headerLine, ...dataLines].join("\n");
}

export function enrollmentsToCsv(rows: EnrollmentExportRow[]): string {
  const headers = ["Student Name", "Email", "Enrolled At", "Type", "Completion Status"];
  const data = rows.map((r) => [
    r.studentName,
    r.email,
    r.enrolledAt,
    r.enrollmentType,
    r.completionStatus,
  ]);
  return rowsToCsv(headers, data);
}

export function revenueToCsv(rows: RevenueExportRow[]): string {
  const headers = ["Purchase Date", "Student Name", "Course Title", "Amount Paid"];
  const data = rows.map((r) => [
    r.purchaseDate,
    r.studentName,
    r.courseTitle,
    (r.amountPaid / 100).toFixed(2),
  ]);
  return rowsToCsv(headers, data);
}

export function quizResultsToCsv(rows: QuizResultsExportRow[]): string {
  const headers = [
    "Student Name",
    "Quiz Title",
    "Best Score",
    "Best Attempt Passed",
    "Latest Score",
    "Latest Attempt Passed",
  ];
  const data = rows.map((r) => [
    r.studentName,
    r.quizTitle,
    r.bestScore.toFixed(2),
    r.bestAttemptPassed ? "yes" : "no",
    r.latestScore.toFixed(2),
    r.latestAttemptPassed ? "yes" : "no",
  ]);
  return rowsToCsv(headers, data);
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
