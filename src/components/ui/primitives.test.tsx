import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Plus } from "lucide-react";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  StatusMessage,
} from "./primitives";

describe("shared UI primitives", () => {
  it("keeps button semantics and defaults to a non-submit action", () => {
    const markup = renderToStaticMarkup(<Button variant="primary">Analyze</Button>);
    expect(markup).toContain('type="button"');
    expect(markup).toContain("lv-button-primary");
  });

  it("requires an accessible name for icon buttons", () => {
    const markup = renderToStaticMarkup(
      <IconButton label="Add chord"><Plus aria-hidden="true" /></IconButton>,
    );
    expect(markup).toContain('aria-label="Add chord"');
    expect(markup).toContain('title="Add chord"');
  });

  it("renders persistent field labels and recoverable inline errors", () => {
    const markup = renderToStaticMarkup(
      <Field htmlFor="title" label="Title" error="Enter a title">
        <input id="title" className="lv-field-control" aria-invalid="true" />
      </Field>,
    );
    expect(markup).toContain('for="title"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Enter a title");
  });

  it("uses assertive announcements only for errors", () => {
    const error = renderToStaticMarkup(<StatusMessage tone="error" title="Save failed" />);
    const info = renderToStaticMarkup(<StatusMessage tone="info" title="Analyzing" />);
    expect(error).toContain('role="alert"');
    expect(error).toContain('aria-live="assertive"');
    expect(info).toContain('role="status"');
    expect(info).toContain('aria-live="polite"');
  });

  it("gives empty states a heading and an explicit next action slot", () => {
    const markup = renderToStaticMarkup(
      <EmptyState
        title="No progressions"
        description="Import a MIDI file to begin."
        action={<Button>Import MIDI</Button>}
      />,
    );
    expect(markup).toContain("<h3");
    expect(markup).toContain("Import MIDI");
  });
});

