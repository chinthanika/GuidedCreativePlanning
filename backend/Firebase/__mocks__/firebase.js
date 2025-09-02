// react-website/src/Firebase/__mocks__/firebase.js

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
const mockChild = jest.fn();
const mockRef = jest.fn();
const mockPush = jest.fn();
const mockOnValue = jest.fn();

module.exports = {
  database: {},
  get: (...args) => mockGet(...args),
  set: (...args) => mockSet(...args),
  update: (...args) => mockUpdate(...args),
  remove: (...args) => mockRemove(...args),
  ref: (...args) => mockRef(...args),
  child: (...args) => mockChild(...args),
  push: (...args) => mockPush(...args),
  onValue: (...args) => mockOnValue(...args),

  // Expose mocks for assertions
  __mockGet: mockGet,
  __mockSet: mockSet,
  __mockUpdate: mockUpdate,
  __mockRemove: mockRemove,
  __mockChild: mockChild,
  __mockRef: mockRef,
  __mockPush: mockPush,
  __mockOnValue: mockOnValue,
};
