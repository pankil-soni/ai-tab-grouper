from flask import Flask, request, jsonify
from flask_cors import CORS
from anthropic import Anthropic
import os
from dotenv import load_dotenv
import json

load_dotenv()

app = Flask(__name__)
CORS(app)

# just for testing
print(os.getenv("ANTHROPIC_API_KEY"))

anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


@app.route("/", methods=["GET"])
def hello():
    return "Hello, World!"


if __name__ == "__main__":
    app.run(debug=True)
