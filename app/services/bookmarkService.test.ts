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
  toggleBookmark,
  isLessonBookmarked,
  getBookmarkedLessonIds,
} from "./bookmarkService";

function createModuleWithLesson(courseId: number) {
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

describe("bookmarkService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("toggleBookmark", () => {
    it("creates a bookmark and returns bookmarked: true", () => {
      const { lesson } = createModuleWithLesson(base.course.id);

      const result = toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(result).toEqual({ bookmarked: true });
    });

    it("removes an existing bookmark and returns bookmarked: false", () => {
      const { lesson } = createModuleWithLesson(base.course.id);

      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
      const result = toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(result).toEqual({ bookmarked: false });
    });

  });

  describe("isLessonBookmarked", () => {
    it("returns false when lesson is not bookmarked", () => {
      const { lesson } = createModuleWithLesson(base.course.id);

      expect(isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })).toBe(false);
    });

    it("returns true after bookmarking a lesson", () => {
      const { lesson } = createModuleWithLesson(base.course.id);

      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })).toBe(true);
    });

    it("returns false after unbookmarking a lesson", () => {
      const { lesson } = createModuleWithLesson(base.course.id);

      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })).toBe(false);
    });
  });

  describe("getBookmarkedLessonIds", () => {
    it("returns empty array when no bookmarks exist", () => {
      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toEqual([]);
    });

    it("returns bookmarked lesson IDs for the given course", () => {
      const { lesson } = createModuleWithLesson(base.course.id);
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toContain(lesson.id);
      expect(ids).toHaveLength(1);
    });

    it("does not return lesson IDs from a different course", () => {
      const { lesson } = createModuleWithLesson(base.course.id);
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

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

      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: otherCourse.id });

      expect(ids).toEqual([]);
    });

    it("does not return IDs after the bookmark is removed", () => {
      const { lesson } = createModuleWithLesson(base.course.id);
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toEqual([]);
    });

    it("returns multiple bookmarked lesson IDs", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      const lesson1 = testDb
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
        .returning()
        .get();

      const lesson2 = testDb
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: "Lesson 2", position: 2 })
        .returning()
        .get();

      toggleBookmark({ userId: base.user.id, lessonId: lesson1.id });
      toggleBookmark({ userId: base.user.id, lessonId: lesson2.id });

      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toHaveLength(2);
      expect(ids).toContain(lesson1.id);
      expect(ids).toContain(lesson2.id);
    });
  });
});
