#!/usr/bin/env python3
"""
OUI Database Update Script

Downloads the latest OUI (Organizationally Unique Identifier) database from IEEE
and updates the local oui_vendors table.

Can be run:
- Manually: python3 oui_update.py
- Via cron: 0 5 * * * /opt/atlas/atlas-backend/venv/bin/python3 /opt/atlas/atlas-backend/scripts/oui_update.py

IEEE OUI database source:
- CSV: https://standards-oui.ieee.org/oui/oui.csv
- TXT: https://standards-oui.ieee.org/oui/oui.txt
"""

import sys
import os
import csv
import io
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import OuiVendor

# IEEE OUI CSV URL
OUI_CSV_URL = "https://standards-oui.ieee.org/oui/oui.csv"

# Alternative: Use a faster mirror if IEEE is slow
# OUI_CSV_URL = "https://maclookup.app/downloads/csv-database/get-db"


def download_oui_csv() -> str:
    """Download the OUI CSV file from IEEE."""
    print(f"[OUI Update] Downloading OUI database from {OUI_CSV_URL}...")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    try:
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            response = client.get(OUI_CSV_URL, headers=headers)
            response.raise_for_status()
            print(f"[OUI Update] Downloaded {len(response.content):,} bytes")
            return response.text
    except Exception as e:
        print(f"[OUI Update] ERROR: Failed to download OUI database: {e}")
        raise


def parse_oui_csv(csv_content: str) -> list:
    """
    Parse the IEEE OUI CSV file.

    CSV format:
    Registry,Assignment,Organization Name,Organization Address
    MA-L,000000,XEROX CORPORATION,"M/S 105-50C, WEBSTER NY 14580, US"
    """
    print("[OUI Update] Parsing CSV...")

    records = []
    reader = csv.DictReader(io.StringIO(csv_content))

    for row in reader:
        # Skip non-MA-L entries (we only want MAC address large blocks)
        registry = row.get('Registry', '')
        if registry not in ('MA-L', 'MA-M', 'MA-S'):
            continue

        assignment = row.get('Assignment', '').strip().upper()
        org_name = row.get('Organization Name', '').strip()
        org_address = row.get('Organization Address', '').strip()

        if assignment and org_name:
            records.append({
                'oui': assignment[:6],  # First 6 hex chars
                'vendor_name': org_name[:255],  # Limit length
                'address': org_address if org_address else None
            })

    print(f"[OUI Update] Parsed {len(records):,} OUI records")
    return records


def update_database(records: list):
    """Update the oui_vendors table with parsed records."""
    print("[OUI Update] Updating database...")

    # Ensure table exists
    Base.metadata.create_all(bind=engine, tables=[OuiVendor.__table__])

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        added = 0
        updated = 0

        # Process in batches for efficiency
        batch_size = 1000
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]

            for record in batch:
                existing = db.query(OuiVendor).filter(OuiVendor.oui == record['oui']).first()

                if existing:
                    # Update if vendor name changed
                    if existing.vendor_name != record['vendor_name']:
                        existing.vendor_name = record['vendor_name']
                        existing.address = record['address']
                        existing.last_updated = now
                        updated += 1
                else:
                    # Insert new record
                    db.add(OuiVendor(
                        oui=record['oui'],
                        vendor_name=record['vendor_name'],
                        address=record['address'],
                        last_updated=now
                    ))
                    added += 1

            # Commit each batch
            db.commit()
            print(f"[OUI Update] Processed {min(i + batch_size, len(records)):,} / {len(records):,} records...")

        print(f"[OUI Update] Complete: {added:,} added, {updated:,} updated")

    except Exception as e:
        db.rollback()
        print(f"[OUI Update] ERROR: Database update failed: {e}")
        raise
    finally:
        db.close()


def get_stats():
    """Get current OUI database statistics."""
    db = SessionLocal()
    try:
        count = db.query(OuiVendor).count()
        latest = db.query(OuiVendor).order_by(OuiVendor.last_updated.desc()).first()
        return {
            'count': count,
            'last_updated': latest.last_updated if latest else None
        }
    finally:
        db.close()


def main():
    """Main entry point."""
    print("=" * 60)
    print("OUI Database Update")
    print(f"Started: {datetime.utcnow().isoformat()}")
    print("=" * 60)

    # Show current stats
    stats = get_stats()
    print(f"[OUI Update] Current database: {stats['count']:,} vendors")
    if stats['last_updated']:
        print(f"[OUI Update] Last updated: {stats['last_updated'].isoformat()}")

    try:
        # Download and parse
        csv_content = download_oui_csv()
        records = parse_oui_csv(csv_content)

        if not records:
            print("[OUI Update] ERROR: No records parsed from CSV")
            sys.exit(1)

        # Update database
        update_database(records)

        # Show final stats
        stats = get_stats()
        print(f"[OUI Update] Final database: {stats['count']:,} vendors")

        print("=" * 60)
        print("OUI Database Update Complete")
        print(f"Finished: {datetime.utcnow().isoformat()}")
        print("=" * 60)

    except Exception as e:
        print(f"[OUI Update] FATAL ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
