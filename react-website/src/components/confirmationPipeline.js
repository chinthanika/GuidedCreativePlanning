// backend/services/ConfirmDenyPipeline.js
import StoryProfileManager from "./StoryProfileManager.js";

class ConfirmDenyPipeline {
  constructor(user) {
    this.manager = new StoryProfileManager(user);
  }

  /**
   * Stage a change: diff old vs new and return proposal
   */
  async stageChange(entityType, entityId, newData) {
    let diff;
    switch (entityType) {
      case "node":
        diff = await this.manager.diffNode(entityId, newData);
        break;
      case "link":
        diff = await this.manager.diffLink(entityId, newData);
        break;
      case "event":
        diff = await this.manager.diffEvent(entityId, newData);
        break;
      default:
        throw new Error(`Unknown entityType: ${entityType}`);
    }

    return {
      entityType,
      entityId,
      newData,
      diff,
      status: "PENDING",
    };
  }

  /**
   * Confirm: apply the change through StoryProfileManager
   */
  async confirm(changeRequest) {
    const { entityType, entityId, newData } = changeRequest;
    switch (entityType) {
      case "node":
        await this.manager.setNode(entityId, newData);
        break;
      case "link":
        await this.manager.setLink(entityId, newData);
        break;
      case "event":
        await this.manager.setEvent(entityId, newData);
        break;
      default:
        throw new Error(`Unknown entityType: ${entityType}`);
    }
    return { ...changeRequest, status: "CONFIRMED" };
  }

  /**
   * Deny: discard the change
   */
  async deny(changeRequest) {
    return { ...changeRequest, status: "DENIED" };
  }
}

export default ConfirmDenyPipeline;
