"""Package one original browser application with a pinned local Electron runtime.

Only explicitly named docs files and a small launcher enter the application.
Caller provides electron-app.json with a docs_files allowlist.
"""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def within(p,base):
 p=p.resolve()
 if not p.is_relative_to(base.resolve()):raise ValueError('Path escapes project')
 return p

def main():
 standalone=(ROOT/'electron-app.json').is_file()
 slug=ROOT.name if standalone else sys.argv[1]
 if not re.fullmatch('[a-z0-9-]+',slug):raise ValueError('Invalid project slug')
 project=ROOT if standalone else within(ROOT/'projects'/slug,ROOT/'projects')
 config=json.loads((project/'electron-app.json').read_text(encoding='utf-8-sig'))
 for rel in config['docs_files']:
  source=within(project/'docs'/rel,project/'docs')
  if not source.is_file():raise ValueError('Missing application doc asset: '+rel)
 if config['entry'] not in config['docs_files']:raise ValueError('Entry must be included in docs allowlist')
 name=config['executable']
 if not re.fullmatch('[A-Za-z0-9_-]+',name):raise ValueError('Invalid executable name')
 runtime=ROOT/'node_modules/electron/dist' if standalone else ROOT/'.runtime/electron-harness/node_modules/electron/dist'
 if not (runtime/'electron.exe').is_file():raise ValueError('Portable Electron45.2.1 runtime required')
 output=project/'releases'/f'{name}-win-x64'
 if output.exists():
  # Never recursively delete prior output; update explicitly from trusted inputs.
  raise ValueError('Package output exists; choose a new package build directory or review it explicitly')
 output.mkdir(parents=True)
 for source in runtime.rglob('*'):
  within(source,runtime)
  rel=source.relative_to(runtime)
  if rel.as_posix()=='resources/default_app.asar':continue
  if rel.as_posix()=='LICENSE':rel=Path('LICENSE.electron')
  dest=within(output/rel,output)
  if source.is_dir():dest.mkdir(exist_ok=True,parents=True)
  elif source.is_file():dest.parent.mkdir(exist_ok=True,parents=True);shutil.copyfile(source,dest)
 (output/'electron.exe').rename(output/(name+'.exe'))
 app=output/'resources/app';(app/'docs').mkdir(parents=True,exist_ok=True)
 launcher=ROOT/'scripts/electron-main.cjs' if standalone else ROOT/'portfolio/electron-main.cjs'
 (app/'main.cjs').write_bytes(launcher.read_bytes())
 public_config={k:config[k] for k in ('name','entry','testSelector') if k in config}
 (app/'app-config.json').write_text(json.dumps(public_config),encoding='utf-8')
 (app/'package.json').write_text(json.dumps({'name':slug,'version':config.get('version','0.1.0'),'main':'main.cjs','license':'MIT'}),encoding='utf-8')
 for rel in config['docs_files']:
  source=within(project/'docs'/rel,project/'docs')
  if not source.is_file():raise ValueError('Missing application doc asset: '+rel)
  dest=within(app/'docs'/rel,app/'docs');dest.parent.mkdir(exist_ok=True,parents=True);shutil.copyfile(source,dest)
 for file in ['LICENSE','README.md']:
  if (project/file).is_file():shutil.copyfile(project/file,output/file)
 # Record the pinned host and give downstream builds the exact original launcher.
 if not standalone:
  shutil.copyfile(launcher,project/'scripts/electron-main.cjs')
  shutil.copyfile(Path(__file__),project/'scripts/package-desktop.py')
 (output/'HOST-VERSION.txt').write_text('Electron45.2.1 win32-x64; original project renderer; see included Electron/Chromium licenses.\n',encoding='utf-8')
 archive=project/'releases'/f'{name}-0.1.0-win-x64.zip'
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for file in sorted(output.rglob('*')):
   within(file,output)
   if file.is_file():z.write(file,str(Path(name)/file.relative_to(output)))
 print(json.dumps({'archive':str(archive.relative_to(project)),'executable':str((output/(name+'.exe')).relative_to(project)),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size}))

if __name__=='__main__':main()
