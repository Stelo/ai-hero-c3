import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  getCourseRevenue,
  getCourseEnrollmentCount,
  getCourseCompletionRate,
  getCourseSummaries,
  getCourseEnrollmentSplit,
  getEnrollmentTrend,
  getCourseQuizMetrics,
  getLessonDropoffFunnel,
  getCourseVideoDropoff,
  detectDropoffAnomalies,
  detectQuizAnomalies,
  detectCompletionAnomaly,
  type LessonFunnelEntry,
  type QuizMetrics,
} from "./analyticsService";

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("getCourseRevenue", () => {
    it("returns the sum of pricePaid for a course", () => {
      testDb.insert(schema.purchases).values([
        { userId: base.user.id, courseId: base.course.id, pricePaid: 1000 },
        { userId: base.user.id, courseId: base.course.id, pricePaid: 2000 },
      ]).run();

      expect(getCourseRevenue(base.course.id)).toBe(3000);
    });

    it("returns 0 when there are no purchases", () => {
      expect(getCourseRevenue(base.course.id)).toBe(0);
    });

    it("does not include purchases for another course", () => {
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Another course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      testDb.insert(schema.purchases).values({
        userId: base.user.id,
        courseId: otherCourse.id,
        pricePaid: 5000,
      }).run();

      expect(getCourseRevenue(base.course.id)).toBe(0);
    });
  });

  describe("getCourseEnrollmentCount", () => {
    it("returns the number of enrollments for a course", () => {
      const anotherUser = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "user2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      testDb.insert(schema.enrollments).values([
        { userId: base.user.id, courseId: base.course.id },
        { userId: anotherUser.id, courseId: base.course.id },
      ]).run();

      expect(getCourseEnrollmentCount(base.course.id)).toBe(2);
    });

    it("returns 0 when there are no enrollments", () => {
      expect(getCourseEnrollmentCount(base.course.id)).toBe(0);
    });
  });

  describe("getCourseCompletionRate", () => {
    it("returns the completion rate as a fraction", () => {
      const anotherUser = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "user2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      testDb.insert(schema.enrollments).values([
        {
          userId: base.user.id,
          courseId: base.course.id,
          completedAt: new Date().toISOString(),
        },
        { userId: anotherUser.id, courseId: base.course.id },
      ]).run();

      expect(getCourseCompletionRate(base.course.id)).toBe(0.5);
    });

    it("returns 0 when there are no enrollments (no divide-by-zero)", () => {
      expect(getCourseCompletionRate(base.course.id)).toBe(0);
    });

    it("returns 1 when all enrolled students have completed the course", () => {
      testDb.insert(schema.enrollments).values({
        userId: base.user.id,
        courseId: base.course.id,
        completedAt: new Date().toISOString(),
      }).run();

      expect(getCourseCompletionRate(base.course.id)).toBe(1);
    });
  });

  describe("getCourseSummaries", () => {
    it("returns summaries for all courses when instructorId is null", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      testDb.insert(schema.courses).values({
        title: "Another Course",
        slug: "another-course",
        description: "Another course",
        instructorId: otherInstructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      }).run();

      const summaries = getCourseSummaries(null);
      expect(summaries.length).toBe(2);
    });

    it("returns only the instructor's courses when instructorId is provided", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      testDb.insert(schema.courses).values({
        title: "Another Course",
        slug: "another-course",
        description: "Another course",
        instructorId: otherInstructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      }).run();

      const summaries = getCourseSummaries(base.instructor.id);
      expect(summaries.length).toBe(1);
      expect(summaries[0].id).toBe(base.course.id);
    });

    it("does not include revenue from another instructor's courses", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Another Course",
          slug: "another-course",
          description: "Another course",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      testDb.insert(schema.purchases).values({
        userId: base.user.id,
        courseId: otherCourse.id,
        pricePaid: 9999,
      }).run();

      const summaries = getCourseSummaries(base.instructor.id);
      expect(summaries.length).toBe(1);
      expect(summaries[0].revenue).toBe(0);
    });

    it("returns an empty array when the instructor has no courses", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "New Instructor",
          email: "new@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      expect(getCourseSummaries(otherInstructor.id)).toEqual([]);
    });
  });

  describe("getCourseRevenue with period", () => {
    it("returns only revenue within the period window", () => {
      const old = new Date();
      old.setDate(old.getDate() - 60);

      testDb.insert(schema.purchases).values([
        { userId: base.user.id, courseId: base.course.id, pricePaid: 1000, createdAt: old.toISOString() },
        { userId: base.user.id, courseId: base.course.id, pricePaid: 2000 },
      ]).run();

      expect(getCourseRevenue(base.course.id, "30d")).toBe(2000);
    });

    it("returns all revenue when period is 'all'", () => {
      const old = new Date();
      old.setDate(old.getDate() - 60);

      testDb.insert(schema.purchases).values([
        { userId: base.user.id, courseId: base.course.id, pricePaid: 1000, createdAt: old.toISOString() },
        { userId: base.user.id, courseId: base.course.id, pricePaid: 2000 },
      ]).run();

      expect(getCourseRevenue(base.course.id, "all")).toBe(3000);
    });
  });

  describe("getCourseEnrollmentSplit", () => {
    it("correctly counts paid and free enrollments", () => {
      const anotherUser = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "user2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      testDb.insert(schema.enrollments).values([
        { userId: base.user.id, courseId: base.course.id },
        { userId: anotherUser.id, courseId: base.course.id },
      ]).run();

      testDb.insert(schema.purchases).values({
        userId: base.user.id,
        courseId: base.course.id,
        pricePaid: 1000,
      }).run();

      const split = getCourseEnrollmentSplit(base.course.id);
      expect(split.total).toBe(2);
      expect(split.paid).toBe(1);
      expect(split.free).toBe(1);
    });

    it("returns all free when no purchases exist", () => {
      testDb.insert(schema.enrollments).values({
        userId: base.user.id,
        courseId: base.course.id,
      }).run();

      const split = getCourseEnrollmentSplit(base.course.id);
      expect(split.total).toBe(1);
      expect(split.paid).toBe(0);
      expect(split.free).toBe(1);
    });

    it("returns zeros when no enrollments exist", () => {
      const split = getCourseEnrollmentSplit(base.course.id);
      expect(split.total).toBe(0);
      expect(split.paid).toBe(0);
      expect(split.free).toBe(0);
    });
  });

  describe("getEnrollmentTrend", () => {
    it("returns daily enrollment counts in order", () => {
      const day1 = new Date();
      day1.setDate(day1.getDate() - 2);
      const day2 = new Date();
      day2.setDate(day2.getDate() - 1);

      const anotherUser = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "user2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      testDb.insert(schema.enrollments).values([
        { userId: base.user.id, courseId: base.course.id, enrolledAt: day1.toISOString() },
        { userId: anotherUser.id, courseId: base.course.id, enrolledAt: day2.toISOString() },
      ]).run();

      const trend = getEnrollmentTrend(base.course.id, "all");
      expect(trend.length).toBe(2);
      expect(trend[0].count).toBe(1);
      expect(trend[1].count).toBe(1);
    });

    it("excludes enrollments outside the period window", () => {
      const old = new Date();
      old.setDate(old.getDate() - 60);

      testDb.insert(schema.enrollments).values([
        { userId: base.user.id, courseId: base.course.id, enrolledAt: old.toISOString() },
      ]).run();

      const trend = getEnrollmentTrend(base.course.id, "30d");
      expect(trend.length).toBe(0);
    });

    it("returns an empty array when there are no enrollments", () => {
      expect(getEnrollmentTrend(base.course.id, "all")).toEqual([]);
    });
  });

  // ─── Phase 3: Quiz metrics ───

  function seedModuleAndLesson(courseId: number) {
    const mod = testDb
      .insert(schema.modules)
      .values({ courseId, title: "Module 1", position: 1 })
      .returning()
      .get();

    const lesson = testDb
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
      .returning()
      .get();

    return { mod, lesson };
  }

  function seedQuiz(lessonId: number, title = "Quiz 1") {
    return testDb
      .insert(schema.quizzes)
      .values({ lessonId, title, passingScore: 0.7 })
      .returning()
      .get();
  }

  describe("getCourseQuizMetrics", () => {
    it("returns empty array when course has no quizzes", () => {
      expect(getCourseQuizMetrics(base.course.id)).toEqual([]);
    });

    it("returns zero metrics for a quiz with no attempts", () => {
      const { lesson } = seedModuleAndLesson(base.course.id);
      const quiz = seedQuiz(lesson.id);

      const metrics = getCourseQuizMetrics(base.course.id);
      expect(metrics).toHaveLength(1);
      expect(metrics[0].quizId).toBe(quiz.id);
      expect(metrics[0].totalAttempts).toBe(0);
      expect(metrics[0].bestAttemptPassRate).toBe(0);
      expect(metrics[0].latestAttemptPassRate).toBe(0);
      expect(metrics[0].avgScore).toBe(0);
    });

    it("calculates best-attempt pass rate correctly", () => {
      const { lesson } = seedModuleAndLesson(base.course.id);
      const quiz = seedQuiz(lesson.id);

      const user2 = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "u2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      // user1: first attempt 0.5 (fail), second attempt 0.8 (pass) → best = pass
      testDb.insert(schema.quizAttempts).values([
        { userId: base.user.id, quizId: quiz.id, score: 0.5, passed: false, attemptedAt: "2024-01-01T00:00:00.000Z" },
        { userId: base.user.id, quizId: quiz.id, score: 0.8, passed: true, attemptedAt: "2024-01-02T00:00:00.000Z" },
      ]).run();

      // user2: single attempt 0.4 (fail) → best = fail
      testDb.insert(schema.quizAttempts).values({
        userId: user2.id, quizId: quiz.id, score: 0.4, passed: false, attemptedAt: "2024-01-01T00:00:00.000Z",
      }).run();

      const [m] = getCourseQuizMetrics(base.course.id);
      expect(m.totalAttempts).toBe(3);
      expect(m.bestAttemptPassRate).toBe(0.5); // 1 of 2 students passed on best attempt
      expect(m.latestAttemptPassRate).toBe(0.5); // latest for user1 = 0.8 (pass), user2 = 0.4 (fail)
    });

    it("latest-attempt pass rate uses the most recent attempt by timestamp", () => {
      const { lesson } = seedModuleAndLesson(base.course.id);
      const quiz = seedQuiz(lesson.id);

      // user: first attempt passes, latest attempt fails
      testDb.insert(schema.quizAttempts).values([
        { userId: base.user.id, quizId: quiz.id, score: 0.9, passed: true, attemptedAt: "2024-01-01T00:00:00.000Z" },
        { userId: base.user.id, quizId: quiz.id, score: 0.3, passed: false, attemptedAt: "2024-01-03T00:00:00.000Z" },
      ]).run();

      const [m] = getCourseQuizMetrics(base.course.id);
      expect(m.bestAttemptPassRate).toBe(1); // best = 0.9, passes
      expect(m.latestAttemptPassRate).toBe(0); // latest = 0.3, fails
    });

    it("does not include quizzes from another course", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({ name: "Other", email: "other2@example.com", role: schema.UserRole.Instructor })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-q",
          description: "x",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const { lesson: otherLesson } = seedModuleAndLesson(otherCourse.id);
      seedQuiz(otherLesson.id, "Other Quiz");

      expect(getCourseQuizMetrics(base.course.id)).toEqual([]);
    });

    it("calculates average score across all attempts", () => {
      const { lesson } = seedModuleAndLesson(base.course.id);
      const quiz = seedQuiz(lesson.id);

      testDb.insert(schema.quizAttempts).values([
        { userId: base.user.id, quizId: quiz.id, score: 0.4, passed: false },
        { userId: base.user.id, quizId: quiz.id, score: 0.6, passed: false },
      ]).run();

      const [m] = getCourseQuizMetrics(base.course.id);
      expect(m.avgScore).toBeCloseTo(0.5);
    });

    it("calculates average attempts per student", () => {
      const { lesson } = seedModuleAndLesson(base.course.id);
      const quiz = seedQuiz(lesson.id);

      const user2 = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "u2b@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      // user1: 3 attempts, user2: 1 attempt → avg = 2
      testDb.insert(schema.quizAttempts).values([
        { userId: base.user.id, quizId: quiz.id, score: 0.5, passed: false, attemptedAt: "2024-01-01T00:00:00.000Z" },
        { userId: base.user.id, quizId: quiz.id, score: 0.5, passed: false, attemptedAt: "2024-01-02T00:00:00.000Z" },
        { userId: base.user.id, quizId: quiz.id, score: 0.8, passed: true, attemptedAt: "2024-01-03T00:00:00.000Z" },
        { userId: user2.id, quizId: quiz.id, score: 0.8, passed: true, attemptedAt: "2024-01-01T00:00:00.000Z" },
      ]).run();

      const [m] = getCourseQuizMetrics(base.course.id);
      expect(m.avgAttemptsPerStudent).toBe(2);
    });
  });

  // ─── Phase 3: Lesson drop-off funnel ───

  describe("getLessonDropoffFunnel", () => {
    it("returns lessons in module/lesson position order", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      testDb.insert(schema.lessons).values([
        { moduleId: mod.id, title: "Lesson B", position: 2 },
        { moduleId: mod.id, title: "Lesson A", position: 1 },
      ]).run();

      const funnel = getLessonDropoffFunnel(base.course.id);
      expect(funnel).toHaveLength(2);
      expect(funnel[0].lessonTitle).toBe("Lesson A");
      expect(funnel[1].lessonTitle).toBe("Lesson B");
    });

    it("counts only in_progress and completed statuses", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      const lesson = testDb
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
        .returning()
        .get();

      const user2 = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "u2c@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      const user3 = testDb
        .insert(schema.users)
        .values({ name: "User 3", email: "u3@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      testDb.insert(schema.lessonProgress).values([
        { userId: base.user.id, lessonId: lesson.id, status: schema.LessonProgressStatus.Completed },
        { userId: user2.id, lessonId: lesson.id, status: schema.LessonProgressStatus.InProgress },
        { userId: user3.id, lessonId: lesson.id, status: schema.LessonProgressStatus.NotStarted },
      ]).run();

      const [entry] = getLessonDropoffFunnel(base.course.id);
      expect(entry.studentCount).toBe(2); // completed + in_progress, not not_started
    });

    it("returns zero for a lesson with no progress records", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      testDb
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: "Empty Lesson", position: 1 })
        .run();

      const [entry] = getLessonDropoffFunnel(base.course.id);
      expect(entry.studentCount).toBe(0);
    });

    it("does not include lessons from another course", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({ name: "Other", email: "other3@example.com", role: schema.UserRole.Instructor })
        .returning()
        .get();

      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course-f",
          description: "x",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const otherMod = testDb
        .insert(schema.modules)
        .values({ courseId: otherCourse.id, title: "Other Module", position: 1 })
        .returning()
        .get();

      testDb.insert(schema.lessons).values({ moduleId: otherMod.id, title: "Other Lesson", position: 1 }).run();

      expect(getLessonDropoffFunnel(base.course.id)).toEqual([]);
    });
  });

  // ─── Phase 3: Video drop-off ───

  describe("getCourseVideoDropoff", () => {
    it("returns empty array when no lessons have video + duration", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      // lesson without videoUrl or durationMinutes
      testDb.insert(schema.lessons).values({ moduleId: mod.id, title: "Text Lesson", position: 1 }).run();

      expect(getCourseVideoDropoff(base.course.id)).toEqual([]);
    });

    it("excludes lessons with no videoWatchEvents", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      testDb.insert(schema.lessons).values({
        moduleId: mod.id,
        title: "Video Lesson",
        position: 1,
        videoUrl: "https://example.com/video.mp4",
        durationMinutes: 10,
      }).run();

      expect(getCourseVideoDropoff(base.course.id)).toEqual([]);
    });

    it("calculates average watch depth correctly", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      const lesson = testDb
        .insert(schema.lessons)
        .values({
          moduleId: mod.id,
          title: "Video Lesson",
          position: 1,
          videoUrl: "https://example.com/video.mp4",
          durationMinutes: 10, // 600 seconds
        })
        .returning()
        .get();

      const user2 = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "u2d@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      // user1 max = 300s (50%), user2 max = 600s (100%) → avg = 75%
      testDb.insert(schema.videoWatchEvents).values([
        { userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 300 },
        { userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 100 },
        { userId: user2.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 600 },
      ]).run();

      const [entry] = getCourseVideoDropoff(base.course.id);
      expect(entry.lessonId).toBe(lesson.id);
      expect(entry.avgWatchDepth).toBeCloseTo(0.75);
    });

    it("excludes lessons with null durationMinutes", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      testDb.insert(schema.lessons).values({
        moduleId: mod.id,
        title: "Video No Duration",
        position: 1,
        videoUrl: "https://example.com/video.mp4",
        // durationMinutes intentionally omitted (null)
      }).run();

      expect(getCourseVideoDropoff(base.course.id)).toEqual([]);
    });
  });

  // ─── Phase 4: Anomaly detection ───

  function makeFunnelEntry(
    overrides: Partial<LessonFunnelEntry> & Pick<LessonFunnelEntry, "lessonId" | "studentCount">
  ): LessonFunnelEntry {
    return {
      lessonTitle: `Lesson ${overrides.lessonId}`,
      modulePosition: 1,
      lessonPosition: overrides.lessonId,
      ...overrides,
    };
  }

  function makeQuizMetrics(
    overrides: Partial<QuizMetrics> & Pick<QuizMetrics, "quizId" | "bestAttemptPassRate">
  ): QuizMetrics {
    return {
      quizTitle: `Quiz ${overrides.quizId}`,
      totalAttempts: 10,
      avgAttemptsPerStudent: 1,
      avgScore: 0.5,
      latestAttemptPassRate: 0.5,
      ...overrides,
    };
  }

  describe("detectDropoffAnomalies", () => {
    it("returns empty array for a single-lesson funnel", () => {
      const funnel = [makeFunnelEntry({ lessonId: 1, studentCount: 100 })];
      expect(detectDropoffAnomalies(funnel)).toEqual([]);
    });

    it("returns empty array when all metrics are within threshold", () => {
      const funnel = [
        makeFunnelEntry({ lessonId: 1, studentCount: 100 }),
        makeFunnelEntry({ lessonId: 2, studentCount: 60 }), // exactly 60% — no anomaly
        makeFunnelEntry({ lessonId: 3, studentCount: 60 }), // 100% — no anomaly
      ];
      expect(detectDropoffAnomalies(funnel)).toEqual([]);
    });

    it("flags a lesson at exactly 59% continuation", () => {
      const funnel = [
        makeFunnelEntry({ lessonId: 1, studentCount: 100 }),
        makeFunnelEntry({ lessonId: 2, studentCount: 59 }), // 59% < 60% → anomaly
      ];
      const anomalies = detectDropoffAnomalies(funnel);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].lessonId).toBe(2);
      expect(anomalies[0].continuationRate).toBeCloseTo(0.59);
    });

    it("does not flag the first lesson", () => {
      // Even if the first lesson has 0 students, it should never be flagged
      const funnel = [
        makeFunnelEntry({ lessonId: 1, studentCount: 0 }),
        makeFunnelEntry({ lessonId: 2, studentCount: 0 }),
      ];
      // Both have 0 students; prior lesson is 0 so we skip (divide-by-zero guard)
      expect(detectDropoffAnomalies(funnel)).toEqual([]);
    });

    it("skips comparison when prior lesson had no students", () => {
      const funnel = [
        makeFunnelEntry({ lessonId: 1, studentCount: 0 }),
        makeFunnelEntry({ lessonId: 2, studentCount: 10 }),
      ];
      expect(detectDropoffAnomalies(funnel)).toEqual([]);
    });

    it("can flag multiple anomalous lessons", () => {
      const funnel = [
        makeFunnelEntry({ lessonId: 1, studentCount: 100 }),
        makeFunnelEntry({ lessonId: 2, studentCount: 50 }), // 50% → anomaly
        makeFunnelEntry({ lessonId: 3, studentCount: 25 }), // 50% → anomaly
      ];
      const anomalies = detectDropoffAnomalies(funnel);
      expect(anomalies).toHaveLength(2);
      expect(anomalies[0].lessonId).toBe(2);
      expect(anomalies[1].lessonId).toBe(3);
    });
  });

  describe("detectQuizAnomalies", () => {
    it("returns empty array when all quizzes are above the threshold", () => {
      const metrics = [
        makeQuizMetrics({ quizId: 1, bestAttemptPassRate: 0.5 }), // exactly 50% — no anomaly
        makeQuizMetrics({ quizId: 2, bestAttemptPassRate: 0.8 }),
      ];
      expect(detectQuizAnomalies(metrics)).toEqual([]);
    });

    it("flags a quiz with best-attempt pass rate below 50%", () => {
      const metrics = [
        makeQuizMetrics({ quizId: 1, bestAttemptPassRate: 0.49 }),
      ];
      const anomalies = detectQuizAnomalies(metrics);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].quizId).toBe(1);
      expect(anomalies[0].bestAttemptPassRate).toBeCloseTo(0.49);
    });

    it("returns empty array when there are no quizzes", () => {
      expect(detectQuizAnomalies([])).toEqual([]);
    });

    it("can flag multiple quizzes", () => {
      const metrics = [
        makeQuizMetrics({ quizId: 1, bestAttemptPassRate: 0.2 }),
        makeQuizMetrics({ quizId: 2, bestAttemptPassRate: 0.9 }),
        makeQuizMetrics({ quizId: 3, bestAttemptPassRate: 0.3 }),
      ];
      const anomalies = detectQuizAnomalies(metrics);
      expect(anomalies).toHaveLength(2);
      expect(anomalies.map((a) => a.quizId)).toEqual([1, 3]);
    });
  });

  describe("detectCompletionAnomaly", () => {
    it("returns null when completion rate is exactly 30%", () => {
      expect(detectCompletionAnomaly(0.3)).toBeNull();
    });

    it("returns null when completion rate is above 30%", () => {
      expect(detectCompletionAnomaly(0.8)).toBeNull();
    });

    it("returns an anomaly when completion rate is below 30%", () => {
      const anomaly = detectCompletionAnomaly(0.29);
      expect(anomaly).not.toBeNull();
      expect(anomaly?.type).toBe("completion");
      expect(anomaly?.completionRate).toBeCloseTo(0.29);
    });

    it("returns an anomaly when completion rate is 0%", () => {
      const anomaly = detectCompletionAnomaly(0);
      expect(anomaly).not.toBeNull();
    });
  });
});
