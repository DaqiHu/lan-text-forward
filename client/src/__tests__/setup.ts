import '@testing-library/jest-dom';

// Mock window.visualViewport
Object.defineProperty(window, 'visualViewport', {
  value: {
    height: window.innerHeight,
    width: window.innerWidth,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});
