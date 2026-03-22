#!/bin/bash
# sync-miles-republic-schema.sh
#
# Syncs the Miles Republic Prisma schema from the source repo (Peyce-dev/app)
# and regenerates the Prisma client.
#
# Usage: ./scripts/sync-miles-republic-schema.sh
#
# Requires: gh CLI authenticated with access to Peyce-dev/app

set -euo pipefail

REPO="Peyce-dev/app"
BRANCH="staging"
REMOTE_PATH="packages/db/prisma/schema.prisma"
LOCAL_SCHEMA="apps/agents/prisma/miles-republic.prisma"

echo "📥 Fetching schema from $REPO ($BRANCH)..."

# Download the source schema
SOURCE_SCHEMA=$(gh api "repos/$REPO/contents/$REMOTE_PATH?ref=$BRANCH" --jq '.content' | base64 -d)

if [ -z "$SOURCE_SCHEMA" ]; then
  echo "❌ Failed to fetch schema from GitHub"
  exit 1
fi

# Our custom header (generator + datasource that differ from the source)
HEADER='generator client {
  provider        = "prisma-client-js"
  output          = "../../../node_modules/.prisma/client-miles"
  previewFeatures = ["fullTextSearchPostgres", "driverAdapters", "typedSql", "postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DATABASE_DIRECT_URL")
  extensions = [citext]
}'

# Extract everything after the datasource block from the source schema
# (skip generator + datasource, keep models + enums)
MODELS=$(echo "$SOURCE_SCHEMA" | awk '
  BEGIN { skip=1; blank_after=0 }
  /^datasource / { skip=1; blank_after=1; next }
  /^generator / { skip=1; blank_after=1; next }
  skip && /^\}/ { skip=0; blank_after=1; next }
  skip { next }
  blank_after && /^$/ { blank_after=0; next }
  { blank_after=0; print }
')

# Write the combined schema
echo "$HEADER" > "$LOCAL_SCHEMA"
echo "" >> "$LOCAL_SCHEMA"
echo "$MODELS" >> "$LOCAL_SCHEMA"

echo "✅ Schema updated: $LOCAL_SCHEMA"

# Show what changed
DIFF=$(git diff --stat "$LOCAL_SCHEMA" 2>/dev/null || true)
if [ -z "$DIFF" ]; then
  echo "ℹ️  No changes detected — schema is already up to date"
else
  echo "📊 Changes:"
  git diff --stat "$LOCAL_SCHEMA"
  echo ""
  # Show enum changes specifically
  ENUM_DIFF=$(git diff "$LOCAL_SCHEMA" | grep "^[+-]  " | grep -v "^[+-]  //" || true)
  if [ -n "$ENUM_DIFF" ]; then
    echo "🔍 Value changes:"
    echo "$ENUM_DIFF"
  fi
fi

# Regenerate Prisma client
echo ""
echo "🔄 Regenerating Prisma client..."
npx prisma generate --schema="$LOCAL_SCHEMA"

echo ""
echo "✅ Done! Don't forget to commit if there are changes."
