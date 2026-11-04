# GoSwiftHR Intelligence — Implementation Plan

This document outlines the phased roadmap for building and deploying the GoSwiftHR Intelligence platform.

---

## Phase Status Summary

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1** | Foundation & Monorepo Architecture | **COMPLETED** |
| **Phase 2** | Domain Data Modeling & Prisma Schema Migrations | **COMPLETED** |
| **Phase 3** | GoSwiftHR Administrative Dashboard Foundation | **COMPLETED** |
| **Phase 4** | Live Dashboard Intelligence & Production Assessment Platform | **IN PROGRESS (Stage 1 Completed)** |
| **Phase 5** | Lead Generation, Capture & Qualification Engine | Upcoming |
| **Phase 6** | Frontend Assessment Wizard & Calculator UI | Upcoming |
| **Phase 7** | Assessment Results, PDF Report & Dynamic Insights | Upcoming |
| **Phase 8** | Production Hardening, Testing & CI/CD Deployment | Upcoming |

---

## Detailed Phase Breakdown

### Phase 1: Project Foundation (Completed)
- [x] Monorepo directory structure established (`frontend/`, `backend/`, `infrastructure/`, `documentation/`).
- [x] Next.js 16 application initialized with App Router, TypeScript, and Tailwind CSS.
- [x] GoSwiftHR design tokens configured in Tailwind CSS (dark teal, deep navy, mint green, white, light grey).
- [x] NestJS 11 backend initialized with TypeScript in strict mode.
- [x] Versioned REST API routing (`/api/v1`) and Swagger OpenAPI documentation (`/api/docs`).
- [x] Prisma ORM (v6.4.1) integrated with PostgreSQL datasource.
- [x] Docker Compose configured for local PostgreSQL (port 5432) with persistent volume and healthchecks.
- [x] Environment variable templates (`.env.example`) configured across all tiers.
- [x] Build and startup checks executed and validated for both frontend and backend.

---

### Phase 2: Domain Data Modeling & Prisma Schema Migrations (Completed)
- [x] Define all 25 relational models and enums in `backend/prisma/schema.prisma`.
- [x] Model core domains: RBAC, Organizations, Leads, Calculators, Versions, Questions, Recommendations, Auditing, and Notifications.
- [x] Configure PostgreSQL relations, unique constraints, foreign keys, and performant indexes.
- [x] Implement anonymous assessment sessions prior to lead capture (`leadId` nullable on `Assessment`).
- [x] Model independent high-frequency visitor tracking events (`TrackingEvent`, `GeoLocation`).
- [x] Preserve immutable historical results (`AssessmentResult` with frozen category scores and calculated ROI metrics).
- [x] Apply initial migration `20261103133226_init_phase2_database_schema` to PostgreSQL.
- [x] Create and execute seed script for system roles, permissions, recommendation templates, initial administrator, and the 4 independent calculators.
- [x] Create comprehensive database design documentation with Mermaid ERD in `documentation/DATABASE_DESIGN.md`.
- [x] Write and pass database integration tests (`src/prisma/prisma.service.spec.ts`) and e2e test suite.

---

### Phase 3: GoSwiftHR Administrative Dashboard Foundation (Completed)
- [x] Administrative interface routed under `/control-panel`.
- [x] Visual identity applied: dark teal sidebar (`#073634`), deep navy typography (`#0A192F`), mint green primary actions (`#10B981`), light grey background (`#F8FAFC`), white cards with subtle borders.
- [x] Collapsible persistent desktop sidebar with icon-only toggle and mobile drawer overlay.
- [x] All 7 sidebar navigation groups with 26 active links: Overview, Lead Management, Assessment Management, Calculators, Intelligence, Analytics, System.
- [x] Reusable component suite: `MetricCard`, `DataTable`, `PageHeader`, `FilterBar`, `StatusBadge`, `EmptyState`, `LoadingSkeleton`, `ConfirmationDialog`, `SearchInput`, `DateRangeFilter`, `SidebarNavigation`, `Pagination`.
- [x] Top navigation bar with live breadcrumbs, quick search modal (⌘K), notifications popover, and user profile dropdown with sign-out confirmation.
- [x] Polished dashboard overview: 6 core metric cards, SVG lead acquisition chart, calculator performance breakdown, status distribution, geographic origin preview, recent leads table, activities stream, follow-up queue, and live integration health checker.
- [x] Dynamic sub-page router (`/control-panel/[...slug]`) ensuring all 26 sidebar links are 100% navigable with active filtering, pagination, and empty states.
- [x] Verified full monorepo and frontend compilation without errors.

---

### Phase 4: Production Platform & Live Intelligence (In Progress)

#### Stage 1: Live Dashboard Intelligence (Completed)
- [x] Removed all dummy mock records, hardcoded analytics, and static badge counts from `/control-panel`.
- [x] Extracted theme design tokens from `goswifthr.com` and user reference visuals (deep night background `#070913`, electric brand blue `#3B82F6`/`#4F46E5`, mint green `#00D294`, deep teal `#073634`, light grey `#F8FAFC`) with full light and dark mode support.
- [x] Created `DashboardModule` in NestJS with `dashboard.controller.ts`, `dashboard.service.ts`, and DTOs:
  - `GET /api/v1/admin/dashboard`: Real-time aggregated business metrics, completion and conversion rates with division-by-zero safeguards, monthly chart series, calculator breakdown, status distribution, geographic distribution, recent leads, activities, follow-ups, and live database latency check.
  - `GET /api/v1/admin/leads`: Paginated, filtered lead retrieval querying PostgreSQL directly.
- [x] Created frontend API client (`frontend/src/lib/api.ts`) with typed methods for dashboard metrics, leads data, and health pings.
- [x] Connected `/control-panel` to live API endpoints with loading skeletons, error retry state, authentic empty states, and dynamic SVG chart rendering.
- [x] Implemented and passed automated unit/integration tests in `backend/src/dashboard/dashboard.service.spec.ts` (9/9 tests passing).
- [x] Verified both backend and frontend compile with 0 errors (`npm run build:backend` and `npm run build:frontend`).

#### Stage 2: Reusable Assessment Engine (Completed)
- [x] Schema Migration `20261103153645_add_conditional_display_and_session_expiry`:
  - Added `displayConditions Json?` to `Question` for dynamic visibility branching.
  - Added `expiresAt DateTime?` to `Assessment` for cryptographically verified session lifespans.
- [x] Created `ConditionEvaluator` (`backend/src/assessments/condition-evaluator.ts`):
  - Supported operators: `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `CONTAINS`, `NOT_CONTAINS`, `IS_EMPTY`, `IS_NOT_EMPTY`.
  - Supported logical groupings: `AND` / `OR` multi-condition trees.
- [x] Created `AssessmentsModule` (`backend/src/assessments/`):
  - `GET /api/v1/calculators/:slug`: Retrieves active published calculator configuration, with internal scoring weights and rules strictly withheld.
  - `POST /api/v1/assessments/start`: Initializes anonymous session with 64-char crypto session token and optional marketing tracking.
  - `GET /api/v1/assessments/:sessionToken`: Resumes unfinished assessments, evaluates live visibility per question, and recalculates progress.
  - `PUT /api/v1/assessments/:sessionToken/answers`: Enforces question ownership, validates inputs by `QuestionType`, and performs idempotent transactional upserts.
  - `POST /api/v1/assessments/:sessionToken/complete`: Validates that all visible required questions have answers, locking the assessment state into `COMPLETED`.
- [x] Passed 100% of automated unit and integration tests (30/30 tests passing across 4 suites).

#### Stage 3: Scoring Engine & Business Logic (Upcoming)
- [ ] Create `CalculatorModule` in NestJS:
  - `POST /api/v1/calculator/workforce-roi`: Calculate cost of turnover, manual HR admin hours, and potential savings.
  - Formulas for cost per hire, attrition impact, and automation ROI.
- [ ] Unit test all arithmetic calculations, boundary cases, and division-by-zero safeguards.

---

### Phase 5: Lead Generation, Capture & Qualification Engine
- [ ] Create `LeadsModule` in NestJS:
  - `POST /api/v1/leads`: Capture lead along with assessment submission ID.
  - Lead scoring & qualification logic (Hot / Warm / Cold).
  - Webhook integration or email notification dispatch for GoSwiftHR sales team.
- [ ] Implement duplicate lead prevention and GDPR/privacy consent logging.

---

### Phase 6: Frontend Assessment Wizard & Calculator UI
- [ ] Build reusable UI component library matching GoSwiftHR design tokens:
  - Buttons, inputs, sliders, radio cards, progress bars, score badges.
- [ ] Implement multi-step Assessment Wizard:
  - Step transitions, progress indicator, state management.
  - Autosave state in local storage / session storage.
- [ ] Implement interactive ROI Calculator:
  - Real-time sliders for employee headcount, average salary, annual turnover rate.
  - Visual charts showing savings projections.

---

### Phase 7: Assessment Results, PDF Report & Dynamic Insights
- [ ] Build Results Presentation view:
  - Overall HR maturity score card.
  - Category breakdowns (Radar/Bar visual charts).
  - High-priority risk alerts and actionable recommendations.
- [ ] Implement PDF report generation (downloadable executive summary for decision-makers).

---

### Phase 8: Admin Dashboard & Lead Management
- [ ] Create administrative API endpoints (protected with JWT authentication and RBAC):
  - `GET /api/v1/admin/leads`: Filter and export leads to CSV.
  - `GET /api/v1/admin/analytics`: Aggregated assessment metrics and conversion rates.
- [ ] Build secure admin views in Next.js.

---

### Phase 9: Production Hardening, Testing & Deployment
- [ ] Implement rate limiting (`@nestjs/throttler`) on submission and lead endpoints.
- [ ] Configure Helmet security headers and CSRF protection.
- [ ] Write Jest unit and e2e integration test suites.
- [ ] Multi-stage production Dockerfiles for frontend and backend.
- [ ] CI/CD pipeline (GitHub Actions) for linting, type-checking, testing, and container deployment.
