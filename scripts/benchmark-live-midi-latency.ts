import { benchmarkLiveMidiLatency } from "../src/liveMidi/latencyBenchmark";

process.stdout.write(`${JSON.stringify(benchmarkLiveMidiLatency(), null, 2)}\n`);
