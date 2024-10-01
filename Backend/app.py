from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import os
from dotenv import load_dotenv
import json
import time

load_dotenv()

app = Flask(__name__)
CORS(app)

api_key = os.getenv("GOOGLE_API_KEY")

genai.configure(api_key=api_key)
config = genai.GenerationConfig(temperature=0, top_p=1, max_output_tokens=1024)
model = genai.GenerativeModel(
    "gemini-1.5-flash",
    system_instruction="You are an AI assistant that helps group browser tabs into categories. Always return valid JSON arrays containing objects with 'title', 'tabIds', and 'color' fields.",
    generation_config=config,
)

@app.route("/", methods=["GET"])
def hello():
    return "Hello, World!"


@app.route("/group-tabs", methods=["POST"])
def group_tabs():
    data = request.json

    if not data:
        return jsonify({"error": "No data provided"}), 400

    try:
        tabs = data["tabs"]
        mode = data["mode"]
    except KeyError:
        return jsonify({"error": "Invalid data format"}), 400

    if mode == "manual":
        try:
            categories = data["categories"]
        except KeyError:
            return jsonify({"error": "Invalid data format"}), 400
        prompt = f"""Given these tabs and categories, group the tab IDs into the most appropriate categories. Return only a JSON array where each object has 'title' (category name), 'tabIds' (array of tab IDs), and 'color' (one of: grey, blue, red, yellow, green, pink, purple, cyan).

Categories: {', '.join(categories)}

Tabs:
{json.dumps(tabs, indent=2)}

Return only the JSON array without any explanation."""

    else:  # auto mode
        prompt = f"""Analyze these tabs and create appropriate categories to group them. Return only a JSON array where each object has 'title' (category name), 'tabIds' (array of tab IDs), and 'color' (one of: grey, blue, red, yellow, green, pink, purple, cyan).

Tabs:
{json.dumps(tabs, indent=2)}

Return only the JSON array without any explanation."""

    try:
        print("Querying gemini AI...")
        start_time = time.time()
        response = model.generate_content(prompt)

        # Extract JSON from response
        print("Gemini response time in seconds: ", time.time() - start_time)
        print("Gemini response received:\n" + response.text)
        text = response.text
        text = text.replace("```json", "")
        text = text.replace("```", "")
        text = text.strip()
        print("Gemini response stripped:\n" + text)
        result = json.loads(text)
        print("Gemini response parsed:\n" + str(result))
        return jsonify(result)

    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
