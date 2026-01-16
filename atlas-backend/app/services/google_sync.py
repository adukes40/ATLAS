import os
import sys
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from app.models import GoogleDevice, GoogleUser
from datetime import datetime
import logging

# Setup logging for cron jobs
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class GoogleConnector:
    def __init__(self, credentials_path: str = None, admin_email: str = None, credentials_json: str = None):
        """
        Initialize Google Admin connector.

        Args:
            credentials_path: Path to service account JSON file (legacy/fallback)
            admin_email: Admin email for domain-wide delegation
            credentials_json: Service account JSON as a string (from database)
        """
        self.scopes = [
            'https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly',
            'https://www.googleapis.com/auth/admin.directory.user.readonly',
            'https://www.googleapis.com/auth/chrome.management.telemetry.readonly'
        ]

        # Prefer credentials_json (from database) over file path
        if credentials_json:
            creds_info = json.loads(credentials_json)
            self.credentials = service_account.Credentials.from_service_account_info(
                creds_info, scopes=self.scopes)
        elif credentials_path:
            self.credentials = service_account.Credentials.from_service_account_file(
                credentials_path, scopes=self.scopes)
        else:
            raise ValueError("Either credentials_json or credentials_path must be provided")

        self.delegated_credentials = self.credentials.with_subject(admin_email)
        self.service = build('admin', 'directory_v1', credentials=self.delegated_credentials)

        # Chrome Management Telemetry API for battery health data
        try:
            self.telemetry_service = build('chromemanagement', 'v1', credentials=self.delegated_credentials)
            self._telemetry_cache = {}  # Cache telemetry data by serial number
        except Exception as e:
            logger.warning(f"Could not initialize Telemetry API: {e}")
            self.telemetry_service = None
            self._telemetry_cache = {}

    def fetch_battery_telemetry(self, serial: str = None):
        """
        Fetches battery telemetry from Chrome Management Telemetry API.
        If serial is provided, returns data for that device.
        If serial is None, fetches all and populates cache.
        """
        if not self.telemetry_service:
            return None

        try:
            if serial and serial in self._telemetry_cache:
                return self._telemetry_cache[serial]

            # Fetch telemetry data
            result = self.telemetry_service.customers().telemetry().devices().list(
                parent='customers/my_customer',
                pageSize=1000,
                readMask='serialNumber,batteryInfo,batteryStatusReport'
            ).execute()

            devices = result.get('devices', [])

            for device in devices:
                device_serial = device.get('serialNumber')
                if not device_serial:
                    continue

                battery_health_percent = None
                battery_status = None
                cycle_count = None

                # Get battery status report
                battery_reports = device.get('batteryStatusReport', [])
                if battery_reports:
                    latest_report = battery_reports[0]  # Most recent
                    battery_status = latest_report.get('batteryHealth')  # e.g., "BATTERY_HEALTH_NORMAL"
                    cycle_count = latest_report.get('cycleCount')

                    # Calculate health percentage from capacity
                    full_capacity = latest_report.get('fullChargeCapacity')
                    battery_info = device.get('batteryInfo', [])
                    if battery_info and full_capacity:
                        design_capacity = battery_info[0].get('designCapacity')
                        if design_capacity:
                            try:
                                battery_health_percent = int((int(full_capacity) / int(design_capacity)) * 100)
                                # Cap at 100%
                                battery_health_percent = min(battery_health_percent, 100)
                            except (ValueError, ZeroDivisionError):
                                pass

                self._telemetry_cache[device_serial] = {
                    'battery_health_percent': battery_health_percent,
                    'battery_status': battery_status,
                    'cycle_count': cycle_count
                }

            if serial:
                return self._telemetry_cache.get(serial)
            return self._telemetry_cache

        except Exception as e:
            logger.warning(f"Error fetching battery telemetry: {e}")
            return None

    def preload_telemetry_cache(self):
        """
        Preloads all battery telemetry data into cache for bulk sync operations.
        """
        if not self.telemetry_service:
            logger.info("Telemetry API not available, skipping battery data")
            return

        logger.info("Preloading battery telemetry data...")
        page_token = None
        total = 0

        try:
            while True:
                result = self.telemetry_service.customers().telemetry().devices().list(
                    parent='customers/my_customer',
                    pageSize=1000,
                    pageToken=page_token,
                    readMask='serialNumber,batteryInfo,batteryStatusReport'
                ).execute()

                devices = result.get('devices', [])

                for device in devices:
                    device_serial = device.get('serialNumber')
                    if not device_serial:
                        continue

                    battery_health_percent = None
                    battery_status = None
                    cycle_count = None

                    battery_reports = device.get('batteryStatusReport', [])
                    if battery_reports:
                        latest_report = battery_reports[0]
                        battery_status = latest_report.get('batteryHealth')
                        cycle_count = latest_report.get('cycleCount')

                        full_capacity = latest_report.get('fullChargeCapacity')
                        battery_info = device.get('batteryInfo', [])
                        if battery_info and full_capacity:
                            design_capacity = battery_info[0].get('designCapacity')
                            if design_capacity:
                                try:
                                    battery_health_percent = int((int(full_capacity) / int(design_capacity)) * 100)
                                    battery_health_percent = min(battery_health_percent, 100)
                                except (ValueError, ZeroDivisionError):
                                    pass

                    self._telemetry_cache[device_serial] = {
                        'battery_health_percent': battery_health_percent,
                        'battery_status': battery_status,
                        'cycle_count': cycle_count
                    }
                    total += 1

                page_token = result.get('nextPageToken')
                if not page_token:
                    break

            logger.info(f"Loaded battery telemetry for {total} devices")
        except Exception as e:
            logger.warning(f"Error preloading telemetry cache: {e}")

    def fetch_device_by_serial(self, serial: str):
        """
        Fetches Chromebook details from Google Admin SDK by Serial Number.
        """
        if not serial:
            return None
            
        clean_serial = serial.strip().upper()
        try:
            # Querying by the plain serial number string is the most robust method
            # for the Admin SDK chromeosdevices.list endpoint.
            results = self.service.chromeosdevices().list(
                customerId='my_customer', 
                query=clean_serial
            ).execute()

            devices = results.get('chromeosdevices', [])
            if devices:
                return devices[0]

            return None
        except Exception as e:
            print(f"[Google] API Error: {e}")
            return None

    def sync_record(self, db: Session, serial: str):
        """
        Syncs Google Admin data to the local google_devices table.
        """
        raw_data = self.fetch_device_by_serial(serial)
        
        if not raw_data:
            return {"status": "error", "message": "Device not found in Google Admin"}

        # Extract Telemetry & Activity
        recent_users = []
        if 'recentUsers' in raw_data:
            recent_users = [user.get('email') for user in raw_data['recentUsers'] if user.get('email')]

        # --- PARSE HARDWARE HEALTH ---
        # 1. CPU Temp (Average across cores)
        cpu_temp = None
        cpu_reports = raw_data.get('cpuStatusReports', [])
        if cpu_reports:
            temp_info = cpu_reports[-1].get('cpuTemperatureInfo', [])
            temps = [t.get('temperature') for t in temp_info if t.get('temperature')]
            if temps:
                cpu_temp = int(sum(temps) / len(temps))

        # 2. RAM (Bytes to GB)
        ram_total = raw_data.get('systemRamTotal')
        ram_free = None
        ram_reports = raw_data.get('systemRamFreeReports', [])
        if ram_reports:
            ram_free = ram_reports[-1].get('systemRamFreeInfo', [None])[0]

        def to_gb(val):
            try: return round(float(val) / (1024**3), 2) if val else None
            except: return None

        # 3. Disk (Bytes to GB)
        disk_total = raw_data.get('diskSpaceUsage', {}).get('capacityBytes')
        disk_used = raw_data.get('diskSpaceUsage', {}).get('usedBytes')
        disk_free = None
        if disk_total and disk_used:
            disk_free = int(disk_total) - int(disk_used)

        # 4. Battery Health (from Telemetry API)
        battery_health = None
        telemetry_data = self.fetch_battery_telemetry(serial)
        if telemetry_data:
            battery_health = telemetry_data.get('battery_health_percent')

        # 5. Network IP Addresses (from lastKnownNetwork)
        lan_ip = None
        wan_ip = None
        last_known_network = raw_data.get('lastKnownNetwork', [])
        if last_known_network and len(last_known_network) > 0:
            lan_ip = last_known_network[0].get('ipAddress')
            wan_ip = last_known_network[0].get('wanIpAddress')

        device_entry = GoogleDevice(
            serial_number = raw_data.get('serialNumber'),
            google_id = raw_data.get('deviceId'),

            # Identity & Config
            org_unit_path = raw_data.get('orgUnitPath'),
            annotated_asset_id = raw_data.get('annotatedAssetId'),
            annotated_user = raw_data.get('annotatedUser'),
            annotated_location = raw_data.get('annotatedLocation'),

            # Device Info
            model = raw_data.get('model'),

            # Vital Telemetry
            status = raw_data.get('status'),
            aue_date = raw_data.get('autoUpdateThrough'), # Using the friendly date string if available
            os_compliance = raw_data.get('osVersionCompliance'),
            boot_mode = raw_data.get('bootMode'),
            
            # Hardware Stats
            cpu_temp_avg = cpu_temp,
            ram_total_gb = str(to_gb(ram_total)) if ram_total else None,
            ram_free_gb = str(to_gb(ram_free)) if ram_free else None,
            disk_total_gb = str(to_gb(disk_total)) if disk_total else None,
            disk_free_gb = str(to_gb(disk_free)) if disk_free else None,
            battery_health_percent = battery_health,

            # Network IPs
            lan_ip = lan_ip,
            wan_ip = wan_ip,

            os_version = raw_data.get('osVersion'),
            # Use Google's lastSync timestamp (when device last synced with Google)
            last_sync = datetime.fromisoformat(raw_data['lastSync'].replace('Z', '+00:00')) if raw_data.get('lastSync') else datetime.utcnow(),
            ethernet_mac_address = raw_data.get('ethernetMacAddress'),
            mac_address = raw_data.get('macAddress'),
            
            recent_users = recent_users,
            raw_reports = {
                "cpu": cpu_reports[-1] if cpu_reports else {},
                "ram_reports": ram_reports[-1] if ram_reports else {},
                "disk": raw_data.get('diskSpaceUsage', {})
            },
            last_updated = datetime.utcnow()
        )

        try:
            db.merge(device_entry)
            db.commit()
            return {"status": "success", "serial": serial}
        except Exception as e:
            db.rollback()
            return {"status": "error", "detail": str(e)}

    def fetch_all_devices(self):
        """
        Fetches ALL Chromebooks from Google Admin SDK with pagination.
        Returns a generator to handle large datasets efficiently.
        """
        logger.info("Starting bulk fetch of all Chromebooks from Google Admin")
        page_token = None
        total_fetched = 0

        while True:
            try:
                results = self.service.chromeosdevices().list(
                    customerId='my_customer',
                    maxResults=200,  # Max allowed by API
                    pageToken=page_token,
                    projection='FULL'  # Get all fields including hardware data
                ).execute()

                devices = results.get('chromeosdevices', [])
                total_fetched += len(devices)
                logger.info(f"Fetched {len(devices)} devices (total: {total_fetched})")

                for device in devices:
                    yield device

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            except Exception as e:
                logger.error(f"Error fetching devices: {e}")
                break

        logger.info(f"Bulk fetch complete. Total devices: {total_fetched}")

    def bulk_sync(self, db: Session):
        """
        Syncs ALL devices from Google Admin to local database.
        Used for nightly cron jobs.
        """
        logger.info("=" * 50)
        logger.info("STARTING GOOGLE BULK SYNC")
        logger.info("=" * 50)

        # Preload battery telemetry data for all devices
        self.preload_telemetry_cache()

        success_count = 0
        error_count = 0

        for raw_data in self.fetch_all_devices():
            try:
                serial = raw_data.get('serialNumber')
                if not serial:
                    continue

                # Extract data using same logic as sync_record
                recent_users = []
                if 'recentUsers' in raw_data:
                    recent_users = [user.get('email') for user in raw_data['recentUsers'] if user.get('email')]

                cpu_temp = None
                cpu_reports = raw_data.get('cpuStatusReports', [])
                if cpu_reports:
                    temp_info = cpu_reports[-1].get('cpuTemperatureInfo', [])
                    temps = [t.get('temperature') for t in temp_info if t.get('temperature')]
                    if temps:
                        cpu_temp = int(sum(temps) / len(temps))

                ram_total = raw_data.get('systemRamTotal')
                ram_free = None
                ram_reports = raw_data.get('systemRamFreeReports', [])
                if ram_reports:
                    ram_free = ram_reports[-1].get('systemRamFreeInfo', [None])[0]

                def to_gb(val):
                    try: return round(float(val) / (1024**3), 2) if val else None
                    except: return None

                disk_total = raw_data.get('diskSpaceUsage', {}).get('capacityBytes')
                disk_used = raw_data.get('diskSpaceUsage', {}).get('usedBytes')
                disk_free = None
                if disk_total and disk_used:
                    disk_free = int(disk_total) - int(disk_used)

                # Get battery health from telemetry cache
                battery_health = None
                telemetry_data = self._telemetry_cache.get(serial)
                if telemetry_data:
                    battery_health = telemetry_data.get('battery_health_percent')

                lan_ip = None
                wan_ip = None
                last_known_network = raw_data.get('lastKnownNetwork', [])
                if last_known_network and len(last_known_network) > 0:
                    lan_ip = last_known_network[0].get('ipAddress')
                    wan_ip = last_known_network[0].get('wanIpAddress')

                device_entry = GoogleDevice(
                    serial_number = raw_data.get('serialNumber'),
                    google_id = raw_data.get('deviceId'),
                    org_unit_path = raw_data.get('orgUnitPath'),
                    annotated_asset_id = raw_data.get('annotatedAssetId'),
                    annotated_user = raw_data.get('annotatedUser'),
                    annotated_location = raw_data.get('annotatedLocation'),
                    model = raw_data.get('model'),
                    status = raw_data.get('status'),
                    aue_date = raw_data.get('autoUpdateThrough'),
                    os_compliance = raw_data.get('osVersionCompliance'),
                    boot_mode = raw_data.get('bootMode'),
                    cpu_temp_avg = cpu_temp,
                    ram_total_gb = str(to_gb(ram_total)) if ram_total else None,
                    ram_free_gb = str(to_gb(ram_free)) if ram_free else None,
                    disk_total_gb = str(to_gb(disk_total)) if disk_total else None,
                    disk_free_gb = str(to_gb(disk_free)) if disk_free else None,
                    battery_health_percent = battery_health,
                    lan_ip = lan_ip,
                    wan_ip = wan_ip,
                    os_version = raw_data.get('osVersion'),
                    # Use Google's lastSync timestamp (when device last synced with Google)
                    last_sync = datetime.fromisoformat(raw_data['lastSync'].replace('Z', '+00:00')) if raw_data.get('lastSync') else datetime.utcnow(),
                    ethernet_mac_address = raw_data.get('ethernetMacAddress'),
                    mac_address = raw_data.get('macAddress'),
                    recent_users = recent_users,
                    raw_reports = {
                        "cpu": cpu_reports[-1] if cpu_reports else {},
                        "ram_reports": ram_reports[-1] if ram_reports else {},
                        "disk": raw_data.get('diskSpaceUsage', {})
                    },
                    last_updated = datetime.utcnow()
                )

                db.merge(device_entry)
                success_count += 1

                # Commit every 100 records
                if success_count % 100 == 0:
                    db.commit()
                    logger.info(f"Committed {success_count} records...")

            except Exception as e:
                error_count += 1
                logger.error(f"Error syncing device {raw_data.get('serialNumber', 'unknown')}: {e}")

        # Final commit
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Final commit failed: {e}")

        logger.info("=" * 50)
        logger.info(f"GOOGLE BULK SYNC COMPLETE")
        logger.info(f"Success: {success_count} | Errors: {error_count}")
        logger.info("=" * 50)

        return {"success": success_count, "errors": error_count}

    def parse_org_unit(self, org_unit_path: str):
        """
        Parses org unit path to extract role and school.
        Examples:
            /Students/High/High School -> (Student, High School)
            /Students/Elementary/Frear -> (Student, Frear)
            /Faculty/High School -> (Faculty, High School)
            /Staff/District Office -> (Staff, District Office)
        """
        if not org_unit_path:
            return None, None

        parts = org_unit_path.strip('/').split('/')
        if not parts:
            return None, None

        # First part is usually the role category
        role_map = {
            'Students': 'Student',
            'Faculty': 'Faculty',
            'Staff': 'Staff',
            'Administrators': 'Admin',
            'Service Accounts': 'Service',
        }

        role = role_map.get(parts[0], parts[0])

        # School is usually the last meaningful part
        if len(parts) >= 2:
            # For students: /Students/Elementary/Frear -> Frear
            # For faculty: /Faculty/High School -> High School
            school = parts[-1] if len(parts) > 1 else None
        else:
            school = None

        return role, school

    def fetch_all_users(self):
        """
        Fetches ALL users from Google Admin Directory API with pagination.
        Returns a generator to handle large datasets efficiently.
        """
        logger.info("Starting bulk fetch of all users from Google Directory API")
        page_token = None
        total_fetched = 0

        while True:
            try:
                results = self.service.users().list(
                    customer='my_customer',
                    maxResults=500,  # Max allowed by API
                    pageToken=page_token,
                    projection='full',
                    orderBy='email'
                ).execute()

                users = results.get('users', [])
                total_fetched += len(users)
                logger.info(f"Fetched {len(users)} users (total: {total_fetched})")

                for user in users:
                    yield user

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            except Exception as e:
                logger.error(f"Error fetching users: {e}")
                break

        logger.info(f"Bulk fetch complete. Total users: {total_fetched}")

    def bulk_sync_users(self, db: Session):
        """
        Syncs ALL users from Google Admin to local database.
        Used for nightly cron jobs.
        """
        logger.info("=" * 50)
        logger.info("STARTING GOOGLE USERS BULK SYNC")
        logger.info("=" * 50)

        success_count = 0
        error_count = 0
        error_details = []  # Capture individual error details
        batch = []
        batch_size = 100

        for raw_data in self.fetch_all_users():
            try:
                google_id = raw_data.get('id')
                email = raw_data.get('primaryEmail')

                if not google_id or not email:
                    continue

                # Parse org unit for role and school
                org_unit_path = raw_data.get('orgUnitPath', '')
                role, school = self.parse_org_unit(org_unit_path)

                # Extract SIS ID from externalIds
                sis_id = None
                external_ids = raw_data.get('externalIds', [])
                for ext_id in external_ids:
                    if ext_id.get('type') == 'organization':
                        sis_id = ext_id.get('value')
                        break

                # Parse last login (handle epoch date for never logged in)
                last_login = None
                last_login_str = raw_data.get('lastLoginTime')
                if last_login_str and not last_login_str.startswith('1970-01-01'):
                    try:
                        last_login = datetime.fromisoformat(last_login_str.replace('Z', '+00:00'))
                    except:
                        pass

                # Parse creation time
                created_at = None
                created_str = raw_data.get('creationTime')
                if created_str:
                    try:
                        created_at = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                    except:
                        pass

                user_data = {
                    'google_id': google_id,
                    'email': email.lower(),
                    'sis_id': sis_id,
                    'full_name': raw_data.get('name', {}).get('fullName'),
                    'first_name': raw_data.get('name', {}).get('givenName'),
                    'last_name': raw_data.get('name', {}).get('familyName'),
                    'org_unit_path': org_unit_path,
                    'role': role,
                    'school': school,
                    'is_suspended': raw_data.get('suspended', False),
                    'is_archived': raw_data.get('archived', False),
                    'is_admin': raw_data.get('isAdmin', False),
                    'last_login': last_login,
                    'created_at': created_at,
                    'last_updated': datetime.utcnow()
                }

                batch.append(user_data)

                # Commit in batches
                if len(batch) >= batch_size:
                    try:
                        self._upsert_users_batch(db, batch)
                        success_count += len(batch)
                        logger.info(f"Committed {success_count} users...")
                    except Exception as batch_error:
                        # Rollback and try inserting one by one to identify problem records
                        db.rollback()
                        logger.warning(f"Batch insert failed, trying individual inserts: {batch_error}")
                        for user in batch:
                            try:
                                self._upsert_users_batch(db, [user])
                                success_count += 1
                            except Exception as user_error:
                                error_count += 1
                                user_email = user.get('email', 'unknown')
                                error_msg = str(user_error)[:200].encode('ascii', 'replace').decode('ascii')
                                logger.error(f"Failed to insert user {user_email}: {error_msg}")
                                error_details.append({
                                    'identifier': user_email,
                                    'error': error_msg,
                                    'timestamp': datetime.utcnow().isoformat()
                                })
                                db.rollback()
                    finally:
                        batch = []

            except Exception as e:
                error_count += 1
                email_addr = raw_data.get('primaryEmail', 'unknown')
                # Safely encode error message
                error_msg = str(e)[:200].encode('ascii', 'replace').decode('ascii')
                logger.error(f"Error processing user {email_addr}: {error_msg}")
                error_details.append({
                    'identifier': email_addr,
                    'error': error_msg,
                    'timestamp': datetime.utcnow().isoformat()
                })

        # Final batch
        if batch:
            try:
                self._upsert_users_batch(db, batch)
                success_count += len(batch)
            except Exception as batch_error:
                db.rollback()
                logger.warning(f"Final batch insert failed, trying individual inserts")
                for user in batch:
                    try:
                        self._upsert_users_batch(db, [user])
                        success_count += 1
                    except Exception as user_error:
                        error_count += 1
                        user_email = user.get('email', 'unknown')
                        error_msg = str(user_error)[:200].encode('ascii', 'replace').decode('ascii')
                        error_details.append({
                            'identifier': user_email,
                            'error': error_msg,
                            'timestamp': datetime.utcnow().isoformat()
                        })
                        db.rollback()

        logger.info("=" * 50)
        logger.info(f"GOOGLE USERS BULK SYNC COMPLETE")
        logger.info(f"Success: {success_count} | Errors: {error_count}")
        logger.info("=" * 50)

        return {"success": success_count, "errors": error_count, "error_details": error_details}

    def _upsert_users_batch(self, db: Session, batch: list):
        """
        Upserts a batch of users using PostgreSQL ON CONFLICT.
        """
        if not batch:
            return

        stmt = insert(GoogleUser).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=['google_id'],
            set_={
                'email': stmt.excluded.email,
                'sis_id': stmt.excluded.sis_id,
                'full_name': stmt.excluded.full_name,
                'first_name': stmt.excluded.first_name,
                'last_name': stmt.excluded.last_name,
                'org_unit_path': stmt.excluded.org_unit_path,
                'role': stmt.excluded.role,
                'school': stmt.excluded.school,
                'is_suspended': stmt.excluded.is_suspended,
                'is_archived': stmt.excluded.is_archived,
                'is_admin': stmt.excluded.is_admin,
                'last_login': stmt.excluded.last_login,
                'created_at': stmt.excluded.created_at,
                'last_updated': stmt.excluded.last_updated
            }
        )
        db.execute(stmt)
        db.commit()
