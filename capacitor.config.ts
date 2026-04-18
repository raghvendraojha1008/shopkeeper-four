import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.shopkeeper.Webledger",
  appName: "Shopkeeper",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: true,
    allowNavigation: [],
  },

  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId:
        "935080418890-4hmkt5g6sn0ar8d1lgcj96mto0hlm5a6.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0b0e1a",
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#f59e0b",
    },
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: "#0b0e1a",
  },
};

export default config;
