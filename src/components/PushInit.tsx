"use client";

import { useEffect } from "react";
import * as PusherPushNotifications from "@pusher/push-notifications-web";

export default function PushInit() {
  useEffect(() => {
    let beamsClient: PusherPushNotifications.Client | null = null;

    async function initBeams() {
      // Ensure we're in browser
      if (typeof window === "undefined" || !("Notification" in window)) {
        console.warn("Push notifications not supported in this environment.");
        return;
      }

      // Request permission explicitly
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.warn("Notification permission denied by user.");
        return;
      }

      try {
        beamsClient = new PusherPushNotifications.Client({
          instanceId: process.env.NEXT_PUBLIC_BEAMS_INSTANCE_ID as string,
          logLevel: "debug", // Optional: helps debugging
        });

        await beamsClient.start();
        await beamsClient.addDeviceInterest("hallo");
        console.log("✅ Successfully registered and subscribed to 'hallo' interest!");
      } catch (error) {
        console.error("❌ Beams init error:", error);
      }
    }

    initBeams();

    return () => {
      beamsClient?.stop().catch(console.error); // Clean up properly
      beamsClient = null;
    };
  }, []);

  return null;
}