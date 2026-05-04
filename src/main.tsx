import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
  onRegistered(r) {
    if (r) {
      setInterval(() => r.update(), 60 * 60 * 1000);
    }
  },
  onOfflineReady() {
    const banner = document.getElementById("ktm-offline-ready");
    if (banner) {
      banner.style.display = "flex";
      setTimeout(() => { banner.style.opacity = "0"; }, 3000);
      setTimeout(() => { banner.style.display = "none"; }, 3600);
    }
  },
});

createRoot(document.getElementById("root")!).render(<App />);
