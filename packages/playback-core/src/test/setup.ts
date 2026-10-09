import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom deliberately leaves media loading unimplemented. Player teardown
// calls load() after clearing a source, just as browsers require.
HTMLMediaElement.prototype.load = () => undefined

afterEach(cleanup)
