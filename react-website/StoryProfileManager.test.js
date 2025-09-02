/**
 * @jest-environment node
 */
const StoryProfileManager = require("../backend/services/StoryProfileManager");

// Grab the auto-mock
jest.mock("react-website/src/Firebase/firebase");
jest.mock("react-website/src/Firebase/AuthContext", () => ({
  useAuthValue: jest.fn(() => ({ uid: "testUID" }))
}));

// Import the exposed mocks
const firebase = require("react-website/src/Firebase/firebase");
const { useAuthValue } = require("react-website/src/Firebase/AuthContext");

describe("StoryProfileManager", () => {
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new StoryProfileManager();
  });

  test("should throw error if user not authenticated", () => {
    useAuthValue.mockReturnValueOnce(null);
    expect(() => new StoryProfileManager()).toThrow("User not authenticated");
  });

  test("should call set when creating a profile", async () => {
    await manager.createProfile({ title: "My Story" }); // ✅ story lives at stories/uid
    expect(firebase.__mockSet).toHaveBeenCalled();
  });

  test("should return null if node does not exist", async () => {
    firebase.__mockGet.mockResolvedValueOnce({ exists: () => false });
    const result = await manager.getNode("node1");
    expect(result).toBeNull();
  });

  test("should return node data if exists", async () => {
    firebase.__mockGet.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ id: "node1", group: "People" }),
    });
    const result = await manager.getNode("node1");
    expect(result).toEqual({ id: "node1", group: "People" });
  });

  test("should diff nodes correctly", async () => {
    firebase.__mockGet.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ id: "node1", name: "Alice" }),
    });
    const diffs = await manager.diffNode("node1", { id: "node1", name: "Bob" });
    expect(diffs).toEqual({ name: { before: "Alice", after: "Bob" } });
  });

  test("should handle link diff for new link", async () => {
    firebase.__mockGet.mockResolvedValueOnce({ exists: () => false });
    const diffs = await manager.diffLink("link1", { source: "n1", target: "n2" });
    expect(diffs).toEqual({ created: { source: "n1", target: "n2" } });
  });

  test("should filter events by field", async () => {
    firebase.__mockGet.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        event1: { title: "Battle", stage: "Climax" },
        event2: { title: "Peace", stage: "Resolution" },
      }),
    });
    const result = await manager.filterEventsByField("stage", "Climax");
    expect(result).toEqual({
      event1: { title: "Battle", stage: "Climax" },
    });
  });

  test("getProfile fetches profile correctly", async () => {
    firebase.__mockGet.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ id: "test123", name: "Test Story" }),
    });

    const profile = await manager.getProfile(); // ✅ no storyId needed now

    expect(profile).toHaveProperty("id", "test123");
    expect(profile).toHaveProperty("name", "Test Story");
  });

  test("deleteProfile removes data", async () => {
    firebase.__mockRemove.mockResolvedValueOnce(true);

    const result = await manager.deleteProfile(); // ✅ no storyId param

    expect(result).toBe(true);
    expect(firebase.__mockRemove).toHaveBeenCalled();
  });
});
