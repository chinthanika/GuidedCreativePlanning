from DTConversationFlowManager import DTConversationFlowManager

# Firebase + DTConversationFlowManager
import firebase_admin
from firebase_admin import credentials, db

# Initialize Firebase
cred = credentials.Certificate("../../Firebase/structuredcreativeplanning-fdea4acca240.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': "https://structuredcreativeplanning-default-rtdb.firebaseio.com/"
})

def main():
    print("=== DTConversationFlowManager Interactive REPL ===")
    uid = input("Enter test user ID: ").strip()
    
    # Create a new session
    session = DTConversationFlowManager.create_session(uid)
    print(f"New session created! Session ID: {session.session_id}")
    
    print("\nAvailable actions: new_category, new_angle, follow_up, meta_transition")
    print("Type 'exit' to quit.\n")
    
    while True:
        action = input("Action: ").strip()
        if action.lower() == "exit":
            print("Exiting REPL.")
            break
        
        category = None
        angle = None

        if action in ["new_category", "new_angle"]:
            category = input("Category: ").strip()
            angle = input("Angle: ").strip()
        elif action == "follow_up":
            meta = session.get_metadata()
            default_cat = meta.get("currentCategory")
            user_input = input(f"Category for follow-up pool (default: {default_cat}): ").strip()
            category = user_input if user_input else default_cat
        elif action == "meta_transition":
            transition_type = input(
                "Transition type (angle_to_angle, angle_to_category, category_to_category, confirm_switch, backtrack, closure): "
            ).strip()

            angle = transition_type  # carry transition_type here
            category = None  # no target needed

        try:
            result = session.next_question(action, category=category, angle=angle)

            if isinstance(result, dict) and "pool" in result:
                # Handle pools (follow_up / meta_transition)
                print(f"\nReturned {result['type']} pool with {len(result['pool'])} options:\n")
                for i, q in enumerate(result["pool"], 1):
                    print(f"{i}. {q['prompt']} (ID: {q['id']})")
                
                # Let user select one to simulate LLM choice
                choice = input("\nPick a question number to log as asked (or press Enter to skip): ").strip()
                if choice.isdigit():
                    idx = int(choice) - 1
                    if 0 <= idx < len(result["pool"]):
                        chosen_q = result["pool"][idx]
                        # Save to metadata asked[]
                        meta = session.get_metadata()
                        asked = meta.get("asked", [])
                        asked.append({
                            "id": chosen_q["id"],
                            "action": action,
                            "category": chosen_q.get("category"),
                            "angle": chosen_q.get("angle"),
                            "prompt": chosen_q.get("prompt")
                        })
                        session.update_metadata({"asked": asked})
                        print(f"Logged {chosen_q['id']} as asked.")
                        
                        save = input("Save this as bot message? (y/n): ").strip().lower()
                        if save == "y":
                            session.save_message("bot", chosen_q.get("prompt"))
                            print("Message saved!\n")
            else:
                # Single question
                print(f"\nNext question returned:\n{result}\n")
                save = input("Save this as bot message? (y/n): ").strip().lower()
                if save == "y":
                    session.save_message("bot", result.get("prompt", str(result)))
                    print("Message saved!\n")

        except Exception as e:
            print(f"Error: {e}\n")
        
        # Display current session metadata
        meta = session.get_metadata()
        print(f"Session metadata (depth {meta['depth']}): {meta}\n")

if __name__ == "__main__":
    main()
