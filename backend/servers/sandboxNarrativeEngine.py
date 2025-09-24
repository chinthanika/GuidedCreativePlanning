from utils.types import EnvState, Turn

class SandboxNarrativeEngine:
    def __init__(self):
        pass

    # -------------------------
    # Environment Simulation
    # -------------------------
    def simulate_event(self, env_state: EnvState, user_action: str) -> str:
        # placeholder for environment evolution logic
        return f"The environment reacts to: {user_action}"

    def validate_user_action(self, action: str, env_state: EnvState) -> bool:
        # TODO: stricter validation (rulesets, consistency checks)
        return True

    # -------------------------
    # AI Narrative Generation Stub
    # -------------------------
    def generate_ai_move(self, env_state: EnvState, profile_data: dict) -> str:
        """
        Generates the AI's narrative move.
        Pulls from profile_data + current env_state.
        """
        return (
            f"AI takes a turn in {env_state.description}. "
            f"It references {len(profile_data)} profile elements."
        )

    # -------------------------
    # Prompt Builder Stub
    # -------------------------
    def build_prompt(self, env_state: EnvState, last_user_action: str) -> str:
        """
        Builds the narrative continuation prompt for the LLM.
        """
        return (
            f"Environment: {env_state.description}\n"
            f"Last User Action: {last_user_action}\n"
            f"AI must narrate the consequences in turn-based style."
        )
