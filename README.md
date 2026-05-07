# C2C Product Data Retriever

An advanced, production-grade product extraction system built with Next.js, Puppeteer, and Prisma. This tool automates the retrieval of detailed product information and assessment certificates from the C2C platform https://c2ccertified.org/certified-products.

## 🚀 Key Features

- **Robust Background Scraper**: High-performance extraction engine using Puppeteer with built-in concurrency management and memory optimization.
- **Real-time Event Tracking**: Leverages Server-Sent Events (SSE) to provide live updates on extraction progress, item counts, and system logs.
- **Session Persistence & Recovery**: Automatically recovers active extraction sessions on page reload using `localStorage` and a custom `reconnecting` state.
- **Modern Tech Stack**: Built with Next.js 14 (App Router), TypeScript, Prisma ORM, and optimized with Google Fonts (Inter & JetBrains Mono).
- **Automated Report Generation**: One-click Excel export functionality for all extracted product data.

## 🛠️ Architecture

- **`useProductExtractor`**: A high-performance custom React hook managing the entire extraction lifecycle, SSE connections, and UI state.
- **Background Workers**: Isolated scraping logic designed for stability on cloud platforms like Railway, featuring automated browser lifecycle management.
- **Event-Driven UI**: Atomic state updates and stabilized callbacks to ensure a smooth, flicker-free user experience.

## 🎨 Design System

- **Typography**: Optimized with `Inter` for clarity and `JetBrains Mono` for technical log precision.
- **Aesthetics**: Premium "Dark Mode" console look for the log viewer with micro-animations and status-based iconography.
- **Performance**: Zero-dependency styling using Vanilla CSS for maximum speed and flexibility.

## 🏁 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL (or compatible) database

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Setup your `.env` with `DATABASE_URL`
4. Run migrations: `npx prisma migrate dev`
5. Start development: `npm run dev`

---

