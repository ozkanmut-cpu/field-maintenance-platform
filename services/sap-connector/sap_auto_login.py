#!/usr/bin/env python3
import os
import subprocess
import time
from pathlib import Path

BASE = Path("/opt/field-maintenance/sap-runtime")
CREDS = BASE / ".sap_credentials"
DISPLAY = ":99"

def load_creds():
    data = {}
    for line in CREDS.read_text(encoding="utf-8").splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            data[k.strip()] = v.strip()
    return data["SAP_USERNAME"], data["SAP_PASSWORD"]

def run(*args, check=True):
    env = os.environ.copy()
    env["DISPLAY"] = DISPLAY
    return subprocess.run(args, env=env, text=True, capture_output=True, check=check)

def main():
    user, password = load_creds()

    wins = run("xdotool", "search", "--onlyvisible", "--name", ".*", check=False).stdout.split()
    sap = None
    for wid in wins:
        title = run("xdotool", "getwindowname", wid, check=False).stdout.strip()
        if "SAP CRM" in title or "Oturum açma" in title:
            sap = wid
            break

    if not sap:
        raise SystemExit("SAP Firefox penceresi bulunamadı")

    run("xdotool", "windowactivate", "--sync", sap, check=False)
    time.sleep(1)

    # Login sayfasındaysak kullanıcı adı / şifre gir.
    # SAP login ekranındaki mevcut koordinatlar.
    run("xdotool", "mousemove", "882", "246", "click", "1")
    run("xdotool", "key", "ctrl+a")
    run("xdotool", "type", "--clearmodifiers", "--delay", "20", user)

    run("xdotool", "mousemove", "882", "267", "click", "1")
    run("xdotool", "key", "ctrl+a")
    run("xdotool", "type", "--clearmodifiers", "--delay", "20", password)

    run("xdotool", "mousemove", "857", "314", "click", "1")
    time.sleep(8)

    print("LOGIN_ATTEMPT_DONE")

if __name__ == "__main__":
    main()
