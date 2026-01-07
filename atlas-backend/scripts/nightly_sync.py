import sys
import os
import time

# Ensure app can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.services.iiq_sync import IIQConnector
from app.config import get_iiq_config

def run_sync():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] >> Starting Nightly Full Sync...")

    db = SessionLocal()
    iiq_cfg = get_iiq_config()
    connector = IIQConnector(
        iiq_cfg["url"], iiq_cfg["token"],
        site_id=iiq_cfg.get("site_id"), product_id=iiq_cfg.get("product_id")
    )
    
    skip = 0
    take = 100
    total_synced = 0
    
    try:
        while True:
            print(f"   >> Fetching assets {skip} to {skip + take}...")
            data = connector.fetch_all_assets(skip=skip, take=take)
            
            if not data or not data.get("Items"):
                break
                
            items = data["Items"]
            item_count = len(items)
            
            for item in items:
                serial = item.get("SerialNumber")
                if serial:
                    connector.sync_record(db, serial, raw_data=item)
            
            total_synced += item_count
            print(f"   >> Processed {item_count} items (Total: {total_synced})")
            
            if item_count < take:
                # Reached the end
                break
                
            skip += take
            
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] >> Full Sync Complete. Total Assets: {total_synced}")

    except Exception as e:
        print(f"!! CRITICAL ERROR during sync: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_sync()
