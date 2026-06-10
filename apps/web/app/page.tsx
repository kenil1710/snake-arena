import { TOURNAMENT_TIER_IDS, TOURNAMENT_TIERS } from '@snake-arena/shared';

export default function LobbyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-4 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Snake<span className="text-accent">Arena</span>
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Daily Snake tournaments on Base. Enter with USDC, top scores split the pool.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {TOURNAMENT_TIER_IDS.map((id) => {
          const tier = TOURNAMENT_TIERS[id];
          return (
            <div
              key={tier.id}
              className="flex items-center justify-between border border-neutral-800 bg-neutral-950 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{tier.label}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  ${tier.entryFeeUsdc} USDC entry · {tier.durationHours}h
                </p>
              </div>
              <span className="text-xs uppercase tracking-wide text-neutral-600">Coming soon</span>
            </div>
          );
        })}
      </section>

      <footer className="mt-auto text-xs text-neutral-600">
        Phase 1 scaffold — lobby, game, and wallet land in later phases.
      </footer>
    </main>
  );
}
