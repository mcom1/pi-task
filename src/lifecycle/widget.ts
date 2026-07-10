import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { formatMs } from "../helpers.js";
import { renderTaskWidget, type ThemeLike } from "../task-widget.js";
import { ignoreStaleExtensionCtx } from "../stale-ctx.js";
import type { BackgroundTask } from "../types.js";

export interface TaskWidgetController {
  ensureTaskWidget(targetCtx: ExtensionContext): void;
  requestRender(): void;
  clearTaskWidgetIfIdle(): void;
  dispose(): void;
}

export function createTaskWidgetController(
  foregroundTasks: Map<string, BackgroundTask>,
  backgroundTasks: Map<string, BackgroundTask>,
): TaskWidgetController {
  let widgetCtx: ExtensionContext | null = null;
  let requestWidgetRender: (() => void) | null = null;
  let widgetTheme: ThemeLike | null = null;

  function renderWidget(width: number): string[] {
    try {
      return renderTaskWidget({
        foregroundTasks: foregroundTasks.entries(),
        backgroundTasks: backgroundTasks.entries(),
        foregroundCount: foregroundTasks.size,
        backgroundCount: backgroundTasks.size,
        width,
        theme: widgetTheme,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const active = [
        ...Array.from(foregroundTasks.entries()),
        ...Array.from(backgroundTasks.entries()),
      ];
      if (active.length === 0) return [];
      const [, task] = active[0]!;
      return [
        truncateToWidth(
          `${task.agentType}  • ${formatMs(Date.now() - task.startedAt)}  (render error: ${msg})`,
          Math.min(width, 120),
        ),
      ];
    }
  }

  function requestRender(): void {
    requestWidgetRender?.();
  }

  function ensureTaskWidget(targetCtx: ExtensionContext): void {
    if (targetCtx.mode !== "tui") return;
    if (widgetCtx) {
      requestRender();
      return;
    }
    widgetCtx = targetCtx;
    ignoreStaleExtensionCtx(() =>
      targetCtx.ui.setWidget("task", (tui, theme) => {
        widgetTheme = theme ?? null;
        requestWidgetRender = () => tui.requestRender();
        return {
          render: (width: number) => renderWidget(width),
          invalidate: requestRender,
          dispose: () => {
            widgetTheme = null;
            requestWidgetRender = null;
          },
        };
      }),
    );
  }

  function clearTaskWidgetIfIdle(): void {
    if (foregroundTasks.size > 0 || backgroundTasks.size > 0) {
      requestRender();
      return;
    }
    if (widgetCtx) {
      const ctx = widgetCtx;
      ignoreStaleExtensionCtx(() => ctx.ui.setWidget("task", undefined));
      widgetCtx = null;
    }
    requestWidgetRender = null;
  }

  function dispose(): void {
    if (widgetCtx) {
      const ctx = widgetCtx;
      ignoreStaleExtensionCtx(() => ctx.ui.setWidget("task", undefined));
      widgetCtx = null;
    }
    widgetTheme = null;
    requestWidgetRender = null;
  }

  return { ensureTaskWidget, requestRender, clearTaskWidgetIfIdle, dispose };
}
