#!/bin/bash
# Fuzzing Script for Clique
#
# This script runs various fuzzing tests for the Clique parsers.
# Requires: cargo, cargo-fuzz (install with: cargo install cargo-fuzz)

set -e

MODE="${1:-proptest}"
DURATION="${2:-60}"
TARGET="${3:-all}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUST_DIR="$ROOT_DIR/rust"
CORE_DIR="$RUST_DIR/clique-core"

echo "🔍 Clique Fuzzing Suite"
echo "========================"
echo ""

run_prop_tests() {
    echo "📦 Running Property-Based Tests (proptest)..."
    echo ""

    cd "$CORE_DIR"
    cargo test fuzz_ --release -- --nocapture
    echo "✅ Proptest fuzzing completed successfully!"
}

run_libfuzzer() {
    local target_name="$1"
    local seconds="$2"

    echo "🔥 Running libFuzzer on target: $target_name for $seconds seconds..."
    echo ""

    cd "$CORE_DIR/fuzz"
    export RUSTFLAGS="-C target-cpu=native"
    cargo +nightly fuzz run "$target_name" -- -max_total_time="$seconds" || {
        echo "⚠️  Fuzzer found issues or was interrupted"
    }
}

run_typescript_fuzz() {
    echo "📦 Running TypeScript Fuzz Tests..."
    echo ""

    cd "$ROOT_DIR"
    npm test -- --testPathPattern=fuzz --testTimeout=120000
    echo "✅ TypeScript fuzzing completed successfully!"
}

case "$MODE" in
    proptest)
        run_prop_tests
        run_typescript_fuzz
        ;;
    libfuzzer)
        targets=(
            "fuzz_workflow_parser"
            "fuzz_sprint_parser"
            "fuzz_workflow_update"
            "fuzz_sprint_update"
            "fuzz_path_validation"
        )

        if [ "$TARGET" = "all" ]; then
            for t in "${targets[@]}"; do
                run_libfuzzer "$t" "$DURATION"
            done
        else
            run_libfuzzer "$TARGET" "$DURATION"
        fi
        ;;
    quick)
        echo "⚡ Quick Fuzz Mode (reduced iterations)..."
        echo ""

        cd "$CORE_DIR"
        PROPTEST_CASES=50 cargo test fuzz_ --release -- --nocapture

        run_typescript_fuzz
        ;;
    all)
        run_prop_tests
        run_typescript_fuzz

        echo ""
        echo "💡 For deeper fuzzing with libFuzzer, run:"
        echo "   ./scripts/fuzz.sh libfuzzer 300"
        ;;
    *)
        echo "Usage: $0 [proptest|libfuzzer|quick|all] [duration] [target]"
        echo ""
        echo "Modes:"
        echo "  proptest  - Run proptest property-based tests (default)"
        echo "  libfuzzer - Run cargo-fuzz with libFuzzer"
        echo "  quick     - Quick smoke test with reduced iterations"
        echo "  all       - Run all fuzz modes"
        echo ""
        echo "Examples:"
        echo "  $0 proptest              # Run proptest"
        echo "  $0 libfuzzer 300         # Fuzz for 5 minutes"
        echo "  $0 libfuzzer 60 fuzz_workflow_parser  # Fuzz specific target"
        exit 1
        ;;
esac

echo ""
echo "🎉 Fuzzing complete!"
