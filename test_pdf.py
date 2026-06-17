import requests

def test_pdf():
    url_upload = "http://localhost:8001/api/v1/upload-datasets"
    print("Uploading datasets...")
    files = {
        'blackbox': ('blackbox.csv', open('blackbox.csv', 'rb'), 'text/csv'),
        'magnet': ('magnet.csv', open('magnet.csv', 'rb'), 'text/csv')
    }
    r_up = requests.post(url_upload, files=files)
    print("Upload status:", r_up.status_code)
    print("Upload response:", r_up.text)
    
    url = "http://localhost:8001/api/v1/market-report/pdf"
    payload = {
        "mode": "all",
        "selected_categories": [],
        "category_column": "",
        "scope_key": "all"
    }
    print("Requesting PDF...")
    response = requests.post(url, json=payload)
    
    if response.status_code == 200 and response.headers.get('content-type') == 'application/pdf':
        with open("market_report_test.pdf", "wb") as f:
            f.write(response.content)
        print("Success! Saved to market_report_test.pdf. Size:", len(response.content), "bytes")
    else:
        print("Failed or JSON returned:", response.status_code)
        print(response.text)

if __name__ == "__main__":
    test_pdf()
