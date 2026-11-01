"""Package explicitly public workbench files; validate all archive paths and bundled code."""
from pathlib import Path
import json
import hashlib
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'releases'
OUT.mkdir(exist_ok=True)
CONFIG=json.loads((ROOT/'electron-app.json').read_text(encoding='utf-8-sig'))
NAME=CONFIG['executable']
ROOT_FILES=['.gitignore','LICENSE','README.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','electron-app.json']
def within(file):
    resolved=file.resolve()
    if not resolved.is_relative_to(ROOT):raise ValueError('Path escapes project')
    return resolved
def safe(file):
    within(file)
    if file.is_symlink() or not file.is_file():raise ValueError('Expected regular public file')
    if any(p in ('investigation','node_modules','.test-build','__pycache__') for p in file.relative_to(ROOT).parts):raise ValueError('Non-public path')
    if '.private.' in file.name or 'privateinventory' in file.name:raise ValueError('Private file rejected')

desktop_dir=OUT/(NAME+'-win-x64')
desktop=OUT/(NAME+'-0.1.0-win-x64.zip')
if desktop_dir.is_dir():
    app=within(desktop_dir/'resources/app')
    if not (app/'main.cjs').is_file():raise ValueError('Not a helper-built package')
    for notice in ['LICENSE.electron','LICENSES.chromium.html']:
        if not (desktop_dir/notice).is_file():raise ValueError('Runtime license missing')
    for name in CONFIG['docs_files']:
        source=ROOT/'docs'/name;safe(source)
        within(app/'docs'/name).write_bytes(source.read_bytes())
    for name in ['LICENSE','README.md','THIRD_PARTY_NOTICES.md']:
        within(desktop_dir/name).write_bytes((ROOT/name).read_bytes())
    with zipfile.ZipFile(desktop,'w',zipfile.ZIP_DEFLATED,compresslevel=6,strict_timestamps=False) as z:
        for file in sorted(desktop_dir.rglob('*')):
            within(file)
            if file.is_symlink():raise ValueError('Symlink in runtime')
            if file.is_file():z.write(file,(Path(NAME)/file.relative_to(desktop_dir)).as_posix())

web=OUT/'pencil-transactions-web-0.1.0.zip'
with zipfile.ZipFile(web,'w',zipfile.ZIP_DEFLATED,compresslevel=6,strict_timestamps=False) as z:
    for file in sorted((ROOT/'docs').rglob('*')):
        if file.is_file():safe(file);z.write(file,file.relative_to(ROOT/'docs').as_posix())
    for name in ['LICENSE','README.md','THIRD_PARTY_NOTICES.md']:z.write(ROOT/name,name)
source=OUT/'pencil-transactions-source-0.1.0.zip'
files=[ROOT/n for n in ROOT_FILES]
for directory in ['docs','src','scripts','tests','fixtures']:
    files.extend(f for f in (ROOT/directory).rglob('*') if f.is_file() and '__pycache__' not in f.parts)
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED,compresslevel=6,strict_timestamps=False) as z:
    for file in sorted(files):safe(file);z.write(file,(Path('pencil-transactions')/file.relative_to(ROOT)).as_posix())
app_bytes=(ROOT/'docs/app.js').read_bytes()
results=[]
for file in [web,source]+([desktop] if desktop.is_file() else []):
    with zipfile.ZipFile(file) as z:
        assert z.testzip() is None
        assert len(z.namelist())==len(set(z.namelist()))
        for name in z.namelist():
            p=Path(name)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in name
            assert 'investigation' not in p.parts and '.private.' not in name and 'privateinventory' not in name
        if file==web:assert z.read('app.js')==app_bytes
        elif file==source:assert z.read('pencil-transactions/docs/app.js')==app_bytes
        else:
            assert z.read(NAME+'/resources/app/docs/app.js')==app_bytes
            assert z.read(NAME+'/resources/app/main.cjs')==(ROOT/'scripts/electron-main.cjs').read_bytes()
            assert z.read(NAME+'/LICENSE.electron') and z.read(NAME+'/LICENSES.chromium.html')
        results.append({'artifact':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'entries':len(z.namelist()),'crc':'pass','bundledAppMatchesBuild':True})
(OUT/'SHA256SUMS.txt').write_text(''.join(f"{r['sha256']}  {r['artifact']}\n" for r in results))
(OUT/'package-verification.json').write_text(json.dumps({'command':'python scripts/release.py','appSha256':hashlib.sha256(app_bytes).hexdigest(),'artifacts':results,'scope':'ZIP CRC/path/privacy, bundled code equality and runtime notices; real engine compatibility not tested.'},indent=2)+'\n')
print(json.dumps(results,indent=2))
