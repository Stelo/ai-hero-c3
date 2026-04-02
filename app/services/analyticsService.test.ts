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
});
