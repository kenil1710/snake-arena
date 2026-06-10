# SnakeArena — Getting Started

## Step 1: Create the project folder

```bash
mkdir snake-arena && cd snake-arena
```

## Step 2: Drop in the spec files

Put `CLAUDE.md` (the spec) in the project root.

## Step 3: Start Claude Code

```bash
claude
```

## Step 4: Kick off Phase 1

Paste this to Claude:

```
Read CLAUDE.md carefully. We are building SnakeArena, a Base Mini App
for daily Snake game tournaments. 

Start with Phase 1 only:
1. Initialize a turborepo monorepo
2. Create apps/web (Next.js 14 + TS + Tailwind + App Router)
3. Create apps/backend (Node.js + Express + TS)
4. Create contracts/ with Foundry init
5. Create packages/shared for shared TypeScript types
6. Set up the root package.json, turbo.json, .gitignore, and .env.example

Stop after Phase 1. Show me the file tree and confirm everything compiles.
Do not start Phase 2 until I say so.
```

## Step 5: After Phase 1 passes, move to Phase 2 (contracts)

```
Phase 1 looks good. Now do Phase 2: implement the smart contracts.

Start with SnakeArena.sol, then PowerUpStore.sol, then PrizeDistributor.sol.
Follow the spec in CLAUDE.md exactly. Write Foundry tests for every flow.

Stop after all tests pass. Do not deploy yet.
```

## Step 6: Continue phase by phase

Don't let Claude jump ahead. One phase at a time, review after each phase.

---

## Useful commands during build

```bash
# Foundry
cd contracts
forge build
forge test -vv
forge fmt

# Frontend
cd apps/web
pnpm dev

# Backend
cd apps/backend
pnpm dev

# Deploy contracts to Base Sepolia
cd contracts
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
```

## Tip: Use Claude Code's planning mode

Before each phase, ask Claude to:

```
Before writing any code for this phase, give me a plan:
- Files you'll create
- Order of operations  
- Any decisions you need to make

Wait for my approval before writing code.
```

This catches mistakes early and saves you from refactoring later.
