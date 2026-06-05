import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./pages/Dashboard", () => ({
  Dashboard: () => <main>Dashboard page loaded</main>
}));

vi.mock("./pages/Sessions", () => ({
  Sessions: () => <main>Sessions page loaded</main>
}));

vi.mock("./pages/Practice", () => ({
  Practice: () => <main>Practice page loaded</main>
}));

vi.mock("./pages/Settings", () => ({
  Settings: () => <main>Settings page loaded</main>
}));

describe("App navigation", () => {
  afterEach(() => {
    cleanup();
  });

  it("switches between every sidebar button", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("Dashboard page loaded")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByText("Sessions page loaded")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Practice" }));
    expect(screen.getByText("Practice page loaded")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("Settings page loaded")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(screen.getByText("Dashboard page loaded")).toBeInTheDocument();
  });
});
