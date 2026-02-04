import { app } from './app.ts';
import { env } from './utils/env.ts';
import { connectDB } from '#db';

await connectDB();

app.listen(env.PORT, () => {
  console.log(`[server] listening on port ${env.PORT}`);
});
