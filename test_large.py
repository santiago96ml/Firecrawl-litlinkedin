import requests
import json

url = "http://localhost:3002/agent"
headers = {
    "Authorization": "Bearer firecrawl_n8n_master_key",
    "Content-Type": "application/json"
}

# 12,000 character prompt
payload = {
    "url": "https://example.com",
    "prompt": "a" * 12000
}

print(f"Sending request with prompt length: {len(payload['prompt'])}")
try:
    response = requests.post(url, headers=headers, json=payload)
    print(f"Status Code: {response.status_code}")
    print("Response Body:")
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print(f"Error: {e}")
