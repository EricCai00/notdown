import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.notdown.mobile",
  appName: "Notdown",
  webDir: ".run/android-frontend",
  android: { path: "android", backgroundColor: "#ffffff" },
  plugins: { SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "cover" } },
};
export default config;
