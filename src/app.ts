import express from "express";
import { routes } from "./routes/index.ts";
import { notFoundHandler } from "./middlewares/notFoundHandler.ts";
import { errorHandler } from "./middlewares/errorHandler.ts";

export const app = express();

app.set("trust proxy", 1);
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);
