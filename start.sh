#!/bin/sh
set -e

# Initialise / sync the Prisma schema to a fresh SQLite database
echo "[start.sh] Running Prisma DB push..."
npx prisma db push --accept-data-loss

echo "[start.sh] Starting Scraper production server..."
npm run start
