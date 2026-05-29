import sys
sys.stdout.reconfigure(encoding='utf-8')
import json, re, pandas as pd
import numpy as np

content = open('../../../table.txt', encoding='utf-8').read()
arrays = []
decoder = json.JSONDecoder()
pos = 0

while pos < len(content):
    match = re.search(r'\[\s*\{', content[pos:])
    if not match:
        break
    start = pos + match.start()
    try:
        obj, end = decoder.raw_decode(content[start:])
        arrays.append(obj)
        pos = start + end
    except:
        pos += 1

envs = pd.DataFrame(arrays[1])
envs['timestamp'] = pd.to_datetime(envs['timestamp'])
envs = envs.sort_values('timestamp').reset_index(drop=True)
sensor_cols = ['temperature', 'humidity', 'brightness', 'gas_level']

# ✅ Gom các sensor event trong cùng burst 5 giây lại thành 1 row
envs['ts_bucket'] = envs['timestamp'].dt.round('5s')
grouped = envs.groupby('ts_bucket')[sensor_cols].mean()

# ✅ ffill chỉ với limit=3 (15 giây) để fill gap cực ngắn giữa các burst
# Không fill qua gap dài — tránh carry forward sai
filled = grouped.ffill(limit=3)

# ✅ Drop nếu vẫn còn NaN (khoảng gap quá dài, không đủ tin)
cleaned = filled.dropna().reset_index()
cleaned.rename(columns={'ts_bucket': 'timestamp'}, inplace=True)
cleaned.insert(0, 'en_id', range(1, len(cleaned) + 1))
cleaned['room_id'] = None
cleaned['is_synthetic'] = 0

cleaned.to_csv('cleaned_environment_data.csv', index=False)

print(f'Saved: {len(cleaned)} rows')
print(cleaned[sensor_cols].describe().round(2))
print('\nNaN check:')
print(cleaned[sensor_cols].isna().sum())