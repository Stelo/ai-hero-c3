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
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "./notificationService";

describe("notificationService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createNotification", () => {
    it("creates a notification with all fields", () => {
      const notification = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Jane Doe enrolled in Test Course",
        "/instructor/1/students"
      );

      expect(notification).toBeDefined();
      expect(notification.recipientUserId).toBe(base.instructor.id);
      expect(notification.type).toBe(schema.NotificationType.Enrollment);
      expect(notification.title).toBe("New Enrollment");
      expect(notification.message).toBe("Jane Doe enrolled in Test Course");
      expect(notification.linkUrl).toBe("/instructor/1/students");
      expect(notification.isRead).toBe(false);
      expect(notification.createdAt).toBeDefined();
    });
  });

  describe("getNotifications", () => {
    it("returns notifications for a user ordered newest first", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student A enrolled in Test Course",
        "/instructor/1/students"
      );
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student B enrolled in Test Course",
        "/instructor/1/students"
      );

      const notifications = getNotifications(base.instructor.id, 10, 0);
      expect(notifications).toHaveLength(2);
      // Newest first: Student B was created after Student A
      expect(notifications[0].message).toBe(
        "Student B enrolled in Test Course"
      );
      expect(notifications[1].message).toBe(
        "Student A enrolled in Test Course"
      );
    });

    it("respects limit", () => {
      for (let i = 0; i < 5; i++) {
        createNotification(
          base.instructor.id,
          schema.NotificationType.Enrollment,
          "New Enrollment",
          `Student ${i} enrolled`,
          "/instructor/1/students"
        );
      }

      const notifications = getNotifications(base.instructor.id, 3, 0);
      expect(notifications).toHaveLength(3);
    });

    it("respects offset", () => {
      for (let i = 0; i < 5; i++) {
        createNotification(
          base.instructor.id,
          schema.NotificationType.Enrollment,
          "New Enrollment",
          `Student ${i} enrolled`,
          "/instructor/1/students"
        );
      }

      const page1 = getNotifications(base.instructor.id, 3, 0);
      const page2 = getNotifications(base.instructor.id, 3, 3);
      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(2);
    });

    it("returns empty array when user has no notifications", () => {
      expect(getNotifications(base.instructor.id, 10, 0)).toHaveLength(0);
    });

    it("does not return notifications for a different user", () => {
      createNotification(
        base.user.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Someone enrolled",
        "/instructor/1/students"
      );

      expect(getNotifications(base.instructor.id, 10, 0)).toHaveLength(0);
    });
  });

  describe("getUnreadCount", () => {
    it("returns the count of unread notifications", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student A enrolled",
        "/instructor/1/students"
      );
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student B enrolled",
        "/instructor/1/students"
      );

      expect(getUnreadCount(base.instructor.id)).toBe(2);
    });

    it("returns 0 when all notifications are read", () => {
      const n = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student enrolled",
        "/instructor/1/students"
      );
      markAsRead(n.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("returns 0 when user has no notifications", () => {
      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("does not count another user's unread notifications", () => {
      createNotification(
        base.user.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Someone enrolled",
        "/instructor/1/students"
      );

      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });
  });

  describe("markAsRead", () => {
    it("marks a single notification as read", () => {
      const n = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student enrolled",
        "/instructor/1/students"
      );
      expect(n.isRead).toBe(false);

      markAsRead(n.id);

      const [updated] = getNotifications(base.instructor.id, 10, 0);
      expect(updated.isRead).toBe(true);
    });

    it("does not affect other notifications", () => {
      const n1 = createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student A enrolled",
        "/instructor/1/students"
      );
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student B enrolled",
        "/instructor/1/students"
      );

      markAsRead(n1.id);

      expect(getUnreadCount(base.instructor.id)).toBe(1);
    });
  });

  describe("markAllAsRead", () => {
    it("marks all notifications as read for a user", () => {
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student A enrolled",
        "/instructor/1/students"
      );
      createNotification(
        base.instructor.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Student B enrolled",
        "/instructor/1/students"
      );

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("does not affect another user's notifications", () => {
      createNotification(
        base.user.id,
        schema.NotificationType.Enrollment,
        "New Enrollment",
        "Someone enrolled",
        "/instructor/1/students"
      );

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.user.id)).toBe(1);
    });
  });
});
