import { NextResponse } from "next/server";
import Pusher from "pusher";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

export async function POST(req: Request) {
  const { username, message } = await req.json();

  await pusher.trigger("chat-channel", "new-message", {
    username,
    message,
  });

  return NextResponse.json({ success: true });
}
