export function getOpeningGreeting(name: string) {
  const safeName = name.trim() || "du";
  const hour = new Date().getHours();

  if (hour < 12) return `Guten Morgen ${safeName}`;
  if (hour < 18) return `Guten Tag ${safeName}`;
  return `Guten Abend ${safeName}`;
}

export function getGreeting(name: string) {
  const safeName = name.trim() || "du";

  const greetings = [
    "Hey",
    "Grüße",
    "Servus",
    "Hallo",
  ];

  const motivations = [
    "bereit zum Lernen? 📚",
    "heute wird durchgezogen 💪",
    "Zeit für Fortschritt 🚀",
    "keine Ausreden 😏",
    "du schaffst das 💯",
    "Gas geben ⚡",
    "heute wirst du besser 👊",
    "weiter geht’s 🔥",
    "Fokus jetzt 🎯",
  ];

  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const motivation = motivations[Math.floor(Math.random() * motivations.length)];

  return `${greeting} ${safeName} – ${motivation}`;
}
