import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.crybabygolf.app",
  appName: "Crybaby Golf",
  webDir: "dist",
  server: {
    // During development, point to your Render URL so you don't need to rebuild for every change.
    // Remove this (or comment it out) for production App Store builds.
    // url: "https://crybaby-app.onrender.com",
    // cleartext: true,
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#ffffff",
  },
};

export default config;
