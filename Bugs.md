- [ ] **CRITICAL:** Stage handler fails to detect existing entity and creates duplicate node instead of returning existing info
  - Severity: Critical
  - Affected area: DTConversationFlowManager / stage handling (STAGE_CHANGE), dt_chatbot_server
  - Summary: When a user/stage requests to create or update a node that already exists (label "Akio"), the flow should call `get_info` and block creation, returning the existing node info. Instead the stage issues a STAGE_CHANGE that creates a new node (entityId: None) and the assistant responds "I've added Akio..." — duplicating data and skipping the expected get_info/blocked response.
  - Reproduction steps:
    1. Ensure a node with label "Akio" already exists in the story data store.
    2. Trigger the stage flow that issues a request to create or update "Akio".
    3. Observe logs and assistant response.
  - Expected result: The stage performs `get_info` for "Akio", detects existing entity, blocks creation, and responds with the existing entity details.
  - Actual result: STAGE_CHANGE request created new node (entityId: None) with label "Akio"; assistant replies "Great! I've added Akio..." and proceeds to follow-up instead of returning existing info.
  - Relevant log excerpt:
    ```
    2025-10-06 16:29:48,305 [DEBUG] [STAGE_CHANGE] Requests: [{'entityType': 'node', 'entityId': None, 'newData': {'label': 'Akio', 'group': 'Person', ...}}]
    2025-10-06 16:30:01,238 [DEBUG] [LLM] Raw staging follow-up: { "action": "respond", ... "message": "Great! I've added Akio to your story. ..." }
    2025-10-06 16:30:01,240 [DEBUG] [RESPOND] Message: <p>Great! I've added Akio to your story....</p>
    ```
  - Likely cause:
    - Stage handling code does not call or honor `get_info` checks before applying STAGE_CHANGE.
    - Stage decision logic permits creation when it should instead detect existing entity and return info.
  - Suggested fixes:
    1. In DTConversationFlowManager (or the stage handler module):
       - Before executing a STAGE_CHANGE that creates a node (entityId null), call the entity lookup function (`get_info` or equivalent) by label and other identifying attributes.
       - If an entity exists, cancel creation and return the existing entity data as the stage response (and set appropriate metadata to prevent duplicate creation).
    2. Add guards in the stage executor to reject STAGE_CHANGE requests with `entityId: None` when a matching entity already exists; return a "blocked" response instead of performing create.
    3. Add unit/integration tests covering the case: existing entity -> stage should return existing info and not create new node.
    4. Add logging and an assertion to detect duplicate creation attempts in staging flow.
  - Files to inspect:
    - backend/servers/dt_chatbot_server.py
    - utils/DTConversationFlowManager.py (or equivalent stage handling code)
    - any stage executor / entity-store adapter that implements `get_info` and node creation
  - Priority: P0 (must fix before next deploy)
  - Notes: Mark this off after code change + tests added and verified in logs (should show `get_info` call and blocked response instead of STAGE_CHANGE create).


  - [ ] **HIGH:** Background task messages displaying incorrectly and persisting
  - Severity: High
  - Affected area: Frontend chat display, background task handling
  - Summary: "Let me check that..." loading messages are showing for all background tasks regardless of necessity and persisting after task completion instead of being replaced by results.
  - Reproduction steps:
    1. Open chat with existing character
    2. Mention character name
    3. Observe "Let me check that..." message appears
    4. Message persists even after data is retrieved and displayed
  - Expected behavior:
    1. Only show loading message for actual data retrieval operations
    2. Loading message should be replaced by retrieved data/response
    3. Loading message should not appear for operations that don't need background checks
  - Actual behavior:
    ```
    User: Hi, I want to talk about my character Akio
    Bot: Let me check that for you...
    Bot: Great, let's talk about Akio! [Loading message still visible]
    User: What have I said about him before?
    Bot: Let me check that for you... [Previous loading message still visible]
    Bot: Here's what you've previously told me about Akio: [...] [All loading messages still visible]
    ```
  - Likely cause:
    - Loading messages are being added to chat history instead of being temporary UI states
    - Background task completion not clearing loading messages
    - No discrimination between operations that need loading states
  - Suggested fixes:
    1. Implement temporary loading state in chat UI:
       - Replace permanent chat messages with temporary loading indicator
       - Clear loading indicator when background task completes
    2. Add task type checking:
       - Only show loading for actual data retrieval operations
       - Skip loading state for simple responses
    3. Implement message replacement logic:
       - Store message IDs for loading states
       - Replace loading messages with actual responses on task completion
  - Files to inspect:
    - react-website/src/components/chatbot/ChatWindow.js
    - react-website/src/services/chatbotAPI.js
  - Priority: P1 (High priority but not blocking deployment)
  - Notes: Should be fixed in conjunction with the entity detection bug as they affect the same conversation flow