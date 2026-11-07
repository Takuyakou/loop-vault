/* global process */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

/** Timing evidence only. Does not change test scheduling, retries or outcomes. */
export default class PerformanceReporter {
  constructor(options = {}) {
    this.root = process.cwd();
    this.output = resolve(options.outputFile ?? process.env.LV_TEST_PERFORMANCE_OUTPUT
      ?? '.local-evaluation/test-logs/playwright-timing.json');
    const local = resolve(this.root, '.local-evaluation') + sep;
    if (!this.output.startsWith(local)) throw new Error('Performance output must remain local and Git-ignored');
    this.tests = [];
  }
  onBegin(config, suite) {
    this.startedAt = new Date().toISOString();
    this.workers = config.workers;
    this.discovered = suite.allTests().map(test => ({
      id: test.id, file: relative(this.root, test.location.file).replaceAll('\\', '/'),
      title: test.title, project: test.parent.project()?.name ?? '',
    }));
  }
  onTestEnd(test, result) {
    this.tests.push({
      id: test.id, file: relative(this.root, test.location.file).replaceAll('\\', '/'),
      line: test.location.line, title: test.title, project: test.parent.project()?.name ?? '',
      durationMs: result.duration, startedAt: result.startTime.toISOString(),
      status: result.status, expectedStatus: test.expectedStatus, retry: result.retry,
      workerIndex: result.workerIndex, errors: result.errors.length,
      attachments: result.attachments.filter(a => a.path).map(a => ({
        name: a.name, path: relative(this.root, a.path).replaceAll('\\', '/'),
      })),
    });
  }
  onEnd(result) {
    mkdirSync(dirname(this.output), { recursive: true });
    writeFileSync(this.output, JSON.stringify({
      schemaVersion: 1, startedAt: this.startedAt, endedAt: new Date().toISOString(),
      status: result.status, workers: this.workers, durationMs: result.duration,
      discovered: this.discovered, tests: this.tests,
    }, null, 2), 'utf8');
  }
}
