# GoSwiftHR Intelligence — Comprehensive Technical Audit

**Audit Date**: November 2026  
**Audited Targets**: Frontend (Next.js 16), Backend (NestJS 11), Database (PostgreSQL 16 + Prisma ORM 6.4.1), Admin Control Panel.

---

## 1. Executive Summary

Phases 1 through 3 established the monorepo foundation, the 25-model relational database schema, database migrations, initial seed data, and the administrative dashboard shell under `/control-panel`.

However, the administrative dashboard currently relies on **simulated static mock data**, and the backend currently only exposes a single health check endpoint (`/api/v1/health`). 

Phase 4 bridges this gap by:
1. Converting the dashboard to be **100% database-driven** via dedicated NestJS API endpoints with realistic fallback empty states.
2. Building an **end-to-end, reusable assessment engine** on both backend and frontend.
3. Implementing the first calculator: **The Hidden Payroll Cost Calculator**.

---

## 2. Detailed Findings

### A. Existing Functionality
* **Monorepo Architecture**: Independent `frontend/` (Next.js App Router, port 3000) and `backend/` (NestJS modular core, port 3001) communicating via `/api/v1`.
* **Database & ORM**: PostgreSQL 16 schema with 25 models, 10 enums, foreign keys, unique constraints, and soft deletion (`deletedAt`).
* **Migrations**: Active migration `20261103133226_init_phase2_database_schema` applied to database `health`.
* **Seed Data**: 12 modular permissions, 3 system roles (`SUPER_ADMIN`, `ADMIN`, `ANALYST`), 1 initial administrator, 4 recommendation templates, and 4 baseline calculator versions.
* **Control Panel Shell**: Accessible under `/control-panel` with collapsible sidebar navigation, top bar, breadcrumbs, search modal (`⌘K`), notification popover, sign-out dialog, and dynamic route handler `[...slug]/page.tsx`.

---

### B. Existing Reusable Components (`frontend/src/components/ui/`)
1. **`MetricCard`**: KPI card with trend indicators, iconography, and subtitle.
2. **`DataTable`**: Generic typed data table with sorting, row actions, loading skeleton, and empty state fallback.
3. **`PageHeader`**: Standardized page title, subtitle, breadcrumb navigation, and action buttons.
4. **`FilterBar`**: Search input, status tab filters, count badges, and reset filter trigger.
5. **`StatusBadge`**: Semantic badge with indicator dots for leads, assessments, and integrations.
6. **`EmptyState`**: Empty container with icon, title, description, and primary CTA.
7. **`LoadingSkeleton`**: Animated skeleton placeholders for tables and metric cards.
8. **`ConfirmationDialog`**: Accessible modal dialog for destructive or high-impact actions.
9. **`SearchInput`**: Debounced search input with clear button and keyboard shortcut indicator.
10. **`DateRangeFilter`**: Multi-option time window dropdown.
11. **`Pagination`**: Pagination controls with page numbers, ellipsis, and total count.
12. **`SidebarNavigation`**: 7-group navigation sidebar with responsive mobile drawer and collapse toggle.

---

### C. Existing Hardcoded / Simulated Data (To Be Replaced)
1. **Dashboard Overview (`frontend/src/app/control-panel/page.tsx`)**:
   - `mockRecentLeads`: 5 hardcoded lead rows.
   - `mockActivities`: 4 hardcoded timeline events.
   - `mockFollowUps`: 2 hardcoded follow-up tasks.
   - Metric cards: Hardcoded strings (`"1,428"`, `"486"`, `"1,120"`, `"21.5%"`, `"84"`, `"34.0%"`).
   - Acquisition trend chart: Hardcoded SVG path coordinates and static month labels.
   - Calculator engagement breakdown: Static progress percentages (`42%`, `28%`, `18%`, `12%`).
   - Lead status distribution: Hardcoded counts (`400`, `485`, `343`, `200`).
   - Geographic origin preview: Hardcoded proportions (`54%`, `26%`, `20%`).
2. **Sub-Route Handler (`frontend/src/app/control-panel/[...slug]/page.tsx`)**:
   - `sampleRecords`: 4 static demo records.
3. **Top Navigation (`frontend/src/components/layout/TopNavbar.tsx`)**:
   - `mockNotifications`: 3 hardcoded notification items.

---

### D. Existing Database Models (Prisma Schema)
1. `AdminUser` (RBAC user)
2. `Role` (Role definitions)
3. `Permission` (Action permissions)
4. `RolePermission` (Join table)
5. `Company` (With `normalizedName` deduplication)
6. `Lead` (Contact, status, tier, GDPR/marketing consent)
7. `Calculator` (Container slug & name)
8. `CalculatorVersion` (Versioning for questions & scoring)
9. `Question` (Code, type, weight, ordering)
10. `QuestionOption` (Label, value, scoreValue)
11. `ScoreCategory` (Category groupings with weights)
12. `ScoringRule` (Formulas and multipliers)
13. `RecommendationTemplate` (Action plans & priorities)
14. `RecommendationRule` (Trigger thresholds)
15. `Assessment` (Session token, nullable `leadId` for anonymous exploration)
16. `AssessmentAnswer` (Option selection, text, numeric, raw JSON)
17. `AssessmentResult` (Immutable frozen category scores & ROI metrics)
18. `AssessmentRecommendation` (Preserved recommendation snapshots)
19. `TrackingEvent` (Independent visitor analytics)
20. `GeoLocation` (IP geolocation cache)
21. `Campaign` (UTM marketing attribution)
22. `WalkthroughRequest` (Executive consultations)
23. `LeadActivity` (Timeline activities)
24. `IntegrationLog` (Webhook and third-party sync audit)
25. `AuditLog` (Admin action history)
26. `Notification` (Alert queue)

---

### E. Existing API Endpoints
* `GET /api/v1/health` (System diagnostic endpoint)
* `GET /api/docs` (Swagger OpenAPI documentation)

---

### F. Missing Backend Functionality Required for Phase 4
1. **Admin Analytics API**:
   - `GET /api/v1/admin/dashboard`: Returns real-time aggregated metrics (`totalLeads`, `qualifiedLeads`, `completions`, `abandonmentRate`, `walkthroughRequests`, `conversionRate`), monthly acquisition trend data, calculator engagement distributions, funnel counts, geographic breakdowns, recent leads, activities, follow-ups, and integration statuses queried directly from PostgreSQL.
   - `GET /api/v1/admin/leads`: Filterable, paginated lead list querying the `Lead` and `Company` models.
2. **Assessment & Calculation Engine API**:
   - `GET /api/v1/calculators/:slug`: Fetches active published calculator configuration, categories, questions, options, and conditional display rules.
   - `POST /api/v1/assessments/start`: Initializes an anonymous assessment session with UUID `sessionToken`.
   - `GET /api/v1/assessments/:sessionToken`: Retrieves existing answers and state for autosave recovery.
   - `PUT /api/v1/assessments/:sessionToken/answers`: Upserts answers as respondent progresses through questions (autosave).
   - `POST /api/v1/assessments/:sessionToken/capture-lead`: Captures mandatory contact information (Email, Name, Company, Consent) and links the lead to the assessment.
   - `POST /api/v1/assessments/:sessionToken/calculate`: Executes deterministic backend business logic for **The Hidden Payroll Cost Calculator**, generates `AssessmentResult` with concrete dollar impact metrics and risk levels, triggers matched recommendations, and marks the assessment as `COMPLETED`.
   - `GET /api/v1/assessments/:sessionToken/result`: Fetches immutable result and recommendations.

---

## 3. Brand Identity Guidelines (GoSwiftHR)

Referencing **[GoSwiftHR](https://goswifthr.com/)**:
* **Logo**: GoSwiftHR brand symbol (`/brand/cut/symbol.png`) and clean typography.
* **Palette**:
  * **Deep Teal**: `#073634` / `#0D5C58` (Primary brand grounding, sidebars, headers).
  * **Mint Green**: `#10B981` / `#00D084` (Primary actions, CTA buttons, success metrics).
  * **Navy**: `#0A192F` / `#152238` (Typography, high-contrast surfaces).
  * **Pale Aqua**: `#E6FFFA` / `#CCFBF1` (Soft badges, progress highlights, card accents).
  * **White**: `#FFFFFF` (Card surfaces, inputs, clean whitespace).
  * **Light Grey**: `#F8FAFC` / `#F1F5F9` (Application canvas, borders `#E2E8F0`).
  * **Restrained Accents**: Amber (`#F59E0B`) for warnings, Indigo/Blue (`#3B82F6`) for information.

---

## 4. Proposed Implementation Sequence

### Stage 1: Backend Admin Dashboard & Analytics Service
* Create `DashboardModule` (`dashboard.controller.ts`, `dashboard.service.ts`).
* Implement real PostgreSQL queries for all metrics, recent leads, activities, and follow-ups.
* Handle empty states gracefully (returning zero counts, empty arrays, and clear status).

### Stage 2: Connect Frontend Dashboard to Live API
* Create an API client in `frontend/src/lib/api.ts`.
* Replace hardcoded mock data in `frontend/src/app/control-panel/page.tsx` with live data fetched from `/api/v1/admin/dashboard`.
* Display the reusable `LoadingSkeleton` during loads and `EmptyState` when records are zero, without ever substituting static fake data.

### Stage 3: Core Assessment & Calculation Backend Engine
* Create `AssessmentsModule` and `CalculatorsModule`.
* Implement the calculation formula for the **Hidden Payroll Cost Calculator**:
  * Base payroll overhead calculation.
  * Time lost to manual payroll processing & errors.
  * Contractor misclassification & tax penalty exposure risk.
  * Projected annual savings with GoSwiftHR.
* Implement recommendation matching rules linked to `RecommendationTemplate`.

### Stage 4: Public Frontend Assessment Flow
* Build the interactive public calculator under `/calculator/payroll-cost` (and embeddable reusable container).
* Support:
  * Progressive question step navigation with smooth transitions.
  * Local storage / backend autosave.
  * Mandatory email and lead capture gate before revealing results.
  * Comprehensive result screen showing calculated dollar impact, score breakdowns, and personalized recommendation action plans.
