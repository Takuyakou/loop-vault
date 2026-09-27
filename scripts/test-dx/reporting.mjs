export function summaryCounts(output, kind) {
  if (kind === "vitest") {
    const match = output.match(/Tests\s+(\d+) passed \((\d+)\)/);
    return match ? `${match[1]}/${match[2]}` : "";
  }
  if (kind === "browser") {
    const match = output.match(/\b(\d+) passed \(/);
    return match ? `${match[1]}/${match[1]}` : "";
  }
  if (kind === "node") {
    const match = output.match(/[ℹ#]\s+pass\s+(\d+)/);
    return match ? `${match[1]}/${match[1]}` : "";
  }
  return "";
}

export function diagnostics(output) {
  const lines = output.split(/\r?\n/);
  const header = lines.find((line) => /^\s*\d+\)\s+\[|^\s*FAIL\s+/.test(line));
  const relevant = lines.filter((line) => /FAIL |failed|Error:|AssertionError|Expected:|Received:|Timeout:|test-failed-|trace\.zip|\s+at .*:\d+/i.test(line));
  const tail = (relevant.length ? relevant : lines).slice(-12);
  return [...new Set([header, ...tail].filter(Boolean))].join("\n");
}
