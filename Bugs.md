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

- [ ] **HIGH:** LLM occasionally nests actions inside response messages
  - Severity: High
  - Affected area: LLM response handling in dt_chatbot_server.py
  - Summary: The LLM sometimes wraps a `stage_change` action inside a `respond` action's message field, causing raw JSON to appear in the chat and potentially breaking action handling.
  - Reproduction steps:
    1. Create conversation flow that triggers both staging and response (e.g., "They're a mysterious guide" for White Rabbit character)
    2. LLM returns nested response:
    ```json
    {
      "action": "respond",
      "data": {
        "message": "{\n  \"action\": \"stage_change\",\n  ... }\n\n<p>Perfect! A mysterious guide...</p>"
      }
    }
    ```
  - Expected behavior:
    - LLM should return separate actions:
    ```json
    [
      {
        "action": "stage_change",
        "reasoning": "...",
        "data": { ... }
      },
      {
        "action": "respond",
        "data": {
          "message": "Perfect! A mysterious guide..."
        }
      }
    ]
    ```
  - Actual behavior:
    - Stage action gets embedded in message field
    - Raw JSON appears in chat
    - Action handling may fail or duplicate
  - Suggested fixes:
    1. Add response parsing guard:
    ````python
    def extract_nested_actions(response):
        """Extract any JSON actions embedded in message fields."""
        actions = []
        
        if isinstance(response, dict):
            if response.get("action") == "respond":
                message = response.get("data", {}).get("message", "")
                # Try to extract JSON action from start of message
                try:
                    json_end = message.find("\n\n")
                    if json_end > -1:
                        json_part = message[:json_end]
                        text_part = message[json_end:].strip()
                        if json_part.strip().startswith("{"):
                            nested_action = json.loads(json_part)
                            actions.append(nested_action)
                            # Create clean respond action with just text
                            actions.append({
                                "action": "respond",
                                "data": {"message": text_part}
                            })
                            return actions
                except:
                    pass
            
        return [response]

    # In chat endpoint:
    parsed = parse_deepseek_json(bot_reply_raw)
    bot_reply_json_list = []
    for response in (parsed or [{"action": "respond", "data": {"message": bot_reply_raw}}]):
        bot_reply_json_list.extend(extract_nested_actions(response))
    ````
    2. Update LLM prompt to explicitly warn against nesting actions
    3. Add validation to ensure message fields don't contain JSON actions
  - Files to inspect:
    - backend/servers/dt_chatbot_server.py
  - Priority: P1 (High - causes confusion and potential staging issues)
  - Notes:
    - Consider adding logging when nested actions are detected
    - May need to recursively check for multiple levels of nesting
    - Could be related to how follow-up questions are handled after staging

- [ ] **MEDIUM:** Raw JSON visible during LLM processing instead of placeholder messages
  - Severity: Medium
  - Affected area: Chatbot server response handling, dt_chatbot_server.py
  - Summary: When processing complex actions (like CFM questions), the server shows raw JSON in chat instead of waiting for the `respond` action or using an appropriate placeholder based on `reasoning`.
  - Reproduction steps:
    1. Trigger a CFM question or meta-transition
    2. Observe chat shows raw JSON like `{"action": "meta_transition",...}` 
    3. Final `respond` message appears only after processing completes
  - Expected behavior:
    1. Show either:
        - Earlier `respond` action if present in multi-action response
        - Conversational placeholder based on `reasoning` field
        - Generic "Thinking..." message
    2. Replace placeholder with final response when processing complete
  - Actual behavior:
    ```python
    # Current logic
    if not chat_message:
        # Shows raw JSON if response looks like JSON
        if bot_reply_raw.strip().startswith("{") or bot_reply_raw.strip().startswith("["):
            chat_message = "Let me check that for you..."
        else:
            chat_message = bot_reply_raw
    ```
  - Suggested fixes:
    1. Prioritize `respond` actions:
    ````python
    # Extract respond action first
    chat_message = None
    reasoning_message = None
    
    for obj in bot_reply_json_list:
        if isinstance(obj, dict):
            if obj.get("action") == "respond":
                chat_message = parse_markdown(obj.get("data", {}).get("message", ""), "html")
                break
            # Store reasoning as fallback
            if obj.get("reasoning"):
                reasoning_message = f"Let me think about {obj.get('reasoning').lower()}..."
    
    # Use respond > reasoning > default
    if not chat_message:
        chat_message = reasoning_message or "Let me think about that..."
    ````
  - Files to inspect:
    - backend/servers/dt_chatbot_server.py
  - Priority: P2 (Medium priority, affects UX but not functionality)
  - Notes: 
    - Consider standardizing placeholder messages based on action types
    - Could be combined with background task message fix for consistent UX
    - Add logging to track which message type (respond/reasoning/default) is being used