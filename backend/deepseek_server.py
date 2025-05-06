from flask import Flask, request, render_template, jsonify
from flask_cors import CORS
import requests  # For making API requests to DeepSeek
import json
import re
import os
import openai
import logging
import time
app = Flask(__name__)
CORS(app)

# Replace with your DeepSeek API endpoint and API key
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/analyze"  # Example endpoint

DEEPSEEK_API_KEY = "sk-2a0e1b3c-4d8f-4a5b-ae6f-7c9d0f2b1c3e"  # Replace with your actual API key

# DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")  # Replace with your actual API key

LEONARDO_API_KEY = "b54d28c4-7197-459a-a84c-b96d96698cae"# Replace with your actual API key

# LEONARDO_API_KEY = os.getenv("LEONARDO_API_KEY")  # Replace with your actual API key
if not LEONARDO_API_KEY:
    raise ValueError("LEONARDO_API_KEY environment variable is not set")

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
    
@app.route('/images', methods=['POST'])
def generate_image():
    print("Generating image...")
    leonardo_auth = "Bearer %s" % LEONARDO_API_KEY

    # Get 'description' from JSON body
    data = request.json
    description = data.get('description', '')

    if not description:
        return jsonify({'error': 'Description is required'}), 400

    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": leonardo_auth
    }

    try:
        # Step 1: Generate the image
        url = "https://cloud.leonardo.ai/api/rest/v1/generations"
        payload = {
            "modelId": "1dd50843-d653-4516-a8e3-f0238ee453ff",
            "contrast": 3.5,
            "prompt": description,    #Leonardo Flux model id
            "num_images": 1,
            "width": 1472,
            "height": 832,
            "ultra": False,
            "styleUUID": "111dc692-d470-4eec-b791-3475abac4c46",
            "enhancePrompt": True,
        }

        response = requests.post(url, json=payload, headers=headers)

        if response.status_code != 200:
            return jsonify({'error': 'Failed to generate image', 'details': response.text}), 500

        # Step 2: Extract the generationId from the response
        generation_data = response.json()
        generation_id = generation_data['sdGenerationJob']['generationId']

        # Step 3: Wait for the image to be generated
        time.sleep(20)  # Wait for the generation to complete (adjust as needed)

        # Step 4: Retrieve the generated image using the generationId
        url = f"https://cloud.leonardo.ai/api/rest/v1/generations/{generation_id}"
        response = requests.get(url, headers=headers)

        if response.status_code != 200:
            return jsonify({'error': 'Failed to retrieve generated image', 'details': response.text}), 500

        # Step 5: Extract the image URL from the response
        generation_result = response.json()
        if "generations_by_pk" in generation_result and "generated_images" in generation_result["generations_by_pk"]:
            image_url = generation_result["generations_by_pk"]["generated_images"][0]["url"]
        else:
            return jsonify({'error': 'Unexpected response structure', 'details': generation_result}), 500

        return jsonify({'image_url': image_url}), 200

    except Exception as e:
        return jsonify({'error': 'An error occurred', 'details': str(e)}), 500
    
    # url = "https://cloud.leonardo.ai/api/rest/v1/init-image"

    # payload = {"extension": "jpg"}

    # response = requests.post(url, json=payload, headers=headers)

    # print(response.status_code)

    # # Upload image via presigned URL
    # fields = json.loads(response.json()['uploadInitImage']['fields'])

    # url = response.json()['uploadInitImage']['url']

    # image_id = response.json()['uploadInitImage']['id']  # For getting the image later

    # image_file_path = "/workspace/test.jpg"
    # files = {'file': open(image_file_path, 'rb')}


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

    return deepseek_output

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=False)