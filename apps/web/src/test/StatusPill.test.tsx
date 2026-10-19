import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "@/components/StatusPill";

describe("StatusPill", () => {
  it("always shows an icon and a word", () => {
    const { container } = render(<StatusPill stage="verified" />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("shows the count for partly verified", () => {
    render(<StatusPill stage="partly_verified" checksDone={2} checksTotal={4} />);
    expect(screen.getByText("Partly verified, 2 of 4")).toBeInTheDocument();
  });
  it("shows Paused in red tone", () => {
    const { container } = render(<StatusPill stage="paused" />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(container.firstElementChild?.getAttribute("data-stage")).toBe("paused");
  });
});
