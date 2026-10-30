import '@testing-library/jest-dom/vitest';
import fc from 'fast-check';

// Floor for every property test; each test also passes { numRuns: 100 } explicitly.
fc.configureGlobal({ numRuns: 100 });
