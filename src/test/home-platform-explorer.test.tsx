import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlatformExplorer } from "@/components/home/HomeExplore";

afterEach(cleanup);

describe("homepage platform explorer", () => {
  it("shows clear platform status and changes its example tasks without external actions", () => {
    render(<PlatformExplorer />);

    expect(screen.getByText("Supervised browser foundation")).toBeInTheDocument();
    expect(screen.getByText("Explore local resources")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Facebook Pages/i }));
    expect(screen.getByText("Planned connection")).toBeInTheDocument();
    expect(screen.getByText("Draft resource posts")).toBeInTheDocument();
    expect(screen.getByText(/No connected listening or publishing yet/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Eventbrite/i }));
    expect(screen.getByText("Prepare an event brief")).toBeInTheDocument();
    expect(
      screen.getByText(/External event creation and registration are not connected yet/),
    ).toBeInTheDocument();
  });
});
