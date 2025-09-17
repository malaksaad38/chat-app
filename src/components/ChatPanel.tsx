"use client";

import { useEffect, useState, useRef } from "react";
import Pusher from "pusher-js";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Send,
  User,
  Clock,
  MessagesSquare,
  Trash2,
  ChevronLeft,
  Search,
  Plus,
  MoreVertical,
  Smile,
  Paperclip,
  Mic,
  CheckCheck,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type ChatMessage = {
  id?: string;
  clientId?: string;
  username: string;
  message: string;
  timestamp?: string | number | null;
  local?: boolean;
};

const INITIAL_ROOMS = ["General", "Random", "Tech"];
const MESSAGE_LIMIT = 100;
const DUPLICATE_WINDOW_MS = 5000;

function generateClientId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(ts?: string | number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return !isNaN(d.getTime())
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
}

export default function WhatsAppChat() {
  const [roomCache, setRoomCache] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [currentRoom, setCurrentRoom] = useState("General");
  const [rooms, setRooms] = useState<string[]>(INITIAL_ROOMS);
  const [showSidebar, setShowSidebar] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  /** Clear all cached messages */
  const clearCache = () => {
    setRoomCache({});
    localStorage.removeItem("chat-cache");
  };

  /** Load username */
  useEffect(() => {
    const storedName = localStorage.getItem("chat-username");
    if (storedName) {
      setUsername(storedName);
    } else {
      setShowDialog(true);
    }
  }, []);

  /** Load cached messages */
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

  /** Persist cache whenever roomCache changes */
  useEffect(() => {
    localStorage.setItem("chat-cache", JSON.stringify(roomCache));
  }, [roomCache]);

  const messages = roomCache[currentRoom] || [];

  /** Insert or update room messages */
  const upsertRoomMessage = (msg: ChatMessage) => {
    setRoomCache((prev) => {
      const roomMsgs = [...(prev[currentRoom] || [])];

      // Update existing optimistic message
      if (msg.clientId) {
        const idx = roomMsgs.findIndex((m) => m.clientId === msg.clientId);
        if (idx !== -1) {
          roomMsgs[idx] = { ...roomMsgs[idx], ...msg, local: false };
          return { ...prev, [currentRoom]: roomMsgs.slice(-MESSAGE_LIMIT) };
        }
      }

      // Prevent duplicate by ID
      if (msg.id && roomMsgs.some((m) => m.id === msg.id)) return prev;

      // Fuzzy duplicate detection by username + message + timestamp window
      const existsFuzzy = roomMsgs.some((m) => {
        if (m.username !== msg.username || m.message !== msg.message) return false;
        const t1 = m.timestamp ? new Date(m.timestamp).getTime() : NaN;
        const t2 = msg.timestamp ? new Date(msg.timestamp).getTime() : NaN;
        return !isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) < DUPLICATE_WINDOW_MS;
      });
      if (existsFuzzy) return prev;

      roomMsgs.push(msg);
      return { ...prev, [currentRoom]: roomMsgs.slice(-MESSAGE_LIMIT) };
    });
  };

  /** Pusher real-time subscription */
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

  /** Auto-scroll to bottom when messages update */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Send message */
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

    // Optimistic update
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

        // Replace optimistic message with server response
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

  /** Switch room */
  const handleRoomChange = (room: string) => {
    setCurrentRoom(room);
    setShowSidebar(false); // Close sidebar on mobile
    if (!rooms.includes(room)) {
      setRooms((prev) => [...prev, room]);
    }
  };

  /** Save username */
  const handleUsernameSubmit = () => {
    if (usernameInput.trim()) {
      setUsername(usernameInput.trim());
      localStorage.setItem("chat-username", usernameInput.trim());
      setShowDialog(false);
    }
  };

  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-gray-900">
      {/* Username Dialog */}
      <Dialog open={showDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-center">
              Welcome 👋
            </DialogTitle>
            <p className="text-sm text-muted-foreground text-center">
              Choose a username to join the chat
            </p>
          </DialogHeader>
          <Input
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            placeholder="Your name"
            onKeyDown={(e) => e.key === "Enter" && handleUsernameSubmit()}
          />
          <DialogFooter>
            <Button
              onClick={handleUsernameSubmit}
              disabled={!usernameInput.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sidebar Backdrop for Mobile */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-10 md:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div
        className={`fixed md:static top-0 left-0 h-full w-72 bg-gray-200 dark:bg-gray-800 border-r z-20 flex flex-col
    transform transition-transform duration-300 
    ${showSidebar ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">Chats</h2>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                const newRoom = prompt("Enter new room name:");
                if (newRoom && !rooms.includes(newRoom)) {
                  setRooms((prev) => [...prev, newRoom]);
                }
              }}
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Room List */}
        <div className="flex-1 overflow-y-auto">
          {rooms.map((room) => (
            <div
              key={room}
              onClick={() => handleRoomChange(room)}
              className={`p-4 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 transition relative
          ${currentRoom === room ? "bg-gray-300 dark:bg-gray-700" : ""}`}
            >
              <p className="font-medium">{room}</p>
              <span className="text-xs text-gray-500">
          {roomCache[room]?.[roomCache[room].length - 1]?.message ||
            "No messages yet"}
        </span>

              {/* Unread Badge */}
              {room !== currentRoom &&
                roomCache[room] &&
                roomCache[room].length > 0 && (
                  <span className="absolute top-3 right-3 text-xs bg-green-500 text-white rounded-full px-2 py-0.5">
              {roomCache[room].length}
            </span>
                )}
            </div>
          ))}
        </div>
      </div>


      {/* Chat Area */}
      <div className="flex flex-col flex-1">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-100 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setShowSidebar(true)}>
              <ChevronLeft className="w-6 h-6" />
            </button>
            <User className="w-8 h-8 rounded-full border p-1" />
            <div>
              <p className="font-medium">{currentRoom}</p>
              <span className="text-xs text-gray-500">
                {messages.length} messages
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost">
              <Search className="w-5 h-5" />
            </Button>
            <Button size="icon" variant="ghost">
              <MoreVertical className="w-5 h-5" />
            </Button>
            <Button onClick={clearCache} size="icon" variant="ghost">
              <Trash2 className="w-5 h-5 text-red-500" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900">
          {messages.length === 0 ? (
            <p className="text-center text-gray-500 mt-20">
              No messages yet. Start the conversation 👋
            </p>
          ) : (
            <AnimatePresence>
              {messages.map((msg, i) => {
                const mine = msg.username === username;
                return (
                  <motion.div
                    key={msg.clientId ?? msg.id ?? i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`p-3 rounded-xl max-w-[80%] md:max-w-[60%] shadow relative group
                        ${
                        mine
                          ? "bg-green-500 text-white"
                          : "bg-gray-300 dark:bg-gray-700"
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {msg.message}
                      </div>

                      {/* Time + Status */}
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-80">
                        <span className="text-[10px]">{formatTime(msg.timestamp)}</span>
                        {mine &&
                          (msg.local ? (
                            <Clock className="w-3 h-3" />
                          ) : (
                            <CheckCheck className="w-3 h-3" />
                          ))}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Section */}
        <div className="flex items-center gap-2 p-3 border-t bg-gray-100 dark:bg-gray-800">
          <Button size="icon" variant="ghost">
            <Smile className="w-5 h-5" />
          </Button>

          <Button size="icon" variant="ghost">
            <Paperclip className="w-5 h-5" />
          </Button>

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={`Message ${currentRoom}`}
            className="flex-1 rounded-full px-4"
          />

          {input.trim() ? (
            <Button
              onClick={sendMessage}
              size="icon"
              className="rounded-full bg-green-500 hover:bg-green-600 text-white"
            >
              <Send className="w-5 h-5" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost">
              <Mic className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
