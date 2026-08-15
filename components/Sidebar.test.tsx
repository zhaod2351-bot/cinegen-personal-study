// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

describe("Sidebar settings launcher", () => {
  afterEach(cleanup);

  it("asks App to open the settings dialog", () => {
    const onOpenSettings = vi.fn();
    render(
      <Sidebar
        currentStage="script"
        setStage={vi.fn()}
        onExit={vi.fn()}
        onOpenSettings={onOpenSettings}
        projectName="余烬回声"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "系统设置" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("主题颜色")).not.toBeInTheDocument();
  });
});
