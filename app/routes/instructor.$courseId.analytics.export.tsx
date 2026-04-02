import type { Route } from "./+types/instructor.$courseId.analytics.export";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { getCourseById } from "~/services/courseService";
import {
  getEnrollmentExportRows,
  getRevenueExportRows,
  getQuizResultsExportRows,
  enrollmentsToCsv,
  revenueToCsv,
  quizResultsToCsv,
  type Period,
} from "~/services/analyticsService";
import { data } from "react-router";
import { UserRole } from "~/db/schema";

const VALID_TYPES = ["enrollments", "revenue", "quiz-results"] as const;
type ExportType = (typeof VALID_TYPES)[number];

function parsePeriod(raw: string | null): Period {
  const valid: Period[] = ["7d", "30d", "90d", "1y", "all"];
  return valid.includes(raw as Period) ? (raw as Period) : "all";
}

function parseExportType(raw: string | null): ExportType | null {
  return VALID_TYPES.includes(raw as ExportType) ? (raw as ExportType) : null;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to export analytics.", { status: 401 });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role === UserRole.Student) {
    throw data("Only instructors and admins can export analytics.", { status: 403 });
  }

  const courseId = parseInt(params.courseId, 10);
  if (isNaN(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const course = getCourseById(courseId);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  if (course.instructorId !== currentUserId && user.role !== UserRole.Admin) {
    throw data("You can only export analytics for your own courses.", { status: 403 });
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const exportType = parseExportType(url.searchParams.get("type"));

  if (!exportType) {
    throw data("Invalid export type. Use: enrollments, revenue, or quiz-results.", { status: 400 });
  }

  let csv: string;
  let filename: string;

  if (exportType === "enrollments") {
    csv = enrollmentsToCsv(getEnrollmentExportRows(courseId, period));
    filename = `${course.slug}_enrollments_${period}.csv`;
  } else if (exportType === "revenue") {
    csv = revenueToCsv(getRevenueExportRows(courseId, period));
    filename = `${course.slug}_revenue_${period}.csv`;
  } else {
    csv = quizResultsToCsv(getQuizResultsExportRows(courseId));
    filename = `${course.slug}_quiz-results.csv`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
