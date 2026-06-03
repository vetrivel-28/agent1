import json

transcript_path = r"C:\Users\vetri\.gemini\antigravity\brain\f2244004-0a47-44f9-9aa4-9ce1eb8e4898\.system_generated\logs\transcript.jsonl"

found_contents = []
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            entry = json.loads(line)
            if entry.get("type") == "MODEL" or entry.get("source") == "MODEL":
                tool_calls = entry.get("tool_calls", [])
                for tc in tool_calls:
                    name = tc.get("name", "")
                    args = tc.get("arguments", {})
                    
                    if name in ["default_api:write_to_file", "default_api:replace_file_content", "default_api:multi_replace_file_content"]:
                        target = args.get("TargetFile", "")
                        if "WhitespaceOpportunities.tsx" in target:
                            print(f"Found {name} modifying {target}")
                            if name == "default_api:write_to_file":
                                found_contents.append(args.get("CodeContent", ""))
        except Exception as e:
            pass

if found_contents:
    print(f"Found {len(found_contents)} full file writes.")
    with open(r"d:\agent1\scratch\recovered_whitespace.tsx", "w", encoding="utf-8") as out:
        out.write(found_contents[-1])
    print("Saved the last full write to d:\\agent1\\scratch\\recovered_whitespace.tsx")
else:
    print("No full file writes found.")
