#!/bin/bash

# Resume Studio - Quick Validation (CI/CD)
# Runs fast checks for continuous integration

set -e

echo "🚀 Quick Validation (CI/CD)"
echo "==========================="
echo ""

# Lint
echo "→ Linting..."
npm run lint
echo "  ✅ Passed"
echo ""

# Type check
echo "→ Type checking..."
npx tsc --noEmit
echo "  ✅ Passed"
echo ""

# Build
echo "→ Building..."
npm run build
echo "  ✅ Passed"
echo ""

echo "✅ Quick validation complete!"
echo ""
echo "For comprehensive validation, run: ./validate.sh"
