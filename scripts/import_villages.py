import argparse
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
import os

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f"import_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
    ],
)
log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
BATCH_SIZE = 5000

def get_connection():
    return psycopg2.connect(DATABASE_URL)

def upsert_country(cur):
    cur.execute("""
        INSERT INTO "Country" (name, code, "createdAt", "updatedAt")
        VALUES ('India', 'IN', NOW(), NOW())
        ON CONFLICT (code) DO UPDATE SET "updatedAt" = NOW()
        RETURNING id
    """)
    row = cur.fetchone()
    log.info(f"Country 'India' id={row[0]}")
    return row[0]

def upsert_states(cur, df, country_id):
    states = df[["state_code","state_name"]].drop_duplicates()
    result = {}
    for _, row in states.iterrows():
        cur.execute("""
            INSERT INTO "State" (code, name, "countryId", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()
            RETURNING id
        """, (str(row.state_code), row.state_name.strip(), country_id))
        result[str(row.state_code)] = cur.fetchone()[0]
    log.info(f"Upserted {len(result)} states")
    return result

def upsert_districts(cur, df, state_map):
    districts = df[["district_code","district_name","state_code"]].drop_duplicates()
    result = {}
    for _, row in districts.iterrows():
        state_id = state_map[str(row.state_code)]
        cur.execute("""
            INSERT INTO "District" (code, name, "stateId", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT (code, "stateId") DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()
            RETURNING id
        """, (str(row.district_code), row.district_name.strip(), state_id))
        result[(str(row.district_code), str(row.state_code))] = cur.fetchone()[0]
    log.info(f"Upserted {len(result)} districts")
    return result

def upsert_subdistricts(cur, df, district_map):
    subs = df[["subdistrict_code","subdistrict_name","district_code","state_code"]].drop_duplicates()
    result = {}
    for _, row in subs.iterrows():
        district_id = district_map[(str(row.district_code), str(row.state_code))]
        cur.execute("""
            INSERT INTO "SubDistrict" (code, name, "districtId", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT (code, "districtId") DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()
            RETURNING id
        """, (str(row.subdistrict_code), row.subdistrict_name.strip(), district_id))
        result[(str(row.subdistrict_code), str(row.district_code), str(row.state_code))] = cur.fetchone()[0]
    log.info(f"Upserted {len(result)} sub-districts")
    return result

def run_import(file_path):
    start = time.time()
    log.info(f"Starting import from: {file_path}")
    log.info("Reading CSV file...")
    df = pd.read_csv(file_path, dtype=str).fillna('')
    df = df.apply(lambda col: col.str.strip() if col.dtype == "object" else col)
    log.info(f"Loaded {len(df):,} rows")

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                country_id   = upsert_country(cur)
                state_map    = upsert_states(cur, df, country_id)
                district_map = upsert_districts(cur, df, state_map)
                sub_map      = upsert_subdistricts(cur, df, district_map)

        log.info(f"Inserting villages in batches of {BATCH_SIZE:,}...")
        total = len(df)
        inserted = 0
        errors = 0

        with conn:
            with conn.cursor() as cur:
                batch = []
                for _, row in df.iterrows():
                    key = (str(row.subdistrict_code), str(row.district_code), str(row.state_code))
                    sub_id = sub_map.get(key)
                    if sub_id is None:
                        errors += 1
                        continue
                    batch.append((str(row.village_code), row.village_name, sub_id))
                    if len(batch) >= BATCH_SIZE:
                        execute_values(cur, """
                            INSERT INTO "Village" (code, name, "subDistrictId", "createdAt", "updatedAt")
                            VALUES %s
                            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()
                        """, [(c, n, s, datetime.now(), datetime.now()) for c, n, s in batch])
                        inserted += len(batch)
                        log.info(f"  Progress: {inserted:,}/{total:,} ({inserted/total*100:.1f}%)")
                        batch = []

                if batch:
                    execute_values(cur, """
                        INSERT INTO "Village" (code, name, "subDistrictId", "createdAt", "updatedAt")
                        VALUES %s
                        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()
                    """,[(c, n, s, datetime.now(), datetime.now()) for c, n, s in batch])
                    inserted += len(batch)

        with conn.cursor() as cur:
            for table in ["Country","State","District","SubDistrict","Village"]:
                cur.execute(f'SELECT COUNT(*) FROM "{table}"')
                count = cur.fetchone()[0]
                log.info(f"  {table}: {count:,} records")

    finally:
        conn.close()

    elapsed = time.time() - start
    log.info(f"Import complete in {elapsed:.1f}s | {inserted:,} villages | {errors} errors")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    args = parser.parse_args()
    if not Path(args.file).exists():
        log.error(f"File not found: {args.file}")
        sys.exit(1)
    run_import(args.file)