import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import Contact from "./Contact.jsx";
import "./index.css";

// Tiny path router: "/" → homepage, "/app" → app, "/contact" → contact.
function Root() {
  const path = window.location.pathname;
  if (path === "/app" || path.startsWith("/app/")) return <App />;
  if (path === "/contact" || path.startsWith("/contact/")) return <Contact />;
  return <Landing />;
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
