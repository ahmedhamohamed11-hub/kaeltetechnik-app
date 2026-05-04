function getOpeningGreetingWithoutName() {
  const hour = new Date().getHours();

  if (hour < 12) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

function markSplashForNextOpen() {
  try {
    localStorage.setItem("lastWelcomePeriod", "show-next-open");
  } catch {}
}

export function getGreeting(name: string) {
  const safeName = name.trim() || "du";
  const calledFromSplash = new Error().stack?.includes("SplashScreen") ?? false;

  markSplashForNextOpen();

  if (calledFromSplash) {
    return getOpeningGreetingWithoutName();
  }

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

  const motivation = motivations[Math.floor(Math.random() * motivations.length)];

  return `${safeName} – ${motivation}`;
}
