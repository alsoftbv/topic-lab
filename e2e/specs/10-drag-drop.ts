import {
  selectors,
  waitForDashboard,
  openButtonEditor,
  setInputValue,
  getElText,
} from "../helpers.js";

describe("Drag & Drop Reorder", () => {
  before(async () => {
    await waitForDashboard();
  });

  it("has at least one button from seed data", async () => {
    const cards = await $$(selectors.buttonCard);
    expect(await cards.length).toBeGreaterThanOrEqual(1);
  });

  it("creates a second button for reordering", async () => {
    await openButtonEditor();

    await setInputValue("#buttonName", "Drag Target");
    await setInputValue("#topic", "test/drag");

    const submitBtn = await $("button=Create");
    await submitBtn.click();

    await browser.waitUntil(
      async () => {
        const cards = await $$(selectors.buttonName);
        for (const card of cards) {
          if ((await getElText(card)) === "Drag Target") return true;
        }
        return false;
      },
      { timeout: 5000, timeoutMsg: "Drag Target button was not created" }
    );
  });

  it("reads initial button order", async () => {
    const names = await $$(selectors.buttonName);
    const count = await names.length;
    expect(count).toBeGreaterThanOrEqual(2);

    const firstName = await getElText(names[0]);
    const secondName = await getElText(names[1]);

    // Store for comparison after drag
    await browser.execute(
      (first: string, second: string) => {
        (window as any).__dragTestOrder = { first, second };
      },
      firstName,
      secondName
    );
  });

  it("drags the second button before the first", async () => {
    const result = await browser.execute(() => {
      const cards = document.querySelectorAll(".button-card");
      if (cards.length < 2) return { error: "Not enough cards" };

      const sourceCard = cards[1];
      const targetCard = cards[0];
      const dragHandle = sourceCard.querySelector(".drag-handle");
      if (!dragHandle) return { error: "No drag handle found" };

      const sourceRect = sourceCard.getBoundingClientRect();
      const targetRect = targetCard.getBoundingClientRect();

      // Trigger mousedown on the drag handle (React handler)
      const propsKey = Object.keys(dragHandle).find((k) => k.startsWith("__reactProps$"));
      if (propsKey) {
        const props = (dragHandle as any)[propsKey];
        if (props.onMouseDown) {
          props.onMouseDown({
            preventDefault: () => {},
            clientX: sourceRect.left + sourceRect.width / 2,
            clientY: sourceRect.top + sourceRect.height / 2,
          });
        }
      }

      // Small delay then simulate mouse move to target position (left side)
      setTimeout(() => {
        // Trigger mouseenter on target card
        const targetPropsKey = Object.keys(targetCard).find((k) =>
          k.startsWith("__reactProps$")
        );
        if (targetPropsKey) {
          const targetProps = (targetCard as any)[targetPropsKey];
          if (targetProps.onMouseEnter) {
            targetProps.onMouseEnter({
              clientX: targetRect.left + 10,
              clientY: targetRect.top + targetRect.height / 2,
            });
          }
          if (targetProps.onMouseMove) {
            targetProps.onMouseMove({
              clientX: targetRect.left + 10,
              clientY: targetRect.top + targetRect.height / 2,
            });
          }
        }

        // Dispatch global mousemove for ghost position
        window.dispatchEvent(
          new MouseEvent("mousemove", {
            clientX: targetRect.left + 10,
            clientY: targetRect.top + targetRect.height / 2,
            bubbles: true,
          })
        );

        // Drop after another small delay
        setTimeout(() => {
          window.dispatchEvent(
            new MouseEvent("mouseup", {
              clientX: targetRect.left + 10,
              clientY: targetRect.top + targetRect.height / 2,
              bubbles: true,
            })
          );
        }, 100);
      }, 100);

      return { success: true };
    });

    // Wait for the drag operation to complete
    await browser.pause(500);

    expect((result as any).error).toBeUndefined();
  });

  it("verifies buttons were reordered", async () => {
    const originalOrder = await browser.execute(
      () => (window as any).__dragTestOrder as { first: string; second: string }
    );

    const names = await $$(selectors.buttonName);
    const firstAfterDrag = await getElText(names[0]);
    const secondAfterDrag = await getElText(names[1]);

    // After dragging the second button before the first, order should be swapped
    expect(firstAfterDrag).toBe(originalOrder.second);
    expect(secondAfterDrag).toBe(originalOrder.first);
  });
});
