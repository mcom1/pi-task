import assert from "node:assert/strict";
import { test } from "node:test";
import { createTaskWidgetController } from "../src/lifecycle/widget";

function createTuiContext() {
  let widgetFactory: ((tui: { requestRender(): void }, theme: unknown) => unknown) | undefined;
  const setWidgetCalls: unknown[] = [];
  return {
    context: {
      mode: "tui",
      ui: {
        setWidget(_name: string, value: unknown) {
          setWidgetCalls.push(value);
          widgetFactory = value as typeof widgetFactory;
        },
      },
    } as any,
    getWidgetFactory: () => widgetFactory,
    setWidgetCalls,
  };
}

test("task widget renders only when explicitly refreshed", () => {
  const foregroundTasks = new Map();
  const backgroundTasks = new Map();
  const { context, getWidgetFactory } = createTuiContext();
  const controller = createTaskWidgetController(foregroundTasks, backgroundTasks);
  let renders = 0;

  controller.ensureTaskWidget(context);
  const widget = getWidgetFactory()?.(
    { requestRender: () => renders++ },
    undefined,
  );

  assert.ok(widget);
  assert.equal(renders, 0, "widget registration must not start a repaint loop");
  controller.requestRender();
  assert.equal(renders, 1);
  controller.requestRender();
  assert.equal(renders, 2);
  controller.dispose();
});
