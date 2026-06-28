import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import "./index.css";

// Tiny path router: "/" → marketing homepage, "/app" → the TaskMind app.
function Root() {
  const path = window.location.pathname;
  return path === "/app" || path.startsWith("/app/") ? <App /> : <Landing />;
}

// Register the service worker — required for notifications on mobile Chrome.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
