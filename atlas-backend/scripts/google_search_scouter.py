from app.services.google_sync import GoogleConnector
from app.config import GOOGLE_CREDS_PATH, GOOGLE_ADMIN_EMAIL

def scout_google():
    print(">> Scouting Google Admin for devices starting with 'NXKD4'...")
    connector = GoogleConnector(GOOGLE_CREDS_PATH, GOOGLE_ADMIN_EMAIL)
    
    try:
        # Just list first 5 devices to see what they look like
        print(">> Fetching ANY 5 devices to check formatting...")
        results = connector.service.chromeosdevices().list(
            customerId='my_customer', 
            maxResults=5
        ).execute()
        devices = results.get('chromeosdevices', [])

        for d in devices:
            print(f"--- DEVICE FOUND ---")
            print(f"Serial: {d.get('serialNumber')}")
            print(f"Model:  {d.get('model')}")
            print(f"OrgUnit: {d.get('orgUnitPath')}")
            print(f"Annotated ID: {d.get('annotatedAssetId')}")

    except Exception as e:
        print(f"!! Error: {e}")

if __name__ == "__main__":
    scout_google()
