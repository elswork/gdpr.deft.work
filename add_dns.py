import os
import requests

env_path = "/home/pirate/docker/Arquimedes/forge/infra/.env"
env_vars = {}
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                k, v = line.strip().split('=', 1)
                env_vars[k] = v

LOCAL_TOKEN = env_vars.get("LOCAL_TOKEN")
LOCAL_IP = "192.168.1.75"
API_BASE = f"http://{LOCAL_IP}:5380/api"

if not LOCAL_TOKEN:
    print("ERROR: No se encontró LOCAL_TOKEN.")
    exit(1)

def call_api(path, params):
    params["token"] = LOCAL_TOKEN
    r = requests.get(f"{API_BASE}{path}", params=params)
    return r.json()

print(f"Añadiendo IP de M2 para gdpr.deft.work en el DNS local...")
add_res = call_api("/zones/records/add", {
    "domain": "gdpr.deft.work",
    "type": "A",
    "ipAddress": LOCAL_IP,
    "ttl": 3600
})
print(f"Resultado: {add_res['status']}")
