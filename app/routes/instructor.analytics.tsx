import { Link } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { getCourseSummaries } from "~/services/analyticsService";
import { data, isRouteErrorResponse } from "react-router";
import { UserRole } from "~/db/schema";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { AlertTriangle, BarChart2, GraduationCap } from "lucide-react";

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "Overview of your course analytics" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
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

  const instructorId = user.role === UserRole.Admin ? null : currentUserId;
  const courses = getCourseSummaries(instructorId);

  return { courses };
}

function formatRevenue(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export default function InstructorAnalyticsOverview({
  loaderData,
}: Route.ComponentProps) {
  const { courses } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics Overview</h1>
        <p className="mt-1 text-muted-foreground">
          Key metrics across all your courses
        </p>
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GraduationCap className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="text-lg font-medium">No courses yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and publish a course to start seeing analytics.
          </p>
          <Link to="/instructor/new" className="mt-4 underline text-primary text-sm">
            Create a course
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base leading-snug">
                  {course.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Revenue</dt>
                    <dd className="mt-0.5 font-semibold">
                      {formatRevenue(course.revenue)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Students</dt>
                    <dd className="mt-0.5 font-semibold">
                      {course.enrollmentCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Completion</dt>
                    <dd className="mt-0.5 font-semibold">
                      {formatPercent(course.completionRate)}
                    </dd>
                  </div>
                </dl>
                <Link
                  to={`/instructor/${course.id}/analytics`}
                  className="mt-auto flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <BarChart2 className="size-4" />
                  View details
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

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
        <Link to="/instructor" className="underline text-primary text-sm">
          Back to My Courses
        </Link>
      </div>
    </div>
  );
}
