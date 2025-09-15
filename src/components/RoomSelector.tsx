"use client";

import { Button } from "@/components/ui/button";

type RoomSelectorProps = {
  rooms: string[];
  currentRoom: string;
  onRoomChange: (room: string) => void;
};

export default function RoomSelector({
                                       rooms,
                                       currentRoom,
                                       onRoomChange,
                                     }: RoomSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {rooms.map((room) => (
        <Button
          key={room}
          variant={currentRoom === room ? "default" : "outline"}
          size="sm"
          onClick={() => onRoomChange(room)}
        >
          {room}
        </Button>
      ))}
    </div>
  );
}
