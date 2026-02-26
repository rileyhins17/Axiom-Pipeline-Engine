# The Omniscient - Setup Guide

Welcome to **The Omniscient**, your advanced Playwright-powered lead scraping and AI intelligence dashboard. 

Follow these steps to get your local environment running.

## 1. Environment Variables
Create a `.env` file in the root of the project (`the-omniscient/.env`) and add the following keys:

```env
# Your Google Gemini API Key for the Deep Search Reasoning Engine
GEMINI_API_KEY="your_gemini_api_key_here"

# Your SQLite Database URL (Prisma default)
DATABASE_URL="file:./dev.db"
```

## 2. Database Initialization
This project uses **Prisma** with a local SQLite database to persist your targets.

First, ensure your schema is synced to the database. Run the following command in the terminal at the root of the project (`the-omniscient/`):

```bash
npx prisma db push
```

## 3. Playwright Browser Engines
Since the Application uses Playwright to perform live Google Maps scraping in the API route, you must install the Chromium binary if you haven't already.

```bash
npx playwright install chromium
```

## 4. Run the Dev Server
Start your Next.js local development server:

```bash
npm run dev
```

Navigate to `http://localhost:3000` to access **The Hunt** control panel. 

## Extraction Constraints
By default, the `api/scrape/route.ts` is configured to stop after finding and enriching **3 targets without websites** per execution. This prevents the API request from timing out in the Next.js local environment. If you want to increase this limit, edit the `break` condition inside `/api/scrape/route.ts`.
