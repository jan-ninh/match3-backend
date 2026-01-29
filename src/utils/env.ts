function toPort(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 3000;
  return n;
}

export const env = {
  PORT: toPort(process.env.PORT),
} as const;
