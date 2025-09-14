"use client";

import { useEffect } from "react";
import * as PusherPushNotifications from "@pusher/push-notifications-web";

export default function PushInit() {
  useEffect(() => {
    let beamsClient: PusherPushNotifications.Client | null = null;

    async function initBeams() {
      try {
        beamsClient = new PusherPushNotifications.Client({
          instanceId: process.env.NEXT_PUBLIC_BEAMS_INSTANCE_ID as string,
        });

        await beamsClient.start();
        await beamsClient.addDeviceInterest("hello");
        console.log("✅ Successfully registered and subscribed!");
      } catch (error) {
        console.error("❌ Beams init error:", error);
      }
    }

    initBeams();

    // optional cleanup (not strictly needed, but safe)
    return () => {
      beamsClient = null;
    };
  }, []);

  return null;
}
