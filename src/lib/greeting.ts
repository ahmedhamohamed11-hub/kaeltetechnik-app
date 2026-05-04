export function getGreeting(name: string) {
  const safeName = name.trim() || "du";
  const hour = new Date().getHours();

  if (hour < 12) return `Guten Morgen ${safeName}`;
  if (hour < 18) return `Guten Tag ${safeName}`;
  return `Guten Abend ${safeName}`;
}
