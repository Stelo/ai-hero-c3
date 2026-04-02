import { Link, useNavigate } from "react-router";
import { lazy, Suspense } from "react";
import type { Route } from "./+types/instructor.$courseId.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { getCourseById } from "~/services/courseService";
import {
  getCourseRevenue,
  getCourseCompletionRate,
  getCourseEnrollmentSplit,
  getEnrollmentTrend,
  type Period,
} from "~/services/analyticsService";
import { data, isRouteErrorResponse } from "react-router";
import { UserRole } from "~/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { AlertTriangle } from "lucide-react";

const EnrollmentTrendChart = lazy(() =>
  import("~/components/enrollment-trend-chart").then((m) => ({
    default: m.EnrollmentTrendChart,
  }))
);

const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All time" },
];

function parsePeriod(raw: string | null): Period {
  const valid: Period[] = ["7d", "30d", "90d", "1y", "all"];
  return valid.includes(raw as Period) ? (raw as Period) : "all";
}

export function meta({ data: loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Course";
  return [
    { title: `Analytics: ${title} — Cadence` },
    { name: "description", content: `Analytics for ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role === UserRole.Student) {
    throw data("Only instructors and admins can access this page.", {
      status: 403,
    });
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
    throw data("You can only view analytics for your own courses.", {
      status: 403,
    });
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period"));

  const revenue = getCourseRevenue(courseId, period);
  const enrollmentSplit = getCourseEnrollmentSplit(courseId);
  const completionRate = getCourseCompletionRate(courseId);
  const enrollmentTrend = getEnrollmentTrend(courseId, period);

  return { course, period, revenue, enrollmentSplit, completionRate, enrollmentTrend };
}

function formatRevenue(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export default function CourseAnalytics({ loaderData }: Route.ComponentProps) {
  const { course, period, revenue, enrollmentSplit, completionRate, enrollmentTrend } =
    loaderData;
  const navigate = useNavigate();

  function handlePeriodChange(newPeriod: Period) {
    navigate(`?period=${newPeriod}`, { replace: true });
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <Link to="/instructor/analytics" className="hover:text-foreground">
          Analytics
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{course.title}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{course.title}</h1>

        {/* Period filter */}
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handlePeriodChange(value)}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                period === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatRevenue(revenue)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{enrollmentSplit.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paid / Free
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {enrollmentSplit.paid}{" "}
              <span className="text-base font-normal text-muted-foreground">
                / {enrollmentSplit.free}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatPercent(completionRate)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Enrollment trend chart */}
      <Card>
        <CardHeader>
          <CardTitle>Enrollment Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollmentTrend.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No enrollment data for this period.
            </p>
          ) : (
            <Suspense fallback={<div className="h-[300px]" />}>
              <EnrollmentTrendChart data={enrollmentTrend} />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading course analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to access this page.";
    } else if (error.status === 404) {
      title = "Course not found";
      message =
        typeof error.data === "string" ? error.data : "This course does not exist.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/instructor/analytics" className="underline text-primary text-sm">
          Back to Analytics Overview
        </Link>
      </div>
    </div>
  );
}
