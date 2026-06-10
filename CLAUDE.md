# SnakeArena — Base Mini App

A daily Snake game tournament on Base where users pay USDC to enter, compete for top scores, and the top scorers split the prize pool. Built as a Farcaster Mini App for listing on the Base App.

---

## Project goals

- High on-chain transaction volume (target: 15–40 txs per active user per day)
- Listed on Base App (Farcaster Frames v2 / Mini App spec)
- Gasless UX via Coinbase Smart Wallet + Paymaster
- Anti-cheat: server-authoritative game logic with ECDSA-signed scores

---

## Tech stack

| Layer | Tool |
|---|---|
| Smart contracts | Solidity + Foundry, deployed to Base mainnet |
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind |
| Mini App | Coinbase MiniKit + OnchainKit |
| Wallet | Coinbase Smart Wallet (session keys for gasless in-game purchases) |
| Backend | Node.js + Express (or Next.js API routes) |
| Database | Supabase (Postgres) |
| Currency | USDC on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) |
| Game engine | HTML5 Canvas (client) + server-authoritative validation |
| Hosting | Vercel (frontend) + Railway (backend) |
| Paymaster | Coinbase CDP Paymaster |

---

## Core mechanics

### Tournament types (4 running in parallel)

| Tier | Entry | Duration | Notes |
|---|---|---|---|
| `1usd_daily` | $1 USDC | 24h (00:00–23:59 UTC) | Mass market |
| `5usd_daily` | $5 USDC | 24h | Mid-tier |
| `25usd_daily` | $25 USDC | 24h | Whale pool |
| `1usd_hourly` | $1 USDC | 1h (rolls every hour) | Quick gratification |

### Entry rules

- A user can enter any tournament as many times as they want
- Each entry = a fresh game attempt = a separate USDC payment = a separate transaction
- Only the user's **best score** across all their entries counts for the leaderboard
- Username is set on first entry and bound to their wallet

### Power-ups (in-game purchases, USDC)

| Power-up | Cost | Effect |
|---|---|---|
| Shield | $0.25 | Blocks 1 collision |
| 2× Multiplier | $0.50 | Doubles score for next 10 apples |
| Slow-Mo | $0.25 | Slows game by 50% for 10 seconds |
| Revive | $0.50 | Continue once after death (this run only) |

Power-ups are purchased mid-game via smart wallet session keys → no popups, instant.

### Prize distribution

When a tournament ends:

- **3+ players entered:** 1st = 45%, 2nd = 25%, 3rd = 20%, treasury = 10%
- **1–2 players entered:** Winner = 90%, treasury = 10%
- **0 players:** Pool stays at 0 (impossible — fees only collected on entry)

Tie-breaker: earlier score submission timestamp wins.

Distribution is automatic when `finalizeTournament` is called (by cron, after `endTime`). Next tournament of the same tier starts in the same tx.

---

## File structure

```
snake-arena/
├── contracts/                   # Foundry project
│   ├── src/
│   │   ├── SnakeArena.sol       # Main tournament entry + score submission
│   │   ├── PowerUpStore.sol     # In-game purchases
│   │   ├── PrizeDistributor.sol # Auto prize splitting
│   │   └── interfaces/
│   ├── test/
│   ├── script/
│   │   └── Deploy.s.sol
│   └── foundry.toml
├── apps/
│   ├── web/                     # Next.js mini app
│   │   ├── app/
│   │   │   ├── page.tsx                  # Lobby (active tournaments)
│   │   │   ├── play/[tournamentId]/      # Game canvas page
│   │   │   ├── leaderboard/[id]/
│   │   │   ├── profile/
│   │   │   ├── api/
│   │   │   │   ├── frame/                # Farcaster frame metadata
│   │   │   │   ├── session/
│   │   │   │   │   ├── start/route.ts
│   │   │   │   │   ├── move/route.ts
│   │   │   │   │   ├── powerup/route.ts
│   │   │   │   │   └── end/route.ts
│   │   │   │   ├── tournaments/route.ts
│   │   │   │   ├── leaderboard/[id]/route.ts
│   │   │   │   └── cron/
│   │   │   │       └── rollover/route.ts
│   │   ├── components/
│   │   │   ├── game/
│   │   │   │   ├── SnakeCanvas.tsx
│   │   │   │   ├── PowerUpBar.tsx
│   │   │   │   └── ScoreDisplay.tsx
│   │   │   ├── lobby/
│   │   │   ├── leaderboard/
│   │   │   └── ui/
│   │   ├── lib/
│   │   │   ├── contracts.ts
│   │   │   ├── wagmi.ts
│   │   │   ├── minikit.ts
│   │   │   ├── paymaster.ts
│   │   │   └── supabase.ts
│   │   └── tailwind.config.ts
│   └── backend/                 # Optional: separate Express server
│       ├── src/
│       │   ├── game-engine/
│       │   │   ├── snake.ts     # Server-side snake logic
│       │   │   └── validator.ts # Move validation, anti-cheat
│       │   ├── signer/
│       │   │   └── ecdsa.ts     # Score signing
│       │   └── server.ts
└── packages/
    └── shared/                  # Shared types between web + backend + contracts
        └── types.ts
```

---

## Smart contracts

### `SnakeArena.sol`

```solidity
// Pseudocode — implement fully

contract SnakeArena {
    enum TournamentTier { ONE_USD_DAILY, FIVE_USD_DAILY, TWENTYFIVE_USD_DAILY, ONE_USD_HOURLY }

    struct Tournament {
        uint256 id;
        TournamentTier tier;
        uint256 startTime;
        uint256 endTime;
        uint256 prizePool;
        uint256 entryFee;
        bool finalized;
        address[] players;
    }

    struct PlayerEntry {
        address wallet;
        uint256 bestScore;
        uint256 lastSubmissionTime; // tie-breaker
        uint256 entryCount;
    }

    IERC20 public usdc;
    address public trustedSigner;   // Backend's signing key
    address public treasury;        // Platform fee receiver

    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => mapping(address => PlayerEntry)) public entries;
    mapping(address => string) public usernames;
    mapping(TournamentTier => uint256) public currentTournamentId;
    mapping(bytes32 => bool) public usedNonces;

    // Events
    event TournamentStarted(uint256 indexed id, TournamentTier tier, uint256 endTime);
    event EnteredTournament(uint256 indexed tournamentId, address indexed player, uint256 entryNumber);
    event ScoreSubmitted(uint256 indexed tournamentId, address indexed player, uint256 score);
    event TournamentFinalized(uint256 indexed tournamentId, address[] winners, uint256[] payouts);

    // Core functions
    function enterTournament(TournamentTier tier, string calldata username) external;
    function submitScore(uint256 tournamentId, uint256 score, bytes32 nonce, bytes calldata signature) external;
    function finalizeTournament(uint256 tournamentId) external;

    // Views
    function getActiveTournament(TournamentTier tier) external view returns (Tournament memory);
    function getLeaderboard(uint256 tournamentId, uint256 topN) external view returns (PlayerEntry[] memory);
    function getPrizePool(uint256 tournamentId) external view returns (uint256);
}
```

**Key behaviors:**

- `enterTournament`: Pulls USDC, registers player if new, increments entryCount, emits event. Sets username on first entry.
- `submitScore`: Verifies ECDSA signature against `trustedSigner`. Hash format: `keccak256(abi.encode(tournamentId, player, score, nonce))`. Only updates `bestScore` if higher than current. Marks nonce used.
- `finalizeTournament`: Anyone can call after `endTime`. Sorts players by `bestScore` desc, distributes prize pool per rules, starts next tournament of same tier in same tx.

### `PowerUpStore.sol`

```solidity
contract PowerUpStore {
    enum PowerUpType { SHIELD, MULTIPLIER_2X, SLOW_MO, REVIVE }

    mapping(PowerUpType => uint256) public prices; // in USDC (6 decimals)

    event PowerUpPurchased(
        address indexed player,
        bytes32 indexed sessionId,
        PowerUpType powerUpType,
        uint256 timestamp
    );

    function buyPowerUp(bytes32 sessionId, PowerUpType powerUpType) external;
}
```

Power-up purchases just record on-chain payments; the game server reads events (or the frontend passes the txHash to the backend) to unlock the power-up in game state.

### `PrizeDistributor.sol`

Internal helper called by `SnakeArena.finalizeTournament`. Handles the 45/25/20/10 vs 90/10 logic. Use OpenZeppelin's `SafeERC20`.

---

## Database schema (Supabase / Postgres)

```sql
CREATE TABLE users (
  wallet_address TEXT PRIMARY KEY,
  farcaster_id TEXT,
  username TEXT UNIQUE,
  total_winnings_usdc NUMERIC DEFAULT 0,
  total_spent_usdc NUMERIC DEFAULT 0,
  games_played INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_tournament_id BIGINT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('1usd_daily','5usd_daily','25usd_daily','1usd_hourly')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  prize_pool_usdc NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','finalizing','completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id),
  wallet_address TEXT REFERENCES users(wallet_address),
  entry_count INT DEFAULT 1,
  best_score INT DEFAULT 0,
  best_score_submitted_at TIMESTAMPTZ,
  UNIQUE(tournament_id, wallet_address)
);

CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES entries(id),
  wallet_address TEXT,
  tournament_id UUID,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  final_score INT DEFAULT 0,
  moves JSONB,
  power_ups_used JSONB,
  status TEXT DEFAULT 'playing' CHECK (status IN ('playing','died','submitted'))
);

CREATE TABLE power_up_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id),
  type TEXT NOT NULL CHECK (type IN ('shield','multiplier_2x','slowmo','revive')),
  tx_hash TEXT,
  amount_usdc NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entries_tournament ON entries(tournament_id, best_score DESC);
CREATE INDEX idx_sessions_wallet ON game_sessions(wallet_address);
```

---

## Server-authoritative game engine (anti-cheat core)

### Why this matters

If the client sends the score directly, anyone can fake 9999 with browser dev tools and drain prize pools. The server must run the actual game logic.

### Flow

1. **Start session**: Client calls `POST /api/session/start` with `{ walletAddress, tournamentId, entryTxHash }`. Server verifies the entry tx on-chain, creates a `game_sessions` row, returns `sessionId` + initial state (snake position, first apple).
2. **Move**: Client calls `POST /api/session/move` for every direction change: `{ sessionId, direction, clientTime }`. Server:
   - Validates direction (no 180° turns)
   - Validates timing (no more than 20 moves/sec — flag as cheat)
   - Advances snake position
   - Checks collisions with walls and self
   - Spawns new apple (server-controlled randomness)
   - Returns new game state
3. **Buy power-up**: Client calls `POST /api/session/powerup` with `{ sessionId, type, txHash }`. Server verifies tx on-chain, activates power-up in session state.
4. **End session**: When snake dies (server detects), server signs the final score:

```typescript
const message = keccak256(
  encodeAbiParameters(
    parseAbiParameters('uint256, address, uint256, bytes32'),
    [tournamentId, walletAddress, score, nonce]
  )
);
const signature = await trustedSigner.signMessage({ message: { raw: message } });
```

5. Returns `{ score, nonce, signature }` to client. Client calls `submitScore` on-chain. Contract verifies the signature.

### Server-side snake logic

Implement in `apps/backend/src/game-engine/snake.ts`:

```typescript
class SnakeGame {
  grid: { width: 20, height: 20 };
  snake: Position[];
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  apple: Position;
  score: number;
  multiplier: number = 1;
  shield: boolean = false;
  slowMo: { active: boolean; until: number };
  alive: boolean = true;

  step(): GameState { /* advance one tick, apply power-ups, detect collisions */ }
  applyMove(direction): void { /* validate + queue */ }
  activatePowerUp(type): void { /* set shield/multiplier/slowmo */ }
  serialize(): GameState { /* for client */ }
}
```

The client renders state but doesn't compute logic. Client sends only `direction` inputs.

---

## Gasless UX with Smart Wallet + Paymaster

### Setup

- Use **Coinbase Smart Wallet** as the default connector via `@coinbase/onchainkit`
- Configure CDP Paymaster endpoint in `lib/paymaster.ts`
- All in-game purchases go through `useWriteContracts` (EIP-5792) with paymaster capabilities

### Session keys flow

When a user starts a game:

1. Smart wallet generates a session key with scope limited to:
   - Contract: `PowerUpStore`
   - Functions: `buyPowerUp`
   - Spend limit: $5 USDC per session
   - Expiry: 10 minutes
2. User signs *once* to authorize the session key
3. All power-up purchases during that game are auto-executed by the session key — no popups
4. Session key expires when game ends

Reference: https://docs.base.org/identity/smart-wallet/concepts/features/optional/sub-accounts

---

## Cron / automation

Use **Vercel Cron** (or backend cron) to:

- Every minute: check for tournaments past `endTime` → call `finalizeTournament`
- Every hour: ensure new `1usd_hourly` tournament exists
- Daily at 00:00 UTC: ensure new daily tournaments of each tier exist

`apps/web/app/api/cron/rollover/route.ts` handles this. Protect with `CRON_SECRET` env var.

---

## Frontend — Mini App spec

### Farcaster Frame metadata

In `app/layout.tsx`, set frame metadata:

```typescript
export const metadata = {
  other: {
    'fc:frame': JSON.stringify({
      version: 'next',
      imageUrl: 'https://snakearena.app/og.png',
      button: {
        title: 'Play SnakeArena',
        action: {
          type: 'launch_frame',
          name: 'SnakeArena',
          url: 'https://snakearena.app',
          splashImageUrl: 'https://snakearena.app/splash.png',
          splashBackgroundColor: '#0a0a0a'
        }
      }
    })
  }
};
```

### Pages

- **`/` (lobby)**: Shows all 4 active tournaments with live pool size, time remaining, your status. CTA: "Enter" buttons per tier.
- **`/play/[tournamentId]`**: Game canvas, score display, power-up bar (4 buttons with prices), pause/quit.
- **`/leaderboard/[id]`**: Real-time leaderboard for a tournament (Supabase realtime subscription). Highlight current user.
- **`/profile`**: User's stats — total winnings, games played, best scores, recent transactions.

### Design system

- **Dark theme**, near-black background `#0a0a0a`
- **Teal accent** `#14b8a6` for primary actions
- **Inter font**
- **Linear / Vercel inspired** — minimal, sharp, no rounded-everything
- Subtle grid background on lobby
- Snake game: bright teal snake on dark grid, red apple, particle effects on apple eat
- Mobile-first (Base App is mobile)

---

## Build order (work through these phases sequentially)

### Phase 1 — Foundation
- [ ] Init turborepo monorepo with `apps/web`, `apps/backend`, `contracts/`, `packages/shared`
- [ ] Set up Foundry in `contracts/`
- [ ] Set up Supabase project, run schema migrations
- [ ] Init Next.js 14 app with TS, Tailwind, App Router

### Phase 2 — Smart contracts
- [ ] Implement `SnakeArena.sol`, `PowerUpStore.sol`, `PrizeDistributor.sol`
- [ ] Write Foundry tests for all entry/score/finalize flows
- [ ] Edge case tests: 1 player, 2 players, ties, signature replay
- [ ] Deploy to Base Sepolia testnet
- [ ] Verify contracts on Basescan

### Phase 3 — Backend game engine
- [ ] Implement `SnakeGame` class with server-side logic
- [ ] Build session endpoints (`start`, `move`, `powerup`, `end`)
- [ ] ECDSA score signing
- [ ] Anti-cheat validation (move timing, direction logic)

### Phase 4 — Frontend lobby + wallet
- [ ] MiniKit + OnchainKit integration
- [ ] Coinbase Smart Wallet connector
- [ ] Lobby page with live tournament data
- [ ] Entry flow (approve USDC + enterTournament)

### Phase 5 — Game canvas
- [ ] `SnakeCanvas` component (renders server state)
- [ ] Keyboard + swipe input handling
- [ ] Score display, power-up bar
- [ ] Game over screen with score + share-to-Farcaster button

### Phase 6 — Paymaster + session keys
- [ ] CDP Paymaster integration
- [ ] Session key generation on game start
- [ ] Gasless power-up purchases via `useWriteContracts`

### Phase 7 — Leaderboard + realtime
- [ ] Leaderboard page with Supabase realtime
- [ ] Profile page
- [ ] Winner notifications

### Phase 8 — Cron + automation
- [ ] Vercel cron route for tournament rollover
- [ ] Finalization logic

### Phase 9 — Deploy + ship
- [ ] Deploy contracts to Base mainnet
- [ ] Deploy frontend to Vercel
- [ ] Deploy backend to Railway
- [ ] Submit Mini App to Base App directory
- [ ] Initial test with 5 friends to validate end-to-end

---

## Environment variables

```
# Contracts
BASE_RPC_URL=
BASE_SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
BASESCAN_API_KEY=

# Backend
TRUSTED_SIGNER_PRIVATE_KEY=     # NEVER commit
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Frontend
NEXT_PUBLIC_BASE_RPC=
NEXT_PUBLIC_CONTRACT_ADDRESS=
NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
NEXT_PUBLIC_PAYMASTER_URL=
NEXT_PUBLIC_CDP_PROJECT_ID=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Cron
CRON_SECRET=
```

---

## Critical security notes

- `TRUSTED_SIGNER_PRIVATE_KEY` must stay on the backend only — anyone with this key can fake any score
- Use OpenZeppelin's `Ownable` + a multisig (Gnosis Safe) for contract ownership — same pattern as CronPay
- Treasury address should be the multisig, not an EOA
- Audit before mainnet deploy. Run Slither + Mythril locally during dev.
- Rate-limit the `/api/session/move` endpoint heavily (per IP + per wallet)
- Implement circuit breaker: pause all tournaments if suspicious activity detected

---

## How to use this file with Claude Code

```bash
cd snake-arena/
claude
```

Then tell Claude:

> Read CLAUDE.md and start Phase 1. Set up the monorepo structure and initialize Foundry, Next.js, and Supabase. Stop after Phase 1 is complete and show me what was built.

Work through one phase at a time. Don't let Claude run ahead.
