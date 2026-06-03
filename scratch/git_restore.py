import subprocess

try:
    blob = subprocess.check_output(["git", "show", "432ff15:market_intelligence_dashboard/src/pages/WhitespaceOpportunities.tsx"], cwd=r"d:\agent1")
    with open(r"d:\agent1\market_intelligence_dashboard\src\pages\WhitespaceOpportunities.tsx", "wb") as f:
        f.write(blob)
    print(f"Restored file perfectly from git blob. Length: {len(blob)} bytes.")
except Exception as e:
    print(f"Error: {e}")
