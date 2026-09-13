#!/usr/bin/env python3
import csv, json, os, shutil, subprocess, sys, time
import numpy as np
from PIL import Image
from collections import Counter
from datetime import datetime
from pathlib import Path

DISPLAY = os.environ.get('DISPLAY', ':99')
SAP_URL = 'https://demirbas.efespilsen.com.tr'
DOWNLOAD_DIR = Path('/root/Downloads')
BASE = Path('/opt/field-maintenance/sap-runtime')
EXPORTS = BASE / 'exports'
LOGS = BASE / 'logs'
TEMPLATE = BASE / 'export-icon-template.png'
SCREENSHOT = BASE / 'current-screen.png'
LOGIN_HELPER = BASE / 'sap_auto_login.py'
HEADER_ALIASES = {
    'Hizmet teyidi tanıtıcısı': 'Tanıtıcı', 'Tanıtıcı': 'Tanıtıcı',
    'Bayi / Dist.': 'Bayi', 'Bayi': 'Bayi',
    'Nokta Kodu': 'Nokta Kodu', 'Nokta': 'Nokta',
    'Kayıt tarihi': 'Kayıt tarihi', 'Yaratan': 'Yaratan',
    'Net değer': 'Net değer', 'KlncDrm': 'KlncDrm',
    'İlgili kişi': 'İlgili kişi', 'Masraf Yeri': 'Masraf Yeri',
    'İşlem Tipi': 'İşlem Tipi', 'Sistem durumu': 'Sistem durumu',
    'Müşteri': 'Müşteri', 'Sorumlu çalışan': 'Sorumlu çalışan',
}


def run(*args, check=True):
    env = os.environ.copy(); env['DISPLAY'] = DISPLAY
    return subprocess.run(args, env=env, text=True, capture_output=True, check=check)


def click(x, y):
    run('xdotool', 'mousemove', str(x), str(y), 'click', '1')


def window_title(wid):
    return run('xdotool', 'getwindowname', wid, check=False).stdout.strip()


def find_firefox_window():
    ids = run('xdotool','search','--onlyvisible','--name','.*', check=False).stdout.split()
    fallback = None
    for wid in ids:
        title = window_title(wid)
        if 'SAP CRM' in title or 'Oturum açma' in title or 'Application Server Error' in title:
            return wid
        if title in ('Firefox', 'Nightly'):
            fallback = wid
    return fallback


def ensure_logged_in():
    wid = find_firefox_window()
    if not wid:
        raise RuntimeError('Firefox window not found')
    run('xdotool','windowactivate','--sync',wid, check=False)
    title = window_title(wid)
    if 'SAP CRM' in title:
        return wid

    run('xdotool','key','ctrl+l')
    run('xdotool','type','--clearmodifiers','https://demirbas.efespilsen.com.tr')
    run('xdotool','key','Return')
    time.sleep(6)
    title = window_title(wid)
    if 'SAP CRM' in title:
        return wid
    if 'Oturum açma' in title:
        if not LOGIN_HELPER.exists():
            raise RuntimeError('SAP login required but login helper is missing')
        result = run(str(LOGIN_HELPER), check=False)
        if result.returncode != 0:
            raise RuntimeError('SAP auto-login helper failed')
        time.sleep(8)
        title = window_title(wid)
        if 'SAP CRM' not in title:
            raise RuntimeError(f'SAP auto-login did not reach CRM (title={title!r})')
        return wid
    raise RuntimeError(f'Unexpected SAP/Firefox state (title={title!r})')


def locate_export_icon():
    # Normal Hizmet teyitleri layout. Saved searches are intentionally not used:
    # SAP drops Nokta Kodu from saved-search exports.
    return (1164, 599), 0.0


def wait_for_new_download(start_time, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        candidates = [p for p in DOWNLOAD_DIR.glob('export*.csv') if p.stat().st_mtime > start_time and p.stat().st_size > 100]
        if candidates:
            return max(candidates, key=lambda p: p.stat().st_mtime)
        time.sleep(0.5)
    return None


def parse_export(path):
    with path.open('r', encoding='utf-16', newline='') as f:
        first = f.readline().strip()
        if first.lower() != 'sep=;':
            raise RuntimeError(f'Unexpected export preamble: {first!r}')
        reader = csv.DictReader(f, delimiter=';')
        source_headers = [h for h in (reader.fieldnames or []) if h]
        if 'Tanıtıcı' not in source_headers and 'Hizmet teyidi tanıtıcısı' not in source_headers:
            raise RuntimeError(f'Confirmation id column missing: {source_headers!r}')
        rows = []
        for source in reader:
            normalized = {HEADER_ALIASES.get(k, k): v for k, v in source.items() if k}
            rows.append(normalized)
    return rows, source_headers


def main():
    EXPORTS.mkdir(parents=True, exist_ok=True); LOGS.mkdir(parents=True, exist_ok=True)
    sap_window = ensure_logged_in()
    run('xdotool','windowactivate','--sync',sap_window, check=False)

    # Mandatory flow: Operasyon -> Hizmet teyitleri -> normal search.
    click(92, 385)
    time.sleep(3)
    click(270, 298)
    time.sleep(4)

    # Normal search: 14-day window + Product Id 203 + max 1000 results.
    click(758, 325)
    time.sleep(1)
    click(650, 406)
    time.sleep(1)
    click(425, 374)
    time.sleep(1)
    click(270, 518)
    time.sleep(1)
    click(675, 374)
    run('xdotool','key','ctrl+a'); run('xdotool','type','203')
    click(792, 462)
    run('xdotool','key','ctrl+a'); run('xdotool','type','1000')
    start_time = time.time()
    click(227, 526)
    time.sleep(10)

    (export_x, export_y), match_score = locate_export_icon()
    click(export_x, export_y)
    downloaded = wait_for_new_download(start_time, 20)
    if not downloaded:
        raise RuntimeError(f'SAP export was not downloaded (icon score={match_score:.2f})')

    rows, source_headers = parse_export(downloaded)
    if 'Nokta Kodu' not in source_headers:
        raise RuntimeError(f'Nokta Kodu missing from SAP export: {source_headers!r}')
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    target = EXPORTS / f'teyit-203-{stamp}.csv'
    shutil.copy2(downloaded, target)

    db_proc = subprocess.run(
        ['node', str(BASE / 'sync_teyit_db.js'), str(target)],
        text=True, capture_output=True
    )
    if db_proc.returncode != 0:
        raise RuntimeError(f'DB sync failed: {db_proc.stderr.strip() or db_proc.stdout.strip()}')
    try:
        db_sync = json.loads(db_proc.stdout.strip().splitlines()[-1])
    except Exception as exc:
        raise RuntimeError(f'Invalid DB sync response: {db_proc.stdout!r}') from exc

    summary = {
        'source': 'Operasyon > Hizmet teyitleri > normal arama',
        'productId': '203',
        'lookbackDays': 14,
        'rows': len(rows),
        'sourceHeaders': source_headers,
        'hasPointCode': 'Nokta Kodu' in source_headers,
        'uniquePoints': len({(r.get('Nokta Kodu') or r.get('Nokta') or r.get('Müşteri') or '') for r in rows if (r.get('Nokta Kodu') or r.get('Nokta') or r.get('Müşteri'))}),
        'statusCounts': dict(Counter(r['KlncDrm'] for r in rows)),
        'firstConfirmationId': rows[0]['Tanıtıcı'] if rows else None,
        'lastConfirmationId': rows[-1]['Tanıtıcı'] if rows else None,
        'exportFile': str(target),
        'dbSync': db_sync,
        'createdAt': datetime.now().astimezone().isoformat(),
    }
    manifest = LOGS / 'last-pull.json'
    manifest.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
