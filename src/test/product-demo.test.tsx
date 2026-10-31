import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDemo } from "@/components/product/ProductDemo";
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reduced = false;
});
describe("public guided product demo", () => {
  it("navigates all scenes and keeps review local", () => {
    const network = vi.spyOn(globalThis, "fetch");
    render(<ProductDemo />);
    expect(screen.getByRole("button", { name: "Previous scene" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    fireEvent.click(screen.getByRole("button", { name: "Review draft" }));
    expect(screen.getByText("Reviewed in demo · Nothing has been published")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Follow through" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "6");
    expect(screen.getByRole("button", { name: "Next scene" })).toBeDisabled();
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });
  it("plays, pauses, and stops at the end without wrapping", () => {
    render(<ProductDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Play walkthrough" }));
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    fireEvent.click(screen.getByRole("button", { name: "Pause walkthrough" }));
    act(() => vi.advanceTimersByTime(16000));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Play walkthrough" }));
    act(() => vi.advanceTimersByTime(8000));
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "6");
    expect(screen.getByRole("button", { name: "Play walkthrough" })).toBeInTheDocument();
  });
  it("starts paused with reduced motion and supports manual scene changes", () => {
    reduced = true;
    render(<ProductDemo />);
    act(() => vi.advanceTimersByTime(20000));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    fireEvent.click(screen.getByRole("button", { name: "Next scene" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  });
});

