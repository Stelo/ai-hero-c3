# Plan: Instructor Analytics Dashboard

> Source PRD: plans/prd-instructor-analytics-dashboard.md

## Architectural decisions

- **Routes**:
  - `GET /instructor/analytics` — cross-course overview (new file: `instructor.analytics.tsx`)
  - `GET /instructor/:courseId/analytics` — per-course detail (new file: `instructor.$courseId.analytics.tsx`)
  - `GET /instructor/:courseId/analytics/export` — CSV export (new file: `instructor.$courseId.analytics.export.tsx`)
- **Service**: All analytics queries live in a new `app/services/analyticsService.ts`, extended incrementally with each phase. No analytics logic in route loaders.
- **Access control**: Reuse the existing pattern — `getCurrentUserId` → role check → course ownership check. Instructors see only their own courses; admins see everything. Enforced in each loader.
- **Schema**: No schema changes. All data derived from existing tables: `purchases`, `enrollments`, `lessonProgress`, `quizAttempts`, `videoWatchEvents`, `lessons`, `courses`.
- **Time filtering**: URL search param `?period=7d|30d|90d|1y|all`. Applied to `purchases.createdAt` (revenue) and `enrollments.enrolledAt` (enrollment trend). Lesson drop-off is all-time only (no `createdAt` on `lessonProgress`).
- **Charts**: `recharts` added in Phase 2, client-side only (lazy-loaded to avoid SSR issues).
- **Pass threshold**: A quiz attempt is considered passing at score ≥ 0.7.
- **Anomaly thresholds**: drop-off < 60% continuation to next lesson; quiz best-attempt pass rate < 50%; course completion rate < 30% after 7 days.
- **Tests**: Vitest with in-memory SQLite, following the existing pattern in `app/test/setup.ts`. New seed helpers for purchases, enrollments, quiz attempts, lesson progress, and video watch events added to that file.

---

## Phase 1: Cross-course overview page

**User stories**: 1, 2, 17, 18, 22, 23

### What to build

Create `analyticsService.ts` with the queries needed for the overview: total revenue per course (sum of `purchases.pricePaid`), total enrollment count per course, and completion rate per course. Build the `/instructor/analytics` route as a server-rendered page showing a summary card per course. Each card shows course title, total revenue (converted from cents), enrollment count, and completion rate. Instructors see only their own courses; admins see all courses. Add an "Analytics" link to the instructor nav. Include unit tests for all service functions introduced in this phase, including empty-state and access-scoping cases.

### Acceptance criteria

- [ ] An instructor visiting `/instructor/analytics` sees one summary card per course they own.
- [ ] Each card shows total revenue (sum of `pricePaid` in pounds/dollars), total enrollment count, and completion rate.
- [ ] An admin visiting `/instructor/analytics` sees cards for all courses on the platform.
- [ ] An unauthenticated user is redirected away from the route.
- [ ] A student role receives a 403.
- [ ] An instructor with no courses sees an empty state.
- [ ] `analyticsService` unit tests: revenue returns correct sum; zero enrollments gives 0% completion without error; instructor A's queries do not return data for instructor B's courses.

---

## Phase 2: Per-course analytics page with enrollment chart

**User stories**: 2, 3, 4, 5, 6, 8, 24

### What to build

Extend `analyticsService` with paid vs free enrollment split (enrollments with a matching `purchases` row = paid; without = free) and enrollment trend over time (enrollment counts bucketed by day/week within the selected period). Build the `/instructor/:courseId/analytics` route with a time-period filter (`?period=`) in the URL. Page shows: revenue for the course (filtered by period), enrollment split (total, paid, free), and enrollment trend as a `recharts` line chart. Add `recharts` as a dependency here. Access-controlled to the course owner and admins. Link to this page from the overview cards. Include unit tests for new service functions.

### Acceptance criteria

- [ ] Visiting `/instructor/:courseId/analytics` shows revenue, enrollment split, and enrollment trend for that course.
- [ ] Changing `?period=` updates the revenue figure and enrollment chart to the selected window.
- [ ] Paid enrollment count matches enrollments with a corresponding `purchases` row; free count equals total minus paid.
- [ ] An instructor cannot access this page for another instructor's course (403).
- [ ] An admin can access this page for any course.
- [ ] Overview summary cards link through to the per-course page.
- [ ] `analyticsService` unit tests: paid/free split is correct; time filter excludes records outside the window.

---

## Phase 3: Quiz analytics and drop-off funnel with charts

**User stories**: 9, 10, 11, 12, 13, 27

### What to build

Extend `analyticsService` with:
- Quiz metrics: best-attempt pass rate, latest-attempt pass rate, average score, total attempts, and average attempts per student — all per quiz for the course.
- Lesson drop-off: for each lesson (ordered by position), count distinct users with `lessonProgress.status` of `in_progress` or `completed`.
- Video drop-off: per lesson with a non-null `videoUrl` and non-null `durationMinutes`, approximate watch depth as `MAX(positionSeconds)` per user, averaged across users, divided by `durationMinutes * 60`.

Add a quiz section to the per-course page with a `recharts` bar chart showing best- and latest-attempt pass rates side-by-side per quiz, plus numeric figures for average score and attempt counts. Add a lesson funnel section with a bar chart showing student counts per lesson in position order. Show video drop-off inline below each lesson that has data. Include unit tests for all new service functions.

### Acceptance criteria

- [ ] The quiz section shows best-attempt pass rate, latest-attempt pass rate, average score, total attempts, and avg attempts per student for each quiz.
- [ ] A quiz with no attempts shows 0% for both pass rates and no error.
- [ ] Pass rates are shown side-by-side in a bar chart per quiz.
- [ ] A course with no quizzes shows no quiz section.
- [ ] The lesson funnel shows all lessons in position order; each bar reflects distinct users with non-`not_started` progress.
- [ ] The first lesson bar is the tallest (or equal-tallest).
- [ ] Lessons with no progress records show zero.
- [ ] Video drop-off is shown only for lessons with a non-null `videoUrl` and non-null `durationMinutes`.
- [ ] A lesson with no `videoWatchEvents` shows no video drop-off chart.
- [ ] `analyticsService` unit tests: pass rate calculations; funnel ordering; video drop-off excluded when duration is null.

---

## Phase 4: Anomaly callouts

**User stories**: 14, 15, 16

### What to build

Add pure anomaly-detection functions (no database access) that take the already-computed analytics data and return a list of anomalies. Three checks: a lesson where fewer than 60% of the previous lesson's students continued (drop-off anomaly); a quiz whose best-attempt pass rate is below 50% (quiz anomaly); a course whose completion rate is below 30% (course anomaly). Render anomaly callouts as highlighted warning cards at the top of the relevant section on the per-course page. Unit tests cover exact boundary conditions for all three thresholds.

### Acceptance criteria

- [ ] A drop-off anomaly callout appears when a lesson has fewer than 60% of the prior lesson's student count.
- [ ] The first lesson is never flagged as a drop-off anomaly.
- [ ] A quiz anomaly callout appears when the best-attempt pass rate is below 50%.
- [ ] A course completion anomaly callout appears when completion rate is below 30%.
- [ ] No callouts appear when all metrics are within thresholds.
- [ ] Unit tests: a lesson at exactly 60% continuation does not trigger; at 59% it does. Same boundary checks for quiz (50%) and completion (30%) thresholds.

---

## Phase 5: CSV export

**User stories**: 19, 20, 21

### What to build

Add a loader at `GET /instructor/:courseId/analytics/export?type=enrollments|revenue|quiz-results&period=...` that returns a `Response` with `Content-Type: text/csv` and `Content-Disposition: attachment`. Implement a pure CSV serialisation function that converts query results to a CSV string. Columns per export type:
- `enrollments`: student name, email, enrolled at, paid/free, completion status
- `revenue`: purchase date, student name, course title, amount paid
- `quiz-results`: student name, quiz title, best score, best attempt passed, latest score, latest attempt passed

Time-period filter applied where applicable. Access-controlled same as the analytics page. Add download buttons to the per-course analytics page. Unit tests for the CSV serialisation function cover correct headers, value escaping (commas and quotes in names), and empty result sets.

### Acceptance criteria

- [ ] Downloading each export type produces a correctly structured `.csv` file with the specified columns.
- [ ] If a time-period filter is active, exported records are filtered to match.
- [ ] Exporting with no data produces a header-only file with no error.
- [ ] Values containing commas or quotes are correctly escaped.
- [ ] An instructor cannot export data for another instructor's course.
- [ ] Unit tests: headers correct per type; comma/quote escaping; empty input produces header row only.
