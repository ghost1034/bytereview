#!/bin/bash

# Setup script for type generation and validation

echo "🔧 Setting up type generation system..."

# Ensure we're in the project root
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Install dependencies if needed
echo "📦 Checking dependencies..."
if [ ! -d "node_modules/openapi-typescript" ]; then
    echo "Installing openapi-typescript..."
    npm install --save-dev openapi-typescript typescript
fi

if [ ! -d "backend/node_modules/openapi-typescript" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install --save-dev openapi-typescript typescript && cd ..
fi

# Generate types
echo "🔄 Generating types from backend..."
npm run generate-types

# Validate generated types
if [ -f "lib/api-types.ts" ]; then
    echo "✅ Types generated successfully at lib/api-types.ts"
    
    # Check if TypeScript can compile the types
    echo "🔍 Validating TypeScript compilation..."
    npx tsc --noEmit lib/api-types.ts lib/typed-api.ts hooks/useExtraction.ts hooks/useUserProfile.ts
    
    if [ $? -eq 0 ]; then
        echo "✅ All types compile successfully!"
    else
        echo "⚠️  TypeScript compilation warnings detected"
    fi
else
    echo "❌ Error: Types not generated. Check backend setup."
    exit 1
fi

echo ""
echo "🎉 Type generation setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Use 'npm run generate-types' to regenerate types after backend changes"
echo "2. Use 'npm run dev:with-types' to start development with fresh types"
echo "3. Import from 'lib/typed-api' for fully typed API calls"
echo "4. See TYPES_MIGRATION.md for detailed migration guide"
echo ""
echo "🔗 Key files:"
echo "  - lib/api-types.ts (generated types)"
echo "  - lib/typed-api.ts (typed API client)"
echo "  - hooks/useExtraction.ts (typed extraction hooks)"
echo "  - hooks/useUserProfile.ts (React Query user hooks)"