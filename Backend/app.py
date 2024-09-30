from flask import Flask, request, jsonify
from flask_cors import CORS
from anthropic import Anthropic
import os
from dotenv import load_dotenv
import json

load_dotenv()

app = Flask(__name__)
CORS(app)

anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


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
        print("Querying Claude AI...")
        response = anthropic.messages.create(
            model="claude-3-opus-latest",
            max_tokens=1024,
            temperature=0,
            top_p=1,
            system="You are an AI assistant that helps group browser tabs into categories. Always return valid JSON arrays containing objects with 'title', 'tabIds', and 'color' fields.",
            messages=[{"role": "user", "content": prompt}],
        )

        # Extract JSON from response
        print("Claude response received:\n" + response.content[0].text)
        result = json.loads(response.content[0].text)
        print("Claude response parsed:\n" + str(result))
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
