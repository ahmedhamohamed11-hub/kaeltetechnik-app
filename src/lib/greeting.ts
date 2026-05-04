export function getGreeting(name: string) {
  const STORAGE_KEY = "lastGreeting";

  const now = Date.now();
  const INTERVAL = 60 * 60 * 1000; // 🔥 1 Stunde (änderbar)

  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    const parsed = JSON.parse(saved);

    if (now - parsed.time < INTERVAL) {
      return parsed.text;
    }
  }

  const hour = new Date().getHours();

  let timeText = "";
  if (hour < 12) timeText = "Guten Morgen";
  else if (hour < 18) timeText = "Guten Tag";
  else timeText = "Guten Abend";

  const greetings = [
    `Servus ${name} 😄`,
    `Grüß dich ${name} 👋`,
    `Hallo ${name}`,
    `Na ${name} 😎`,
    `${timeText} ${name}`,
  ];

  const extras = [
    "Bereit zum Lernen? 📚",
    "Heute wird durchgezogen 💪",
    "Zeit für Fortschritt 🚀",
    "Hol dir Punkte 🔥",
    "Keine Ausreden 😏",
    "Du schaffst das 💯",
    "Gas geben ⚡",
    "Heute wirst du besser 👊",
    "Weiter geht’s 🔥",
    "Fokus jetzt 🎯"
  ];

  const g = greetings[Math.floor(Math.random() * greetings.length)];
  const e = extras[Math.floor(Math.random() * extras.length)];

  const text = `${g} – ${e}`;

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ text, time: now })
  );

  return text;
}
