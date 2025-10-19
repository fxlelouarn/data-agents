# Quick Start Cheatsheet

## 🚀 First Time Setup

```bash
# 1. Clone and install
git clone <url>
cd data-agents
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your database URL

# 3. Initialize database
npm run db:migrate

# 4. Build everything
npm run build

# 5. Start development
npm run dev
```

## 📋 Most Common Commands

### During Development
```bash
npm run dev              # ✨ Start everything (use this!)
npm run dev:api          # Just the API
npm run dev:dashboard    # Just the dashboard
```

### Building
```bash
npm run build            # Full build (respects dependency order)
npm run build:prod       # Production build
```

### Database
```bash
npm run db:migrate       # Apply migrations
npm run db:studio        # Open Prisma GUI
```

### Quality Checks
```bash
npm run lint             # Check code style
npm run test             # Run tests
npm run clean            # Clear cache if things break
```

## 🔴 When Things Break

### Build fails: "Cannot find module '@data-agents/types'"
```bash
npm run clean
npm install
npm run build
```

### TypeScript errors appear suddenly
```bash
npm run clean
npm run build
```

### Port already in use
```bash
# Find what's using the port
lsof -i :4001
# Kill it or change PORT in .env
```

### Database connection fails
```bash
# Check your .env has DATABASE_URL
cat .env | grep DATABASE_URL

# If using Docker
docker-compose up -d
```

## 📁 Where to Make Changes

| Task | Location | Depends on |
|------|----------|-----------|
| Add new agent | `apps/agents/src/` | database, agent-framework |
| Add API endpoint | `apps/api/src/routes/` | database |
| UI changes | `apps/dashboard/src/` | database |
| Database schema | `packages/database/prisma/` | none |
| New shared types | `packages/types/src/` | none |
| Agent framework | `packages/agent-framework/src/` | types |

## ⚠️ CRITICAL RULES

1. **NEVER** import `DatabaseService` directly in `agent-framework`
   - Use `getDatabaseService()` instead (lazy load)

2. **ALWAYS** add shared types to `packages/types`
   - Not to database, not to agent-framework

3. **BUILD ORDER MATTERS**
   - types → database → agent-framework → everything else
   - Turbo handles this automatically with `npm run build`

## 🐛 Debugging

### See what's failing
```bash
npm run build 2>&1 | grep -i error
```

### Check specific package
```bash
npm run build:database
npm run build:framework
```

### Full verbose output
```bash
npm run dev 2>&1 | tail -50
```

## 📚 More Help

- [INSTALL.md](INSTALL.md) - Detailed setup
- [WARP.md](WARP.md) - Project rules
- [CIRCULAR_DEPENDENCY_RESOLUTION.md](CIRCULAR_DEPENDENCY_RESOLUTION.md) - Technical details
- [README.md](README.md) - Project overview

## 🆘 Still Stuck?

1. Check that Node.js is v18+ : `node --version`
2. Clear everything: `npm run clean && rm -rf node_modules && npm install`
3. Rebuild: `npm run build`
4. Read error messages carefully
5. Check [INSTALL.md](INSTALL.md) Troubleshooting section
