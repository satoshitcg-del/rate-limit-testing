#!/bin/bash

# Run tests with 3-minute wait between runs
# Usage: ./run-with-wait.sh [number_of_runs]

RUNS=${1:-2}
DELAY=180  # 3 minutes in seconds

echo "=========================================="
echo "Rate Limit Test Runner"
echo "Will run $RUNS times with $DELAY seconds between runs"
echo "=========================================="

for i in $(seq 1 $RUNS); do
    echo ""
    echo "========== RUN $i of $RUNS =========="
    echo "Starting at: $(date)"
    echo ""

    npx playwright test --reporter=list

    if [ $i -lt $RUNS ]; then
        echo ""
        echo "========== Waiting $DELAY seconds before next run =========="
        echo "Started waiting at: $(date)"
        sleep $DELAY
        echo "Finished waiting at: $(date)"
    fi
done

echo ""
echo "=========================================="
echo "All $RUNS runs completed!"
echo "=========================================="
