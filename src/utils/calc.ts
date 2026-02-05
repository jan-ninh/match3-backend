// src/utils/calc.ts
export const FIRST_TIME_POINTS = 800;
export const REPEAT_POINTS = 400;

export function pointsForStage(isFirstTime: boolean) {
  return isFirstTime ? FIRST_TIME_POINTS : REPEAT_POINTS;
}

export function stageKey(stageNumber: number | string) {
  return `stage${stageNumber}`;
}
