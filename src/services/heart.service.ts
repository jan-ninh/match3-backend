export const calculateHeartRefill = (lastRefillAt: Date): number => {
  const now = new Date();
  const diffMs = now.getTime() - lastRefillAt.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const heartsToAdd = Math.floor(diffMinutes / 30);
  return heartsToAdd;
};

export const refillHearts = (currentHearts: number, lastRefillAt: Date, maxHearts: number = 3): { hearts: number; lastRefillAt: Date } => {
  const heartsToAdd = calculateHeartRefill(lastRefillAt);

  if (heartsToAdd === 0) {
    return { hearts: currentHearts, lastRefillAt };
  }

  const newHearts = Math.min(currentHearts + heartsToAdd, maxHearts);
  const now = new Date();

  return { hearts: newHearts, lastRefillAt: now };
};
