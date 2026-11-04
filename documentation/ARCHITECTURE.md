# GoSwiftHR Intelligence — System Architecture

## 1. Overview

**GoSwiftHR Intelligence** is a production-oriented HR assessment, workforce analytics, ROI calculator, and lead generation platform designed for GoSwiftHR.

The application follows an independent monorepo architecture where the client layer (Frontend) and the business logic/persistence layer (Backend) remain strictly decoupled and communicate via versioned REST APIs.

```
+-------------------------------------------------------------+
|                      User Browser                           |
|       (Desktop, Tablet, Mobile Responsive Viewports)        |
+-------------------------------------------------------------+
                              |
                              | HTTP/HTTPS (Port 3000)
                              v
+-------------------------------------------------------------+
|                    Frontend Application                     |
|           Next.js 16 (App Router) + Tailwind CSS v4         |
|  - Assessment UI Wizard & Step Navigation                   |
|  - Real-time Interactive Visualizations                     |
|  - Lead Capture & Assessment Result Presentation            |
|  - GoSwiftHR Brand Design System Tokens                     |
+-------------------------------------------------------------+
                              |
                              | REST JSON Requests
                              | Base URL: /api/v1
                              | CORS Protected
                              v
+-------------------------------------------------------------+
|                     Backend API Server                      |
|                     NestJS Modular Core                     |
|                   (Listening on Port 3001)                  |
|  - Global Prefix: /api/v1                                   |
|  - Interactive Swagger Docs: /api/docs                      |
|  - Global ValidationPipe (DTO Whitelisting)                 |
|  - Business Logic & Domain Engine (HR Health Scoring)       |
|  - ROI & Workforce Metric Calculators                       |
|  - Recommendation Rules Engine                              |
|  - Lead Qualification & Notification Dispatcher             |
+-------------------------------------------------------------+
                              |
                              | Prisma ORM (v6.4.1)
                              | Connection Pooling & Migrations
                              v
+-------------------------------------------------------------+
|                     PostgreSQL Database                     |
|                     (Listening on 5432)                     |
|  - Relational Schema (Assessments, Submissions, Leads)      |
|  - Audit Logs & Analytical Aggregations                     |
+-------------------------------------------------------------+
```

---

## 2. Architectural Boundaries & Principles

### Strict Separation of Concerns
1. **Frontend Isolation**:
   - The frontend is responsible for presentation, form interaction, input validation UX, and responsive rendering.
   - The frontend **never** executes proprietary scoring algorithms, workforce risk models, or recommendation rules.
   - All calculations, benchmarks, and personalized advice originate from the backend API.
2. **Backend Domain Ownership**:
   - The backend owns all business logic, calculations, scoring formulas, authentication, recommendation rules, lead management, and database transactions.
   - The API is strictly versioned under `/api/v1`.
3. **No Microservices at Current Scale**:
   - The backend uses a cohesive, modular monolith structure with domain-driven boundaries within NestJS.
   - This eliminates distributed network latency, deployment complexity, and eventual consistency issues while maintaining clean domain isolation.
4. **Zero Fake Database Connections**:
   - Persistence is managed exclusively through Prisma ORM targeting real PostgreSQL instances.
5. **No Hardcoded Secrets**:
   - All connection strings, credentials, and tokens are read through `@nestjs/config` and injected via environment variables.

---

## 3. Technology Stack & Responsibilities

| Tier | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Next.js 16 (App Router) | High-performance React server and client components |
| **Styling** | Tailwind CSS v4 | Utility-first CSS using custom GoSwiftHR color tokens |
| **Language** | TypeScript 5 (Strict Mode) | End-to-end type safety across both frontend and backend |
| **Backend** | NestJS 11 | Enterprise, modular Node.js backend framework |
| **API Docs** | Swagger / OpenAPI 3.0 | Real-time interactive documentation available at `/api/docs` |
| **Database** | PostgreSQL 16 (Alpine) | ACID-compliant relational persistence |
| **ORM** | Prisma 6.4.1 | Type-safe schema definition, migrations, and query generation |
| **Local Infra**| Docker Compose | Reproducible local PostgreSQL container with healthchecks |

---

## 4. Backend Modular Structure

The backend application is structured into domain and infrastructure modules:

```
backend/src/
├── main.ts                     # Application bootstrap, Swagger, CORS, Validation
├── app.module.ts               # Root module orchestrating feature modules
├── prisma/                     # Database access layer
│   ├── prisma.service.ts       # Prisma Client lifecycle provider
│   └── prisma.module.ts        # Global database module
├── health/                     # System diagnostics & health check
│   ├── health.controller.ts    # /api/v1/health endpoint
│   └── health.module.ts
└── [future modules]
    ├── assessment/             # Questionnaires, question sets, and evaluation
    ├── calculator/             # HR ROI & workforce cost calculation engine
    ├── leads/                  # Lead capture, qualification, and routing
    └── auth/                   # Authentication & administrative access
```

---

## 5. Design System Tokens (GoSwiftHR Branding)

The design system incorporates GoSwiftHR's official brand palette:

- **Deep Navy (`#0A192F`)**: Used for primary headers, high-contrast surfaces, and grounding visual elements.
- **Dark Teal (`#0D5C58`)**: Used for branding accents, subheadings, and secondary actions.
- **Mint Green (`#10B981`)**: Used for highlights, success metrics, progress meters, and key call-to-actions.
- **White (`#FFFFFF`)**: Card surfaces, primary content containers, and clean whitespace.
- **Light Grey (`#F8FAFC`, `#E2E8F0`)**: Page backgrounds, borders, and input boundaries.

---

## 6. Security & Operational Architecture

- **CORS**: Configured in `main.ts` to allow verified origins (local dev `http://localhost:3000`).
- **Input Validation**: `ValidationPipe` with `whitelist: true` strips unknown properties from incoming request bodies.
- **Database Resilience**: Prisma connection startup is non-blocking so API containers and health probes initialize cleanly even during database recovery.
- **Docker Compose**: Pre-configured with persistent named volumes and `pg_isready` healthcheck probes.
