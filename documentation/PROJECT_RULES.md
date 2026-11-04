# GoSwiftHR Intelligence — Project Rules & Engineering Standards

All contributors and AI agents working on GoSwiftHR Intelligence must adhere to these non-negotiable architectural and engineering rules.

---

## 1. Architectural Boundaries

1. **Frontend / Backend Independence**:
   - The `frontend/` and `backend/` applications must remain strictly independent.
   - Never import code, types, or modules directly across `frontend` and `backend` file trees. Shared contracts must be mirrored through TypeScript interfaces or generated from OpenAPI schemas.
2. **Backend Owns All Business Logic**:
   - All calculations, score computation, risk models, benchmark comparisons, recommendations, and lead qualifications **must be performed on the backend**.
   - The frontend must never run shadow score calculations or make assumptions about scoring formulas.
3. **Versioned REST API**:
   - All backend API endpoints must reside under the global prefix `/api/v1`.
   - Never expose unversioned root API routes.
4. **Interactive OpenAPI / Swagger Documentation**:
   - Every public and internal controller method must be decorated with Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBody`).
   - Swagger docs must be accessible at `/api/docs`.
5. **No Microservices at Current Phase**:
   - Keep the backend as a single, well-structured, modular NestJS application. Avoid distributed message brokers or multi-service orchestration until specified.
6. **No Fake Connections or Hardcoded Secrets**:
   - Do not mock database connections in production services.
   - Do not commit secrets, passwords, or API keys. Always retrieve configuration through NestJS `ConfigService` or environment variables.

---

## 2. Backend Coding Standards (NestJS)

1. **Layered Modular Architecture**:
   - **Modules**: Group feature-specific logic (`*.module.ts`).
   - **Controllers**: Handle HTTP routing, status codes, and input/output mapping only. No business logic in controllers (`*.controller.ts`).
   - **Services**: Contain pure business logic and transactional workflows (`*.service.ts`).
   - **DTOs**: Every incoming request body and query parameter must have a strongly-typed Data Transfer Object validated via `class-validator` and `class-transformer` (`*.dto.ts`).
2. **TypeScript Strictness**:
   - Strict mode is enabled (`strict: true`).
   - Never use `any` unless strictly unavoidable with explicit type narrowing.
   - Explicit return types are required on all public methods and functions.
3. **Database Operations via Prisma**:
   - Use `PrismaService` exclusively for database interaction.
   - Do not construct raw SQL strings or execute unescaped queries.
   - All schema changes must be accompanied by an official Prisma migration (`npx prisma migrate dev`).

---

## 3. Frontend Coding Standards (Next.js & Tailwind CSS)

1. **App Router Conventions**:
   - Use Next.js App Router (`src/app/`).
   - Default to React Server Components (RSC) unless interactivity (hooks, state, browser events) is required, in which case use `"use client"`.
2. **GoSwiftHR Design Token Usage**:
   - Strictly adhere to GoSwiftHR brand tokens:
     - Dark Teal: `bg-goswift-teal`, `text-goswift-teal`
     - Deep Navy: `bg-goswift-navy`, `text-goswift-navy`
     - Mint Green: `bg-goswift-mint`, `text-goswift-mint`
     - Light Grey: `bg-goswift-grey-light`, `border-goswift-grey-muted`
     - White: `bg-white`
3. **Responsive & Accessible**:
   - Mobile-first approach using responsive Tailwind breakpoints (`sm:`, `md:`, `lg:`).
   - Semantic HTML elements (`<header>`, `<nav>`, `<main>`, `<section>`, `<button>`).
4. **Environment Variables in Frontend**:
   - Only variables prefixed with `NEXT_PUBLIC_` may be referenced in client components.
   - Secrets must never be exposed with the `NEXT_PUBLIC_` prefix.

---

## 4. API Response & Error Standards

1. **Standardized Success Responses**:
   ```json
   {
     "data": {},
     "meta": {
       "timestamp": "2026-11-03T13:00:00.000Z"
     }
   }
   ```
2. **Standardized Error Responses**:
   ```json
   {
     "statusCode": 400,
     "message": ["email must be an email address"],
     "error": "Bad Request",
     "timestamp": "2026-11-03T13:00:00.000Z",
     "path": "/api/v1/leads"
   }
   ```

---

## 5. Verification & Testing Standards

1. Before committing changes or completing a phase:
   - Run `npm run build:backend` and ensure zero TypeScript or compilation errors.
   - Run `npm run build:frontend` and ensure zero Next.js build errors.
   - Verify that all environment variables are documented in the respective `.env.example` files.
