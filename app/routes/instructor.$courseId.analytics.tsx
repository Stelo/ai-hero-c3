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
  getCourseQuizMetrics,
  getLessonDropoffFunnel,
  getCourseVideoDropoff,
  detectDropoffAnomalies,
  detectQuizAnomalies,
  detectCompletionAnomaly,
  type Period,
  type DropoffAnomaly,
  type QuizAnomaly,
  type CompletionAnomaly,
} from "~/services/analyticsService";
import { data, isRouteErrorResponse } from "react-router";
import { UserRole } from "~/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { AlertTriangle, FileDown } from "lucide-react";

const EnrollmentTrendChart = lazy(() =>
  import("~/components/enrollment-trend-chart").then((m) => ({
    default: m.EnrollmentTrendChart,
  }))
);

const QuizPassRateChart = lazy(() =>
  import("~/components/quiz-pass-rate-chart").then((m) => ({
    default: m.QuizPassRateChart,
  }))
);

const LessonFunnelChart = lazy(() =>
  import("~/components/lesson-funnel-chart").then((m) => ({
    default: m.LessonFunnelChart,
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
  const quizMetrics = getCourseQuizMetrics(courseId);
  const lessonFunnel = getLessonDropoffFunnel(courseId);
  const videoDropoff = getCourseVideoDropoff(courseId);

  const dropoffAnomalies = detectDropoffAnomalies(lessonFunnel);
  const quizAnomalies = detectQuizAnomalies(quizMetrics);
  const completionAnomaly = detectCompletionAnomaly(completionRate);

  return {
    course,
    period,
    revenue,
    enrollmentSplit,
    completionRate,
    enrollmentTrend,
    quizMetrics,
    lessonFunnel,
    videoDropoff,
    dropoffAnomalies,
    quizAnomalies,
    completionAnomaly,
  };
}

function formatRevenue(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export default function CourseAnalytics({ loaderData }: Route.ComponentProps) {
  const {
    course,
    period,
    revenue,
    enrollmentSplit,
    completionRate,
    enrollmentTrend,
    quizMetrics,
    lessonFunnel,
    videoDropoff,
    dropoffAnomalies,
    quizAnomalies,
    completionAnomaly,
  } = loaderData;
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

        <div className="flex flex-wrap items-center gap-3">
          {/* CSV exports */}
          <div className="flex items-center gap-2">
            <a
              href={`/instructor/${course.id}/analytics/export?type=enrollments&period=${period}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FileDown className="size-4" />
              Enrollments
            </a>
            <a
              href={`/instructor/${course.id}/analytics/export?type=revenue&period=${period}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FileDown className="size-4" />
              Revenue
            </a>
            <a
              href={`/instructor/${course.id}/analytics/export?type=quiz-results`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FileDown className="size-4" />
              Quiz Results
            </a>
          </div>

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

      {/* Completion anomaly callout */}
      {completionAnomaly && (
        <div className="mb-8 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">Low completion rate</p>
            <p className="text-sm">
              Only {formatPercent(completionAnomaly.completionRate)} of enrolled students have completed this course. Consider reviewing the course structure or adding more engaging content.
            </p>
          </div>
        </div>
      )}

      {/* Enrollment trend chart */}
      <Card className="mb-8">
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

      {/* Quiz analytics */}
      {quizMetrics.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Quiz Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {quizAnomalies.length > 0 && (
              <div className="mb-4 space-y-2">
                {quizAnomalies.map((a) => (
                  <div
                    key={a.quizId}
                    className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm">
                      <span className="font-medium">{a.quizTitle}</span> has a low best-attempt pass rate of {formatPercent(a.bestAttemptPassRate)}. Review the quiz questions or prerequisite lesson content.
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Suspense fallback={<div className="h-[300px]" />}>
              <QuizPassRateChart data={quizMetrics} />
            </Suspense>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Quiz</th>
                    <th className="pb-2 pr-4 font-medium">Best pass rate</th>
                    <th className="pb-2 pr-4 font-medium">Latest pass rate</th>
                    <th className="pb-2 pr-4 font-medium">Avg score</th>
                    <th className="pb-2 pr-4 font-medium">Total attempts</th>
                    <th className="pb-2 font-medium">Avg attempts/student</th>
                  </tr>
                </thead>
                <tbody>
                  {quizMetrics.map((q) => (
                    <tr key={q.quizId} className="border-b last:border-0">
                      <td className="py-2 pr-4">{q.quizTitle}</td>
                      <td className="py-2 pr-4">{formatPercent(q.bestAttemptPassRate)}</td>
                      <td className="py-2 pr-4">{formatPercent(q.latestAttemptPassRate)}</td>
                      <td className="py-2 pr-4">{formatPercent(q.avgScore)}</td>
                      <td className="py-2 pr-4">{q.totalAttempts}</td>
                      <td className="py-2">{q.avgAttemptsPerStudent.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lesson drop-off funnel */}
      {lessonFunnel.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Lesson Completion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {dropoffAnomalies.length > 0 && (
              <div className="mb-4 space-y-2">
                {dropoffAnomalies.map((a) => (
                  <div
                    key={a.lessonId}
                    className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm">
                      <span className="font-medium">{a.lessonTitle}</span> has a high drop-off — only {formatPercent(a.continuationRate)} of students from the previous lesson continued here.
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Suspense fallback={<div className="h-[300px]" />}>
              <LessonFunnelChart data={lessonFunnel} />
            </Suspense>

            {/* Video drop-off inline per lesson */}
            {videoDropoff.length > 0 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Average video watch depth
                </h3>
                {videoDropoff.map((v) => (
                  <div key={v.lessonId} className="flex items-center gap-3">
                    <span className="w-48 truncate text-sm">{v.lessonTitle}</span>
                    <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${Math.round(v.avgWatchDepth * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm text-muted-foreground">
                      {Math.round(v.avgWatchDepth * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
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
