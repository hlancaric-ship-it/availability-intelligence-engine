import { AvailabilityEngine } from './AvailabilityEngine.js';
import { SortingPipeline } from '../ranking/SortingPipeline.js';
import { ProductAvailabilityInput } from './types.js';

function runBenchmark(count: number) {
    const products: ProductAvailabilityInput[] = [];
    for (let i = 0; i < count; i++) {
        products.push({
            id: `PROD_${i}`,
            variants: [
                { id: `v1_${i}`, isPurchasable: true, inStock: Math.random() > 0.5 },
                { id: `v2_${i}`, isPurchasable: true, inStock: Math.random() > 0.5 }
            ],
            baseSortPriority: Math.floor(Math.random() * 100)
        });
    }

    const startEval = process.hrtime.bigint();
    const evaluated = products.map(p => AvailabilityEngine.evaluate(p));
    const endEval = process.hrtime.bigint();

    const startSort = process.hrtime.bigint();
    const sorted = SortingPipeline.sort(evaluated);
    const endSort = process.hrtime.bigint();

    const evalTimeMs = Number(endEval - startEval) / 1_000_000;
    const sortTimeMs = Number(endSort - startSort) / 1_000_000;

    console.log(`[Benchmark] ${count.toLocaleString()} products`);
    console.log(`- Evaluation: ${evalTimeMs.toFixed(2)} ms`);
    console.log(`- Sorting:    ${sortTimeMs.toFixed(2)} ms`);
    console.log(`- Total:      ${(evalTimeMs + sortTimeMs).toFixed(2)} ms\n`);
}

console.log("=== AVAILABILITY INTELLIGENCE BENCHMARK ===");
runBenchmark(1000);
runBenchmark(10000);
runBenchmark(50000);
runBenchmark(100000);
