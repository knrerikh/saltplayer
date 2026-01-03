# Contributing to Saltplayer

Thank you for your interest in contributing to Saltplayer!

## Development Setup

1. **Prerequisites:**
   - Node.js 18+ (recommended via nvm)
   - npm 9+

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode:**
   ```bash
   npm run dev
   ```

4. **Run tests:**
   ```bash
   npm test
   npm run test:coverage
   ```

## Project Structure

```
saltplayer/
├── src/
│   ├── main/       # Electron main process
│   ├── renderer/   # React UI
│   └── shared/     # Shared types
├── tests/          # Unit and integration tests
└── build/          # Build assets
```

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Write tests for new functionality
4. Ensure all tests pass: `npm test`
5. Build the project: `npm run build`
6. Submit a pull request

## Code Style

- TypeScript strict mode is enabled
- Follow existing code formatting
- Write descriptive commit messages
- Keep functions small and focused

## Testing

- Write unit tests for business logic
- Write integration tests for component interactions
- Aim for >60% code coverage on critical modules

## Pull Request Process

1. Update README.md if needed
2. Ensure CI passes
3. Request review from maintainers
4. Address review feedback

## Questions?

Open an issue for discussion before starting major work.

