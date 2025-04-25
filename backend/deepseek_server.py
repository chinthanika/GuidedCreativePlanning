from flask import Flask, request, render_template, jsonify
from flask_cors import CORS
import requests  # For making API requests to DeepSeek
import json
import re
import os
import openai
import logging
app = Flask(__name__)
CORS(app)

# Replace with your DeepSeek API endpoint and API key
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/analyze"  # Example endpoint
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")  # Replace with your actual API key

if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

openai.log = "debug"

@app.route('/')
def show_relation_form():
    return render_template('relationform.html')

@app.route('/characters', methods=['GET', 'POST'])
def predict():
    # Get 'text' from JSON body
    if request.method == 'POST':
        data = request.json
        text = data.get('text', '')

        # Clean the text (if necessary)
        # cleaned_text = clean_text(text)

        # Use DeepSeek to extract entities and relationships
        # relations = get_relations_with_deepseek(cleaned_text)
        relations = get_relations_with_deepseek(text)
        
        # Return the result as JSON
        return jsonify(relations)

def clean_text(text):
    # Simple text cleaning (remove brackets and their contents)
    cleaned = re.sub(r"[\(\[].*?[\)\]]", "", str(text))
    return cleaned

def get_relations_with_deepseek(text):
    
    # client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")
    client = openai.OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")
    system_prompt = """
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
    print("Sending request to deepseek...")
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content":system_prompt},
                {"role": "user", "content": text},
            ],
            response_format={
                'type': 'json_object'
            },
            stream=False
        )

        print("Processing response from deepseek...")
        print (response.choices[0].message.content)
        deepseek_output = json.loads(response.choices[0].message.content)
        print(deepseek_output)

    except Exception as e:
        print("Error:", e)
        deepseek_output = 0

    # print("Processing response from deepseek...")
    # print (response.choices[0].message.content)
    # deepseek_output = json.loads(response.choices[0].message.content)
    # print(deepseek_output)

    return deepseek_output

    # """
    # Send the text to the DeepSeek API for entity and relationship extraction.
    # """
    # headers = {
    #     "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
    #     "Content-Type": "application/json"
    # }
    # payload = {
    #     "text": text,
    #     "options": {
    #         "extract_entities": True,
    #         "extract_relationships": True,
    #         "format": "json"  # Request output in JSON format
    #     }
    # }

    # try:
    #     # Make a POST request to the DeepSeek API
    #     response = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload)
    #     response.raise_for_status()  # Raise an error for bad status codes

    #     # Parse the response JSON
    #     deepseek_output = response.json()
    #     print("DeepSeek Output:", deepseek_output)

    #     # Return the extracted entities and relationships
    #     return deepseek_output

    # except requests.exceptions.RequestException as e:
    #     print(f"Error calling DeepSeek API: {e}")
    #     return {"error": "Failed to call DeepSeek API", "details": str(e)}, 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=False)