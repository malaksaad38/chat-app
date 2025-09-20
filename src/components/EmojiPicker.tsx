"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import EmojiPicker from "emoji-picker-react";
import { useTheme } from "next-themes";

export default function EmojiDialogButton({
                                            onEmojiSelect,
                                          }: {
  onEmojiSelect: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();

  const handleEmojiClick = (emojiData: any) => {
    onEmojiSelect(emojiData.emoji); // send emoji to parent
    setOpen(false); // close dialog after selection
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Button to open dialog */}
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Smile className="w-5 h-5" />
        </Button>
      </DialogTrigger>

      {/* Emoji Picker Dialog */}
      <DialogContent className="p-0 w-auto bg-transparent border-none shadow-none">
        <DialogHeader>
          <DialogTitle className="sr-only">Choose an emoji</DialogTitle>
        </DialogHeader>
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          theme={theme === "dark" ? "dark" : "light"} // adapts to dark/light mode
          autoFocusSearch={false}
        />
      </DialogContent>
    </Dialog>
  );
}
