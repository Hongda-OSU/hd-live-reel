import type { MouseEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import type { Clip } from "../api";
import { IconButton } from "../ui";

/** With a clip selected before the last, asks whether new photos go after
 * it or on the end; otherwise they go on the end. */
async function askWhere(event: MouseEvent<HTMLButtonElement>, selected: number, onAdd: (after: boolean) => void) {
  const box = event.currentTarget.getBoundingClientRect();
  const menu = await Menu.new({
    items: await Promise.all([
      MenuItem.new({ text: `加到第 ${selected} 段后面`, action: () => onAdd(true) }),
      MenuItem.new({ text: "加到最后", action: () => onAdd(false) }),
    ]),
  });
  await menu.popup(new LogicalPosition(box.left, box.bottom + 4));
}

/** The ＋ that opens the picker; `onAdd(true)` puts what it adds after
 * the selected clip. */
export function AddClipsButton({
  clips,
  selectedId,
  onAdd,
}: {
  clips: Clip[];
  selectedId: string | null;
  onAdd: (after: boolean) => void;
}) {
  const selected = clips.findIndex((clip) => clip.id === selectedId) + 1;
  const asks = selected > 0 && selected < clips.length;
  return (
    <IconButton
      label="添加照片"
      aria-haspopup={asks ? "menu" : undefined}
      onClick={(e) => (asks ? void askWhere(e, selected, onAdd) : onAdd(false))}
    >
      <path d="M8 3v10M3 8h10" />
    </IconButton>
  );
}
