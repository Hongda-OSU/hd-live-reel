import { useEffect, useEffectEvent, useState } from "react";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";

export type MenuCommand = "add" | "export" | "clear";

const COMMANDS: [MenuCommand, string, string][] = [
  ["add", "添加照片…", "CmdOrCtrl+O"],
  ["export", "导出…", "CmdOrCtrl+E"],
  ["clear", "清空工程…", "CmdOrCtrl+Shift+Backspace"],
];

/** Puts up the menu bar, in Chinese like the rest of the app; its 文件
 * menu runs `onCommand`. `enabled` greys out commands that can't run now,
 * since the menu bar stays usable while a dialog covers the window. */
export function useAppMenu(enabled: Record<MenuCommand, boolean>, onCommand: (command: MenuCommand) => void) {
  const run = useEffectEvent(onCommand);
  const [items, setItems] = useState<Map<MenuCommand, MenuItem> | null>(null);

  useEffect(() => {
    void (async () => {
      const commands = new Map<MenuCommand, MenuItem>();
      for (const [id, text, accelerator] of COMMANDS) {
        commands.set(id, await MenuItem.new({ id, text, accelerator, enabled: false, action: () => run(id) }));
      }
      const separator = () => PredefinedMenuItem.new({ item: "Separator" });
      const window = await Submenu.new({
        text: "窗口",
        items: [
          await PredefinedMenuItem.new({ item: "Minimize", text: "最小化" }),
          await PredefinedMenuItem.new({ item: "Maximize", text: "缩放" }),
          await PredefinedMenuItem.new({ item: "Fullscreen", text: "进入全屏幕" }),
          await separator(),
          await PredefinedMenuItem.new({ item: "BringAllToFront", text: "前置全部窗口" }),
        ],
      });
      const menu = await Menu.new({
        items: [
          // macOS names the first menu after the app, whatever its text.
          await Submenu.new({
            text: "HD Live Reel",
            items: [
              await PredefinedMenuItem.new({ item: { About: null }, text: "关于 HD Live Reel" }),
              await separator(),
              await PredefinedMenuItem.new({ item: "Services", text: "服务" }),
              await separator(),
              await PredefinedMenuItem.new({ item: "Hide", text: "隐藏 HD Live Reel" }),
              await PredefinedMenuItem.new({ item: "HideOthers", text: "隐藏其他" }),
              await PredefinedMenuItem.new({ item: "ShowAll", text: "全部显示" }),
              await separator(),
              await PredefinedMenuItem.new({ item: "Quit", text: "退出 HD Live Reel" }),
            ],
          }),
          await Submenu.new({
            text: "文件",
            items: [
              commands.get("add")!,
              commands.get("export")!,
              await separator(),
              commands.get("clear")!,
              await separator(),
              await PredefinedMenuItem.new({ item: "CloseWindow", text: "关闭窗口" }),
            ],
          }),
          // Text fields need these for ⌘C, ⌘V and the like to work.
          await Submenu.new({
            text: "编辑",
            items: [
              await PredefinedMenuItem.new({ item: "Undo", text: "撤销" }),
              await PredefinedMenuItem.new({ item: "Redo", text: "重做" }),
              await separator(),
              await PredefinedMenuItem.new({ item: "Cut", text: "剪切" }),
              await PredefinedMenuItem.new({ item: "Copy", text: "拷贝" }),
              await PredefinedMenuItem.new({ item: "Paste", text: "粘贴" }),
              await PredefinedMenuItem.new({ item: "SelectAll", text: "全选" }),
            ],
          }),
          window,
        ],
      });
      await menu.setAsAppMenu();
      await window.setAsWindowsMenuForNSApp();
      setItems(commands);
    })();
  }, []);

  const { add, export: exporting, clear } = enabled;
  useEffect(() => {
    if (!items) return;
    void items.get("add")!.setEnabled(add);
    void items.get("export")!.setEnabled(exporting);
    void items.get("clear")!.setEnabled(clear);
  }, [items, add, exporting, clear]);
}
