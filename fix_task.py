import re
file_path = "C:/Users/annie/.gemini/antigravity/brain/35f401e5-10df-4fd8-b847-84b64c33f84e/task.md"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()
content = content.replace("- [ ]", "- [x]")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
