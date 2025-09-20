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
  Trash2,
  ChevronLeft,
  Plus,
  Smile,
  Paperclip,
  Mic,
  CheckCheck,
  Edit3, User2Icon,
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
  userId?: string; // Unique identifier for the sender
  username: string;
  message: string;
  timestamp?: string | number | null;
  local?: boolean;
};

const INITIAL_ROOMS = ["General", "Random", "Tech"];
const MESSAGE_LIMIT = 100;
const DUPLICATE_WINDOW_MS = 5000;

/** Generate unique IDs */
function generateClientId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function generateUserId() {
  return `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(ts?: string | number | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return !isNaN(d.getTime())
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
}

export function ChatPanel() {
  const [roomCache, setRoomCache] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [showDialog, setShowDialog] = useState(false);
  const [currentRoom, setCurrentRoom] = useState("General");
  const [rooms, setRooms] = useState<string[]>(INITIAL_ROOMS);
  const [showSidebar, setShowSidebar] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false); // Dialog open state
  const [newRoomName, setNewRoomName] = useState(""); // Input value
  const [openC, setOpenC] = useState(false);



  /** --- LocalStorage Helpers --- */
  const storageKey = (room: string) => `chat-cache-${room}`;

  const loadRoomCache = (room: string) => {
    const stored = localStorage.getItem(storageKey(room));
    return stored ? JSON.parse(stored) : [];
  };

  const saveRoomCache = (room: string, messages: ChatMessage[]) => {
    localStorage.setItem(storageKey(room), JSON.stringify(messages));
  };

  /** Clear current room's cache */
  const clearCache = () => {
    setRoomCache((prev) => ({ ...prev, [currentRoom]: [] }));
    localStorage.removeItem(storageKey(currentRoom));
  };

  /** --- Load Username and UserID --- */
  useEffect(() => {
    // Load or generate a persistent userId
    let storedId = localStorage.getItem("chat-user-id");
    if (!storedId) {
      storedId = generateUserId();
      localStorage.setItem("chat-user-id", storedId);
    }
    setUserId(storedId);

    // Load username
    const storedName = localStorage.getItem("chat-username");
    if (storedName) {
      setUsername(storedName);
    } else {
      setShowDialog(true); // Ask for username if not set
    }
  }, []);

  /** Load messages for the initial room */
  useEffect(() => {
    const initialMessages = loadRoomCache(currentRoom);
    setRoomCache((prev) => ({ ...prev, [currentRoom]: initialMessages }));
  }, [currentRoom]);

  /** Persist current room messages whenever they change */
  useEffect(() => {
    if (roomCache[currentRoom]) {
      saveRoomCache(currentRoom, roomCache[currentRoom]);
    }
  }, [roomCache, currentRoom]);

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

      // Fuzzy duplicate detection
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

  /** --- Pusher Subscription --- */
  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe(`chat-${currentRoom}`);
    const handler = (data: any) => {
      const incoming: ChatMessage = {
        id: data?.id,
        clientId: data?.clientId,
        userId: data?.userId,
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

  /** --- Auto-scroll on message update --- */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** --- Send Message --- */
  const sendMessage = async () => {
    if (!input.trim()) return;

    const clientId = generateClientId();
    const optimistic: ChatMessage = {
      clientId,
      userId,
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
          userId: serverMsg?.userId ?? userId,
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

  /** --- Room Switching --- */
  const handleRoomChange = (room: string) => {
    setCurrentRoom(room);
    setShowSidebar(false); // close sidebar on mobile
    if (!rooms.includes(room)) {
      setRooms((prev) => [...prev, room]);
    }

    // Load messages for the new room if not already loaded
    if (!roomCache[room]) {
      const loadedMessages = loadRoomCache(room);
      setRoomCache((prev) => ({ ...prev, [room]: loadedMessages }));
    }
  };

  /** --- Username Dialog --- */
  const handleUsernameSubmit = () => {
    if (usernameInput.trim()) {
      const newName = usernameInput.trim();

      setUsername(newName);
      localStorage.setItem("chat-username", newName);
      setShowDialog(false);

      // Update all messages in memory for this user
      setRoomCache((prev) => {
        const updated = { ...prev };
        for (const room in updated) {
          updated[room] = updated[room].map((msg) =>
            msg.userId === userId ? { ...msg, username: newName } : msg
          );
        }
        return updated;
      });

      // Optional system notification
      if (username && newName !== username) {
        const systemMsg: ChatMessage = {
          username: "System",
          message: `${username} changed their name to ${newName}`,
          timestamp: new Date().toISOString(),
        };
        upsertRoomMessage(systemMsg);
      }
    }
  };

  const openUsernameDialog = () => {
    setUsernameInput(username);
    setShowDialog(true);
  };

  const handleAddRoom = () => {
    if (newRoomName.trim() && !rooms.includes(newRoomName.trim())) {
      setRooms((prev) => [...prev, newRoomName.trim()]);
      setNewRoomName("");
      setOpen(false);
    }
  };
  const handleConfirm = () => {
    clearCache();
    setOpen(false); // close dialog after confirmation
  };
  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-gray-900">
      {/* Username Dialog */}
      <Dialog open={showDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-center">
              {username ? "Update Username" : "Welcome 👋"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground text-center">
              {username
                ? "Change your username below"
                : "Choose a username to join the chat"}
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
              onClick={() => setOpen(true)}
            >
              <Plus className="w-5 h-5" />
            </Button>

            {/* Dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Room</DialogTitle>
                </DialogHeader>

                {/* Input for new room name */}
                <Input
                  placeholder="Enter room name"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />

                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddRoom}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
            </div>
          ))}
        </div>

        {/* Simple User Profile (Username Only) */}
        <div className="border-t p-4 bg-gray-100 dark:bg-gray-900">
          <div className="flex items-center justify-between font-semibold text-gray-800 dark:text-gray-100">
            {/* Left Side: Icon + Username */}
            <div className="flex items-center gap-2">
              <User2Icon />
              <span>{username}</span>
            </div>

            {/* Right Side: Edit Button */}
            <Button size="icon" variant="ghost" onClick={openUsernameDialog}>
              <Edit3 className="w-5 h-5" />
            </Button>
          </div>
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

          <div>
            {/* Trigger Button */}
            <Button onClick={() => setOpenC(true)} size="icon" variant="ghost">
              <Trash2 className="w-5 h-5 text-red-500" />
            </Button>

            {/* Confirmation Dialog */}
            <Dialog open={openC} onOpenChange={setOpenC}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear Cache?</DialogTitle>

                </DialogHeader>

                <DialogFooter className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpenC(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant={"default"}
                    onClick={handleConfirm}
                  >
                    Yes, Clear
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                const mine = msg.userId === userId;
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
                        {!mine && (
                          <span className="text-blue-600">{msg.username}</span>
                        )}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {msg.message}
                      </div>

                      {/* Time + Status */}
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-80">
                        <span className="text-[10px]">
                          {formatTime(msg.timestamp)}
                        </span>
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
