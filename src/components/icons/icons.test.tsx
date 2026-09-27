import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CloseIcon, iconCatalog } from "./index";

describe("P8.9 icon set", () => {
  it("draws every icon with the shared stroke rules and hides it from assistive tech by default", () => {
    expect(iconCatalog.length).toBeGreaterThanOrEqual(28);
    for (const [name, Icon] of iconCatalog) {
      const svg = renderToStaticMarkup(<Icon />);
      expect(svg, name).toContain('viewBox="0 0 24 24"');
      expect(svg, name).toContain('stroke="currentColor"');
      expect(svg, name).toContain('stroke-width="1.8"');
      expect(svg, name).toContain('stroke-linecap="round"');
      expect(svg, name).toContain('stroke-linejoin="round"');
      expect(svg, name).toContain('fill="none"');
      expect(svg, name).toContain('aria-hidden="true"');
      expect(svg, name).not.toContain('role="img"');
    }
  });

  it("accepts a size and can be exposed as a labelled image", () => {
    const svg = renderToStaticMarkup(<CloseIcon size={14} aria-hidden={false} aria-label="閉じる" />);
    expect(svg).toContain('width="14"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="閉じる"');
  });
});
