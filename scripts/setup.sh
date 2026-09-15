#!/bin/bash
# Setup script for Interviewed platform
set -e

echo "Installing dependencies..."
npm install

echo "Setting up environment..."
cp .env.example .env

echo "Generating Prisma client..."
npm run prisma:generate

echo "Running migrations..."
npm run prisma:migrate

echo "Seeding database..."
npm run prisma:seed

echo "Setup complete!"
