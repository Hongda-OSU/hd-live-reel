import * as stylex from "@stylexjs/stylex";
import type { MediaItem } from "../api";
import { colors } from "../tokens.stylex";

const styles = stylex.create({
  list: {
    overflowY: "auto",
    paddingBlock: "10px",
    paddingInline: "8px",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: colors.border,
    backgroundColor: colors.sidebar,
  },
  month: {
    marginTop: {
      default: "12px",
      ":first-child": "0",
    },
    marginBottom: "4px",
    paddingInline: "10px",
    color: colors.muted,
    fontSize: 11,
    fontWeight: 600,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingRight: "8px",
    borderRadius: 6,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.hover,
    },
  },
  rowOn: {
    backgroundColor: {
      default: colors.accentSoft,
      ":hover": colors.accentSoft,
    },
  },
  // Indents a scene so its circle starts where its day's label does
  // (18 px chevron, 20 px check button, two 4 px gaps, less the 3 px
  // between the button and its circle).
  sceneRow: {
    paddingLeft: "43px",
  },
  disclosure: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: 18,
    height: 18,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.muted,
    cursor: "pointer",
  },
  chevron: {
    width: 10,
    height: 10,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    transition: "transform 0.15s",
  },
  chevronOpen: {
    transform: "rotate(90deg)",
  },
  checkButton: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: 20,
    height: 20,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: {
      default: "pointer",
      ":disabled": "default",
    },
  },
  label: {
    display: "flex",
    alignItems: "center",
    flex: "1",
    minWidth: 0,
    gap: 6,
    height: "100%",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    textAlign: "left",
    cursor: "pointer",
  },
  name: {
    flex: "1",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dayName: {
    fontWeight: 600,
  },
  sceneName: {
    color: colors.muted,
    fontSize: 12,
  },
  sceneNameOn: {
    color: colors.text,
  },
  count: {
    color: colors.muted,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
  },
  check: {
    display: "grid",
    placeItems: "center",
    width: 14,
    height: 14,
    boxSizing: "border-box",
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: colors.muted,
    borderRadius: "50%",
  },
  // Some of the group is ticked: a dash.
  checkSome: {
    borderColor: colors.accent,
    "::after": {
      content: '""',
      width: 6,
      height: 1.5,
      backgroundColor: colors.accent,
    },
  },
  checkAll: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    "::after": {
      content: '""',
      width: 6,
      height: 3,
      borderTopWidth: "0",
      borderRightWidth: "0",
      borderBottomWidth: "1.5px",
      borderLeftWidth: "1.5px",
      borderStyle: "solid",
      borderColor: "#fff",
      transform: "translateY(-1px) rotate(-45deg)",
    },
  },
});

export interface SceneNode {
  key: string;
  label: string;
  /** What the filter lets through, newest first. */
  items: MediaItem[];
}

export interface DayNode {
  key: string;
  label: string;
  /** "2026年11月", or "日期未知". */
  month: string;
  scenes: SceneNode[];
}

/** Which day the grid shows, and one of its scenes or (null) all of them. */
export interface Focus {
  day: string;
  scene: string | null;
}

export type CheckState = "none" | "some" | "all";

/** How many of `ids` are ticked, as a check mark. */
export function checkState(ids: string[], chosen: Set<string>): CheckState {
  const ticked = ids.filter((id) => chosen.has(id)).length;
  if (ticked === 0) return "none";
  return ticked === ids.length ? "all" : "some";
}

/** An empty circle, a dash or a tick, for a group of photos. */
export function GroupCheck({ state }: { state: CheckState }) {
  return (
    <span {...stylex.props(styles.check, state === "all" ? styles.checkAll : state === "some" && styles.checkSome)} />
  );
}

interface Props {
  days: DayNode[];
  focus: Focus | null;
  /** Keys of days whose scenes are listed. */
  expanded: Set<string>;
  chosen: Set<string>;
  /** Ids in `items` that can be ticked. */
  selectable: (items: MediaItem[]) => string[];
  onFocus: (focus: Focus) => void;
  onExpand: (day: string) => void;
  /** Ticks all of `ids`, or unticks them when they all are. */
  onToggle: (ids: string[]) => void;
}

/** The picker's outline: months, their days and, for days with more than
 * one scene, the scenes. A row's label shows it in the grid; its circle
 * ticks everything in it. */
export function PickerSidebar({ days, focus, expanded, chosen, selectable, onFocus, onExpand, onToggle }: Props) {
  return (
    <nav aria-label="日期" {...stylex.props(styles.list)}>
      {days.flatMap((day, i) => {
        const rows = [];
        // A month heading over the first day of each month.
        if (day.month !== days[i - 1]?.month) {
          rows.push(
            <div key={`month-${day.key}`} {...stylex.props(styles.month)}>
              {day.month}
            </div>,
          );
        }
        const split = day.scenes.length > 1;
        const open = split && expanded.has(day.key);
        const items = day.scenes.flatMap((scene) => scene.items);
        rows.push(
          <Row
            key={day.key}
            label={day.label}
            count={items.length}
            ids={selectable(items)}
            chosen={chosen}
            on={focus?.day === day.key && focus.scene === null}
            disclosure={split ? { open, onClick: () => onExpand(day.key) } : null}
            onFocus={() => onFocus({ day: day.key, scene: null })}
            onToggle={onToggle}
          />,
        );
        if (open) {
          for (const scene of day.scenes) {
            rows.push(
              <Row
                key={scene.key}
                scene
                label={scene.label}
                count={scene.items.length}
                ids={selectable(scene.items)}
                chosen={chosen}
                on={focus?.day === day.key && focus.scene === scene.key}
                disclosure={null}
                onFocus={() => onFocus({ day: day.key, scene: scene.key })}
                onToggle={onToggle}
              />,
            );
          }
        }
        return rows;
      })}
    </nav>
  );
}

function Row({
  label,
  count,
  ids,
  chosen,
  on,
  scene = false,
  disclosure,
  onFocus,
  onToggle,
}: {
  label: string;
  count: number;
  ids: string[];
  chosen: Set<string>;
  on: boolean;
  scene?: boolean;
  disclosure: { open: boolean; onClick: () => void } | null;
  onFocus: () => void;
  onToggle: (ids: string[]) => void;
}) {
  const state = checkState(ids, chosen);
  return (
    <div {...stylex.props(styles.row, on && styles.rowOn, scene && styles.sceneRow)}>
      {disclosure ? (
        <button
          aria-label={disclosure.open ? "收起时段" : "展开时段"}
          aria-expanded={disclosure.open}
          onClick={disclosure.onClick}
          {...stylex.props(styles.disclosure)}
        >
          <svg viewBox="0 0 10 10" {...stylex.props(styles.chevron, disclosure.open && styles.chevronOpen)}>
            <path d="M3.5 2 6.5 5 3.5 8" />
          </svg>
        </button>
      ) : (
        !scene && <span {...stylex.props(styles.disclosure)} />
      )}
      <button
        disabled={ids.length === 0}
        title={state === "all" ? "取消勾选" : "全部勾选"}
        onClick={() => onToggle(ids)}
        {...stylex.props(styles.checkButton)}
      >
        <GroupCheck state={state} />
      </button>
      <button onClick={onFocus} aria-current={on || undefined} {...stylex.props(styles.label)}>
        <span {...stylex.props(styles.name, scene ? [styles.sceneName, on && styles.sceneNameOn] : styles.dayName)}>
          {label}
        </span>
        <span {...stylex.props(styles.count)}>{count}</span>
      </button>
    </div>
  );
}
