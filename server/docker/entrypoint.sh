#!/bin/sh

set -eu

echo "========================================"
echo "Starting What's Next Backend"
echo "========================================"

echo "Environment: ${NODE_ENV:-production}"
echo "Port: ${PORT:-4000}"

if [ "${RUN_PRISMA_GENERATE_ON_START:-false}" = "true" ]; then
  echo ""
  echo "Generating Prisma Client..."
  npx prisma generate
fi

if [ "${RUN_PRISMA_MIGRATIONS:-true}" = "true" ]; then
  echo ""
  echo "Running Prisma migrations..."
  npx prisma migrate deploy
fi

echo ""
echo "Starting application command: $*"
exec "$@"
