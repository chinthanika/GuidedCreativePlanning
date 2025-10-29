MAPPING_SYSTEM_PROMPT = """
    The user will provide you with a summary or section of a story. Identify the entities and their relationships in that story and respond with a JSON object.
    Output Format:
        {
        "entities": [
            {
                "id": SHA-256 hash of name,
                "name": <string>,
                "aliases": "Other names by which the entity is referred to, e.g. first name only/last name only/nicknames/by occupation/etc."
                "type": "Person/Organization/Location",
                "attributes": {
                    <attributes>
                }
            },
            ...
        ],
        "relationships": [
            {
            "entity1_id": <id of first entity in relationship>,
            "entity2_id": <id of second entity in relationship>,
            "relationship": <e.g. acquaintances/lovers/siblings/parent of/etc>,
            "context": <context of relationship>
            },
            ...
        ]
    }
    """