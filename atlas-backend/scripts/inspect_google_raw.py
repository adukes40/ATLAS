import json
from app.services.google_sync import GoogleConnector
from app.config import GOOGLE_CREDS_PATH, GOOGLE_ADMIN_EMAIL

def inspect_raw_google_data(serial):
    print(f">> Fetching RAW Google data for: {serial}")
    connector = GoogleConnector(GOOGLE_CREDS_PATH, GOOGLE_ADMIN_EMAIL)
    
    try:
        # Use the plain serial query we confirmed works
        results = connector.service.chromeosdevices().list(
            customerId='my_customer', 
            query=serial
        ).execute()

        devices = results.get('chromeosdevices', [])
        if devices:
            device = devices[0]
            print("\n--- COMPLETE RAW GOOGLE API RESPONSE ---")
            print(json.dumps(device, indent=2))
            print("----------------------------------------")
            
            print("\n>> SUMMARY OF USEFUL FIELDS:")
            print(f"- Serial: {device.get('serialNumber')}")
            print(f"- Status: {device.get('status')}")
            print(f"- Last Sync: {device.get('lastSync')}")
            print(f"- OS Version: {device.get('osVersion')}")
            print(f"- Platform Version: {device.get('platformVersion')}")
            print(f"- Firmware Version: {device.get('firmwareVersion')}")
            print(f"- Model: {device.get('model')}")
            print(f"- Org Unit: {device.get('orgUnitPath')}")
            print(f"- Annotated User: {device.get('annotatedUser')}")
            print(f"- Annotated Asset ID: {device.get('annotatedAssetId')}")
            print(f"- Annotated Location: {device.get('annotatedLocation')}")
            print(f"- Auto Update Expiration: {device.get('autoUpdateExpiration')}")
            print(f"- Mac Address: {device.get('macAddress')}")
            print(f"- Ethernet Mac: {device.get('ethernetMacAddress')}")
            
            recent = device.get('recentUsers', [])
            if recent:
                print(f"- Most Recent User: {recent[0].get('email')}")
        else:
            print("!! Device not found in Google Admin.")

    except Exception as e:
        print(f"!! Error: {e}")

if __name__ == "__main__":
    # Using the serial we know exists from your previous successful test
    inspect_raw_google_data("NXKD4AA00242009C4F7600")
