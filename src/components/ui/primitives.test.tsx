import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Plus } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  LoadingState,
  SectionHeading,
  StatusMessage,
  Surface,
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

  it("provides semantic visual hierarchy without changing surface semantics", () => {
    const markup = renderToStaticMarkup(
      <Surface variant="primary">
        <SectionHeading
          kicker="Today"
          title="Current progression"
          description="Continue from the latest saved chord."
        />
      </Surface>,
    );
    expect(markup).toContain("<section");
    expect(markup).toContain("lv-surface-primary");
    expect(markup).toContain("<h2");
    expect(markup).toContain("lv-section-kicker");
  });

  it("labels badges by tone and loading updates as polite status", () => {
    const badge = renderToStaticMarkup(<Badge tone="indigo">Practice</Badge>);
    const loading = renderToStaticMarkup(
      <LoadingState label="Analyzing…" description="Voice 3 of 8" />,
    );
    expect(badge).toContain("lv-badge-indigo");
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
  });
});
