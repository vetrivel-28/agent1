import json
import sys

transcript_path = r"C:\Users\vetri\.gemini\antigravity\brain\f2244004-0a47-44f9-9aa4-9ce1eb8e4898\.system_generated\logs\transcript.jsonl"

last_content = None

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            entry = json.loads(line)
            if entry.get("type") == "MODEL" or entry.get("source") == "MODEL":
                tool_calls = entry.get("tool_calls", [])
                for tc in tool_calls:
                    if tc.get("name") == "default_api:write_to_file":
                        args = tc.get("arguments", {})
                        if "WhitespaceOpportunities.tsx" in args.get("TargetFile", ""):
                            last_content = args.get("CodeContent", "")
        except Exception as e:
            pass

if last_content:
    with open(r"d:\agent1\market_intelligence_dashboard\src\pages\WhitespaceOpportunities.tsx", 'w', encoding='utf-8') as f:
        f.write(last_content)
    print("Recovered WhitespaceOpportunities.tsx from transcript via write_to_file.")
else:
    print("Could not find a write_to_file call for WhitespaceOpportunities.tsx.")
