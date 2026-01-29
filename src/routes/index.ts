import { Router } from "express";
import { healthRouter } from "./health.ts";

export const routes = Router();

routes.get("/", (_req, res) => {
  res.type("text").send("match3-backend running");
});

routes.use(healthRouter);
