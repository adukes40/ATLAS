import requests
import json
import logging
from sqlalchemy.orm import Session
from app.models import IIQAsset, LocationCache
from datetime import datetime

# Setup logging for cron jobs
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# IIQ Fee Tracker custom field ID (discovered via API exploration)
FEE_FIELD_TYPE_ID = "fb1baf3c-345c-4b85-ab35-d109851e27d4"

class IIQConnector:
    def __init__(self, base_url: str, token: str, site_id: str = None, product_id: str = None):
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "SiteId": site_id or "7c7ece18-33b0-4937-ac36-77d9373997c6",
            "ProductId": product_id or "88df910c-91aa-e711-80c2-0004ffa00050",
            "Client": "ApiClient"
        }

    def _get_location_name(self, db: Session, location_id: str):
        """
        Resolves LocationId -> Name using Cache first, then API.
        """
        if not location_id or location_id == "00000000-0000-0000-0000-000000000000":
            return None

        # 1. Check DB Cache (Restore Speed)
        cached = db.query(LocationCache).filter(LocationCache.location_id == location_id).first()
        if cached:
            return cached.name

        # 2. Call API (The exact endpoint you identified)
        # print(f"   >> Cache Miss: Fetching Location Name for {location_id}...")
        url = f"{self.base_url}/api/v1.0/locations/{location_id}"
        
        try:
            resp = requests.get(url, headers=self.headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                
                # --- THE FIX IS HERE ---
                # We drill down into the "Location" sub-object
                loc_obj = data.get("Location") or {} 
                loc_name = loc_obj.get("Name")
                
                # 3. Save to Cache
                if loc_name:
                    new_cache = LocationCache(location_id=location_id, name=loc_name)
                    db.add(new_cache)
                    db.commit()
                    return loc_name
        except Exception as e:
            print(f"   !! Location Lookup Failed: {e}")
            
        return None

    def fetch_asset_by_serial(self, serial: str):
        """
        Fetches asset by serial number.
        GET endpoints return CustomFieldValues including Fee Tracker when present.
        """
        url = f"{self.base_url}/api/v1.0/assets/serial/{serial}"
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data.get("ItemCount", 0) > 0 and len(data.get("Items", [])) > 0:
                return data["Items"][0]
            return None
        except Exception as e:
            print(f"[IIQ] Sync Error (Serial): {e}")
            return None

    def fetch_asset_by_tag(self, tag: str):
        """
        Fetches asset by asset tag.
        GET endpoints return CustomFieldValues including Fee Tracker when present.
        """
        url = f"{self.base_url}/api/v1.0/assets/assettag/{tag}"
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data.get("ItemCount", 0) > 0 and len(data.get("Items", [])) > 0:
                return data["Items"][0]
            return None
        except Exception as e:
            print(f"[IIQ] Sync Error (Tag): {e}")
            return None

    def fetch_all_assets(self, skip: int = 0, take: int = 100):
        """
        Fetches a batch of assets for bulk synchronization.
        """
        url = f"{self.base_url}/api/v1.0/assets"
        params = {
            "skip": skip,
            "take": take
        }
        try:
            resp = requests.get(url, headers=self.headers, params=params, timeout=20)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            print(f"[IIQ] Bulk Fetch Error: {e}")
            return None

    def sync_record(self, db: Session, identifier: str, raw_data: dict = None):
        # 1. Use provided data or Fetch from API
        if not raw_data:
            # Try Serial Number First
            raw_data = self.fetch_asset_by_serial(identifier)

            # 2. If not found, Try Asset Tag
            if not raw_data:
                # print(f"   >> Serial lookup failed for '{identifier}', trying Asset Tag...")
                raw_data = self.fetch_asset_by_tag(identifier)

        if not raw_data:
            return {"status": "error", "message": f"Asset not found in IIQ for query '{identifier}'"}

        owner = raw_data.get("Owner") or {}
        loc_obj = raw_data.get("Location") or {}

        # Resolve Owner Location
        resolved_owner_loc = None
        if owner.get("LocationId"):
             resolved_owner_loc = self._get_location_name(db, owner.get("LocationId"))

        # Parse fee data from CustomFieldValues
        fee_balance, fee_past_due = self._parse_fee_data(raw_data)

        asset_entry = IIQAsset(
            serial_number = raw_data.get("SerialNumber"),
            iiq_id = raw_data.get("AssetId"),
            asset_tag = raw_data.get("AssetTag"),

            model = raw_data.get("Model", {}).get("Name"),
            model_category = raw_data.get("Model", {}).get("Category", {}).get("Name"),
            status = raw_data.get("Status", {}).get("Name"),

            assigned_user_email = owner.get("Email"),
            assigned_user_id = owner.get("SchoolIdNumber"),
            owner_iiq_id = owner.get("UserId"),
            assigned_user_name = owner.get("FullName"),
            assigned_user_role = owner.get("RoleName"),
            assigned_user_grade = owner.get("Grade"),
            assigned_user_homeroom = owner.get("Homeroom"),
            owner_location = resolved_owner_loc,

            location = loc_obj.get("Name", "Unknown"),
            ticket_count = raw_data.get("OpenTickets", 0),

            # Fee data
            fee_balance = str(fee_balance) if fee_balance else None,
            fee_past_due = str(fee_past_due) if fee_past_due else None,

            last_updated = datetime.utcnow(),
            meta_data = raw_data
        )

        try:
            db.merge(asset_entry)
            db.commit()
            return {"status": "success", "serial": raw_data.get("SerialNumber")}
        except Exception as e:
            db.rollback()
            return {"status": "error", "detail": str(e)}

    def _parse_fee_data(self, raw_data: dict):
        """
        Parses fee data from CustomFieldValues.
        Returns total balance across all fee types.
        Deduplicates identical entries to avoid double-counting.
        Returns tuple of (fee_balance, fee_past_due) or (None, None) if not found.
        """
        cfv = raw_data.get("CustomFieldValues", [])
        for field in cfv:
            if field.get("CustomFieldTypeId") == FEE_FIELD_TYPE_ID:
                value = field.get("Value")
                if value and isinstance(value, str):
                    try:
                        parsed = json.loads(value)
                        # Deduplicate by unique key (Amount + Balance + LastActivityDate)
                        seen = set()
                        total_balance = 0.0
                        total_past_due = 0.0
                        for item in parsed:
                            balance = float(item.get("Balance", 0))
                            if balance > 0:
                                key = (item.get("Amount"), item.get("Balance"), item.get("LastActivityDate"))
                                if key not in seen:
                                    seen.add(key)
                                    total_balance += balance
                                    total_past_due += float(item.get("PastDueAmount", 0))
                        return (total_balance if total_balance > 0 else None,
                                total_past_due if total_past_due > 0 else None)
                    except (json.JSONDecodeError, ValueError):
                        pass
        return None, None

    def fetch_all_assets_paginated(self, page_size: int = 100):
        """
        Fetches ALL assets from IIQ using pagination.
        Returns a generator for memory efficiency.
        Note: IIQ uses PageIndex (0-based) not PageNumber!
        """
        logger.info("Starting bulk fetch of all assets from IIQ")
        page_index = 0
        total_fetched = 0
        total_rows = None

        while True:
            body = {
                "OnlyShowDeleted": False,
                "Paging": {
                    "PageIndex": page_index,
                    "PageSize": page_size
                }
            }

            try:
                resp = requests.post(
                    f"{self.base_url}/api/v1.0/assets",
                    headers=self.headers,
                    json=body,
                    timeout=30
                )
                resp.raise_for_status()
                data = resp.json()

                items = data.get("Items", [])
                if not items:
                    break

                # Get total from Paging object on first request
                if total_rows is None:
                    paging = data.get("Paging", {})
                    total_rows = paging.get("TotalRows", 0)
                    page_count = paging.get("PageCount", 0)
                    logger.info(f"Total assets to fetch: {total_rows} ({page_count} pages)")

                total_fetched += len(items)
                logger.info(f"Fetched page {page_index}: {len(items)} assets (total: {total_fetched}/{total_rows})")

                for asset in items:
                    yield asset

                # Check if we've fetched all items
                if total_fetched >= total_rows:
                    break

                page_index += 1

            except Exception as e:
                logger.error(f"Error fetching page {page_index}: {e}")
                break

        logger.info(f"Bulk fetch complete. Total assets: {total_fetched}")

    def bulk_sync(self, db: Session):
        """
        Syncs ALL assets from IIQ to local database.
        Used for nightly cron jobs.
        """
        logger.info("=" * 50)
        logger.info("STARTING IIQ BULK SYNC")
        logger.info("=" * 50)

        success_count = 0
        error_count = 0
        fee_count = 0

        for raw_data in self.fetch_all_assets_paginated():
            try:
                serial = raw_data.get("SerialNumber")
                if not serial:
                    continue

                owner = raw_data.get("Owner") or {}
                loc_obj = raw_data.get("Location") or {}

                # Parse fee data
                fee_balance, fee_past_due = self._parse_fee_data(raw_data)
                if fee_balance:
                    fee_count += 1

                # Skip location API lookups during bulk sync to save time
                # Location name is already in loc_obj for most assets
                resolved_owner_loc = None
                if owner.get("LocationId"):
                    # Try cache first (no API calls during bulk)
                    cached = db.query(LocationCache).filter(
                        LocationCache.location_id == owner.get("LocationId")
                    ).first()
                    if cached:
                        resolved_owner_loc = cached.name

                asset_entry = IIQAsset(
                    serial_number=raw_data.get("SerialNumber"),
                    iiq_id=raw_data.get("AssetId"),
                    asset_tag=raw_data.get("AssetTag"),
                    model=raw_data.get("Model", {}).get("Name"),
                    model_category=raw_data.get("Model", {}).get("Category", {}).get("Name"),
                    status=raw_data.get("Status", {}).get("Name"),
                    assigned_user_email=owner.get("Email"),
                    assigned_user_id=owner.get("SchoolIdNumber"),
                    owner_iiq_id=owner.get("UserId"),
                    assigned_user_name=owner.get("FullName"),
                    assigned_user_role=owner.get("RoleName"),
                    assigned_user_grade=owner.get("Grade"),
                    assigned_user_homeroom=owner.get("Homeroom"),
                    owner_location=resolved_owner_loc,
                    location=loc_obj.get("Name", "Unknown"),
                    ticket_count=raw_data.get("OpenTickets", 0),
                    fee_balance=str(fee_balance) if fee_balance else None,
                    fee_past_due=str(fee_past_due) if fee_past_due else None,
                    last_updated=datetime.utcnow(),
                    meta_data=raw_data
                )

                db.merge(asset_entry)
                success_count += 1

                # Commit every 100 records
                if success_count % 100 == 0:
                    db.commit()
                    logger.info(f"Committed {success_count} records...")

            except Exception as e:
                error_count += 1
                logger.error(f"Error syncing asset {raw_data.get('SerialNumber', 'unknown')}: {e}")

        # Final commit
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Final commit failed: {e}")

        logger.info("=" * 50)
        logger.info(f"IIQ BULK SYNC COMPLETE")
        logger.info(f"Success: {success_count} | Errors: {error_count} | With Fees: {fee_count}")
        logger.info("=" * 50)

        return {"success": success_count, "errors": error_count, "with_fees": fee_count}

    def cache_ticket_stats(self, db) -> dict:
        """
        Fetch ticket statistics from IIQ API and cache them in the database.
        Called during nightly sync to avoid live API calls on dashboard load.
        """
        from app.models import CachedStats
        import json

        logger.info("Caching IIQ ticket statistics...")

        try:
            # Get total ticket count
            resp = requests.post(
                f"{self.base_url}/api/v1.0/tickets",
                headers=self.headers,
                json={"OnlyShowDeleted": False, "Paging": {"PageIndex": 0, "PageSize": 1}},
                timeout=30
            )
            total_all_time = resp.json().get("Paging", {}).get("TotalRows", 0)

            # Get open ticket count
            resp = requests.post(
                f"{self.base_url}/api/v1.0/tickets",
                headers=self.headers,
                json={
                    "OnlyShowDeleted": False,
                    "Filters": [{"Facet": "Status", "Values": ["Open"]}],
                    "Paging": {"PageIndex": 0, "PageSize": 1}
                },
                timeout=30
            )
            open_tickets = resp.json().get("Paging", {}).get("TotalRows", 0)

            # Sample first 500 tickets to count school year tickets
            school_year_count = 0
            school_year_start = "2025-07-01"
            for page in range(25):
                resp = requests.post(
                    f"{self.base_url}/api/v1.0/tickets",
                    headers=self.headers,
                    json={"OnlyShowDeleted": False, "Paging": {"PageIndex": page, "PageSize": 20}},
                    timeout=30
                )
                items = resp.json().get("Items", [])
                for item in items:
                    if item.get("CreatedDate", "") >= school_year_start:
                        school_year_count += 1

            # Save to cache
            stats = {
                "total_all_time": total_all_time,
                "open_tickets": open_tickets,
                "school_year_tickets": school_year_count,
                "school_year": "2025-2026"
            }

            cache_entry = CachedStats(
                stat_key="iiq_ticket_stats",
                stat_value=json.dumps(stats),
                last_updated=datetime.utcnow()
            )
            db.merge(cache_entry)
            db.commit()

            logger.info(f"Cached ticket stats: {stats}")
            return stats

        except Exception as e:
            logger.error(f"Failed to cache ticket stats: {e}")
            return {"error": str(e)}

    def cache_user_stats(self, db) -> dict:
        """
        Fetch user statistics from IIQ API and cache them in the database.
        Called during nightly sync to get accurate total student count.
        Uses GET with query params (POST ignores PageSize for users endpoint).
        """
        from app.models import CachedStats
        import json

        logger.info("Caching IIQ user statistics...")

        try:
            # Get total from first request
            resp = requests.get(
                f"{self.base_url}/api/v1.0/users",
                headers=self.headers,
                params={"$p": 0, "$s": 1},
                timeout=30
            )
            total_users = resp.json().get("Paging", {}).get("TotalRows", 0)

            # Count students by paginating through all users
            student_count = 0
            faculty_count = 0
            page_index = 0
            page_size = 100
            total_fetched = 0

            while True:
                resp = requests.get(
                    f"{self.base_url}/api/v1.0/users",
                    headers=self.headers,
                    params={"$p": page_index, "$s": page_size},
                    timeout=30
                )
                data = resp.json()
                items = data.get("Items", [])

                if not items:
                    break

                total_fetched += len(items)

                for user in items:
                    role_obj = user.get("Role") or {}
                    role = role_obj.get("Name", "")
                    if role == "Student":
                        student_count += 1
                    elif role in ["Faculty", "Staff", "Teacher"]:
                        faculty_count += 1

                # Check if we've fetched all
                total_rows = data.get("Paging", {}).get("TotalRows", 0)
                if total_fetched >= total_rows:
                    break

                page_index += 1

                # Log progress every 50 pages
                if page_index % 50 == 0:
                    logger.info(f"User stats: processed {total_fetched} of {total_rows} users...")

            # Save to cache
            stats = {
                "total_users": total_users,
                "total_students": student_count,
                "total_faculty": faculty_count
            }

            cache_entry = CachedStats(
                stat_key="iiq_user_stats",
                stat_value=json.dumps(stats),
                last_updated=datetime.utcnow()
            )
            db.merge(cache_entry)
            db.commit()

            logger.info(f"Cached user stats: {stats}")
            return stats

        except Exception as e:
            logger.error(f"Failed to cache user stats: {e}")
            return {"error": str(e)}

    def fetch_all_users_paginated(self, page_size: int = 100):
        """
        Fetches ALL users from IIQ using pagination.
        Uses GET with query parameters: ?$p=<page>&$s=<size>
        (POST ignores PageSize for users endpoint)
        Returns a generator for memory efficiency.
        """
        logger.info("Starting bulk fetch of all users from IIQ")
        page_index = 0
        total_fetched = 0
        total_rows = None

        while True:
            try:
                # IIQ users API requires GET with query params for pagination
                resp = requests.get(
                    f"{self.base_url}/api/v1.0/users",
                    headers=self.headers,
                    params={"$p": page_index, "$s": page_size},
                    timeout=30
                )
                resp.raise_for_status()
                data = resp.json()

                items = data.get("Items", [])
                if not items:
                    break

                if total_rows is None:
                    paging = data.get("Paging", {})
                    total_rows = paging.get("TotalRows", 0)
                    page_count = paging.get("PageCount", 0)
                    logger.info(f"Total users to fetch: {total_rows} ({page_count} pages)")

                total_fetched += len(items)
                if page_index % 10 == 0:  # Log every 10 pages to reduce noise
                    logger.info(f"Fetched page {page_index}: {len(items)} users (total: {total_fetched}/{total_rows})")

                for user in items:
                    yield user

                if total_fetched >= total_rows:
                    break

                page_index += 1

            except Exception as e:
                logger.error(f"Error fetching user page {page_index}: {e}")
                break

        logger.info(f"User fetch complete. Total users: {total_fetched}")

    def bulk_sync_users(self, db: Session):
        """
        Syncs ALL users from IIQ to local database.
        Used for nightly cron jobs to maintain complete user list.
        Uses direct SQL upsert for reliability.
        """
        from sqlalchemy.dialects.postgresql import insert
        from app.models import IIQUser

        logger.info("=" * 50)
        logger.info("STARTING IIQ BULK USER SYNC")
        logger.info("=" * 50)

        success_count = 0
        error_count = 0
        student_count = 0
        batch = []
        batch_size = 100
        seen_user_ids = set()  # Track duplicates

        for raw_data in self.fetch_all_users_paginated():
            try:
                user_id = raw_data.get("UserId")
                if not user_id:
                    continue

                # Skip duplicates (IIQ API sometimes returns same user multiple times)
                if user_id in seen_user_ids:
                    continue
                seen_user_ids.add(user_id)

                # Extract nested role
                role_obj = raw_data.get("Role") or {}
                role_name = role_obj.get("Name", "")

                if role_name == "Student":
                    student_count += 1

                # Extract nested location
                location_obj = raw_data.get("Location") or {}

                # Parse fee data from user's CustomFieldValues
                fee_balance, fee_past_due = self._parse_fee_data(raw_data)

                user_data = {
                    "user_id": user_id,
                    "school_id_number": raw_data.get("SchoolIdNumber"),
                    "email": raw_data.get("Email"),
                    "full_name": raw_data.get("Name"),
                    "first_name": raw_data.get("FirstName"),
                    "last_name": raw_data.get("LastName"),
                    "role_name": role_name,
                    "grade": raw_data.get("Grade"),
                    "location_name": location_obj.get("Name") or raw_data.get("LocationName"),
                    "location_id": raw_data.get("LocationId"),
                    "homeroom": raw_data.get("Homeroom"),
                    "fee_balance": str(fee_balance) if fee_balance else None,
                    "fee_past_due": str(fee_past_due) if fee_past_due else None,
                    "is_active": raw_data.get("IsActive", True),
                    "is_deleted": raw_data.get("IsDeleted", False),
                    "last_updated": datetime.utcnow(),
                    "meta_data": raw_data
                }

                batch.append(user_data)
                success_count += 1

                if len(batch) >= batch_size:
                    try:
                        stmt = insert(IIQUser).values(batch)
                        stmt = stmt.on_conflict_do_update(
                            index_elements=['user_id'],
                            set_={
                                'school_id_number': stmt.excluded.school_id_number,
                                'email': stmt.excluded.email,
                                'full_name': stmt.excluded.full_name,
                                'first_name': stmt.excluded.first_name,
                                'last_name': stmt.excluded.last_name,
                                'role_name': stmt.excluded.role_name,
                                'grade': stmt.excluded.grade,
                                'location_name': stmt.excluded.location_name,
                                'location_id': stmt.excluded.location_id,
                                'homeroom': stmt.excluded.homeroom,
                                'fee_balance': stmt.excluded.fee_balance,
                                'fee_past_due': stmt.excluded.fee_past_due,
                                'is_active': stmt.excluded.is_active,
                                'is_deleted': stmt.excluded.is_deleted,
                                'last_updated': stmt.excluded.last_updated,
                                'meta_data': stmt.excluded.meta_data
                            }
                        )
                        db.execute(stmt)
                        db.commit()
                        logger.info(f"Committed {success_count} user records...")
                        batch = []
                    except Exception as e:
                        db.rollback()
                        error_count += len(batch)
                        success_count -= len(batch)
                        batch = []
                        logger.error(f"Batch commit failed: {e}")

            except Exception as e:
                error_count += 1
                logger.error(f"Error processing user {raw_data.get('UserId', 'unknown')}: {e}")

        # Final batch
        if batch:
            try:
                stmt = insert(IIQUser).values(batch)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['user_id'],
                    set_={
                        'school_id_number': stmt.excluded.school_id_number,
                        'email': stmt.excluded.email,
                        'full_name': stmt.excluded.full_name,
                        'first_name': stmt.excluded.first_name,
                        'last_name': stmt.excluded.last_name,
                        'role_name': stmt.excluded.role_name,
                        'grade': stmt.excluded.grade,
                        'location_name': stmt.excluded.location_name,
                        'location_id': stmt.excluded.location_id,
                        'homeroom': stmt.excluded.homeroom,
                        'fee_balance': stmt.excluded.fee_balance,
                        'fee_past_due': stmt.excluded.fee_past_due,
                        'is_active': stmt.excluded.is_active,
                        'is_deleted': stmt.excluded.is_deleted,
                        'last_updated': stmt.excluded.last_updated,
                        'meta_data': stmt.excluded.meta_data
                    }
                )
                db.execute(stmt)
                db.commit()
            except Exception as e:
                db.rollback()
                error_count += len(batch)
                success_count -= len(batch)
                logger.error(f"Final batch commit failed: {e}")

        logger.info("=" * 50)
        logger.info(f"IIQ BULK USER SYNC COMPLETE")
        logger.info(f"Success: {success_count} | Errors: {error_count} | Students: {student_count}")
        logger.info("=" * 50)

        return {"success": success_count, "errors": error_count, "students": student_count}

    def bulk_sync_tickets(self, db: Session):
        """
        Syncs ALL tickets from IIQ to local database.
        """
        from sqlalchemy.dialects.postgresql import insert
        from app.models import IIQTicket

        logger.info("=" * 50)
        logger.info("STARTING IIQ BULK TICKET SYNC")
        logger.info("=" * 50)

        success_count = 0
        error_count = 0
        batch = {}  # Use dict to dedupe by ticket_id (API returns duplicates)
        batch_size = 100  # Commit every 100 records
        page_index = 0
        total_fetched = 0
        total_rows = None
        page_size = 100
        cutoff_date = "2025-01-01T00:00:00Z"
        # With 56K tickets at 100/page = ~562 API calls, should take ~5-10 minutes

        while True:
            try:
                # NOTE: IIQ tickets API requires query params for pagination ($p, $s)
                # JSON body Paging is ignored by the tickets endpoint
                resp = requests.post(
                    f"{self.base_url}/api/v1.0/tickets?$p={page_index}&$s=100",
                    headers=self.headers,
                    json={
                        "OnlyShowDeleted": False,
                        "Filters": [{
                            "Facet": "CreatedDate",
                            "Min": cutoff_date
                        }]
                    },
                    timeout=30
                )
                resp.raise_for_status()
                data = resp.json()

                items = data.get("Items", [])
                if not items:
                    break

                if total_rows is None:
                    total_rows = data.get("Paging", {}).get("TotalRows", 0)
                    pages_needed = (total_rows + page_size - 1) // page_size
                    logger.info(f"Total tickets to fetch: {total_rows} ({pages_needed} pages at {page_size}/page)")

                total_fetched += len(items)

                for raw_data in items:
                    try:
                        ticket_id = raw_data.get("TicketId")
                        if not ticket_id:
                            continue

                        # Double check date client-side
                        created_date = raw_data.get("CreatedDate")
                        if created_date and created_date < "2025-01-01":
                            continue

                        # Extract nested objects (some may not exist or be different types)
                        owner = raw_data.get("Owner") or {}
                        assignee = raw_data.get("AssignedToUser") or {}  # Not "Assignee"
                        location = raw_data.get("Location") or {}
                        workflow_step = raw_data.get("WorkflowStep") or {}  # Status is WorkflowStep
                        issue = raw_data.get("Issue") or {}  # Category is Issue

                        # Priority is an int, not a dict
                        priority_val = raw_data.get("Priority")
                        priority_str = str(priority_val) if priority_val is not None else None

                        ticket_data = {
                            "ticket_id": ticket_id,
                            "ticket_number": raw_data.get("TicketNumber"),
                            "subject": raw_data.get("Subject"),
                            "description": raw_data.get("IssueDescription"),  # Not "Description"
                            "status": workflow_step.get("Name") if isinstance(workflow_step, dict) else None,
                            "priority": priority_str,
                            "category": issue.get("Name") if isinstance(issue, dict) else None,
                            "created_date": raw_data.get("CreatedDate"),
                            "modified_date": raw_data.get("ModifiedDate"),
                            "closed_date": raw_data.get("ClosedDate"),
                            "owner_id": owner.get("UserId") if isinstance(owner, dict) else None,
                            "owner_name": owner.get("Name") if isinstance(owner, dict) else None,
                            "owner_email": owner.get("Email") if isinstance(owner, dict) else None,
                            "assignee_id": assignee.get("UserId") if isinstance(assignee, dict) else None,
                            "assignee_name": assignee.get("Name") if isinstance(assignee, dict) else None,
                            "team_id": None,  # No direct team field in tickets
                            "team_name": None,
                            "asset_id": None,  # No direct asset field in tickets
                            "asset_tag": None,
                            "location_id": location.get("LocationId") if isinstance(location, dict) else None,
                            "location_name": location.get("Name") if isinstance(location, dict) else None,
                            "last_updated": datetime.utcnow(),
                            "meta_data": json.dumps(raw_data)
                        }

                        batch[ticket_id] = ticket_data  # Dedupe by ticket_id
                        success_count += 1

                        if len(batch) >= batch_size:
                            batch_list = list(batch.values())
                            stmt = insert(IIQTicket).values(batch_list)
                            stmt = stmt.on_conflict_do_update(
                                index_elements=['ticket_id'],
                                set_={k: stmt.excluded[k] for k in ticket_data.keys() if k != 'ticket_id'}
                            )
                            db.execute(stmt)
                            db.commit()
                            logger.info(f"Committed {success_count} ticket records...")
                            batch = {}

                    except Exception as e:
                        error_count += 1
                        logger.error(f"Error processing ticket: {e}")

                # Log progress every 50 pages (~1000 tickets)
                if page_index > 0 and page_index % 50 == 0:
                    logger.info(f"Progress: {total_fetched}/{total_rows} tickets ({100*total_fetched//total_rows}%)")

                if total_fetched >= total_rows:
                    break

                page_index += 1

            except Exception as e:
                logger.error(f"Error fetching ticket page {page_index}: {e}")
                break

        # Final batch
        if batch:
            try:
                batch_list = list(batch.values())
                stmt = insert(IIQTicket).values(batch_list)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['ticket_id'],
                    set_={k: stmt.excluded[k] for k in batch_list[0].keys() if k != 'ticket_id'}
                )
                db.execute(stmt)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Final ticket batch commit failed: {e}")

        logger.info("=" * 50)
        logger.info(f"IIQ BULK TICKET SYNC COMPLETE")
        logger.info(f"Success: {success_count} | Errors: {error_count}")
        logger.info("=" * 50)

        return {"success": success_count, "errors": error_count}

    def bulk_sync_locations(self, db: Session):
        """Syncs all locations from IIQ."""
        from sqlalchemy.dialects.postgresql import insert
        from app.models import IIQLocation

        logger.info("Starting IIQ locations sync...")

        try:
            resp = requests.get(
                f"{self.base_url}/api/v1.0/locations",
                headers=self.headers,
                params={"$p": 0, "$s": 100},
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("Items", [])

            for raw_data in items:
                location_id = raw_data.get("LocationId")
                if not location_id:
                    continue

                # Extract address from nested Address object
                address_obj = raw_data.get("Address") or {}
                address_str = address_obj.get("Street1") if isinstance(address_obj, dict) else None

                location_data = {
                    "location_id": location_id,
                    "name": raw_data.get("Name"),
                    "abbreviation": raw_data.get("Abbreviation"),
                    "address": address_str,
                    "city": address_obj.get("City") if isinstance(address_obj, dict) else None,
                    "state": address_obj.get("State") if isinstance(address_obj, dict) else None,
                    "zip": address_obj.get("Zip") if isinstance(address_obj, dict) else None,
                    "location_type": raw_data.get("LocationType", {}).get("Name") if isinstance(raw_data.get("LocationType"), dict) else raw_data.get("LocationType"),
                    "parent_id": raw_data.get("ParentLocationId"),
                    "is_active": raw_data.get("IsActive", True),
                    "last_updated": datetime.utcnow(),
                    "meta_data": json.dumps(raw_data)
                }

                stmt = insert(IIQLocation).values(location_data)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['location_id'],
                    set_={k: stmt.excluded[k] for k in location_data.keys() if k != 'location_id'}
                )
                db.execute(stmt)

            db.commit()
            logger.info(f"Synced {len(items)} locations")
            return {"success": len(items), "errors": 0}

        except Exception as e:
            db.rollback()
            logger.error(f"Location sync failed: {e}")
            return {"success": 0, "errors": 1, "message": str(e)}

    def bulk_sync_teams(self, db: Session):
        """Syncs all teams from IIQ."""
        from sqlalchemy.dialects.postgresql import insert
        from app.models import IIQTeam

        logger.info("Starting IIQ teams sync...")

        try:
            resp = requests.get(
                f"{self.base_url}/api/v1.0/teams",
                headers=self.headers,
                params={"$p": 0, "$s": 100},
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("Items", [])
            synced_count = 0

            for raw_data in items:
                team_id = raw_data.get("TeamId")
                team_name = raw_data.get("TeamName") or raw_data.get("Name")
                # Skip teams without ID or name (name is required in DB)
                if not team_id or not team_name:
                    continue

                team_data = {
                    "team_id": team_id,
                    "name": team_name,
                    "description": raw_data.get("Description") or "",
                    "member_count": raw_data.get("MembersCount") or raw_data.get("MemberCount"),
                    "is_active": raw_data.get("IsActive", True),
                    "last_updated": datetime.utcnow(),
                    "meta_data": json.dumps(raw_data)
                }

                stmt = insert(IIQTeam).values(team_data)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['team_id'],
                    set_={k: stmt.excluded[k] for k in team_data.keys() if k != 'team_id'}
                )
                db.execute(stmt)
                synced_count += 1

            db.commit()
            logger.info(f"Synced {synced_count} teams (skipped {len(items) - synced_count} without names)")
            return {"success": synced_count, "errors": 0}

        except Exception as e:
            db.rollback()
            logger.error(f"Team sync failed: {e}")
            return {"success": 0, "errors": 1, "message": str(e)}

    def bulk_sync_manufacturers(self, db: Session):
        """Syncs all manufacturers from IIQ."""
        from sqlalchemy.dialects.postgresql import insert
        from app.models import IIQManufacturer

        logger.info("Starting IIQ manufacturers sync...")

        try:
            resp = requests.get(
                f"{self.base_url}/api/v1.0/manufacturers",
                headers=self.headers,
                params={"$p": 0, "$s": 100},
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("Items", [])
            synced_count = 0

            for raw_data in items:
                mfr_id = raw_data.get("ManufacturerId")
                mfr_name = raw_data.get("Name")
                # Skip manufacturers without ID or name
                if not mfr_id or not mfr_name:
                    continue

                mfr_data = {
                    "manufacturer_id": mfr_id,
                    "name": mfr_name,
                    "last_updated": datetime.utcnow(),
                    "meta_data": json.dumps(raw_data)
                }

                stmt = insert(IIQManufacturer).values(mfr_data)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['manufacturer_id'],
                    set_={k: stmt.excluded[k] for k in mfr_data.keys() if k != 'manufacturer_id'}
                )
                db.execute(stmt)
                synced_count += 1

            db.commit()
            logger.info(f"Synced {synced_count} manufacturers")
            return {"success": synced_count, "errors": 0}

        except Exception as e:
            db.rollback()
            logger.error(f"Manufacturer sync failed: {e}")
            return {"success": 0, "errors": 1, "message": str(e)}
