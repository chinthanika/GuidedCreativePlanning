import json
import os
from jsonschema import validate, Draft202012Validator
from jsonschema.exceptions import ValidationError

def load_json(filename):
    """Load a JSON file from the current folder."""
    with open(filename, "r", encoding="utf-8") as f:
        return json.load(f)

def validate_bank(bank_data, schema, bank_name):
    """Validate a question bank against its schema."""
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(bank_data), key=lambda e: e.path)
    if errors:
        print(f"\n❌ Validation failed for {bank_name}:")
        for error in errors:
            path = ".".join([str(p) for p in error.path]) or "<root>"
            print(f" - Path `{path}`: {error.message}")
    else:
        print(f"\n✅ {bank_name} validated successfully!")

def main():
    # Load schemas
    primary_schema = load_json("primary_schema.json")
    follow_up_schema = load_json("follow_up_schema.json")
    meta_transition_schema = load_json("meta_transition_schema.json")

    # Load question banks
    question_banks = load_json("question_bank.json")

    # Validate each bank
    if "primary" in question_banks:
        validate_bank(question_banks["primary"], primary_schema, "Primary Bank")
    else:
        print("⚠️ No 'primary' bank found in question_bank.json")

    validate_bank(question_banks, follow_up_schema, "Follow-Up Bank")

    # FIX: Only pass the meta_transition_bank object for meta-transition validation
    if "meta_transitions" in question_banks:
        validate_bank(
            question_banks,
            meta_transition_schema,
            "Meta-Transition Bank"
        )
    else:
        print("⚠️ No 'meta_transition_bank' found in question_bank.json")

if __name__ == "__main__":
    main()
