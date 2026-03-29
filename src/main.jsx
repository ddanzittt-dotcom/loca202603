import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { StatusBar, Style } from "@capacitor/status-bar"
import { SplashScreen } from "@capacitor/splash-screen"
import { Capacitor } from "@capacitor/core"
import "./map-editor-overlays.css"
import "./map-labels.css"
import "./legacy/styles.css"
import App from "./App"
import { registerServiceWorker } from "./registerServiceWorker"

registerServiceWorker()

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  StatusBar.setBackgroundColor({ color: "#635bff" }).catch(() => {})
  SplashScreen.hide().catch(() => {})
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
