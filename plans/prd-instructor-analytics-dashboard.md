## Problem Statement

Instructors on the Cadence platform have no way to understand the commercial and educational performance of their courses. They can view a raw student roster with individual progress data, but there is no aggregated view of revenue generated, enrollment trends, course completion rates, quiz performance, or where students are dropping out of their courses. Without this, instructors cannot make data-driven decisions about how to improve their content or understand the return on their teaching investment.

## Solution

Build an instructor analytics dashboard with two levels of visibility:

1. **Cross-course overview** (`/instructor/analytics`) — an at-a-glance summary across all of the instructor's courses, showing total revenue, total enrollments, average completion rates, and highlights of courses that need attention.
2. **Per-course analytics** (`/instructor/:courseId/analytics`) — a detailed breakdown for a single course covering revenue, enrollment, completion, quiz pass rates, and student drop-off points, with time-period filtering and CSV export.

Admins can access the same views for any course on the platform. Anomalies (high drop-off, low completion, poor quiz pass rates) are surfaced as callouts so instructors can act quickly.

## User Stories

1. As an instructor, I want to see total revenue across all my courses in one place, so that I can understand the overall commercial value of my teaching.
2. As an instructor, I want to see revenue broken down per course, so that I can identify which courses are most commercially successful.
3. As an instructor, I want to filter revenue figures by time period (last 7 days, last 30 days, last 90 days, this year, all time), so that I can understand revenue trends over time.
4. As an instructor, I want to see total enrollment counts for each course, so that I know how many students have joined each course.
5. As an instructor, I want to see enrollment broken down into paid vs. free/coupon-redeemed, so that I can distinguish between commercially valuable enrolments and complementary access.
6. As an instructor, I want to see enrollment trends over time as a chart, so that I can identify growth or decline in course popularity.
7. As an instructor, I want to see the completion rate for each course (the proportion of enrolled students who have a completedAt timestamp), so that I can assess how engaging my courses are end-to-end.
8. As an instructor, I want to see completion rate trends over time, so that I can understand whether changes to my course improved or hurt completion.
9. As an instructor, I want to see the quiz pass rate per quiz, broken down into best-attempt pass rate and latest-attempt pass rate, so that I can understand both the ceiling of student understanding and their current knowledge state.
10. As an instructor, I want to see average quiz scores per quiz, so that I can identify quizzes that are consistently too hard or too easy.
11. As an instructor, I want to see the number of attempts per quiz (total and average per student), so that I can understand how much effort students put into passing.
12. As an instructor, I want to see lesson-level drop-off data showing where in the course students stop progressing, so that I can identify lessons that cause students to disengage.
13. As an instructor, I want to see video-level drop-off data showing the average watch completion percentage per lesson video, so that I can identify parts of a video where students lose interest.
14. As an instructor, I want anomaly callouts that flag lessons with unusually high drop-off rates, so that I am proactively alerted to content that needs improvement.
15. As an instructor, I want anomaly callouts that flag quizzes with low pass rates, so that I can identify assessments that may be too difficult or misaligned with course content.
16. As an instructor, I want anomaly callouts that flag courses with low overall completion rates, so that I can prioritise improving engagement for those courses.
17. As an instructor, I want a cross-course overview page summarising key metrics for all my courses, so that I can monitor my entire catalogue at a glance.
18. As an instructor, I want to drill down from the overview into a specific course's analytics page, so that I can investigate the detail behind any summary metric.
19. As an instructor, I want to export enrollment data as a CSV file, so that I can use it in external tools for further analysis.
20. As an instructor, I want to export revenue data as a CSV file, so that I can produce reports or reconcile figures externally.
21. As an instructor, I want to export quiz results as a CSV file, so that I can track student performance outside the platform.
22. As an admin, I want to access the analytics dashboard for any course on the platform, so that I can monitor platform-wide performance and support instructors.
23. As an admin, I want to see cross-platform aggregated metrics on the overview page, so that I can understand the health of the whole platform.
24. As an instructor, I want to see a revenue summary card on my course overview page, so that I always know the headline figure when managing a course.
25. As an instructor, I want to see the number of students who started but never completed a single lesson, so that I can detect "enrolled but inactive" students.
26. As an instructor, I want to see average time-to-completion for students who did finish the course, so that I can understand the typical learning journey duration.
27. As an instructor, I want to see a per-lesson completion funnel chart showing how many students reached each lesson, so that I can visualise where the biggest drop-off steps are.

## Implementation Decisions

### New Routes
- `GET /instructor/analytics` — cross-course overview for the logged-in instructor (or all courses for admins).
- `GET /instructor/:courseId/analytics` — per-course analytics detail page.
- `GET /instructor/analytics/export` — CSV export endpoint (course, type, and date-range passed as query params).
- `GET /instructor/:courseId/analytics/export` — per-course CSV export.

### Access Control
- Reuse the existing role check pattern: instructors see only their own courses; admins see everything.
- Enforce at the loader level, same pattern as the existing `/instructor/:courseId` route guard.

### Data Queries
All analytics are computed at query time from existing tables — no new tracking tables are needed. Key query patterns:
- **Revenue**: `SUM(pricePaid)` from `purchases` joined to `courses` filtered by `instructorId` and optional `createdAt` date range.
- **Enrollment split**: Count `enrollments` joined to `purchases` — rows with a matching purchase = paid; rows without = free/coupon.
- **Completion rate**: `COUNT(enrollments WHERE completedAt IS NOT NULL) / COUNT(enrollments)` per course.
- **Quiz pass rates**: Two aggregations over `quizAttempts` — one using the best attempt per (userId, quizId) pair, one using the most recent attempt.
- **Lesson drop-off**: For each lesson, count distinct `userId` values in `lessonProgress` where `status != 'not_started'`. Plot as a funnel ordered by lesson position.
- **Video drop-off**: Per lesson with a video, calculate `AVG(MAX(positionSeconds) / lesson.durationMinutes / 60)` from `videoWatchEvents` grouped by userId.
- **Anomaly thresholds** (hard-coded defaults, can be tuned later):
  - Drop-off anomaly: a lesson where fewer than 60% of previously-active students continued to the next lesson.
  - Quiz anomaly: a quiz best-attempt pass rate below 50%.
  - Course completion anomaly: completion rate below 30%.

### Time Filtering
- Implemented as URL search params (`?period=30d`, `7d`, `90d`, `1y`, `all`).
- Applied to `purchases.createdAt` (revenue), `enrollments.enrolledAt` (enrollment trend), and `quizAttempts.attemptedAt` (quiz trend).
- Lesson drop-off and video drop-off are all-time only (no `createdAt` on `lessonProgress`).

### Charts (Recharts)
- Add `recharts` as a new dependency.
- Chart components are client-side only (wrapped in `ClientOnly` or lazy-loaded) to avoid SSR issues.
- Charts used:
  - **Line chart**: enrollment over time, revenue over time.
  - **Bar chart**: per-lesson completion funnel, quiz pass rates per quiz.
  - **Area chart**: video drop-off curve per lesson (x = video position, y = % of students still watching).

### CSV Export
- Implemented as a loader that returns a `Response` with `Content-Type: text/csv` and `Content-Disposition: attachment`.
- Three export types: `enrollments`, `revenue`, `quiz-results`.
- Date range params respected where applicable.

### Schema Changes
No schema changes are required. All analytics are derived from existing tables.

### Navigation
- Add an "Analytics" link to the existing instructor sidebar/nav alongside the existing course tabs.
- Add an "Analytics" link to the top-level `/instructor` dashboard alongside the existing course list.

### Anomaly Callout UI
- Rendered as highlighted cards or inline warning banners (using existing Tailwind styling conventions).
- Displayed at the top of the relevant section (e.g. drop-off anomalies above the lesson funnel chart).

## Testing Strategy

The project uses Vitest with isolated in-memory SQLite databases. All analytics logic should follow the same pattern as existing service tests: a new `analyticsService.ts` (and optionally a `videoDropOffService.ts`) is the primary unit-test target.

### Unit Tests — `analyticsService`

Each query function should have its own `describe` block with tests covering:

- **Happy path**: correct aggregation given a known seed dataset.
- **Empty state**: returns sensible defaults (zeros, empty arrays) when there is no data.
- **Boundary conditions**: e.g. all students inactive, all lessons completed, all quizzes failed.
- **Time filtering**: filtering by period returns only records within the date window and excludes records outside it.
- **Access scoping**: a query scoped to instructor A does not return data for instructor B's courses.

The test setup already provides `createTestDb()` and `seedBaseData()`. Additional seed helpers will be needed for purchases, quiz attempts, lesson progress, and video watch events — these should be added to `app/test/setup.ts` following the existing pattern.

### Unit Tests — Anomaly Detection

The threshold logic (drop-off >40%, quiz pass rate <50%, completion <30%) is pure business logic and should be tested in isolation, independently of database queries. Test that:

- A lesson with exactly 40% continuation does not trigger an anomaly.
- A lesson with 39% continuation does trigger an anomaly.
- Same boundary checks for quiz and completion thresholds.

### Unit Tests — CSV Serialisation

The CSV formatting logic (converting query results to CSV strings) should be a pure function and tested separately from the loader. Tests should confirm:

- Correct column headers per export type.
- Values are correctly escaped (commas, quotes in names).
- Empty result set produces a header row only.

### What Is Not Unit-Tested

- Chart rendering (Recharts components) — visual output is not testable at the unit level.
- Route loaders themselves — these are integration concerns and the project has no E2E test suite.
- Navigation link presence — verified by inspection during code review.

## Acceptance Criteria

Each criterion maps to one or more user stories. A story is complete when all its criteria pass.

### Revenue

- [ ] The overview page displays the sum of `pricePaid` (in pounds/dollars, converted from cents) across all of the instructor's courses.
- [ ] The per-course page displays the sum of `pricePaid` for that course only.
- [ ] Changing the time-period filter updates the revenue figure to include only purchases within that window.
- [ ] An instructor cannot see revenue figures for another instructor's courses.
- [ ] An admin can see revenue figures for any course.

### Enrollment

- [ ] Enrollment count matches the number of rows in `enrollments` for the course.
- [ ] Paid enrollment count matches enrollments that have a corresponding row in `purchases`.
- [ ] Free/coupon enrollment count equals total enrollments minus paid enrollments.
- [ ] Changing the time-period filter updates the enrollment chart to show only enrolments within that window.

### Completion

- [ ] Completion rate = `COUNT(enrollments WHERE completedAt IS NOT NULL) / COUNT(enrollments)`, expressed as a percentage.
- [ ] A course with zero enrolments shows 0% completion (not a divide-by-zero error).
- [ ] A course where every enrolled student has `completedAt` set shows 100%.

### Quiz Pass Rates

- [ ] Best-attempt pass rate for a quiz = percentage of enrolled students whose highest-scoring attempt is ≥ 0.7.
- [ ] Latest-attempt pass rate = percentage of enrolled students whose most recent attempt is ≥ 0.7.
- [ ] Both figures are shown side-by-side for each quiz.
- [ ] A quiz with no attempts shows 0% for both metrics (not an error).
- [ ] Average score per quiz is shown and matches `AVG(score)` across all attempts for that quiz.

### Drop-off

- [ ] The lesson funnel shows all lessons in the course in position order.
- [ ] Each lesson's bar height reflects the number of distinct students who have a `lessonProgress` record with status `in_progress` or `completed` for that lesson.
- [ ] The first lesson bar is the tallest (or equal-tallest).
- [ ] Lessons with no progress records show zero.
- [ ] Video drop-off is only shown for lessons that have a non-null `videoUrl` and non-null `durationMinutes`.
- [ ] A lesson with no `videoWatchEvents` shows no video drop-off chart (not an error).

### Anomaly Callouts

- [ ] A drop-off anomaly callout appears when the student count at a lesson is less than 60% of the student count at the previous lesson.
- [ ] The first lesson is never flagged as a drop-off anomaly (no previous lesson to compare to).
- [ ] A quiz anomaly callout appears when the best-attempt pass rate for a quiz is below 50%.
- [ ] A course completion anomaly callout appears when the course completion rate is below 30%.
- [ ] No anomaly callouts appear when all metrics are within acceptable thresholds.

### CSV Export

- [ ] Downloading the enrollment export produces a `.csv` file with columns: student name, email, enrolled at, paid/free, completion status.
- [ ] Downloading the revenue export produces a `.csv` file with columns: purchase date, student name, course title, amount paid.
- [ ] Downloading the quiz results export produces a `.csv` file with columns: student name, quiz title, best score, best attempt passed, latest score, latest attempt passed.
- [ ] If a time-period filter is active, exported records are filtered to match.
- [ ] Exporting when there is no data produces a file with a header row and no data rows.

### Access Control

- [ ] An unauthenticated user is redirected away from all analytics routes.
- [ ] A student role cannot access any analytics route (receives a 403 or redirect).
- [ ] An instructor can only load analytics for courses where they are the `instructorId`.
- [ ] An instructor attempting to load analytics for another instructor's course receives a 403 or redirect.
- [ ] An admin can load analytics for any course without restriction.

### Empty States

- [ ] An instructor with no published courses sees an empty state on the overview page.
- [ ] A course with no enrolments shows zero for all metrics and renders without errors.
- [ ] A course with no quizzes shows no quiz section (not an empty table).

## Out of Scope

- Real-time or streaming analytics (all data is computed on page load).
- Email or notification delivery of analytics reports.
- Student-facing analytics or progress dashboards.
- Instructor revenue share or payout modelling — revenue figures represent raw `pricePaid` only.
- A/B testing or content experimentation features.
- Integration with external analytics platforms (e.g. Google Analytics, Mixpanel).
- Configurable anomaly thresholds per-instructor or per-course.
- Scheduled or automated CSV exports.
- Platform-wide admin analytics beyond what is visible through the instructor dashboard (e.g. cross-instructor comparisons, platform P&L).

## Further Notes

- `videoWatchEvents` records play/pause/seek events but does not store total watch duration directly. Video drop-off must be approximated from `MAX(positionSeconds)` per user per lesson session, which may slightly overcount watch depth if students seek forward.
- The `lessonProgress` table has no `createdAt` column, so lesson-level drop-off cannot be time-filtered. This is a known limitation.
- `durationMinutes` on lessons is nullable. Lessons with no duration set should be excluded from video drop-off calculations.
- For the overview page, instructors with no published courses should see an empty state with a prompt to create or publish a course.
