"use client";

import { useEffect, useState } from "react";
import Pusher from "pusher-js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {Send, User, MessageCircle, Users, Clock, MessageSquareIcon, MessagesSquareIcon} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type ChatMessage = {
  username: string;
  message: string;
  timestamp?: string | number | null;
};

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [username] = useState("Guest" + Math.floor(Math.random() * 100));

  // --- Pusher subscription ---
  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe("chat-channel");
    channel.bind("new-message", (data: any) => {
      const msg: ChatMessage = {
        username: data?.username ?? "Unknown",
        message: data?.message ?? "",
        timestamp: data?.timestamp ?? new Date().toISOString(),
      };
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      pusher.unsubscribe("chat-channel");
      pusher.disconnect();
    };
  }, []);

  // --- Send Message ---
  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessage: ChatMessage = {
      username,
      message: input,
      timestamp: new Date().toISOString(),
    };

    // ❌ removed optimistic update here to avoid duplicates

    await fetch("/api/message", {
      method: "POST",
      body: JSON.stringify(newMessage),
      headers: { "Content-Type": "application/json" },
    });

    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // --- Timestamp Formatting ---
  const parseTimestamp = (ts?: string | number | null): Date | null => {
    if (!ts) return null;
    if (typeof ts === "number") {
      return String(ts).length === 10 ? new Date(ts * 1000) : new Date(ts);
    }
    if (/^\d+$/.test(String(ts))) {
      const n = Number(ts);
      return String(n).length === 10 ? new Date(n * 1000) : new Date(n);
    }
    const d1 = new Date(ts as string);
    if (!isNaN(d1.getTime())) return d1;
    const d2 = new Date((ts as string).replace(" ", "T"));
    if (!isNaN(d2.getTime())) return d2;
    const d3 = new Date(ts + "Z");
    return isNaN(d3.getTime()) ? null : d3;
  };

  const formatTime = (ts?: string | number | null) => {
    const d = parseTimestamp(ts);
    return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  };

  return (
    <div className="flex justify-center md:p-6 p-2">
      <Card className="w-full max-w-lg shadow-lg rounded-2xl">
        {/* Header */}
        <CardHeader className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            <CardTitle className="text-lg font-semibold">Realtime Chat</CardTitle>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessagesSquareIcon className="w-4 h-4" />
              <span>{messages.length}</span>
            </div>
            <ThemeToggle />
          </div>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex flex-col h-[500px]">
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-muted rounded-lg scrollbar-thin">
            {messages.length === 0 ? (
              <p className="flex flex-col items-center text-sm text-muted-foreground mt-10">
                <MessageCircle className="w-6 h-6 mb-2 opacity-70" />
                No messages yet. Be the first to say hi 👋
              </p>
            ) : (
              messages.map((msg, i) => {
                const mine = msg.username === username;
                return (
                  <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`flex items-start gap-2 p-3 rounded-lg text-sm max-w-[80%] ${
                        mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary-foreground text-secondary-foreground"
                      }`}
                    >
                      {!mine && <User className="w-5 h-5 opacity-70 mt-1 shrink-0" />}
                      <div className={`${mine ? "text-right" : "text-left"}`}>
                        <span className="block text-xs font-medium opacity-70">{msg.username}</span>
                        <div className="whitespace-pre-wrap break-words">{msg.message}</div>
                        <div
                          className={`flex items-center gap-1 mt-1 text-[10px] opacity-70 ${
                            mine ? "justify-end" : ""
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(msg.timestamp)}</span>
                        </div>
                      </div>
                      {mine && <User className="w-5 h-5 opacity-70 mt-1 shrink-0" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 mt-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button onClick={sendMessage} size="icon" disabled={!input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
