from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
import os
import json

app = Flask(__name__)
CORS(app)

DEEPSEEK_API_KEY = "sk-6c4641c0b8404e049912cafc281e04f5"
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

# Initialize OpenAI client for DeepSeek
client = openai.OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")

# ============================================
# WORLD METADATA ENDPOINTS
# ============================================

@app.route('/api/world-metadata', methods=['GET', 'POST'])
def world_metadata():
    """Get or update world metadata (name, etc.)"""
    if request.method == 'GET':
        user_id = request.args.get('userId')
        # TODO: Fetch from Firebase
        # For now, return mock data
        return jsonify({'name': 'My World'})
    
    elif request.method == 'POST':
        data = request.json
        user_id = data.get('userId')
        name = data.get('name')
        # TODO: Save to Firebase
        return jsonify({'success': True})

# ============================================
# WORLDBUILDING ITEMS ENDPOINTS
# ============================================

@app.route('/api/worldbuilding/items', methods=['GET'])
def get_all_items():
    """Get all worldbuilding items for a user"""
    user_id = request.args.get('userId')
    # TODO: Fetch all items from Firebase
    # Return as dictionary: { firebaseKey: itemData, ... }
    return jsonify({})

@app.route('/api/worldbuilding/item', methods=['POST'])
def create_item():
    """Create a new worldbuilding item"""
    data = request.json
    user_id = data.get('userId')
    item_data = data.get('data')
    
    # TODO: Save to Firebase and return the generated key
    # firebase_key = db.reference(f'users/{user_id}/worldbuilding/items').push(item_data).key
    
    return jsonify({'success': True, 'firebaseKey': 'mock_key'})

@app.route('/api/worldbuilding/item/update', methods=['POST'])
def update_item():
    """Update an existing worldbuilding item"""
    data = request.json
    user_id = data.get('userId')
    firebase_key = data.get('firebaseKey')
    item_data = data.get('data')
    
    # TODO: Update in Firebase
    # db.reference(f'users/{user_id}/worldbuilding/items/{firebase_key}').update(item_data)
    
    return jsonify({'success': True})

@app.route('/api/worldbuilding/item/delete', methods=['POST'])
def delete_item():
    """Delete a worldbuilding item and all its children"""
    data = request.json
    user_id = data.get('userId')
    firebase_key = data.get('firebaseKey')
    
    # TODO: Implement recursive deletion
    # 1. Find all items where parentKey == firebase_key
    # 2. Recursively delete those children
    # 3. Delete the item itself
    # db.reference(f'users/{user_id}/worldbuilding/items/{firebase_key}').delete()
    
    return jsonify({'success': True})

# ============================================
# AI TEMPLATE SUGGESTION ENDPOINT
# ============================================

@app.route('/api/worldbuilding/suggest-template', methods=['POST'])
def suggest_template():
    """Use DeepSeek to suggest custom fields for an item type"""
    data = request.json
    user_id = data.get('userId')
    item_type = data.get('itemType')
    item_name = data.get('itemName', '')
    parent_fields = data.get('parentFields', {})
    existing_fields = data.get('existingFields', {})
    
    # Build the prompt
    system_prompt = """
You are a creative worldbuilding assistant. The user is creating items for their fictional world.

Given an item type (e.g., "Magic System", "Character", "Location", "Organization"), suggest relevant custom fields that would help describe that item.

Consider:
- What information would be useful for this type of item?
- What fields would help with consistency and depth?
- Common worldbuilding best practices

Output Format (JSON):
{
    "suggestedFields": [
        {
            "fieldName": "string (concise, descriptive name)",
            "fieldType": "text" or "array",
            "description": "string (brief explanation of what this field is for)"
        }
    ]
}

Rules:
- Suggest 4-8 fields
- Use "array" type for lists (e.g., abilities, members, resources)
- Use "text" type for paragraphs or single values
- Field names should be clear and concise (e.g., "Magical Rules", "Weaknesses", "Population")
- If parent fields are provided, inherit them and suggest additional complementary fields
- If existing fields are provided, suggest NEW fields that complement but don't duplicate them
"""

    user_prompt = f"Item Type: {item_type}"
    if item_name:
        user_prompt += f"\nItem Name: {item_name}"
    
    if parent_fields:
        user_prompt += f"\n\nParent Item Fields (inherit these):\n{json.dumps(list(parent_fields.keys()), indent=2)}"
    
    if existing_fields:
        user_prompt += f"\n\nExisting Fields (suggest additional fields, not these):\n{json.dumps(list(existing_fields.keys()), indent=2)}"
    
    user_prompt += "\n\nSuggest relevant custom fields for this item."
    
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={
                'type': 'json_object'
            },
            stream=False
        )
        
        deepseek_output = json.loads(response.choices[0].message.content)
        
        # If there are parent fields, include them at the top
        suggested_fields = deepseek_output.get('suggestedFields', [])
        
        if parent_fields:
            # Add inherited parent fields first
            inherited_fields = []
            for field_name, field_data in parent_fields.items():
                if field_name not in existing_fields:
                    inherited_fields.append({
                        'fieldName': field_name,
                        'fieldType': field_data.get('type', 'text'),
                        'description': f"Inherited from parent"
                    })
            suggested_fields = inherited_fields + suggested_fields
        
        return jsonify({'suggestedFields': suggested_fields})
        
    except Exception as e:
        print("Error calling DeepSeek:", e)
        return jsonify({'error': str(e)}), 500

# ============================================
# RUN APP
# ============================================

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True, threaded=False)