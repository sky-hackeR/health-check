# GoSwiftHR Intelligence Platform

A production-grade HR assessment, workforce analytics, ROI calculator, and lead generation platform for **[GoSwiftHR](https://goswifthr.com/)**.

---

## Architecture Overview

- **Frontend (`frontend/`)**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4 with custom GoSwiftHR design tokens. Runs on `http://localhost:3000`.
- **Backend (`backend/`)**: Modular NestJS 11 REST API with global versioning (`/api/v1`), Swagger OpenAPI documentation (`/api/docs`), and strict validation pipes. Runs on `http://localhost:3001`.
- **Database & ORM (`backend/prisma/`)**: PostgreSQL 16 managed via Prisma ORM (v6.4.1) for type-safe models and migrations. Runs on `localhost:5432`.
- **Infrastructure (`infrastructure/`)**: Docker Compose configuration for local PostgreSQL with healthchecks and persistent storage.
- **Documentation (`documentation/`)**: Complete architectural specifications, implementation plans, and project engineering rules.

---

## Directory Structure

```
health-check/
├── frontend/                     # Next.js 16 Web Application
│   ├── src/
│   │   └── app/                  # App Router pages and layouts
│   │       ├── globals.css       # Tailwind CSS v4 & GoSwiftHR design tokens
│   │       ├── layout.tsx        # Root HTML layout with brand metadata
│   │       └── page.tsx          # Initial platform landing screen
│   ├── .env.example              # Frontend environment template
│   ├── package.json
│   └── tsconfig.json             # TypeScript configuration
├── backend/                      # NestJS 11 API Server
│   ├── src/
│   │   ├── main.ts               # Server bootstrap, Swagger & CORS config
│   │   ├── app.module.ts         # Root NestJS application module
│   │   ├── prisma/               # Global PrismaService & lifecycle hooks
│   │   └── health/               # /api/v1/health status endpoint
│   ├── prisma/
│   │   └── schema.prisma         # Prisma data schema & generator
│   ├── .env.example              # Backend environment template
│   ├── package.json
│   └── tsconfig.json             # TypeScript strict configuration
├── infrastructure/               # Local Development Infrastructure
│   └── docker-compose.yml        # PostgreSQL 16 container definition
├── documentation/                # Architectural & Technical Documentation
│   ├── ARCHITECTURE.md           # System topology, data flow & boundaries
│   ├── IMPLEMENTATION_PLAN.md    # Multi-phase roadmap from setup to launch
│   └── PROJECT_RULES.md          # Coding standards, API specs & rules
├── docker-compose.yml            # Root compose shortcut
├── package.json                  # Root monorepo orchestration scripts
└── .gitignore                    # Git ignore rules for monorepo
```

---

## Prerequisites

Before running the project locally, ensure you have:

- **Node.js**: `v20.x` or `v22.x` (verified on `v22.18.0`)
- **npm**: `v10.x`
- **Docker & Docker Compose**: For local PostgreSQL container

---

## Quick Start Setup

### 1. Environment Configuration

Copy the example environment variable files:

```bash
# In the project root
cp .env.example .env

# In backend
cp backend/.env.example backend/.env

# In frontend
cp frontend/.env.example frontend/.env.local
```

### 2. Start PostgreSQL Database

Launch the containerized PostgreSQL database:

```bash
npm run docker:up
# Or: docker-compose up -d
```

PostgreSQL will start on `localhost:5432` with:
- **Database**: `goswifthr_intelligence`
- **User**: `goswift_admin`
- **Password**: `goswift_dev_pass_2026`

### 3. Generate Prisma Client

Generate the type-safe Prisma client:

```bash
npm run prisma:generate
# Or: cd backend && npx prisma generate
```

### 4. Start Development Servers

Run both servers concurrently or in separate terminals:

**Terminal 1 — Backend API:**
```bash
npm run dev:backend
# Or: cd backend && npm run start:dev
```
- API Base URL: [http://localhost:3001/api/v1](http://localhost:3001/api/v1)
- Swagger OpenAPI Docs: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- Health Check: [http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health)

**Terminal 2 — Frontend Application:**
```bash
npm run dev:frontend
# Or: cd frontend && npm run dev
```
- Web Application: [http://localhost:3000](http://localhost:3000)

---

## Production Build Verification

Verify that both applications compile without errors:

```bash
npm run build
```

Or individually:

```bash
npm run build:backend
npm run build:frontend
```

---

## Documentation Links

- [System Architecture](documentation/ARCHITECTURE.md)
- [Implementation Plan & Phased Roadmap](documentation/IMPLEMENTATION_PLAN.md)
- [Project Rules & Engineering Standards](documentation/PROJECT_RULES.md)
