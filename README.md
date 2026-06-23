# C2C Product Data Retriever

> **Production-grade web scraper** for extracting certified product data and assessment certificates from the [C2C Certified Products](https://c2ccertified.org/certified-products) platform.

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![Puppeteer](https://img.shields.io/badge/Puppeteer-24-40B5A8?logo=googlechrome)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
  - [Project Structure](#project-structure)
  - [Data Flow](#data-flow)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Environment Variables](#environment-variables)
- [Docker Deployment](#docker-deployment)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)

---

## Overview

The **C2C Product Data Retriever** automates the extraction of detailed product information and Cradle to Cradle (C2C) certification data. It uses Puppeteer with stealth plugins to reliably scrape product pages, persists results in a SQLite/PostgreSQL database via Prisma, and streams live progress updates to the UI over **Server-Sent Events (SSE)**.

The system is designed for production use: it handles session recovery after page reloads, supports job cancellation, and exports all data as an Excel report.

---

## Key Features

| Feature | Description |
|---|---|
| 🤖 **Headless Scraping** | Puppeteer + `puppeteer-extra-plugin-stealth` to bypass bot detection |
| ⚡ **Concurrency Control** | `p-limit` manages parallel browser pages to prevent memory exhaustion |
| 📡 **Real-time Updates** | Server-Sent Events (SSE) stream live log lines and progress counters to the UI |
| 🔄 **Session Recovery** | Active jobs are persisted in `localStorage` and reconnected on page reload |
| 📊 **Excel Export** | One-click download of all extracted product data via `exceljs` |
| 🛑 **Graceful Stop** | Jobs can be cancelled mid-run; the database reflects the cancelled state |
| 🐳 **Docker Ready** | Multi-stage Dockerfile with system Chromium (no bundled browser) |

---

## Architecture

### Project Structure

```
c2c-product-info/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── extract/
│   │   │       ├── start/      # POST  – launch a new scrape job
│   │   │       ├── stop/       # POST  – cancel a running job
│   │   │       ├── status/     # GET   – poll job status
│   │   │       ├── events/     # GET   – SSE stream for live logs
│   │   │       └── export/     # GET   – download Excel report
│   │   ├── page.tsx            # Main UI page
│   │   └── layout.tsx          # Root layout (fonts, metadata)
│   ├── components/             # Reusable React components
│   ├── hooks/
│   │   └── useProductExtractor.ts  # Core extraction lifecycle hook
│   ├── services/
│   │   └── extractionService.ts    # API client layer
│   ├── lib/                    # Prisma client & shared utilities
│   ├── types/                  # Shared TypeScript types
│   └── utils/                  # Helper functions
├── prisma/
│   └── schema.prisma           # Database schema (ScrapeJob + Product)
├── Dockerfile                  # Multi-stage production image
├── start.sh                    # Container entrypoint (db push + server)
└── .env                        # Local environment variables
```

### Data Flow

```
User clicks "Start"
      │
      ▼
useProductExtractor (hook)
  ├─ generates UUID jobId
  ├─ calls extractionService.start()
  │       │
  │       ▼
  │   POST /api/extract/start
  │       ├─ creates ScrapeJob in DB
  │       └─ launches background scraper (Puppeteer)
  │
  └─ opens SSE connection to /api/extract/events?jobId=...
          │
          ▼ (streaming)
      Log lines & progress → UI updates in real time
          │
          ▼ (on complete)
      Job status: "completed" → Excel export available
```

---

## Data Model

Two Prisma models back the system.

### `ScrapeJob`

Tracks the lifecycle of a single scrape run.

| Field | Type | Description |
|---|---|---|
| `id` | `String` (cuid) | Unique job identifier |
| `status` | `String` | `running` \| `completed` \| `failed` |
| `totalItems` | `Int` | Total products discovered |
| `processedItems` | `Int` | Products processed so far |
| `createdAt` | `DateTime` | Job start time |
| `updatedAt` | `DateTime` | Last status update |

### `Product`

Stores all extracted certificate data for a single product.

| Field | Type | Description |
|---|---|---|
| `id` | `String` (cuid) | Unique product record ID |
| `jobId` | `String` | Foreign key → `ScrapeJob` |
| `status` | `String` | `pending` \| `success` \| `error` \| `cancelled` |
| `slug` | `String` | URL slug from the C2C platform |
| `productName` | `String?` | Official product name |
| `company` | `String?` | Manufacturer / company name |
| `level` | `String?` | Overall certification level |
| `standardVersion` | `String?` | C2C standard version |
| `effectiveDate` | `String?` | Certificate effective date |
| `expirationDate` | `String?` | Certificate expiration date |
| `leadAssessmentBody` | `String?` | Lead assessment organization |
| `materialHealthLevel` | `String?` | Material health score level |
| `circularityLevel` | `String?` | Circularity score level |
| `pdfUrl` | `String?` | Direct URL to the certificate PDF |
| `errorReason` | `String?` | Error message if extraction failed |

> **Unique constraint**: `[jobId, slug]` — prevents duplicate entries per job.

---

## API Reference

All endpoints are under `/api/extract/`.

### `POST /api/extract/start`

Starts a new background scrape job.

**Request body**
```json
{
  "jobId": "cuid-generated-by-client",
  "limit": 50
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `jobId` | `string` | ✅ | Pre-generated unique job ID |
| `limit` | `number` | ❌ | Max products to scrape (omit for all) |

**Response `200 OK`**
```json
{ "jobId": "cl..." }
```

---

### `POST /api/extract/stop`

Sends a cancellation signal to a running job.

**Request body**
```json
{ "jobId": "cl..." }
```

**Response `200 OK`**
```json
{ "success": true }
```

---

### `GET /api/extract/status?jobId=<id>`

Returns the current status and progress of a job.

**Response `200 OK`**
```json
{
  "status": "running",
  "processedItems": 42,
  "totalItems": 200
}
```

---

### `GET /api/extract/events?jobId=<id>`

Opens a **Server-Sent Events** stream. Each event is a JSON-encoded log line or progress update.

```
data: {"type":"log","message":"Scraping product: eco-panel-x1"}
data: {"type":"progress","processedItems":43,"totalItems":200}
data: {"type":"done","status":"completed"}
```

---

### `GET /api/extract/export?jobId=<id>`

Generates and streams an Excel (`.xlsx`) file containing all products for the given job.

**Response**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

## Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher
- A **SQLite** file (default) or a **PostgreSQL** database

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/your-org/c2c-product-info.git
cd c2c-product-info

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env — see the table below

# 4. Run database migrations
npx prisma migrate dev --name init

# 5. Start the development server
npm run dev
```

The app is now available at **http://localhost:3000**.

### Environment Variables

Create a `.env` file in the project root with the following variables:

| Variable | Required | Example | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `file:./prisma/dev.db` | Prisma connection string (SQLite or PostgreSQL) |

> For **PostgreSQL**, change the `datasource provider` in `prisma/schema.prisma` to `postgresql` and supply a full connection URL, e.g. `postgresql://user:pass@host:5432/dbname`.

### Useful Scripts

| Script | Command | Description |
|---|---|---|
| Development | `npm run dev` | Start Next.js dev server with HMR |
| Build | `npm run build` | Create production bundle |
| Start | `npm run start` | Run the production build |
| Lint | `npm run lint` | ESLint check |
| Test | `npm run test` | Run tests with Vitest |
| DB Studio | `npx prisma studio` | Open Prisma's visual DB browser |

---

## Docker Deployment

The included **multi-stage Dockerfile** produces a lean production image with system Chromium (no bundled Puppeteer browser).

```bash
# Build the image
docker build -t c2c-product-retriever .

# Run the container
docker run -p 3000:3000 \
  -e DATABASE_URL="file:/app/prisma/dev.db" \
  c2c-product-retriever
```

### What the image does

1. **Stage 1 (builder)**: Installs all dependencies, generates the Prisma client, and runs `next build`.
2. **Stage 2 (runner)**: Copies only the production artefacts, installs system Chromium and required fonts, sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`, and runs `start.sh` on container start.

`start.sh` runs `prisma db push` before starting the Next.js server, ensuring the schema is always up to date.

### Environment variables for Docker

| Variable | Description |
|---|---|
| `DATABASE_URL` | Database connection string |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | Set to `true` (already in Dockerfile) |
| `PUPPETEER_EXECUTABLE_PATH` | Path to system Chromium (already in Dockerfile) |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2 |
| UI | React | 19 |
| Language | TypeScript | 5 |
| ORM | Prisma | 6 |
| Scraping | Puppeteer + Stealth Plugin | 24 |
| Concurrency | p-limit | 3 |
| Validation | Zod | 4 |
| PDF Parsing | pdf-parse / pdfjs-dist | — |
| Export | ExcelJS | 4 |
| HTTP client | Axios | 1.15 |
| Icons | Lucide React | — |
| Styling | Vanilla CSS | — |
| Testing | Vitest | 4 |

---

## Contributing

1. Fork the repository and create a feature branch: `git checkout -b feat/my-feature`
2. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
3. Open a Pull Request and describe what changed and why

---

*Built with ❤️ — C2C Product Data Retriever*
