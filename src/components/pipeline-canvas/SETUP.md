# Pipeline Canvas Library - Setup Guide

This library is prepared for publishing to a private GitHub repository.

## Current Status

✅ All configuration files are ready:
- `vite.config.ts` - Build configuration
- `package.json` - Updated with build scripts and proper exports
- `tsconfig.json` - Configured for declaration file generation
- `style.css` - CSS file for styling
- `README.md` - Installation and usage documentation
- `.gitignore` - Git ignore rules

## Local Development

The library can still be used locally in the current project. The imports work as before:

```tsx
import { PipelineCanvas } from './components/pipeline-canvas';
```

## Building the Library

To build the library for distribution:

```bash
cd src/components/pipeline-canvas
npm install  # Install dev dependencies if needed
npm run build
```

This will:
1. Build the library using Vite (outputs to `dist/`)
2. Generate TypeScript declaration files (`.d.ts`)

## Preparing for GitHub

When you're ready to publish:

1. **Update the repository URL** in `package.json`:
   ```json
   "repository": {
     "type": "git",
     "url": "git+https://github.com/YOUR_USERNAME/pipeline-canvas.git"
   }
   ```

2. **Build the library**:
   ```bash
   cd src/components/pipeline-canvas
   npm run build
   ```

3. **Create a new repository** (or use existing):
   ```bash
   # Create a new directory for the library
   mkdir ../pipeline-canvas-library
   cd ../pipeline-canvas-library
   
   # Copy all files from pipeline-canvas
   cp -r ../novoprotien-ai/src/components/pipeline-canvas/* .
   
   # Initialize git
   git init
   git add .
   git commit -m "Initial commit: Pipeline Canvas Library"
   git branch -M main
   git remote add origin git@github.com:YOUR_USERNAME/pipeline-canvas.git
   git push -u origin main
   ```

4. **Tag a release** (optional but recommended):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

## Installing in Other Projects

Once published to GitHub, install in other projects:

```bash
npm install git+ssh://git@github.com:YOUR_USERNAME/pipeline-canvas.git
```

Or add to `package.json`:
```json
{
  "dependencies": {
    "@novoprotein/pipeline-canvas": "git+ssh://git@github.com:YOUR_USERNAME/pipeline-canvas.git"
  }
}
```

## Important Notes

- **Always build before committing**: The `dist/` folder should be committed to the repository so users can install without building
- **Update version**: Use `npm version patch|minor|major` to bump versions
- **Peer dependencies**: Users must install peer dependencies in their projects
- **CSS import**: Users need to import `@novoprotein/pipeline-canvas/style.css` in their projects

## Testing the Build Locally

You can test the build process:

```bash
cd src/components/pipeline-canvas
npm run build
```

Check that `dist/` folder is created with:
- `.mjs` files (ES modules)
- `.d.ts` files (TypeScript declarations)
- `style.css` file

