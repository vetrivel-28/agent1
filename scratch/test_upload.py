import requests

with open("test.csv", "w") as f:
    f.write("a,b,c\n1,2,3")

with open("test.csv", "rb") as f:
    res = requests.post("http://localhost:8000/api/v1/upload-datasets", files={"blackbox": f})
    print(res.status_code, res.json())
