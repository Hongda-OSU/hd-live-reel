import { open } from "@tauri-apps/plugin-dialog";
import * as stylex from "@stylexjs/stylex";
import type { Output } from "../api";
import { folderLabel, type Action } from "../project";
import { Button, Field, Group, ui } from "../ui";

const styles = stylex.create({
  folder: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
});

interface Props {
  output: Output;
  dispatch: (action: Action) => void;
}

/** Where exported videos are saved. */
export function ExportGroup({ output, dispatch }: Props) {
  const setFolder = (folder: string | null) => dispatch({ type: "updateOutput", patch: { folder } });

  async function chooseFolder() {
    const picked = await open({ directory: true, defaultPath: output.folder ?? undefined });
    if (picked) setFolder(picked);
  }

  return (
    <Group title="导出">
      <Field label="保存到">
        <div {...stylex.props(ui.inline)}>
          <span title={output.folder ?? undefined} {...stylex.props(styles.folder, ui.spacer)}>
            {folderLabel(output.folder)}
          </span>
          <Button onClick={chooseFolder}>更改…</Button>
        </div>
      </Field>
      {output.folder && (
        <Button variant="ghost" onClick={() => setFolder(null)}>
          恢复默认（影片 › HD Live Reel）
        </Button>
      )}
    </Group>
  );
}
