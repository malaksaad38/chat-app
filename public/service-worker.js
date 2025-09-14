/* public/service-worker.js */

self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data?.json() ?? {};
    } catch (e) {
        console.error("Push payload parsing error:", e);
    }

    const title = payload.notification?.title || "New Notification";
    const body = payload.notification?.body || "";
    const icon = payload.notification?.icon || "/icon.png";
    const url = payload.notification?.url || "/"; // 👈 allow deep linking if provided

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon,
            data: { url }, // 👈 store link in notification data
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "/";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then(
            (clientList) => {
                // focus if already open
                for (const client of clientList) {
                    if (client.url === url && "focus" in client) {
                        return client.focus();
                    }
                }
                // otherwise open a new tab
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            }
        )
    );
});
