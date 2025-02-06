from flask import Flask, request, render_template, jsonify
from flask_cors import CORS
import subprocess
import json
import re

app = Flask(__name__)
CORS(app)

@app.route('/')
def show_relation_form():
    return render_template('relationform.html')

@app.route('/characters', methods=['GET', 'POST'])
def predict():
    # Get 'text' from JSON body
    if request.method == 'POST':
        data = request.json
        text = data.get('text', '')
        print(text)
        # Simplify text preprocessing (if necessary for your application)
        cleaned_text = clean_text(text)

        # Assuming you have a function to handle SpERT prediction (to be defined next)
        relations = get_relations_with_spert(cleaned_text)
        
        # Convert relations to JSON and return
        return jsonify(relations)

def clean_text(text):
    #Simple text cleaning
    cleaned = re.sub(r"[\(\[].*?[\)\]]", "", str(text))
    return cleaned

def get_relations_with_spert(text):
    # Example: Save the text to a temporary file in SpERT's input format
    input_path = 'temp_input.json'
    with open(input_path, 'w') as f:
        f.write(json.dumps({"data": text}))  # Adjust based on SpERT's expected format

    # Run SpERT inference script (adjust paths and parameters as necessary)
    output_path = 'temp_output.json'
    try:
        result = subprocess.run(
            ['python', 'spert\\spert.py', 'predict', 
            '--config', 'spert\\configs\\config.json', 
            '--data_path', input_path, 
            '--predictions_path', output_path], 
            capture_output=True, text=True, check=True
        )
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)

    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        print(f"STDOUT: {e.stdout}")
        print(f"STDERR: {e.stderr}")
        return {"error": "SpERT execution failed", "details": e.stderr}, 500
    # print("STDOUT:", result.stdout)
    # print("STDERR:", result.stderr)

    # Read and return the SpERT output
    with open(output_path, 'r') as f:
        spert_output = json.load(f)
        print(spert_output)

    return spert_output  # Adjust this as necessary to match your data handling needs


if __name__ == '__main__':
    app.run(debug=True, threaded=False)