import { expect, test } from "@playwright/test";

test("register, create task, move kanban task, add note, logout, login, and verify persistence", async ({ page }) => {
  const suffix = Date.now();
  const email = `whats-next-e2e-${suffix}@example.com`;
  const password = "WhatsNext-e2e-password-123";
  const taskTitle = `E2E persisted task ${suffix}`;
  const taskNote = `Progress note ${suffix}`;

  await page.goto("/register");
  await page.getByLabel("Name").fill("What's Next E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New task" }).click();

  await page.getByLabel("Task title").fill(taskTitle);
  await page.getByLabel("Description").fill("Created by Playwright to verify the full task lifecycle.");
  await page.getByLabel("Tags").fill("e2e, personal");
  await page.getByLabel("Acceptance criteria").fill("Task survives logout and login.");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { name: taskTitle }).first()).toBeVisible();
  await page.getByRole("button", { name: "Kanban" }).click();
  await dragTaskToStatus(page, taskTitle, "Review");
  await expect(page.getByTestId("kanban-column-Review").getByText(taskTitle)).toBeVisible();

  await page.getByTestId("task-kanban-card").filter({ hasText: taskTitle }).click();
  await expect(page.getByText("Task Details")).toBeVisible();
  await page.getByTestId("task-note-input").fill(taskNote);
  await page.getByTestId("add-task-note").click();
  await expect(page.getByText(taskNote)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Task Details")).toBeHidden();

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: taskTitle }).first()).toBeVisible();
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(page.getByTestId("kanban-column-Review").getByText(taskTitle)).toBeVisible();
});

async function dragTaskToStatus(page: import("@playwright/test").Page, taskTitle: string, status: string) {
  await page.evaluate(
    ({ taskTitle, status }) => {
      const source = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="task-kanban-card"]')).find((element) => element.textContent?.includes(taskTitle));
      const target = document.querySelector<HTMLElement>(`[data-testid="kanban-column-${status}"]`);
      if (!source || !target) throw new Error("Kanban source or target was not found");

      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
      source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
    },
    { taskTitle, status }
  );
}
