import requests
import json

endpoints = [
    "http://localhost:3002/agent",
    "http://localhost:3002/v2/agent",
    "http://localhost:3002/extract",
    "http://localhost:3002/v2/extract"
]

headers = {
    "Authorization": "Bearer firecrawl_n8n_master_key",
    "Content-Type": "application/json"
}

def test_endpoint(endpoint, payload_type):
    if payload_type == "large_prompt":
        payload = {
            "url": "https://example.com",
            "prompt": "a" * 12000
        }
    else: # n8n_compatibility (singular url)
        payload = {
            "url": "https://example.com",
            "prompt": "short prompt"
        }

    print(f"\n--- Testing {endpoint} with {payload_type} ---")
    try:
        response = requests.post(endpoint, headers=headers, json=payload)
        print(f"Status Code: {response.status_code}")
        print("Response Body:")
        res_json = response.json()
        # Truncate long bodies for readability
        if "data" in res_json and len(str(res_json["data"])) > 100:
             res_json["data"] = "..."
        print(json.dumps(res_json, indent=2))
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

all_passed = True
for ep in endpoints:
    if not test_endpoint(ep, "large_prompt"): all_passed = False
    if not test_endpoint(ep, "n8n_compatibility"): all_passed = False

if all_passed:
    print("\n✅ ALL TESTS PASSED!")
else:
    print("\n❌ SOME TESTS FAILED!")
