// Mock window object if needed
global.window = {
    setInterval: jest.fn()
};

// Mock console methods to avoid noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}; 