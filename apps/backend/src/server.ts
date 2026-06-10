import express from 'express';
import { TOURNAMENT_TIERS } from '@snake-arena/shared';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'snake-arena-backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/tournaments/tiers', (_req, res) => {
  res.json(TOURNAMENT_TIERS);
});

app.listen(port, () => {
  console.log(`SnakeArena backend listening on http://localhost:${port}`);
});
