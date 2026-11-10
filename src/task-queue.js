/** Allowed review transitions for persisted SEO recommendations. */
export function canTransitionTaskStatus(currentStatus, nextStatus) {
  return currentStatus === "proposed" && ["approved", "dismissed"].includes(nextStatus);
}
