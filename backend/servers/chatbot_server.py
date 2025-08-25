from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import openai  # DeepSeek-compatible client

app = Flask(__name__)
CORS(app)

# DeepSeek API setup
DEEPSEEK_API_KEY = "sk-2b1e2168cfd34a35937511fa87ac0921"
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

client = openai.OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)

@app.route("/chat", methods=["POST"])
def chat():
    """Chat endpoint for the chatbot window"""
    try:
        data = request.json
        user_message = data.get("message", "")

        if not user_message:
            return jsonify({"error": "Message is required"}), 400

        # Send to DeepSeek
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You are a helpful writing assistant that rewords socratic questions to guide students in brainstorming and planning their stories. Keep responses short and clear."},
                {"role": "user", "content": user_message}
            ],
            stream=False
        )

        bot_reply = response.choices[0].message.content.strip()

        return jsonify({"reply": bot_reply}), 200

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": "Something went wrong", "details": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, threaded=False)
