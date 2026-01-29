import { app } from "./app.ts";
import { env } from "./utils/env.ts";

app.listen(env.PORT, () => {
  console.log(`[server] listening on port ${env.PORT}`);
});
