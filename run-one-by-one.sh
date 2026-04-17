#!/bin/bash

# Run tests one by one with 2-minute wait between each
# IP gets blocked when hitting 429, so must wait 2 minutes between tests

TESTS=(
  "01-tc04-payment-verify.spec.ts"
  "02-tc05-user-isolation.spec.ts"
  "03-tc06-standard-routes.spec.ts"
  "04-tc07-response-format.spec.ts"
  "05-tc08-admin-exempt.spec.ts"
  "06-tc01-auth-signin.spec.ts"
  "07-tc02-window-reset.spec.ts"
)

WAIT=120  # 2 minutes in seconds

echo "=========================================="
echo "Rate Limit Test Runner"
echo "Will run ${#TESTS[@]} tests with ${WAIT}s wait between each"
echo "=========================================="
echo ""

for i in "${!TESTS[@]}"; do
    TEST_NUM=$((i+1))
    TEST_FILE="${TESTS[$i]}"

    echo "========== TEST $TEST_NUM/${#TESTS[@]}: $TEST_FILE =========="
    echo "Started at: $(date)"
    echo ""

    npx playwright test "$TEST_FILE" --reporter=list

    if [ $TEST_NUM -lt ${#TESTS[@]} ]; then
        echo ""
        echo "========== Waiting ${WAIT} seconds =========="
        echo "Started waiting at: $(date)"
        sleep $WAIT
        echo "Finished waiting at: $(date)"
        echo ""
    fi
done

echo ""
echo "=========================================="
echo "ALL TESTS COMPLETED!"
echo "=========================================="
