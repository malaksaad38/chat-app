"use client";

import { useEffect, useState, useRef } from "react";
import Pusher from "pusher-js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {Send, User, MessageCircle, Clock, MessagesSquareIcon, Trash2Icon} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import RoomSelector from "./RoomSelector";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {hidden} from "next/dist/lib/picocolors";

type ChatMessage = {
  id?: string;
  clientId?: string;
  username: string;
  message: string;
  timestamp?: string | number | null;
  local?: boolean;
};

const roomArray = ["General", "Random", "Tech"];
const MESSAGE_LIMIT = 100;
const DUPLICATE_WINDOW_MS = 5000;

function generateClientId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function ChatPanel() {
  const [roomCache, setRoomCache] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState(""); // for dialog
  const [showDialog, setShowDialog] = useState(false);
  const [currentRoom, setCurrentRoom] = useState("General");
  const [rooms, setRooms] = useState<string[]>(roomArray);
  const bottomRef = useRef<HTMLDivElement>(null);

  const clearCache = () => {
    setRoomCache({});
    localStorage.removeItem("chat-cache");
  };

  // load username (persist)
  useEffect(() => {
    const storedName = localStorage.getItem("chat-username");
    if (storedName) {
      setUsername(storedName);
    } else {
      setShowDialog(true); // ask on first visit
    }
  }, []);

  // load chat cache
  useEffect(() => {
    const stored = localStorage.getItem("chat-cache");
    if (stored) {
      try {
        setRoomCache(JSON.parse(stored));
      } catch {
        console.warn("Invalid cache data in localStorage");
      }
    }
  }, []);

  // persist cache
  useEffect(() => {
    localStorage.setItem("chat-cache", JSON.stringify(roomCache));
  }, [roomCache]);

  const messages = roomCache[currentRoom] || [];

  const upsertRoomMessage = (msg: ChatMessage) => {
    setRoomCache((prev) => {
      const roomMsgs = [...(prev[currentRoom] || [])];
      if (msg.clientId) {
        const idx = roomMsgs.findIndex((m) => m.clientId === msg.clientId);
        if (idx !== -1) {
          roomMsgs[idx] = { ...roomMsgs[idx], ...msg, local: false };
          return { ...prev, [currentRoom]: roomMsgs.slice(-MESSAGE_LIMIT) };
        }
      }
      if (msg.id) {
        const existsById = roomMsgs.some((m) => m.id && m.id === msg.id);
        if (existsById) return prev;
      }
      const existsFuzzy = roomMsgs.some((m) => {
        if (m.username !== msg.username || m.message !== msg.message) return false;
        const t1 = m.timestamp ? new Date(m.timestamp).getTime() : NaN;
        const t2 = msg.timestamp ? new Date(msg.timestamp).getTime() : NaN;
        if (!isNaN(t1) && !isNaN(t2)) {
          return Math.abs(t1 - t2) < DUPLICATE_WINDOW_MS;
        }
        return false;
      });
      if (existsFuzzy) return prev;

      roomMsgs.push(msg);
      return { ...prev, [currentRoom]: roomMsgs.slice(-MESSAGE_LIMIT) };
    });
  };

  // pusher subscribe
  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe(`chat-${currentRoom}`);
    const handler = (data: any) => {
      const incoming: ChatMessage = {
        id: data?.id,
        clientId: data?.clientId,
        username: data?.username ?? "Unknown",
        message: data?.message ?? "",
        timestamp: data?.timestamp ?? new Date().toISOString(),
        local: false,
      };
      upsertRoomMessage(incoming);
    };

    channel.bind("new-message", handler);

    return () => {
      channel.unbind("new-message", handler);
      pusher.disconnect();
    };
  }, [currentRoom]);

  // scroll bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const clientId = generateClientId();
    const optimistic: ChatMessage = {
      clientId,
      username,
      message: input,
      timestamp: new Date().toISOString(),
      local: true,
    };
    setRoomCache((prev) => {
      const updated = [...(prev[currentRoom] || []), optimistic].slice(-MESSAGE_LIMIT);
      return { ...prev, [currentRoom]: updated };
    });
    try {
      const res = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...optimistic, room: currentRoom }),
      });
      if (res.ok) {
        const serverMsg = await res.json();
        const normalized: ChatMessage = {
          id: serverMsg?.id,
          clientId: serverMsg?.clientId ?? clientId,
          username: serverMsg?.username ?? username,
          message: serverMsg?.message ?? optimistic.message,
          timestamp: serverMsg?.timestamp ?? new Date().toISOString(),
          local: false,
        };
        setRoomCache((prev) => {
          const roomMsgs = [...(prev[currentRoom] || [])];
          const idx = roomMsgs.findIndex((m) => m.clientId === clientId);
          if (idx !== -1) {
            roomMsgs[idx] = { ...roomMsgs[idx], ...normalized };
            return { ...prev, [currentRoom]: roomMsgs.slice(-MESSAGE_LIMIT) };
          }
          roomMsgs.push(normalized);
          return { ...prev, [currentRoom]: roomMsgs.slice(-MESSAGE_LIMIT) };
        });
      }
    } catch (err) {
      console.error("Send failed", err);
    }
    setInput("");
  };

  const handleRoomChange = (room: string) => {
    setCurrentRoom(room);
    if (!rooms.includes(room)) {
      setRooms((prev) => [...prev, room]);
    }
  };

  const formatTime = (ts?: string | number | null) => {
    if (!ts) return "";
    const d = new Date(ts);
    return !isNaN(d.getTime())
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
  };

  const handleUsernameSubmit = () => {
    if (usernameInput.trim()) {
      setUsername(usernameInput.trim());
      localStorage.setItem("chat-username", usernameInput.trim());
      setShowDialog(false);
    }
  };
const handleProfile =()=>{
  hidden(String(true))
}
  return (
    <div className="flex justify-center md:p-6 p-2">
      {/* Username Dialog */}
      <Dialog open={showDialog} >
        <DialogContent showCloseButton={false}>
          <DialogHeader>

            <DialogTitle className="text-xxl font-semibold text-center">
              Welcome 👋
            </DialogTitle>
            <p className="text-sm text-muted-foreground text-center">
              Pick a username to join the chat. You can change this later.
            </p>
          </DialogHeader>
          <Input
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            placeholder="Your name"
            onKeyDown={(e) => e.key === "Enter" && handleUsernameSubmit()}
          />
          <DialogFooter>
            <Button onClick={handleUsernameSubmit} disabled={!usernameInput.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="w-full max-w-lg shadow-lg rounded-2xl">
        <CardHeader className="flex items-center justify-between border-b pb-3">
          <div className="flex items-start gap-2">
            <MessageCircle className="text-primary"  size={25}/>
            <div>
              <CardTitle className="text-lg font-semibold">
                Room: {currentRoom}
              </CardTitle>
              <CardTitle className="text-lg font-semibold">
                Name: {username}
              </CardTitle>
            </div>

          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessagesSquareIcon className="w-4 h-4" />
              <span>{messages.length}</span>
            </div>
            <ThemeToggle />
            <Button onClick={clearCache} variant="destructive" size={"icon"}>
             <Trash2Icon/>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col h-[500px]">
          <RoomSelector rooms={rooms} currentRoom={currentRoom} onRoomChange={handleRoomChange} />

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-muted rounded-lg scrollbar-thin mt-4">
            {messages.length === 0 ? (
              <p className="flex flex-col items-center text-sm text-muted-foreground mt-10">
                <MessageCircle className="w-6 h-6 mb-2 opacity-70" />
                No messages yet. Be the first to say hi 👋
              </p>
            ) : (
              messages.map((msg, i) => {
                const mine = msg.username === username;
                return (
                  <div key={msg.clientId ?? msg.id ?? i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`flex items-start gap-2 p-3 rounded-lg text-sm max-w-[80%] ${
                        mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary-foreground text-secondary-foreground"
                      } ${msg.local ? "opacity-90" : ""}`}
                    >
                      {!mine && <User className="w-5 h-5 opacity-70 mt-1 shrink-0" />}
                      <div className={`${mine ? "text-right" : "text-left"}`}>
                        <span className="block text-xs font-medium opacity-70">
                          {msg.username}{mine ? " (You)" : ""}
                        </span>
                        <div className="whitespace-pre-wrap break-words">{msg.message}</div>
                        <div className={`flex items-center gap-1 mt-1 text-[10px] opacity-70 ${mine ? "justify-end" : ""}`}>
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
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={`Message #${currentRoom}`}
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
